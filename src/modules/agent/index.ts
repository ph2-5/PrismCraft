/**
 * AI Agent 助手模块 - 公共 API
 *
 * 设计要点：
 * - 通过 barrel 导出所有公共 API
 * - 内部实现细节不导出
 * - 其他模块通过 @/modules/agent 导入
 */

// 主 Hook
export { useAgent } from "./hooks/use-agent";
export type { UseAgentReturn } from "./hooks/use-agent";

// 主页面组件
export { AgentPage } from "./presentation/AgentPage";
export { MarkdownRenderer } from "./presentation/MarkdownRenderer";
export { AgentSettingsPanel, getPersonaPrompt } from "./presentation/AgentSettingsPanel";
export { SessionHistory } from "./presentation/SessionHistory";
export { CheckpointRecovery } from "./presentation/CheckpointRecovery";
export { ToolPluginManager } from "./presentation/ToolPluginManager";
export { ToolPluginEditor } from "./presentation/ToolPluginEditor";

// 核心服务（供测试或高级用法使用）
export { AgentLoop } from "./services/agent-loop";
export { toolRegistry } from "./services/tool-registry";
export { toolExecutor } from "./services/tool-executor";
export { conversationManager } from "./services/conversation-manager";
export { memoryService, MemoryService } from "./services/memory-service";
export { runAgentLoop } from "./services/agent-loop";
export {
  saveSession,
  loadSession,
  listSessions,
  deleteSession,
  persistSession,
  type SessionListItem,
} from "./services/session-storage";

// 工具注册
export { registerAllTools, loadToolPlugins } from "./tools";

// 领域类型
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
export { createEmptySession, DEFAULT_AGENT_CONFIG, DEFAULT_CONTEXT_BUDGET } from "./domain/types";

// Port 接口（方案 3：Agent 服务 DI 化）
export type {
  IConversationManager,
  IToolRegistry,
  IToolExecutor,
  IMemoryService,
  AgentLoopDeps,
} from "./domain/ports";

// 设置类型
export type { AgentSettings } from "./hooks/use-agent";

// 人格模板
export { AGENT_PERSONAS, DEFAULT_SYSTEM_PROMPT } from "./domain/prompts";
export type { AgentPersona } from "./domain/prompts";

// P3 工具插件化
export {
  loadToolPlugin,
  unloadPlugin,
  listLoadedPlugins,
  saveToolPluginFile,
  deleteToolPluginFile,
  listToolPluginFiles,
  loadAllToolPlugins,
  ensureToolPluginsLoaded,
} from "./services/tool-plugin-loader";
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

// P4 多 Agent 编排
export { specialistRegistry, SpecialistRegistry } from "./services/specialist-registry";
export { runSpecialist, listAvailableSpecialists } from "./services/sub-agent-runner";
export type { SpecialistAgent } from "./domain/specialist-types";
export { BUILTIN_SPECIALISTS } from "./domain/specialist-types";

// P5 断点恢复
export {
  initCheckpoint,
  saveCheckpoint,
  clearCheckpoint,
  markInterrupted,
  markRunningAsInterrupted,
  listInterruptedSessions,
  listRunningSessions,
  getCheckpoint,
  loadInterruptedSession,
} from "./services/session-checkpoint";
export type {
  SessionCheckpoint,
  CheckpointStatus,
  CheckpointIndexEntry,
} from "./domain/checkpoint-types";
export { createCheckpoint } from "./domain/checkpoint-types";
