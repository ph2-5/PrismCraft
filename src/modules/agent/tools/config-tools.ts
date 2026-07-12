/**
 * 配置管理工具（Config Tools）
 *
 * 包含工具：
 * - get_api_config：获取 API 配置（脱敏）
 * - check_api_health：检查 API 健康状态
 * - list_providers：列出已配置 provider
 * - test_connection：测试 provider 连接
 * - validate_api_key：验证 API key 有效性
 * - configure_api_provider：自动配置 provider（用户发 key+vendor，AI 自动配置）
 * - auto_configure_provider：子流程（验证 → 配置 → 测试 → 切换默认模型）
 *
 * 设计要点：
 * - API key 在返回时脱敏（只显示前 4 位 + ***）
 * - configure_api_provider 是核心工具，用户发 key 即可完成全套配置
 * - 失败时给出明确错误原因和修复建议
 */

import type { ToolImpl } from "../domain/types";
import { TOOL_TIMEOUTS } from "../services/tool-executor";

/** 脱敏 API key */
function maskApiKey(key: string): string {
  if (!key || key.length < 8) return "***";
  return key.slice(0, 4) + "***" + key.slice(-4);
}

/** 获取 API 配置（脱敏） */
export const getApiConfigTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "get_api_config",
      description: "获取当前 API 配置。返回所有 provider（key 已脱敏）和能力映射。用于诊断配置问题。",
      parameters: { type: "object", properties: {} },
    },
  },
  domain: "config",
  dangerLevel: "safe",
  timeoutMs: TOOL_TIMEOUTS.query,
  async execute() {
    const { loadConfig } = await import("@/shared/api-config");
    const config = await loadConfig();
    return {
      success: true,
      data: {
        version: config.version,
        providers: config.providers.map((p) => ({
          id: p.id,
          name: p.name,
          format: p.format,
          baseUrl: p.baseUrl,
          apiKey: maskApiKey(p.apiKey),
          modelCount: p.models?.length ?? 0,
          models: (p.models ?? []).map((m) => ({
            id: m.id,
            name: m.name,
            capabilities: m.capabilities,
          })),
        })),
        mapping: config.mapping,
        fallback: config.fallback,
      },
    };
  },
};

/** 检查 API 健康状态 */
export const checkApiHealthTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "check_api_health",
      description: "检查各能力（text/image/vision/video）的 API 健康状态。返回每个能力是否已配置、provider 信息。",
      parameters: { type: "object", properties: {} },
    },
  },
  domain: "config",
  dangerLevel: "safe",
  timeoutMs: TOOL_TIMEOUTS.query,
  async execute() {
    const { checkConfigStatus } = await import("@/shared/api-config");
    const status = await checkConfigStatus();
    return {
      success: true,
      data: status,
    };
  },
};

/** 列出已配置 provider */
export const listProvidersTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "list_providers",
      description: "列出所有已配置的 API provider。返回 provider 列表（含模型和能力）。",
      parameters: { type: "object", properties: {} },
    },
  },
  domain: "config",
  dangerLevel: "safe",
  timeoutMs: TOOL_TIMEOUTS.query,
  async execute() {
    const { loadConfig } = await import("@/shared/api-config");
    const config = await loadConfig();
    return {
      success: true,
      data: config.providers.map((p) => ({
        id: p.id,
        name: p.name,
        format: p.format,
        baseUrl: p.baseUrl,
        apiKeyMasked: maskApiKey(p.apiKey),
        models: (p.models ?? []).map((m) => ({
          id: m.id,
          name: m.name,
          capabilities: m.capabilities,
        })),
      })),
    };
  },
};

/** 测试 provider 连接 */
export const testConnectionTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "test_connection",
      description: "测试指定能力和 provider 的连接。返回是否成功和详细信息。",
      parameters: {
        type: "object",
        properties: {
          capability: {
            type: "string",
            enum: ["text", "image", "vision", "video"],
            description: "测试的能力类型",
          },
          providerId: { type: "string", description: "provider ID（可选，不填用默认）" },
          modelId: { type: "string", description: "模型 ID（可选）" },
        },
        required: ["capability"],
      },
    },
  },
  domain: "config",
  dangerLevel: "safe",
  timeoutMs: TOOL_TIMEOUTS.mutation,
  async execute(args) {
    const { testConnection } = await import("@/shared/api-config");
    const capability = String(args.capability) as "text" | "image" | "vision" | "video";
    const result = await testConnection(
      capability,
      args.providerId ? String(args.providerId) : undefined,
      args.modelId ? String(args.modelId) : undefined,
    );
    return {
      success: result.success,
      data: { capability, message: result.success ? result.message : "连接测试失败" },
      error: result.success ? undefined : "API 连接测试失败（详情请查看日志）",
    };
  },
};

/** 验证 API key 有效性 */
export const validateApiKeyTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "validate_api_key",
      description: "验证 API key 是否有效。通过调用 provider 的轻量级接口验证。",
      parameters: {
        type: "object",
        properties: {
          providerId: { type: "string", description: "要验证的 provider ID" },
          capability: {
            type: "string",
            enum: ["text", "image", "vision", "video"],
            description: "验证的能力，默认 text",
            default: "text",
          },
        },
        required: ["providerId"],
      },
    },
  },
  domain: "config",
  dangerLevel: "safe",
  timeoutMs: TOOL_TIMEOUTS.mutation,
  async execute(args) {
    const { testConnection } = await import("@/shared/api-config");
    const capability = String(args.capability || "text") as "text" | "image" | "vision" | "video";
    const result = await testConnection(capability, String(args.providerId));
    return {
      success: result.success,
      data: { providerId: args.providerId, capability, valid: result.success, message: result.success ? result.message : "验证失败" },
      error: result.success ? undefined : "API key 验证失败（详情请查看日志）",
    };
  },
};

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

/** 导出所有配置工具 */
export const configTools: ToolImpl[] = [
  getApiConfigTool,
  checkApiHealthTool,
  listProvidersTool,
  testConnectionTool,
  validateApiKeyTool,
  configureApiProviderTool,
];
