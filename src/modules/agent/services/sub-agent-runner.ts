/**
 * 子 Agent 运行器（P4 多 Agent 编排）
 *
 * 设计要点：
 * - 创建临时 AgentSession + AgentLoop，用 Specialist 配置运行子任务
 * - 子 Agent 的输出不直接显示给用户，而是作为工具结果返回给主 Agent
 * - 防递归：子 Agent 不注册 delegate_to_specialist 工具（通过 enabledTools 白名单实现）
 * - 超时保护：子 Agent 默认 60s 超时（可配置）
 * - 上下文传递：主 Agent 将相关上下文作为子 Agent 的 task 前缀
 * - 白名单硬执行：ToolExecutor 注入 allowedTools，LLM 幻觉调用白名单外工具会被拒绝
 * - 危险操作确认：子 Agent 的危险操作通过 onConfirmationRequired 回调向上传播给主 Agent
 *
 * 工作流程：
 * 1. 主 Agent 调用 delegate_to_specialist(specialistId, task, context)
 * 2. SubAgentRunner 创建临时 session + AgentLoop（用 Specialist 配置）
 * 3. 子 Agent 独立运行（可调用其白名单内的工具）
 * 4. 收集子 Agent 的最终文本回复
 * 5. 返回 ToolResult 给主 Agent
 *
 * 注意事项：
 * - 子 Agent 的 onChunk/onToolCall/onToolResult 回调为空操作（不直接显示给用户）
 * - 子 Agent 的危险操作通过 onConfirmationRequired 向上传播给主 Agent UI
 * - 子 Agent 的 session 不持久化（临时内存对象）
 */

import type { AgentSession, AgentLoopCallbacks, ToolResult, ToolContext } from "../domain/types";
import { AgentLoop } from "./agent-loop";
import { ToolExecutor } from "./tool-executor";
import { specialistRegistry } from "./specialist-registry";
import { createEmptySession } from "../domain/types";

/** 子 Agent 默认超时（60s） */
const DEFAULT_SUB_AGENT_TIMEOUT_MS = 60_000;

/**
 * 运行 Specialist 子 Agent
 *
 * @param specialistId 专家 ID（必须在 specialistRegistry 中注册）
 * @param task 子任务描述（子 Agent 的用户输入）
 * @param context 任务上下文（主 Agent 传递的背景信息，追加到 task 前面）
 * @param parentCtx 父工具上下文（用于取消信号传递）
 * @param parentConfirmation 父 Agent 的确认回调（用于向上传播危险操作确认）
 * @returns ToolResult，data 含 specialist/task/result/toolCallsCount
 */
