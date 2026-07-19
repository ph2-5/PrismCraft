/**
 * AI Agent 助手 - 领域类型定义
 *
 * 设计原则：
 * - 所有类型自包含，不依赖 React 运行时
 * - 与 @/domain/ports/ai-provider-port 的 ToolDef/StreamChunk 对齐
 * - 工具实现接口 ToolImpl 统一规范，确保工具间无冲突
 *
 * 阶段3-1：工具相关类型（ToolImpl/ToolResult/ToolContext/ToolDomain/DangerLevel/
 * ToolExecution/ToolExecutionStatus）已迁移至 @/domain/types/agent-tools，
 * 此处 re-export 保持向后兼容（services/hooks/presentation 中的现有 import 不破坏）。
 * 工具文件（tools/）应直接从 @/domain/types/agent-tools import，避免对 @/modules/agent 的依赖。
 */

import type { ToolDef, ToolCall, StreamChunk } from "@/domain/ports/ai-provider-port";
// SessionCheckpoint 类型已迁移至 @/modules/agent-session（阶段2-b），此处通过 barrel 导入
import type { SessionCheckpoint } from "@/modules/agent-session";

// 工具相关类型 re-export（阶段3-1 迁移至 @/domain/types/agent-tools）
// import type 引入本文件作用域（AgentLoopCallbacks.onToolResult 等需要引用 ToolResult）
// export type re-export 给外部消费者，保持向后兼容
import type {
  ToolResult,
  ToolDomain,
  DangerLevel,
  ToolContext,
  ToolImpl,
  ToolExecutionStatus,
  ToolExecution,
} from "@/domain/types/agent-tools";
export type {
  ToolResult,
  ToolDomain,
  DangerLevel,
  ToolContext,
  ToolImpl,
  ToolExecutionStatus,
  ToolExecution,
};

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
  /**
   * safety 改写日志（IP/名人/品牌改写 + antislop 过滤）
   *
   * 由 AgentLoop.run 在用户输入被 safety 改写时暂存，便于 UI 展示。
   * 仅运行时存在，不参与持久化序列化（可选字段，缺失时视为空数组）。
   */
  safetyLog?: unknown[];
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
  /**
   * 动态系统提示注入（P2 集成：来自外部事件，如 VIDEO_TASK_COMPLETED）。
   *
   * 注入位置：buildSystemPrompt 中 5 个占位符替换之后、意图路由之前。
   * 用途：将异步事件转化为 Agent 上下文，让 Agent 在下次 sendMessage 时感知事件。
   * 一次性消费：useAgent 在 sendMessage 完成后清空 ref，避免污染后续无关对话。
   */
  systemHint?: string;
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

// ToolExecutionStatus / ToolExecution 已迁移至 @/domain/types/agent-tools（阶段3-1）
// 此处通过文件顶部 re-export 提供向后兼容

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

// ============= Memory 相关类型 =============
// CoreMemory / MemoryFact / ExtractedMemory 已迁移至 @/modules/agent-memory/domain/types（阶段2-d）
// ArchivalMemoryEntry 已提取到 @/domain/types/memory（供 vector-search 共享）
// 此处 re-export 保持向后兼容（现有 import 路径不破坏）
export type {
  CoreMemory,
  MemoryFact,
  ExtractedMemory,
  ArchivalMemoryEntry,
} from "@/modules/agent-memory";
