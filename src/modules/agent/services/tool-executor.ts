/**
 * 工具执行器（ToolExecutor）
 *
 * 设计要点：
 * - 解析 ToolCall 的 arguments JSON 字符串
 * - 支持超时控制（查询类 30s / 生成类 5min / 视频任务类 30min）
 * - 支持取消信号（AbortSignal）
 * - 捕获异常并转换为 ToolResult
 * - 记录执行耗时
 */

import type { ToolCall } from "@/domain/ports/ai-provider-port";
import type { ToolResult, ToolContext } from "../domain/types";
import type { IToolExecutor, IToolRegistry } from "../domain/ports";
import { toolRegistry } from "./tool-registry";

/** 默认超时：30 秒（查询类） */
const DEFAULT_TIMEOUT_MS = 30_000;

/** 工具执行器 */
export class ToolExecutor implements IToolExecutor {
  /**
   * 注入的工具注册表（不传则使用模块单例 toolRegistry）
   *
   * 方案 3 DI 化：允许测试注入 mock registry，或组合不同的工具集。
   */
  private readonly registry: IToolRegistry;

  constructor(registry?: IToolRegistry) {
    this.registry = registry ?? toolRegistry;
  }

  /**
   * 执行单个工具调用
   * @param toolCall LLM 返回的工具调用请求
   * @param ctx 工具执行上下文
   * @returns 工具执行结果
   */
  async execute(toolCall: ToolCall, ctx: ToolContext): Promise<ToolResult> {
    const startTime = Date.now();
    const tool = this.registry.get(toolCall.function.name);

    if (!tool) {
      return {
        success: false,
        error: `未知工具：${toolCall.function.name}`,
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
    if (ctx.signal) {
      if (ctx.signal.aborted) {
        clearTimeout(timer);
        return {
          success: false,
          error: "工具执行已取消",
          duration: Date.now() - startTime,
        };
      }
      ctx.signal.addEventListener("abort", () => controller.abort(), { once: true });
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
        error: e instanceof Error ? e.message : String(e),
        duration: Date.now() - startTime,
      };
    } finally {
      clearTimeout(timer);
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

  /** 检查工具是否需要确认 */
  requiresConfirmation(toolCall: ToolCall): boolean {
    const tool = this.registry.get(toolCall.function.name);
    return tool?.requiresConfirmation ?? false;
  }
}

/** 全局工具执行器单例 */
export const toolExecutor = new ToolExecutor();

/** 工具超时预设（按业务域） */
export const TOOL_TIMEOUTS = {
  /** 查询类：30 秒 */
  query: 30_000,
  /** 创建/更新类：60 秒 */
  mutation: 60_000,
  /** AI 生成类：5 分钟 */
  generation: 5 * 60_000,
  /** 视频任务类：30 分钟 */
  videoTask: 30 * 60_000,
  /** 网络下载类：10 分钟 */
  download: 10 * 60_000,
} as const;
