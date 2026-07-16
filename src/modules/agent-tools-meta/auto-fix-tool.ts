/**
 * 自动修复工具 — auto_fix
 *
 * 按 errorType 执行常见错误的自动修复策略（连接 / 鉴权 / 配额 / 模型 / 限流 / 未知）。
 *
 * 设计要点：
 * - 复用 config-tools 的能力（testConnection / loadConfig），按 errorType 分发
 * - 采用策略模式：每个 errorType 对应一个独立策略函数，避免大 switch case
 * - unknown 类型复用 diagnose_error 逻辑
 * - 未识别的 errorType 统一降级为 unknown 策略
 *
 * 特权访问声明：本文件通过 diagnoseErrorTool 间接访问 textProvider，
 * 详见 MODULE.md "Agent 特权访问声明" 章节。
 */

import type { ToolImpl, ToolContext } from "@/domain/types/agent-tools";
import { TOOL_TIMEOUTS } from "@/shared/constants/tool-timeouts";
import { diagnoseErrorTool } from "./diagnose-error-tool";

/** auto_fix 上下文（来自 args.context） */
type AutoFixContext = {
  errorMessage?: string;
  providerId?: string;
  capability?: "text" | "image" | "vision" | "video";
};

/** 策略函数返回的修复结果数据 */
type FixData = {
  fixed: boolean;
  action: string;
  message: string;
  [key: string]: unknown;
};

/** 策略函数类型 */
type FixStrategy = (context: AutoFixContext, ctx: ToolContext) => Promise<FixData>;

// ============= 各 errorType 策略实现 =============

/** api_connection：测试 API 连接是否恢复 */
const fixApiConnection: FixStrategy = async (context, ctx) => {
  ctx.onProgress?.("正在测试 API 连接...");
  const { testConnection } = await import("@/shared/api-config");
  const capability = context.capability ?? "text";
  const result = await testConnection(capability, context.providerId);
  return {
    fixed: result.success,
    action: `testConnection(${capability})`,
    message: result.success
      ? "连接已恢复，API 可正常访问"
      : `连接测试仍失败：${result.message}。建议检查网络、API URL 和密钥配置。`,
  };
};

/** api_auth：验证 API key 是否有效 */
const fixApiAuth: FixStrategy = async (context, ctx) => {
  ctx.onProgress?.("正在验证 API key...");
  const { testConnection } = await import("@/shared/api-config");
  const capability = context.capability ?? "text";
  if (!context.providerId) {
    return {
      fixed: false,
      action: "validate_api_key (skipped: providerId missing)",
      message:
        "未提供 providerId，无法自动验证。建议用户调用 validate_api_key 工具，或检查 API 配置中的密钥是否正确。",
    };
  }
  const result = await testConnection(capability, context.providerId);
  return {
    fixed: result.success,
    action: `validate_api_key(${context.providerId})`,
    message: result.success
      ? "API key 验证通过，鉴权正常"
      : `API key 验证失败：${result.message}。建议用户重新配置正确的 API key。`,
  };
};

/** quota_exceeded：配额超限无法自动修复，给出明确指引 */
const fixQuotaExceeded: FixStrategy = async () => {
  return {
    fixed: false,
    action: "suggest_check_quota",
    message:
      "API 配额已超限，无法自动修复。建议用户登录 provider 控制台查看配额使用情况，" +
      "升级套餐或等待配额重置后再试。",
  };
};

/** model_not_found：列出已配置的可用模型 */
const fixModelNotFound: FixStrategy = async (_context, ctx) => {
  ctx.onProgress?.("正在列出可用模型...");
  const { loadConfig } = await import("@/shared/api-config");
  const config = await loadConfig();
  const availableModels = config.providers.flatMap((p) =>
    (p.models ?? []).map((m) => ({
      providerId: p.id,
      providerName: p.name,
      modelId: m.id,
      modelName: m.name,
      capabilities: m.capabilities,
    })),
  );
  return {
    fixed: false,
    action: "list_available_models",
    message:
      availableModels.length > 0
        ? `已列出可用模型（共 ${availableModels.length} 个）。建议用户从中选择一个正确的模型 ID 重新配置。`
        : "未找到任何已配置的模型。建议用户调用 configure_api_provider 工具配置新 provider 和模型。",
    availableModels,
  };
};

/** rate_limit：触发限流无法自动修复，提示等待 */
const fixRateLimit: FixStrategy = async () => {
  return {
    fixed: false,
    action: "suggest_wait",
    message:
      "触发 API 限流，无法自动修复。建议用户等待一段时间后重试，" +
      "或降低请求频率。如频繁触发限流，建议升级 provider 套餐或更换 provider。",
  };
};

/** unknown：未知错误类型，调用 AI 诊断 */
const fixUnknown: FixStrategy = async (context, ctx) => {
  ctx.onProgress?.("未知错误类型，调用 AI 诊断...");
  const errorMessage = context.errorMessage || "未知错误";
  // 复用 diagnose_error 逻辑
  const result = await diagnoseErrorTool.execute(
    { errorMessage, errorContext: context },
    ctx,
  );
  if (!result.success) {
    return {
      fixed: false,
      action: "diagnose_error (failed)",
      message: `自动诊断失败：${result.error}`,
    };
  }
  return {
    fixed: false,
    action: "diagnose_error",
    message: "已调用 AI 诊断，请查看诊断结果。",
    diagnosis: result.data,
  };
};

/** errorType -> 策略映射 */
const strategies: Record<string, FixStrategy> = {
  api_connection: fixApiConnection,
  api_auth: fixApiAuth,
  quota_exceeded: fixQuotaExceeded,
  model_not_found: fixModelNotFound,
  rate_limit: fixRateLimit,
  unknown: fixUnknown,
};

/** 自动修复常见错误 */
export const autoFixTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "auto_fix",
      description:
        "自动修复常见错误。按 errorType 执行对应修复策略：" +
        "api_connection（测试连接）、api_auth（提示检查 key）、quota_exceeded（提示检查配额）、" +
        "model_not_found（列出可用模型）、rate_limit（提示等待）、unknown（调用 diagnose_error）。" +
        "返回是否已修复、执行的修复操作、修复结果说明。",
      parameters: {
        type: "object",
        properties: {
          errorType: {
            type: "string",
            enum: ["api_connection", "api_auth", "quota_exceeded", "model_not_found", "rate_limit", "unknown"],
            description: "错误类型",
          },
          context: {
            type: "object",
            description: "上下文（可选，含 errorMessage / providerId / capability 等）",
            properties: {
              errorMessage: { type: "string", maxLength: 2000 },
              providerId: { type: "string", maxLength: 200 },
              capability: { type: "string", enum: ["text", "image", "vision", "video"] },
            },
          },
        },
        required: ["errorType"],
      },
    },
  },
  domain: "diagnostic",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.mutation,
  async execute(args, ctx) {
    const errorType = String(args.errorType);
    const context = (args.context ?? {}) as AutoFixContext;

    try {
      // 未识别的 errorType 统一降级为 unknown 策略
      const strategy = strategies[errorType] ?? strategies.unknown;
      // strategies.unknown 一定存在，但 noUncheckedIndexedAccess 下类型可能为 undefined
      if (!strategy) {
        return {
          success: false,
          error: `未找到错误类型 ${errorType} 的修复策略`,
        };
      }
      const data = await strategy(context, ctx);
      return { success: true, data };
    } catch (e) {
      return {
        success: false,
        error: `自动修复失败：${e instanceof Error ? e.message : String(e)}`,
      };
    }
  },
};
