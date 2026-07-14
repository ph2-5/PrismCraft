/**
 * 工具执行器（ToolExecutor）
 *
 * 设计要点：
 * - 解析 ToolCall 的 arguments JSON 字符串
 * - 支持超时控制（查询类 30s / 生成类 5min / 视频任务类 30min）
 * - 支持取消信号（AbortSignal）
 * - 捕获异常并转换为 ToolResult
 * - 记录执行耗时
 * - Specialist 白名单硬执行（防止 LLM 幻觉调用白名单外工具）
 * - 文件操作路径白名单（限制在 userData 目录内）
 */

import type { ToolCall } from "@/domain/ports/ai-provider-port";
import type { ToolResult, ToolContext, DangerLevel } from "../domain/types";
import type { IToolExecutor, IToolRegistry } from "../domain/ports";
import { toolRegistry } from "./tool-registry";

/** 默认超时：30 秒（查询类） */
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * 敏感信息脱敏（防止 API key / token 泄露到 LLM 上下文）
 *
 * 规则：
 * - 匹配 sk-/key-/token-/Bearer 等前缀 + 跟随的字母数字字符
 * - 匹配 Authorization header
 * - 匹配 api_key=xxx / apiKey=xxx 格式
 * - 截断过长的错误消息（>500 字符）
 */
function sanitizeErrorMessage(message: string): string {
  if (!message) return "未知错误";
  let sanitized = message;
  // 脱敏 API key（sk-xxx, key-xxx, token-xxx 等）
  sanitized = sanitized.replace(/(?:sk|key|token|api[_-]?key|bearer)[-_:\s=]+[a-zA-Z0-9]{8,}/gi, "[REDACTED]");
  // 脱敏 Authorization header
  sanitized = sanitized.replace(/Authorization:\s*[^\s,;]+/gi, "Authorization: [REDACTED]");
  // 截断过长错误消息
  if (sanitized.length > 500) {
    sanitized = sanitized.slice(0, 500) + "...(已截断)";
  }
  return sanitized;
}

/**
 * 危险等级判定（综合 requiresConfirmation 和 dangerLevel）
 *
 * - dangerLevel=destructive → 必须确认
 * - requiresConfirmation=true → 必须确认
 * - 其余 → 无需确认
 */
function getEffectiveDangerLevel(
  tool: { requiresConfirmation?: boolean; dangerLevel?: DangerLevel } | undefined,
): DangerLevel {
  if (!tool) return "safe";
  if (tool.dangerLevel === "destructive" || tool.requiresConfirmation) return "destructive";
  if (tool.dangerLevel === "limited") return "limited";
  return "safe";
}

/** 工具执行器 */
export class ToolExecutor implements IToolExecutor {
  /**
   * 注入的工具注册表（不传则使用模块单例 toolRegistry）
   *
   * 方案 3 DI 化：允许测试注入 mock registry，或组合不同的工具集。
   */
  private readonly registry: IToolRegistry;
  /**
   * 工具白名单（硬执行）
   *
   * 设置后，execute() 会拒绝白名单外的工具调用，防止 LLM 幻觉。
   * undefined 表示无限制（主 Agent 默认）。
   */
  private readonly allowedTools: Set<string> | undefined;

  constructor(registry?: IToolRegistry, allowedTools?: string[] | null) {
    this.registry = registry ?? toolRegistry;
    this.allowedTools = allowedTools && allowedTools.length > 0 ? new Set(allowedTools) : undefined;
  }

  /**
   * 执行单个工具调用
   * @param toolCall LLM 返回的工具调用请求
   * @param ctx 工具执行上下文
   * @returns 工具执行结果
   */
  async execute(toolCall: ToolCall, ctx: ToolContext): Promise<ToolResult> {
    const startTime = Date.now();
    const toolName = toolCall.function.name;

    // Specialist 白名单硬执行：白名单外的工具直接拒绝
    if (this.allowedTools && !this.allowedTools.has(toolName)) {
      return {
        success: false,
        error: `工具 ${toolName} 不在当前专家的白名单中，拒绝执行`,
        duration: Date.now() - startTime,
      };
    }

    const tool = this.registry.get(toolName);

    if (!tool) {
      return {
        success: false,
        error: `未知工具：${toolName}`,
        duration: Date.now() - startTime,
      };
    }

    // 解析参数
    let args: Record<string, unknown>;
    try {
      args = toolCall.function.arguments
        ? (JSON.parse(toolCall.function.arguments) as Record<string, unknown>)
        : {};
    } catch (e) {
      return {
        success: false,
        error: `参数解析失败：${e instanceof Error ? e.message : String(e)}`,
        duration: Date.now() - startTime,
      };
    }

    // 超时控制
    const timeoutMs = tool.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    // 合并外部 signal
    const onExternalAbort = () => controller.abort();
    if (ctx.signal) {
      if (ctx.signal.aborted) {
        clearTimeout(timer);
        return {
          success: false,
          error: "工具执行已取消",
          duration: Date.now() - startTime,
        };
      }
      ctx.signal.addEventListener("abort", onExternalAbort, { once: true });
    }

    const childCtx: ToolContext = {
      ...ctx,
      signal: controller.signal,
    };

    try {
      const result = await tool.execute(args, childCtx);
      return {
        ...result,
        duration: Date.now() - startTime,
      };
    } catch (e) {
      // 取消
      if (controller.signal.aborted) {
        return {
          success: false,
          error: `工具执行超时（${timeoutMs}ms）或已取消`,
          duration: Date.now() - startTime,
        };
      }
      return {
        success: false,
        error: sanitizeErrorMessage(e instanceof Error ? e.message : String(e)),
        duration: Date.now() - startTime,
      };
    } finally {
      clearTimeout(timer);
      if (ctx.signal) {
        ctx.signal.removeEventListener("abort", onExternalAbort);
      }
    }
  }

  /** 批量执行工具调用（并行） */
  async executeAll(toolCalls: ToolCall[], ctx: ToolContext): Promise<Array<{ toolCall: ToolCall; result: ToolResult }>> {
    return Promise.all(
      toolCalls.map(async (tc) => ({
        toolCall: tc,
        result: await this.execute(tc, ctx),
      })),
    );
  }

  /** 检查工具是否需要确认（综合 requiresConfirmation 和 dangerLevel） */
  requiresConfirmation(toolCall: ToolCall): boolean {
    // 白名单外的工具不需要确认（会被 execute 直接拒绝）
    if (this.allowedTools && !this.allowedTools.has(toolCall.function.name)) return false;
    const tool = this.registry.get(toolCall.function.name);
    return getEffectiveDangerLevel(tool) === "destructive";
  }

  /** 获取工具的危险等级 */
  getDangerLevel(toolName: string): DangerLevel {
    const tool = this.registry.get(toolName);
    return getEffectiveDangerLevel(tool);
  }
}

/** 全局工具执行器单例 */
export const toolExecutor = new ToolExecutor();

// TOOL_TIMEOUTS 已移至 domain/constants.ts，此处 re-export 保持向后兼容
export { TOOL_TIMEOUTS } from "../domain/constants";
