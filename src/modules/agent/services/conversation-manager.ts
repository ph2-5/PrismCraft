/**
 * 会话管理器（ConversationManager）
 *
 * 设计要点：
 * - 维护消息历史
 * - 上下文窗口管理（滑动窗口，保留最近 N 条）
 * - 构建发送给 LLM 的消息序列（OpenAI 格式）
 * - 支持流式消息的增量更新
 */

import type { LLMMessage, ToolCall } from "@/domain/schemas/llm-message";
import type { AgentSession, AgentMessage } from "../domain/types";
import type { IConversationManager } from "../domain/ports";
import { generateMessageId, DEFAULT_CONTEXT_BUDGET } from "../domain/types";
import { estimateContentTokens, TOKEN_OVERHEAD_PER_MESSAGE } from "@/shared-logic/agent";
import { t } from "@/shared/constants";

// Re-export LLMMessage for backward compatibility (existing imports from conversation-manager)
export type { LLMMessage } from "@/domain/schemas/llm-message";

/**
 * 滑动窗口大小硬上限（保留最近 N 条消息，防止极端情况）
 *
 * 注意：主要截断策略已改为 Token-based（见 MAX_CONTEXT_TOKENS），
 * 此常量仅作为安全边界，避免恶意/异常情况下消息数组无限增长。
 */
const MAX_MESSAGES = 100;

/**
 * 上下文窗口 Token 预算
 *
 * 取自 DEFAULT_CONTEXT_BUDGET.maxHistoryTokens（默认 8000）。
 * 可通过 buildLLMMessages 的 options.maxTokens 覆盖，适配不同模型窗口大小。
 *
 * Token 估算委托 shared-logic/agent/token-estimator（中英文区分精确估算）：
 * - CJK 汉字：1.5 token/字
 * - ASCII：0.25 token/字符（4 字符 = 1 token）
 * - 相比旧的字符数/4，中文估算更精确（旧法低估中文 token）
 */
const MAX_CONTEXT_TOKENS = DEFAULT_CONTEXT_BUDGET.maxHistoryTokens;

class ConversationManager implements IConversationManager {
  /** 创建用户消息并追加到会话 */
  appendUserMessage(session: AgentSession, content: string): AgentMessage {
    const msg: AgentMessage = {
      id: generateMessageId(),
      role: "user",
      content,
      timestamp: Date.now(),
    };
    session.messages.push(msg);
    session.updatedAt = Date.now();
    // 第一条用户消息作为标题
    if (session.messages.length === 1) {
      session.title = content.slice(0, 30) + (content.length > 30 ? "..." : "");
    }
    return msg;
  }

  /** 创建流式 assistant 消息（占位，待 onChunk 填充） */
  startStreamingAssistant(session: AgentSession): AgentMessage {
    const msg: AgentMessage = {
      id: generateMessageId(),
      role: "assistant",
      content: "",
      streaming: true,
      timestamp: Date.now(),
    };
    session.messages.push(msg);
    session.updatedAt = Date.now();
    return msg;
  }

  /** 追加流式 delta 到最后一条 assistant 消息 */
  appendDelta(session: AgentSession, delta: string): void {
    const last = session.messages[session.messages.length - 1];
    if (last && last.role === "assistant" && last.streaming) {
      last.content += delta;
      session.updatedAt = Date.now();
    }
  }

  /** 设置 assistant 消息的工具调用 */
  setToolCalls(session: AgentSession, toolCalls: ToolCall[]): void {
    const last = session.messages[session.messages.length - 1];
    if (last && last.role === "assistant") {
      last.toolCalls = toolCalls;
    }
  }

  /** 结束流式状态 */
  finishStreaming(session: AgentSession, finishReason?: string): void {
    const last = session.messages[session.messages.length - 1];
    if (last && last.role === "assistant") {
      last.streaming = false;
      // 如果因 tool_calls 结束，保留 streaming 状态由 loop 继续
      if (finishReason === "tool_calls") {
        last.streaming = false;
      }
    }
  }

  /** 追加工具结果消息 */
  appendToolResult(
    session: AgentSession,
    toolCallId: string,
    toolName: string,
    result: { success: boolean; data?: unknown; error?: string },
  ): AgentMessage {
    const msg: AgentMessage = {
      id: generateMessageId(),
      role: "tool",
      content: JSON.stringify(result.success ? result.data : { error: result.error }),
      toolCallId,
      toolName,
      error: result.success ? undefined : result.error,
      timestamp: Date.now(),
    };
    session.messages.push(msg);
    session.updatedAt = Date.now();
    return msg;
  }

