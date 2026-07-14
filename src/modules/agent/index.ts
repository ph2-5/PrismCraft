/**
 * AI Agent 助手模块 - 公共 API
 *
 * 设计要点：
 * - 通过 barrel 导出所有公共 API
 * - 内部实现细节不导出
 * - 其他模块通过 @/modules/agent 导入
 */

// 主页面组件
export { AgentPage } from "./presentation/AgentPage";

// 核心服务（供 container.ts 动态导入）
export { toolRegistry } from "./services/tool-registry";
export { toolExecutor } from "./services/tool-executor";
export { conversationManager } from "./services/conversation-manager";
export { memoryService, MemoryService } from "./services/memory-service";
export { prewarmEmbeddings } from "./services/memory-service";

// 审计日志（AuditLogPanel.tsx 从 barrel 导入）
export type { AuditEntry, AuditQueryFilter } from "./services/audit-storage";
export {
  queryAuditLogs,
  clearAllAuditLogs,
  getAuditStats,
} from "./services/audit-storage";

// 领域类型（保留 type 导出供类型推断和外部使用）
export type { UseAgentReturn } from "./hooks/use-agent";
export type {
  AgentSession,
  AgentMessage,
  AgentRole,
  ToolImpl,
  ToolResult,
  ToolContext,
  ToolDomain,
  ToolExecution,
  ToolExecutionStatus,
  AgentLoopConfig,
  AgentLoopCallbacks,
  ContextBudget,
  CoreMemory,
  MemoryFact,
  ArchivalMemoryEntry,
  ExtractedMemory,
} from "./domain/types";
export type { SessionListItem } from "./services/session-storage";
export type {
  IConversationManager,
  IToolRegistry,
  IToolExecutor,
  IMemoryService,
  AgentLoopDeps,
} from "./domain/ports";
export type { AgentSettings } from "./hooks/use-agent";
export type { AgentPersona } from "./domain/prompts";
export type {
  ToolPluginConfig,
  ToolPluginTool,
  ToolPluginAction,
  HttpCallAction,
  BuiltinMirrorAction,
  TextTemplateAction,
  ToolPluginLoadResult,
  ToolPluginsConfig,
} from "./domain/tool-plugin-types";
export type { SpecialistAgent } from "./domain/specialist-types";
export type {
  SessionCheckpoint,
  CheckpointStatus,
  CheckpointIndexEntry,
} from "./domain/checkpoint-types";