export async function runSpecialist(
  specialistId: string,
  task: string,
  context: string,
  parentCtx?: ToolContext,
  parentConfirmation?: (toolCall: import("@/domain/ports/ai-provider-port").ToolCall) => Promise<boolean>,
): Promise<ToolResult> {
  const startTime = Date.now();

  // 1. 查找 Specialist
  const specialist = specialistRegistry.get(specialistId);
  if (!specialist) {
    return {
      success: false,
      error: `专家 ${specialistId} 不存在。可用专家：${specialistRegistry.list().map((s) => s.id).join(", ")}`,
      duration: 0,
    };
  }

  // 2. 构建子任务输入（上下文 + 任务）
  const subTaskInput = context
    ? `## 任务上下文\n${context}\n\n## 你的任务\n${task}`
    : task;

  // 3. 创建临时会话
  const session: AgentSession = {
    ...createEmptySession(),
    title: `[子任务] ${specialist.name}: ${task.slice(0, 30)}`,
  };

  // 4. 收集子 Agent 的文本输出
  const chunks: string[] = [];
  let toolCallsCount = 0;
  const toolResultsSummary: string[] = [];

  // 5. 超时保护（必须在 callbacks 之前初始化，因为 callbacks 引用 timeoutController.signal）
  const timeoutMs = DEFAULT_SUB_AGENT_TIMEOUT_MS;
  const timeoutController = new AbortController();
  const timer = setTimeout(() => timeoutController.abort(), timeoutMs);

  // 外部取消信号联动
  const onParentAbort = () => timeoutController.abort();
  if (parentCtx?.signal) {
    if (parentCtx.signal.aborted) {
      clearTimeout(timer);
      return {
        success: false,
        error: "已取消",
        duration: Date.now() - startTime,
      };
    }
    parentCtx.signal.addEventListener("abort", onParentAbort, { once: true });
  }

  // 6. 配置 callbacks（不直接显示给用户）
  const callbacks: AgentLoopCallbacks = {
    onChunk: (chunk) => {
      if (chunk.delta) {
        chunks.push(chunk.delta);
      }
    },
    onToolCall: () => {
      toolCallsCount++;
    },
    onToolResult: (_toolCallId, result) => {
      if (!result.success && result.error) {
        toolResultsSummary.push(`- 失败: ${result.error.slice(0, 100)}`);
      }
    },
    onToolProgress: () => {
      // 子 Agent 的进度不回传给主 Agent（避免干扰）
    },
    onError: (error) => {
      toolResultsSummary.push(`- 子 Agent 错误: ${error.message.slice(0, 100)}`);
    },
    // 危险工具确认：向上传播给主 Agent UI（如果主 Agent 提供了确认回调）
    // 如果主 Agent 未提供确认回调，则默认拒绝（安全默认）
    onConfirmationRequired: parentConfirmation ?? (async () => false),
    // 传递超时 + 取消信号（timeoutController 同时响应 60s 超时和父 Agent 取消）
    signal: timeoutController.signal,
  };

  // 7. 构建 AgentLoop 配置
  const config: Partial<import("../domain/types").AgentLoopConfig> = {
    systemPromptOverride: specialist.systemPrompt,
    enabledTools: specialist.enabledTools,
    temperature: specialist.temperature,
    maxIterations: specialist.maxIterations ?? 5,
    // P1-B：标记来源 Specialist，用于审计日志区分工具调用来源
    specialistName: specialist.name,
  };

  // 7.1 创建带白名单的 ToolExecutor（硬执行 Specialist 工具白名单）
  const whitelistedExecutor = new ToolExecutor(undefined, specialist.enabledTools);

  // 8. 创建并运行子 AgentLoop（注入白名单 executor）
  const loop = new AgentLoop(session, callbacks, config, {
    toolExecutor: whitelistedExecutor,
  });

  try {
    await loop.run(subTaskInput);
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    // 超时导致的 abort 不算错误
    if (timeoutController.signal.aborted) {
      return {
        success: false,
        error: `子 Agent 执行超时（${timeoutMs / 1000}s）`,
        duration: Date.now() - startTime,
      };
    }
    return {
      success: false,
      error: `子 Agent 运行失败: ${errMsg}`,
      duration: Date.now() - startTime,
    };
  } finally {
    clearTimeout(timer);
    if (parentCtx?.signal) {
      parentCtx.signal.removeEventListener("abort", onParentAbort);
    }
    loop.abort(); // 确保子 Agent 的 LLM 调用被中止
  }

  // 8. 收集最终结果
  let finalContent = chunks.join("");
  if (!finalContent) {
    // 从 session 最后一条 assistant 消息取
    const lastAssistant = [...session.messages]
      .reverse()
      .find((m) => m.role === "assistant" && m.content);
    finalContent = lastAssistant?.content ?? "";
  }

  // 9. 构建返回结果
  const duration = Date.now() - startTime;
  if (!finalContent) {
    return {
      success: false,
      error: `子 Agent 未返回任何内容（调用 ${toolCallsCount} 次工具）`,
      duration,
    };
  }

  // 附加工具执行摘要（如有失败）
  const toolSummary = toolResultsSummary.length > 0
    ? `\n\n## 工具执行情况\n- 总调用: ${toolCallsCount} 次\n${toolResultsSummary.join("\n")}`
    : "";

  return {
    success: true,
    data: {
      specialist: specialist.name,
      specialistId: specialist.id,
      task,
      result: finalContent + toolSummary,
      toolCallsCount,
      duration,
    },
    duration,
  };
}

/**
 * 列出所有可用的 Specialist（供 delegate_to_specialist 工具的 LLM 决策用）
 *
 * 返回格式化的列表，包含 id / name / description。
 */
export function listAvailableSpecialists(): string {
  const list = specialistRegistry.listSummaries();
  if (list.length === 0) return "（无可用专家）";
  return list.map((s) => `- \`${s.id}\`：${s.name} — ${s.description}`).join("\n");
}