  /**
   * 构建发送给 LLM 的消息序列（含 system prompt + Token-based 滑动窗口）
   *
   * 截断策略（从最近向最远累积）：
   * 1. system prompt 永不截断，始终在最前
   * 2. 从最近的消息向前累积，直到达到 MAX_CONTEXT_TOKENS 预算
   * 3. 超预算时丢弃最旧的消息（保留最近的上下文）
   * 4. MAX_MESSAGES 作为硬上限，防止极端情况
   *
   * 特殊处理：
   * - tool 消息必须与其对应的 assistant 消息（含 tool_calls）成对保留，
   *   否则 LLM 会因孤立的 tool 消息报错。若 assistant 消息被截断，
   *   其后续的 tool 消息也会被丢弃。
   */
  buildLLMMessages(
    session: AgentSession,
    systemPrompt: string,
    options?: { maxMessages?: number; maxTokens?: number },
  ): LLMMessage[] {
    const maxMessages = options?.maxMessages ?? MAX_MESSAGES;
    const maxTokens = options?.maxTokens ?? MAX_CONTEXT_TOKENS;

    // 从最近的消息向前累积，直到达到 token 预算
    const selected: AgentMessage[] = [];
    let usedTokens = 0;

    for (let i = session.messages.length - 1; i >= 0; i--) {
      const msg = session.messages[i];
      if (!msg) break;

      const msgTokens = estimateContentTokens(msg) + TOKEN_OVERHEAD_PER_MESSAGE;

      // 检查是否超预算
      if (usedTokens + msgTokens > maxTokens && selected.length > 0) {
        break;
      }

      // 检查是否超消息数硬上限
      if (selected.length >= maxMessages) {
        break;
      }

      selected.unshift(msg);
      usedTokens += msgTokens;
    }

    // 清理孤立的 tool 消息（其对应 assistant 消息已被截断）
    const cleaned = this.removeOrphanToolMessages(selected);

    return [
      { role: "system", content: systemPrompt },
      ...cleaned.map((m) => this.toLLMMessage(m)),
    ];
  }

  /**
   * 移除孤立的 tool 消息
   *
   * 如果 assistant 消息（含 tool_calls）被截断，其后续的 tool 消息
   * 必须一并移除，否则 LLM 会因找不到对应的 tool_call_id 而报错。
   */
  private removeOrphanToolMessages(messages: AgentMessage[]): AgentMessage[] {
    if (messages.length === 0) return [];

    const result: AgentMessage[] = [];
    /** 已见过的 tool_call_id 集合 */
    const seenToolCallIds = new Set<string>();

    for (const msg of messages) {
      if (msg.role === "assistant" && msg.toolCalls && msg.toolCalls.length > 0) {
        // 记录 assistant 声明的所有 tool_call_id
        for (const tc of msg.toolCalls) {
          seenToolCallIds.add(tc.id);
        }
        result.push(msg);
      } else if (msg.role === "tool" && msg.toolCallId) {
        // tool 消息：仅当其 toolCallId 在之前 assistant 消息中声明过时才保留
        if (seenToolCallIds.has(msg.toolCallId)) {
          result.push(msg);
        }
        // 否则丢弃孤立的 tool 消息
      } else {
        result.push(msg);
      }
    }

    return result;
  }

  /** 将内部 AgentMessage 转为 LLM 消息格式 */
  private toLLMMessage(m: AgentMessage): LLMMessage {
    const base: LLMMessage = { role: m.role, content: m.content };
    if (m.toolCalls && m.toolCalls.length > 0) {
      base.tool_calls = m.toolCalls.map((tc) => ({
        id: tc.id,
        type: "function",
        function: { name: tc.function.name, arguments: tc.function.arguments },
      }));
    }
    if (m.toolCallId) {
      base.tool_call_id = m.toolCallId;
      if (m.toolName) base.name = m.toolName;
    }
    return base;
  }

  /** 清空会话 */
  clear(session: AgentSession): void {
    session.messages = [];
    session.title = t("agent.newSession");
    session.updatedAt = Date.now();
  }
}

/** 全局会话管理器单例 */
export const conversationManager = new ConversationManager();

export { ConversationManager, MAX_MESSAGES, MAX_CONTEXT_TOKENS };
