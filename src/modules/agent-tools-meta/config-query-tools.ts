/**
 * 配置查询工具（Config Query Tools）— 读操作
 *
 * 包含工具（7 个，均为只读操作）：
 * - get_api_config：获取 API 配置（脱敏）
 * - check_api_health：检查 API 健康状态
 * - list_providers：列出已配置 provider
 * - list_video_models：列出支持视频生成的模型（Task 4.1）
 * - get_model_parameters：获取模型的推荐参数（Task 4.2）
 * - test_connection：测试 provider 连接（无写入，仅探测）
 * - validate_api_key：验证 API key 有效性（无写入，仅探测）
 *
 * 设计要点：
 * - API key 在返回时脱敏（只显示前 4 位 + *** + 后 4 位）
 * - test_connection / validate_api_key 虽使用 mutation 超时（耗时较长），但不写入配置
 * - 失败时给出明确错误原因和修复建议
 */

import type { ToolImpl } from "@/domain/types/agent-tools";
import { TOOL_TIMEOUTS } from "@/shared/constants/tool-timeouts";

// ============= 辅助函数 =============

/** 脱敏 API key */
function maskApiKey(key: string): string {
  if (!key || key.length < 8) return "***";
  return key.slice(0, 4) + "***" + key.slice(-4);
}

// ============= 工具实现 =============

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

/** 列出支持视频生成的模型（Task 4.1） */
export const listVideoModelsTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "list_video_models",
      description:
        "列出所有支持视频生成的模型。可按 providerId 筛选。返回模型 ID、名称、所属 provider 及关键能力（是否支持首尾帧、最大分辨率等）。",
      parameters: {
        type: "object",
        properties: {
          providerId: {
            type: "string",
            description: "按 provider ID 筛选（可选，不填返回全部）",
          },
        },
      },
    },
  },
  domain: "config",
  dangerLevel: "safe",
  timeoutMs: TOOL_TIMEOUTS.query,
  async execute(args) {
    const { loadConfig } = await import("@/shared/api-config");
    const { getAllModelProfiles } = await import("@/shared/model-capabilities");
    const config = await loadConfig();
    const filterProviderId = args.providerId ? String(args.providerId) : undefined;

    const profiles = getAllModelProfiles();
    const videoModels: Array<Record<string, unknown>> = [];

    for (const provider of config.providers) {
      if (filterProviderId && provider.id !== filterProviderId) continue;
      for (const model of provider.models ?? []) {
        if (!model.capabilities?.includes("video")) continue;
        const profile = profiles[model.id];
        videoModels.push({
          modelId: model.id,
          name: model.name,
          providerId: provider.id,
          providerName: provider.name,
          supportsLastFrame: profile?.capabilities?.supportsLastFrame ?? false,
          maxResolution: profile?.capabilities?.maxResolution ?? "unknown",
          maxReferences: profile?.capabilities?.maxReferences ?? 0,
          durations: profile?.parameters?.durations ?? [],
          resolutions: profile?.parameters?.resolutions ?? [],
        });
      }
    }

    return {
      success: true,
      data: {
        count: videoModels.length,
        models: videoModels,
      },
    };
  },
};

/** 获取模型的推荐参数（Task 4.2） */
export const getModelParametersTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "get_model_parameters",
      description:
        "获取指定模型的推荐参数（时长选项、分辨率选项、风格选项、是否支持负面提示词/seed/cfgScale/lora 等）。用于在生成前了解模型可用参数。",
      parameters: {
        type: "object",
        properties: {
          modelId: {
            type: "string",
            description: "模型 ID",
          },
        },
        required: ["modelId"],
      },
    },
  },
  domain: "config",
  dangerLevel: "safe",
  timeoutMs: TOOL_TIMEOUTS.query,
  async execute(args) {
    const modelId = String(args.modelId);
    const { getModelParameterProfile, getModelCapabilities } = await import("@/shared/model-capabilities");
    const profile = getModelParameterProfile(modelId);
    if (!profile) {
      return {
        success: false,
        error: `未找到模型 ${modelId} 的参数配置。请先通过 list_providers 或 list_video_models 确认模型 ID。`,
      };
    }
    const capabilities = getModelCapabilities(modelId);
    return {
      success: true,
      data: {
        modelId: profile.modelId,
        displayName: profile.displayName,
        providerId: profile.providerId,
        capabilities: {
          supportsLastFrame: capabilities.supportsLastFrame,
          maxResolution: capabilities.maxResolution,
          maxReferences: capabilities.maxReferences,
          referenceMode: capabilities.referenceMode,
          supportsCharacterRef: capabilities.supportsCharacterRef,
          supportsSceneRef: capabilities.supportsSceneRef,
        },
        parameters: profile.parameters,
      },
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

/** 导出所有配置查询工具（读操作） */
export const configQueryTools: ToolImpl[] = [
  getApiConfigTool,
  checkApiHealthTool,
  listProvidersTool,
  listVideoModelsTool,
  getModelParametersTool,
  testConnectionTool,
  validateApiKeyTool,
];
