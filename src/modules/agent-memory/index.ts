/**
 * agent-memory 模块 barrel
 *
 * 提供 Agent 记忆系统服务（三层记忆架构）：
 * - 核心记忆（Core Memory）：常驻 system prompt 的用户偏好和项目事实
 * - 归档记忆（Archival Memory）：按需检索的会话摘要和重要决策
 * - 工作记忆（Working Memory）：当前会话消息历史（由 AgentSession 管理）
 *
 * 记忆自动抽取：从对话中提取偏好、事实、摘要（LLM 驱动）
 * 向量检索：委托 @/modules/vector-search（三策略链：API > 本地模型 > 关键词）
 *
 * 消费者：
 * - @/modules/agent/services/agent-loop.ts（注入 system prompt + RAG 检索）
 * - @/modules/agent/hooks/use-agent.ts（自动抽取触发）
 * - @/modules/agent/tools/memory-tools.ts（工具调用）
 * - @/modules/agent/presentation/MemoryPanel.tsx（UI 管理）
 * - @/modules/settings/EmbeddingModelPanel.tsx（预热嵌入）
 * - @/infrastructure/di/container.ts（DI token: agentMemoryService）
 */

// 类型
export type {
  CoreMemory,
  MemoryFact,
  ExtractedMemory,
  ArchivalMemoryEntry,
} from "./domain/types";

// 核心服务
export {
  memoryService,
  MemoryService,
  getCoreMemory,
  saveCoreMemory,
  updatePreference,
  saveFact,
  removeFact,
  removePreference,
  clearCoreMemory,
  getAllArchivalMemory,
  addArchivalMemory,
  searchArchivalMemory,
  deleteArchivalMemory,
  buildCoreMemoryPrompt,
  shouldExtract,
  getCoreMemorySize,
  getArchivalMemoryCount,
  ensureSeedMemory,
  getSeedMemoryStats,
  resetSeedMemoryFlag,
  prewarmEmbeddings,
  searchRelevantMemory,
  _setSearchEngine,
  _resetSearchEngine,
  _getTestEmbeddingStore,
  _resetAllMemory,
} from "./services/memory-service";

// 抽取与摘要函数（从 memory-service re-export，保持向后兼容）
export {
  extractFromConversation,
  applyExtractedMemory,
  summarizeConversation,
} from "./services/memory-service";
