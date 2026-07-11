/**
 * Agent 服务 Port 接口
 *
 * 方案 3（Agent 服务 DI 化）的核心：将 agent 模块的协作服务抽象为 Port 接口，
 * 使 AgentLoop 通过构造函数注入协作者，而非 service-locator 模式直接访问 container。
 *
 * 设计要点：
 * - Port 接口放在模块 domain 层（模块自治，避免 infrastructure 反向依赖 modules）
 * - 接口方法签名只依赖 domain/types 和 @/domain/ports（分层合规）
 * - 实现侧（services/）实现这些接口，模块单例作为默认实现
 * - 测试可通过构造函数注入 mock，无需 module mocking
 * - DI container 用动态 import 注册 token（E 类），避免静态依赖违规
 *
 * 依赖方向：
 *   domain/ports → domain/types → @/domain/ports/ai-provider-port（合规）
 *   services/    → domain/ports（实现接口）
 *   hooks/       → services/（组装具体实现）
 */

import type { ToolCall, ToolDef, ITextProvider } from "@/domain/ports/ai-provider-port";
import type { LLMMessage } from "@/domain/schemas/llm-message";
import type {
  AgentSession,
  AgentMessage,
  ToolImpl,
  ToolDomain,
  ToolResult,
  ToolContext,
  ExtractedMemory,
} from "./types";

/**
 * 会话管理器接口
 *
 * 维护消息历史、构建 LLM 消息序列、管理流式增量更新。
 * 无状态纯逻辑（所有方法接受 session 参数），但定义为接口以便测试 mock。
 */
export interface IConversationManager {
  /** 创建用户消息并追加到会话 */
  appendUserMessage(session: AgentSession, content: string): AgentMessage;

  /** 创建流式 assistant 消息（占位，待 onChunk 填充） */
  startStreamingAssistant(session: AgentSession): AgentMessage;

  /** 追加流式 delta 到最后一条 assistant 消息 */
  appendDelta(session: AgentSession, delta: string): void;

  /** 设置 assistant 消息的工具调用 */
  setToolCalls(session: AgentSession, toolCalls: ToolCall[]): void;

  /** 结束流式状态 */
  finishStreaming(session: AgentSession, finishReason?: string): void;

  /** 追加工具结果消息 */
  appendToolResult(
    session: AgentSession,
    toolCallId: string,
    toolName: string,
    result: { success: boolean; data?: unknown; error?: string },
  ): AgentMessage;

  /**
   * 构建发送给 LLM 的消息序列（含 system prompt + Token-based 滑动窗口）
   *
   * 截断策略：从最近向最远累积，直到达到 token 预算；tool 消息需与对应 assistant 成对保留。
   */
  buildLLMMessages(
    session: AgentSession,
    systemPrompt: string,
    options?: { maxMessages?: number; maxTokens?: number },
  ): LLMMessage[];

  /** 清空会话 */
  clear(session: AgentSession): void;
}

/**
 * 工具注册表接口
 *
 * 统一管理所有工具，按 name 唯一注册。有状态服务，需 DI 替换。
 */
export interface IToolRegistry {
  /** 注册工具（重名抛错） */
  register(tool: ToolImpl): void;

  /** 批量注册 */
  registerAll(tools: ToolImpl[]): void;

  /** 按名称获取工具实现 */
  get(name: string): ToolImpl | undefined;

  /** 是否已注册 */
  has(name: string): boolean;

  /** 获取所有工具定义（传给 LLM 的 tools 参数） */
  getToolDefs(filter?: string[]): ToolDef[];

  /** 按业务域分组查询 */
  getByDomain(domain: ToolDomain): ToolImpl[];

  /** 获取所有工具名 */
  getAllNames(): string[];

  /** 获取工具数量 */
  size(): number;

  /** 清空注册表（仅测试用） */
  clear(): void;

  /** 获取工具描述列表（用于 system prompt） */
  getToolDescriptions(filter?: string[]): Array<{ name: string; description: string; domain: ToolDomain }>;
}

/**
 * 工具执行器接口
 *
 * 解析 ToolCall 参数、超时控制、异常捕获。依赖 IToolRegistry。
 */
export interface IToolExecutor {
  /** 执行单个工具调用 */
  execute(toolCall: ToolCall, ctx: ToolContext): Promise<ToolResult>;

  /** 批量执行工具调用（并行） */
  executeAll(
    toolCalls: ToolCall[],
    ctx: ToolContext,
  ): Promise<Array<{ toolCall: ToolCall; result: ToolResult }>>;

  /** 检查工具是否需要确认 */
  requiresConfirmation(toolCall: ToolCall): boolean;
}

/**
 * 记忆服务接口
 *
 * 三层记忆架构（核心/归档/工作）的管理服务。
 * AgentLoop 依赖 buildCoreMemoryPrompt；useAgent 依赖抽取与应用方法。
 */
export interface IMemoryService {
  /** 构建核心记忆的 prompt 片段（注入 system prompt） */
  buildCoreMemoryPrompt(): Promise<string>;

  /**
   * 根据用户消息自动检索归档记忆（RAG 自动注入）
   *
   * 策略：
   * - 根据用户最新消息检索 top-K 相关归档记忆
   * - 返回格式化的 prompt 片段（注入 system prompt 的 {RELEVANT_MEMORY} 占位符）
   * - 失败或无结果时返回空字符串（不阻断 Agent Loop）
   *
   * @param userMessage 用户最新消息
   * @param limit 返回条数上限（默认 3）
   * @returns 格式化的记忆片段，或空字符串
   */
  searchRelevant(userMessage: string, limit?: number): Promise<string>;

  /** 判断是否应该触发自动抽取（按用户消息数） */
  shouldExtract(messages: AgentMessage[]): boolean;

  /** 从对话中自动抽取记忆（失败返回 null） */
  extractFromConversation(
    messages: AgentMessage[],
    sessionId?: string,
    options?: { providerId?: string; modelId?: string },
  ): Promise<ExtractedMemory | null>;

  /** 应用抽取结果到记忆系统（偏好合并 + 摘要追加） */
  applyExtractedMemory(extracted: ExtractedMemory, sessionId?: string): Promise<void>;
}

/**
 * AgentLoop 的协作者依赖
 *
 * AgentLoop 通过此接口接收所有外部协作服务。
 * 不传时使用模块单例作为默认实现（向后兼容）。
 *
 * textProvider 包含在此接口中（而非仅从 container 获取），使 AgentLoop 完全解耦：
 * 测试可直接注入 mock textProvider，无需 mock container。
 */
export interface AgentLoopDeps {
  conversationManager: IConversationManager;
  toolRegistry: IToolRegistry;
  toolExecutor: IToolExecutor;
  memoryService: IMemoryService;
  textProvider: ITextProvider;
}
