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

/** 滑动窗口大小（保留最近 N 条消息） */
const MAX_MESSAGES = 30;

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

  /** 构建发送给 LLM 的消息序列（含 system prompt + 滑动窗口） */
  buildLLMMessages(
    session: AgentSession,
    systemPrompt: string,
    options?: { maxMessages?: number },
  ): LLMMessage[] {
    const max = options?.maxMessages ?? MAX_MESSAGES;
    const messages = session.messages.slice(-max);

    return [
      { role: "system", content: systemPrompt },
      ...messages.map((m) => this.toLLMMessage(m)),
    ];
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

export { ConversationManager, MAX_MESSAGES };
