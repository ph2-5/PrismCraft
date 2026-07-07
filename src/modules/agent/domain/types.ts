/**
 * AI Agent 助手 - 领域类型定义
 *
 * 设计原则：
 * - 所有类型自包含，不依赖 React 运行时
 * - 与 @/domain/ports/ai-provider-port 的 ToolDef/StreamChunk 对齐
 * - 工具实现接口 ToolImpl 统一规范，确保工具间无冲突
 */

import type { ToolDef, ToolCall, StreamChunk } from "@/domain/ports/ai-provider-port";

/** Agent 消息角色 */
export type AgentRole = "user" | "assistant" | "tool";

/** Agent 会话消息 */
export interface AgentMessage {
  id: string;
  role: AgentRole;
  content: string;
  /** assistant 请求的工具调用 */
  toolCalls?: ToolCall[];
  /** tool 消息关联的工具调用 ID */
  toolCallId?: string;
  /** tool 消息的工具名 */
  toolName?: string;
  timestamp: number;
  /** 是否正在流式输出 */
  streaming?: boolean;
  /** 工具执行错误（role=tool 时） */
  error?: string;
}

/** 工具执行结果 */
export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  /** 执行耗时（ms） */
  duration?: number;
}

/** 工具业务域分类（用于按域过滤、权限控制） */
export type ToolDomain =
  | "asset"
  | "generation"
  | "story"
  | "video"
  | "shot"
  | "config"
  | "system"
  | "web"
  | "image-edit"
  | "video-post"
  | "audio"
  | "template"
  | "workflow"
  | "help"
  | "monitor"
  | "diagnostic"
  | "memory"
  | "project-io"
  | "file-management";

/** 工具执行上下文 */
export interface ToolContext {
  /** 当前会话 ID */
  sessionId: string;
  /** 取消信号 */
  signal?: AbortSignal;
  /** 通知 UI 更新进度 */
  onProgress?: (message: string) => void;
  /** 当前会话的取消令牌（内部使用） */
  _cancelled?: boolean;
}

/** 工具实现接口 */
export interface ToolImpl {
  /** 工具定义（传给 LLM 的 function schema） */
  def: ToolDef;
  /** 业务域 */
  domain: ToolDomain;
  /** 执行函数 */
  execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>;
  /** 是否需要用户确认（如删除操作） */
  requiresConfirmation?: boolean;
  /** 工具超时（ms），未设置则使用默认值 */
  timeoutMs?: number;
}

/** Agent 会话 */
export interface AgentSession {
  id: string;
  title: string;
  messages: AgentMessage[];
  createdAt: number;
  updatedAt: number;
}

/** Agent Loop 配置 */
export interface AgentLoopConfig {
  /** 最大循环次数（防死循环，默认 10） */
  maxIterations: number;
  /** 每轮最大 token */
  maxTokensPerTurn: number;
  /** 温度 */
  temperature: number;
  /** system prompt 覆盖 */
  systemPromptOverride?: string;
  /** 启用的工具列表（undefined=全部） */
  enabledTools?: string[];
  /** LLM provider ID */
  providerId?: string;
  /** LLM model ID */
  modelId?: string;
}

/** Agent Loop 默认配置 */
export const DEFAULT_AGENT_CONFIG: AgentLoopConfig = {
  maxIterations: 10,
  maxTokensPerTurn: 4096,
  temperature: 0.7,
};

/** 工具执行状态（用于 UI 展示） */
export type ToolExecutionStatus = "pending" | "running" | "done" | "error" | "cancelled";

/** 工具执行记录（UI 状态） */
export interface ToolExecution {
  /** 对应 ToolCall.id */
  id: string;
  toolCall: ToolCall;
  status: ToolExecutionStatus;
  result?: ToolResult;
  /** 进度消息 */
  progress?: string;
  /** 开始时间 */
  startedAt: number;
  /** 结束时间 */
  endedAt?: number;
}

/** Agent Loop 回调 */
export interface AgentLoopCallbacks {
  /** 流式 chunk 回调 */
  onChunk: (chunk: StreamChunk) => void;
  /** 工具调用开始 */
  onToolCall: (toolCall: ToolCall) => void;
  /** 工具执行结果 */
  onToolResult: (toolCallId: string, result: ToolResult) => void;
  /** 工具执行进度 */
  onToolProgress?: (toolCallId: string, message: string) => void;
  /** 错误回调 */
  onError?: (error: Error) => void;
  /** 取消信号 */
  signal?: AbortSignal;
}

/** 创建空会话（title 为空，由调用方设置 i18n 标题） */
export function createEmptySession(): AgentSession {
  const now = Date.now();
  return {
    id: `session_${now}_${Math.random().toString(36).slice(2, 8)}`,
    title: "",
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** 生成消息 ID */
export function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export type { ToolDef, ToolCall, StreamChunk };
