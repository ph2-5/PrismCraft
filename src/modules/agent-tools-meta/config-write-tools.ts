/**
 * 配置写入工具（Config Write Tools）— 写操作
 *
 * 包含工具（1 个，修改 API 配置）：
 * - configure_api_provider：自动配置 provider（用户发 key+vendor，AI 自动配置）
 *
 * 设计要点：
 * - configure_api_provider 是核心工具，用户发 key 即可完成全套配置
 * - vendor 预设从 provider 注册表动态派生（单一权威源），新增 provider JSON 或插件后自动可用
 * - 失败时给出明确错误原因和修复建议
 */

import type { ToolImpl } from "@/domain/types/agent-tools";
import { TOOL_TIMEOUTS } from "@/shared/constants/tool-timeouts";

// ============= Vendor 预设（从 provider 注册表派生） =============

/**
 * Vendor 预设配置（从 provider 注册表动态派生，单一权威源）
 *
 * 派生自 @/shared/api-config 的 getAllTemplatesAsync()，覆盖所有内置 provider JSON
 * 和已加载插件。新增 provider JSON 或插件后自动出现在 vendor 列表中，无需手动维护。
 *
 * 派生规则：
 * - baseUrl ← template.baseUrl
 * - format ← template.format（正确的 ApiFormat，修正了旧硬编码中错误的 format 值）
 * - capabilities ← 合并所有 models 的 capabilities 去重
 * - defaultModel ← 第一个 model.id（JSON 注册表顺序即推荐优先级）
 */
interface VendorPreset {
  baseUrl: string;
  format: string;
  capabilities: string[];
  defaultModel?: string;
}

/** 缓存派生结果（首次调用后复用，provider 注册表运行时不变） */
let _vendorPresetsCache: Record<string, VendorPreset> | null = null;

/**
 * 获取 vendor 预设（从 provider 注册表派生）
 *
 * 首次调用异步加载模板，后续返回缓存。configure_api_provider 工具在 execute 中调用。
 */
async function getVendorPresets(): Promise<Record<string, VendorPreset>> {
  if (_vendorPresetsCache) return _vendorPresetsCache;

  const { getAllTemplatesAsync } = await import("@/shared/api-config");
  const templates = await getAllTemplatesAsync();

  const presets: Record<string, VendorPreset> = {};
  for (const [vendorId, template] of Object.entries(templates)) {
    // 跳过 custom 模板（无固定 baseUrl）
    if (vendorId === "custom") continue;

    // 合并所有 models 的 capabilities 去重
    const capSet = new Set<string>();
    for (const model of template.models) {
      for (const cap of model.capabilities) {
        capSet.add(cap);
      }
    }

    presets[vendorId] = {
      baseUrl: template.baseUrl,
      format: template.format,
      capabilities: Array.from(capSet),
      defaultModel: template.models[0]?.id,
    };
  }

  _vendorPresetsCache = presets;
  return presets;
}

/** 重置 vendor 预设缓存（测试用，模仿 file-http 的 _resetHttpCache 模式） */
export function _resetVendorPresetsCache(): void {
  _vendorPresetsCache = null;
}

// ============= 工具实现 =============

/**
 * 自动配置 provider（用户明确要求的核心工具）
 * 用户提供 key + vendor 信息，AI 自动完成全套配置
 */
