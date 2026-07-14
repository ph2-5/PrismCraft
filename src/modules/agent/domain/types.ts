/**
 * AI Agent 助手 - 领域类型定义
 *
 * 设计原则：
 * - 所有类型自包含，不依赖 React 运行时
 * - 与 @/domain/ports/ai-provider-port 的 ToolDef/StreamChunk 对齐
 * - 工具实现接口 ToolImpl 统一规范，确保工具间无冲突
 */

import type { ToolDef, ToolCall, StreamChunk } from "@/domain/ports/ai-provider-port";
import type { SessionCheckpoint } from "./checkpoint-types";

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
  | "file-management"
  | "plugin";

/**
 * 工具危险等级（用于权限分层控制）
 *
 * - safe：只读/无副作用操作，无需确认（如 list_characters、get_project_state）
 * - limited：有副作用但可恢复，可选确认（如 create_character、update_story）
 * - destructive：不可逆操作，必须确认（如 delete_file、import_project with replace）
 */
export type DangerLevel = "safe" | "limited" | "destructive";

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
  /**
   * 危险工具确认回调（用于子 Agent 向上传播）。
   *
   * 由 AgentLoop 从 callbacks.onConfirmationRequired 注入，
   * delegate_to_specialist 工具将其传给 SubAgentRunner，
   * 使子 Agent 的危险操作也能弹出用户确认。
   */
  _confirmDangerous?: (toolCall: ToolCall) => Promise<boolean>;
}

/** 工具实现接口 */
export interface ToolImpl {
  /** 工具定义（传给 LLM 的 function schema） */
  def: ToolDef;
  /** 业务域 */
  domain: ToolDomain;
  /** 执行函数 */
  execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>;
  /** 是否需要用户确认（如删除操作）。destructive 级别工具自动视为 true */
  requiresConfirmation?: boolean;
  /** 危险等级（默认 safe） */
  dangerLevel?: DangerLevel;
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
  /**
   * 对话摘要（P2 上下文摘要压缩）
   *
   * 当历史消息超过 token 预算被截断时，旧消息会被 LLM 摘要压缩。
   * 摘要缓存在此字段，注入 system prompt 的 {CONVERSATION_SUMMARY} 占位符。
   * 摘要随会话持久化，避免重复生成。
   */
  conversationSummary?: string;
  /** 摘要覆盖的最新消息 ID（已摘要的消息范围标记，避免重复摘要） */
  summaryCoveredUpTo?: string;
  /**
   * P5 断点恢复：运行时检查点
   *
   * 仅在 AgentLoop 运行期间存在，正常完成后被清除。
   * 应用重启时检测到此字段且 status=running，则标记为 interrupted，
   * 用户可加载中断会话查看历史并重新发送消息继续。
   */
  checkpoint?: SessionCheckpoint;
}

/**
 * 上下文窗口预算分配策略
 *
 * 将模型上下文窗口划分为三部分：
 * 1. system prompt（项目状态 + 核心记忆 + 工具列表）
 * 2. 历史消息（滑动窗口，超限截断）
 * 3. 生成预留（maxTokensPerTurn）
 *
 * 设计依据：
 * - 主流模型上下文窗口 8K-128K，默认按 16K 保守配置
 * - system prompt 含动态项目状态，约 1500-3000 token
 * - 生成预留与 maxTokensPerTurn 对齐
 * - 历史消息占大头，保留尽量多的上下文
 *
 * 可通过 AgentLoopConfig.contextBudget 覆盖，适配不同模型窗口大小。
 */
export interface ContextBudget {
  /** 上下文窗口总大小（token） */
  totalBudget: number;
  /** system prompt 最大 token（超出时记录警告，不截断 system） */
  maxSystemPromptTokens: number;
  /** 历史消息最大 token（超限时滑动窗口截断） */
  maxHistoryTokens: number;
  /** 为生成预留的 token（应 >= maxTokensPerTurn） */
  reservedForGeneration: number;
}

/** 默认上下文预算（基于 16K 窗口的保守分配） */
export const DEFAULT_CONTEXT_BUDGET: ContextBudget = {
  totalBudget: 16000,
  maxSystemPromptTokens: 4000,
  maxHistoryTokens: 8000,
  reservedForGeneration: 4096,
};

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
  /** 上下文预算配置（undefined=使用 DEFAULT_CONTEXT_BUDGET） */
  contextBudget?: ContextBudget;
  /** 工具结果最大 token（超限截断，默认 2000） */
  maxToolResultTokens?: number;
  /**
   * 总执行时间上限（ms，默认 5 分钟）。
   * 超过此时间后 Agent Loop 自动停止，防止长时间运行消耗资源。
   * 设为 0 表示不限制。
   */
  maxTotalDurationMs?: number;
  /**
   * 工具调用频率上限（每分钟最大调用次数，默认 60）。
   * 超过此频率时暂停执行，等待至下一分钟窗口。
   * 设为 0 表示不限制。
   */
  maxToolCallsPerMinute?: number;
  /**
   * 来源 Specialist 名称（仅子 Agent 设置，主 Agent 不设置）。
   * 用于审计日志区分工具调用来源。
   */
  specialistName?: string;
}

/** Agent Loop 默认配置 */
export const DEFAULT_AGENT_CONFIG: AgentLoopConfig = {
  maxIterations: 10,
  maxTokensPerTurn: 4096,
  temperature: 0.7,
  contextBudget: DEFAULT_CONTEXT_BUDGET,
  maxToolResultTokens: 2000,
  // P1-D：迭代保护增强 — 总执行时间 5 分钟，工具调用频率 60 次/分钟
  maxTotalDurationMs: 5 * 60 * 1000,
  maxToolCallsPerMinute: 60,
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
  /**
   * 危险工具确认回调（如 delete_file/move_file 等 requiresConfirmation=true 的工具）。
   *
   * 回调应返回 Promise<boolean>：
   * - true：用户确认执行
   * - false：用户拒绝，工具不执行，返回"已取消"结果
   *
   * 若未提供此回调，则默认拒绝所有需要确认的工具（安全默认）。
   */
  onConfirmationRequired?: (toolCall: ToolCall) => Promise<boolean>;
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

// ============= Memory 相关类型（从 services/memory-service.ts 迁移到 domain 层） =============
// 迁移原因：Port 接口（IMemoryService）需要引用这些类型，按分层原则应在 domain 层定义。
// memory-service.ts 仍 re-export 这些类型，保持向后兼容。

/** 核心记忆：常驻 prompt 的小量关键信息 */
export interface CoreMemory {
  /** 用户偏好（键值对，如 preferred_style: "赛博朋克"） */
  preferences: Record<string, string | number | boolean>;
  /** 项目事实（带 key 的列表，便于按 key 更新/删除） */
  facts: MemoryFact[];
}

/** 项目事实条目 */
export interface MemoryFact {
  /** 事实键，如 "source_novel"、"target_duration" */
  key: string;
  /** 事实值 */
  value: string;
  /** 更新时间戳 */
  updatedAt: number;
}

// 归档记忆条目类型已提取到 @/domain/types/memory.ts（供 vector-search 独立模块共享）
// 此处 re-export 保持向后兼容（现有 import 路径不破坏）
export type { ArchivalMemoryEntry } from "@/domain/types/memory";

/** LLM 自动抽取结果 */
export interface ExtractedMemory {
  /** 提取的偏好（会合并到核心记忆） */
  preferences: Record<string, string | number | boolean>;
  /** 提取的事实（会追加到核心记忆，同 key 覆盖） */
  facts: Array<{ key: string; value: string }>;
  /** 会话摘要（追加到归档记忆） */
  summary: string;
}
