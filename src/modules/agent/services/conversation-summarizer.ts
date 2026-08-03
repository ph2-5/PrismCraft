/**
 * 会话摘要压缩（从 AgentLoop.maybeSummarizeConversation 提取，P2.1）。
 *
 * 独立逻辑：
 * - 计算当前消息历史的 token 总量
 * - 超过阈值（maxHistoryTokens * 0.8）时触发摘要
 * - 只摘要未被已摘要覆盖的旧消息（增量摘要）
 * - 摘要结果缓存在 session.conversationSummary
 * - 异步执行，不阻断 Agent Loop
 *
 * 提取原因：降低 agent-loop.ts 行数，且该逻辑自包含、可独立测试。
 */

import type { AgentSession } from "../domain/types";
import type { IMemoryService } from "../domain/ports";
import { errorLogger } from "@/shared/error-logger";

const RECENT_MESSAGES_KEEP = 10;
const MIN_MESSAGES_TO_SUMMARIZE = 3;

/**
 * 检测并触发对话摘要压缩（fire-and-forget 语义，由调用方使用 void 触发）。
 *
 * @param session 会话对象（摘要结果直接写入 session.conversationSummary / summaryCoveredUpTo）
 * @param memoryService 记忆服务（summarizeConversation）
 * @param maxHistoryTokens 历史 token 上限，超过 80% 时触发摘要
 */
export async function maybeSummarizeConversation(
  session: AgentSession,
  memoryService: IMemoryService,
  maxHistoryTokens: number,
): Promise<void> {
  const summarizeThreshold = Math.floor(maxHistoryTokens * 0.8);

  // 估算当前消息 token 总量
  const { estimateMessagesTokens } = await import("@/shared-logic/agent");
  const totalTokens = estimateMessagesTokens(
    session.messages.map((m) => ({
      role: m.role,
      content: m.content,
      toolCalls: m.toolCalls,
    })),
    false,
  );

  if (totalTokens < summarizeThreshold) {
    return; // 未达阈值，不需要摘要
  }

  // 找到需要摘要的旧消息范围（未被 summaryCoveredUpTo 覆盖的）
  const toSummarize = resolveMessagesToSummarize(session);

  if (toSummarize.length < MIN_MESSAGES_TO_SUMMARIZE) {
    return; // 可摘要的消息太少
  }

  // 异步触发摘要（不等待，不阻断）
  void memoryService
    .summarizeConversation(toSummarize, session.conversationSummary)
    .then((summary) => {
      if (summary) {
        session.conversationSummary = summary;
        // 标记摘要覆盖到最后一条被摘要的消息
        const lastSummarized = toSummarize[toSummarize.length - 1];
        if (lastSummarized) {
          session.summaryCoveredUpTo = lastSummarized.id;
        }
      }
    })
    .catch((err) => {
      errorLogger.warn("[AgentLoop] 会话摘要失败", err);
    });
}

/**
 * 计算需要摘要的消息范围（保留最近 10 条不摘要）。
 */
function resolveMessagesToSummarize(session: AgentSession): typeof session.messages {
  const coveredId = session.summaryCoveredUpTo;
  if (!coveredId) {
    // 首次摘要：保留最近 10 条，摘要之前的
    return session.messages.slice(0, -RECENT_MESSAGES_KEEP);
  }

  const coveredIdx = session.messages.findIndex((m) => m.id === coveredId);
  if (coveredIdx >= 0) {
    // 摘要从 coveredIdx+1 开始到最近 N 条之前的消息（保留最近 10 条不摘要）
    const summarizeEnd = Math.max(coveredIdx + 1, session.messages.length - RECENT_MESSAGES_KEEP);
    return session.messages.slice(coveredIdx + 1, summarizeEnd);
  }
  return session.messages.slice(0, -RECENT_MESSAGES_KEEP);
}
