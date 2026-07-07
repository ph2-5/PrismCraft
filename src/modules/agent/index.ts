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

// 核心服务（供测试或高级用法使用）
export { AgentLoop } from "./services/agent-loop";
export { toolRegistry } from "./services/tool-registry";
export { toolExecutor } from "./services/tool-executor";
export { conversationManager } from "./services/conversation-manager";
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
export { registerAllTools } from "./tools";

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
} from "./domain/types";
export { createEmptySession, DEFAULT_AGENT_CONFIG } from "./domain/types";

// 设置类型
export type { AgentSettings } from "./hooks/use-agent";

// 人格模板
export { AGENT_PERSONAS, DEFAULT_SYSTEM_PROMPT } from "./domain/prompts";
export type { AgentPersona } from "./domain/prompts";
