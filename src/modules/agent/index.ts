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
// P1-4：Agent 设置独立页面（路由 /agent/settings）
export { AgentSettingsPage } from "./presentation/AgentSettingsPage";

// 核心服务（供 container.ts 动态导入）
export { toolRegistry } from "./services/tool-registry";
export { toolExecutor } from "./services/tool-executor";
export { conversationManager } from "./services/conversation-manager";
export { memoryService, MemoryService, prewarmEmbeddings } from "@/modules/agent-memory";
// sub-agent-runner（供 specialist-tools 迁移后通过 barrel 导入，避免深路径）
export { runSpecialist, listAvailableSpecialists } from "./services/sub-agent-runner";

// 审计日志已拆分至 @/modules/audit-log

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
// 工厂函数（供 agent-session 等拆分模块的测试使用）
export { createEmptySession, generateMessageId } from "./domain/types";
// 会话存储 + 检查点已拆分至 @/modules/agent-session（阶段2-b）
// 此处 re-export 保持向后兼容，audit-log 仍可通过 @/modules/agent 取 listSessions
export type { SessionListItem } from "@/modules/agent-session";
export { listSessions } from "@/modules/agent-session";
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
export type { SpecialistAgent } from "@/modules/agent-specialist";
// 检查点类型已迁移至 @/modules/agent-session（阶段2-b），此处 re-export 保持向后兼容
export type {
  SessionCheckpoint,
  CheckpointStatus,
  CheckpointIndexEntry,
} from "@/modules/agent-session";
