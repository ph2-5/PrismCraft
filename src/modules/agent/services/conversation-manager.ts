/**
 * 会话管理器（ConversationManager）
 *
 * 设计要点：
 * - 维护消息历史
 * - 上下文窗口管理（滑动窗口，保留最近 N 条）
 * - 构建发送给 LLM 的消息序列（OpenAI 格式）
 * - 支持流式消息的增量更新
 */

import type { ToolCall } from "@/domain/ports/ai-provider-port";
import type { AgentSession, AgentMessage } from "../domain/types";
import { generateMessageId } from "../domain/types";
import { t } from "@/shared/constants";

/** OpenAI 消息格式（发送给 LLM） */
export interface LLMMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  name?: string;
}

/**
 * 滑动窗口大小硬上限（保留最近 N 条消息，防止极端情况）
 *
 * 注意：主要截断策略已改为 Token-based（见 MAX_CONTEXT_TOKENS），
 * 此常量仅作为安全边界，避免恶意/异常情况下消息数组无限增长。
 */
const MAX_MESSAGES = 100;

/**
 * 上下文窗口 Token 预算（近似估算）
 *
 * 设计依据：
 * - maxTokensPerTurn 默认 4096，上下文应留 2-3 倍余地
 * - system prompt（含项目状态 + 核心记忆 + 工具列表）约 1500-2500 token
 * - 因此消息历史预算约 6000 token，总 prompt 约 8000-10000 token
 *
 * 估算方式：字符数 / 4（中英文混合近似值，实际 token 数因模型而异）
 * - 中文：1 字 ≈ 1-2 token
 * - 英文：1 字符 ≈ 0.25 token
 * - 混合取 0.25 偏保守，确保不超限
 */
const MAX_CONTEXT_TOKENS = 6000;

/**
 * 估算字符串的 token 数（近似值）
 *
 * 采用字符数 / 4 的简化估算：
 * - 英文：4 字符 ≈ 1 token（OpenAI BPE 平均）
 * - 中文：1 字 ≈ 1-2 token，但 /4 会低估
 * - 保守取 /4 可确保不超限，实际可能用更少 token
 *
 * 若需精确估算，可接入 tiktoken 库，但会增加包体积。
 * 对于滑动窗口场景，近似估算足够。
 */
function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * 估算单条消息的 token 数（含 role 标记开销）
 *
 * OpenAI 消息格式每条约有 4 token 的固定开销（role 标记 + 分隔符）。
 * tool_calls 的 arguments JSON 也会消耗 token，需计入。
 */
function estimateMessageTokens(message: AgentMessage): number {
  const OVERHEAD_TOKENS = 4;
  let text = message.content ?? "";
  // tool_calls 的 arguments 计入
  if (message.toolCalls && message.toolCalls.length > 0) {
    text += message.toolCalls.map((tc) => tc.function.arguments).join("");
  }
  return estimateTokens(text) + OVERHEAD_TOKENS;
}

class ConversationManager {
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

      const msgTokens = estimateMessageTokens(msg);

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