export const configureApiProviderTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "configure_api_provider",
      description: "自动配置 API provider。用户提供 API key 和 vendor（厂商）信息，自动创建 provider 配置、设置能力映射、测试连接。用户只需说『我有 OpenAI 的 key: sk-xxx』，AI 即可完成全套配置。",
      parameters: {
        type: "object",
        properties: {
          apiKey: { type: "string", description: "API key（如 sk-xxx）", maxLength: 500 },
          vendor: {
            type: "string",
            maxLength: 200,
            description: "API 厂商名称。支持所有已注册 provider（含内置与插件），如 openai、anthropic、google、zhipu、deepseek、moonshot、qwen、openrouter、ollama（本地部署）、kuaishou（含 Kling 模型）、minimax、runway、pika、luma、seedance、volcengine、fireworks、byteplus、bedrock、pollinations、pixverse 等，或自定义 baseUrl。ollama 不需要真实 apiKey，可传任意占位符。vendor 列表动态派生自 provider 注册表，新增 provider JSON 或插件后自动可用。",
          },
          baseUrl: { type: "string", description: "自定义 API base URL（可选，vendor 不在列表时必填）", maxLength: 2048 },
          modelName: { type: "string", description: "默认模型名称（可选，如 gpt-4、claude-3-opus）", maxLength: 200 },
          capabilities: {
            type: "array",
            items: { type: "string", enum: ["text", "image", "vision", "video", "embedding", "audio"] },
            description: "该 provider 支持的能力（可选，AI 会根据 vendor 自动推断）",
          },
          setAsDefault: { type: "boolean", description: "是否设为默认 provider，默认 true", default: true },
        },
        required: ["apiKey", "vendor"],
      },
    },
  },
  domain: "config",
  timeoutMs: TOOL_TIMEOUTS.mutation,
  dangerLevel: "limited", // 修改 API 配置影响后续生成行为
  async execute(args, ctx) {
    const { loadConfig, saveConfig } = await import("@/shared/api-config");
    const { testConnection } = await import("@/shared/api-config");

    const apiKey = String(args.apiKey);
    const vendor = String(args.vendor).toLowerCase();
    const setAsDefault = args.setAsDefault !== false;

    ctx.onProgress?.(`正在配置 ${vendor} provider...`);

    // 1. 根据 vendor 推断 baseUrl 和 format（从 provider 注册表动态派生）
    const vendorPresets = await getVendorPresets();
    const vendorConfig = vendorPresets[vendor];
    const baseUrl = args.baseUrl ? String(args.baseUrl) : vendorConfig?.baseUrl;
    const format = vendorConfig?.format ?? "openai";

    if (!baseUrl) {
      return {
        success: false,
        error: `未识别的 vendor "${vendor}"，请提供 baseUrl 参数或使用已知 vendor（${Object.keys(vendorPresets).join("/")}）`,
      };
    }

    // 2. 构建 provider 配置
    const providerId = `${vendor}_${Date.now()}`;
    const capabilities = (args.capabilities as string[] | undefined) ?? vendorConfig?.capabilities ?? ["text"];
    const modelName = args.modelName ? String(args.modelName) : vendorConfig?.defaultModel;
    const models = modelName
      ? [{ id: modelName, name: modelName, capabilities }]
      : [];

    const newProvider = {
      id: providerId,
      name: vendor,
      format,
      baseUrl,
      apiKey,
      models,
    };

    // 3. 保存配置
    ctx.onProgress?.("正在保存配置...");
    const config = await loadConfig();
    config.providers.push(newProvider as never);

    // 4. 设置能力映射（如果设为默认）
    if (setAsDefault) {
      for (const cap of capabilities) {
        if (["text", "image", "vision", "video", "embedding", "audio"].includes(cap)) {
          config.mapping[cap as "text" | "image" | "vision" | "video" | "embedding" | "audio"] =
            `${providerId}/${modelName || models[0]?.id || ""}`;
        }
      }
    }

    await saveConfig(config);

    // 5. 测试连接
    ctx.onProgress?.("正在测试连接...");
    const caps = capabilities as Array<"text" | "image" | "vision" | "video">;
    const testResults: Array<{ capability: string; success: boolean; message: string }> = [];
    for (const cap of caps) {
      const result = await testConnection(cap, providerId);
      testResults.push({
        capability: cap,
        success: result.success,
        message: result.success ? result.message : "测试失败",
      });
    }

    const allSuccess = testResults.every((r) => r.success);

    return {
      success: allSuccess,
      data: {
        providerId,
        providerName: vendor,
        vendor,
        format,
        baseUrl,
        configuredCapabilities: caps,
        setAsDefault,
        testResults,
        nextSteps: allSuccess
          ? "配置完成，现在可以开始使用 AI 生成功能了"
          : "配置已保存但部分能力测试失败，请检查 key 或 baseUrl 是否正确",
      },
      error: allSuccess ? undefined : "部分能力测试失败，请查看 testResults 详情",
    };
  },
};

/** 导出所有配置写入工具（写操作） */
export const configWriteTools: ToolImpl[] = [
  configureApiProviderTool,
];
