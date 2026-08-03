/**
 * 记忆服务（Memory Service）— 主入口
 *
 * 借鉴 Letta 分层记忆 + Mem0 自动抽取思想，实现轻量级记忆系统。
 *
 * 三层记忆架构：
 * 1. 核心记忆（Core Memory）— 常驻 system prompt，存储用户偏好和项目事实
 *    - 存储：getConfig("agent.coreMemory")
 *    - 大小限制：约 2KB（避免 prompt 膨胀）
 *    - 结构：{ preferences: {}, facts: [] }
 *
 * 2. 归档记忆（Archival Memory）— 按需检索，存储会话摘要和重要决策
 *    - 存储：缓存目录 agent/memory/archival.json
 *    - Embedding 独立存储：agent/memory/embeddings.json（含 modelId/dimensions 元信息）
 *    - 检索：委托 VectorSearchEngine 三策略链（API > 本地模型 > 关键词）
 *    - 容量上限：200 条，超出按时间淘汰
 *
 * 3. 工作记忆（Working Memory）— 当前会话消息历史（已有 AgentSession.messages）
 *
 * 三模式向量检索（委托 vector-search 子模块）：
 * - 模式 1（API）：embedding capability 已配置时，调用 container.embeddingProvider
 * - 模式 2（本地）：用户拖入 ONNX 模型文件时，调用本地推理引擎
 * - 模式 3（关键词）：以上都不可用时，退回关键词匹配 + 时间衰减
 * - 优先级：API > 本地模型 > 关键词
 * - 渐进增强：无任何向量配置时零破坏，保持原有行为
 * - Embedding 独立存储：与 archival.json 解耦，支持维度版本检测与自动失效
 *
 * 模块拆分（P2.1 重构，本文件仅保留聚合与主入口）：
 * - memory-core.ts        核心记忆操作（getCoreMemory / saveFact / buildCoreMemoryPrompt 等）
 * - memory-archival.ts    归档记忆操作（getAllArchivalMemory / searchArchivalMemory 等）
 * - memory-embeddings.ts  VectorSearchEngine 单例管理与 embedding 预热（prewarmEmbeddings 等）
 * - memory-seed.ts        种子记忆注入（ensureSeedMemory / getSeedMemoryStats 等）
 * - memory-shared.ts      共享常量与写串行化锁（enqueueArchivalWrite）
 * - memory-service-extraction.ts  自动抽取与摘要（extractFromConversation 等）
 * - memory-service-seed-data.ts   种子记忆静态数据（SEED_MEMORY_ENTRIES）
 *
 * 设计要点：
 * - 归档记忆检索委托 VectorSearchEngine，本模块只负责存储与抽取
 * - Embedding 不再混入 archival.json，独立存到 embeddings.json（S5）
 * - 所有操作 try/catch，失败不阻断 Agent Loop
 * - 核心记忆大小超限时自动淘汰最旧的 fact
 * - 向量检索失败时静默退回关键词匹配
 */

// Re-export memory types from domain/types for backward compatibility
export type {
  CoreMemory,
  MemoryFact,
  ArchivalMemoryEntry,
  ExtractedMemory,
} from "../domain/types";

// Import 抽取与摘要函数（从拆分文件）— MemoryService 类方法需要本地引用
import {
  extractFromConversation,
  applyExtractedMemory,
  summarizeConversation,
} from "./memory-service-extraction";

// Re-export for backward compatibility（保持外部 import 路径不破坏）
export {
  extractFromConversation,
  applyExtractedMemory,
  summarizeConversation,
};

// MemoryService 类方法需要本地引用的函数（从拆分文件导入）
import { buildCoreMemoryPrompt, shouldExtract } from "./memory-core";
import { searchArchivalMemory } from "./memory-archival";
// AgentMessage 和 IMemoryService 仍归属于 @/modules/agent（Agent 核心类型/端口接口）。
// 通过 import type 引用，编译时擦除，无运行时循环依赖（与阶段2-b agent-session 模式一致）。
import type { AgentMessage, IMemoryService } from "@/modules/agent";
// ExtractedMemory 从本模块 domain/types 导入（阶段2-d 迁移）
import type { ExtractedMemory } from "../domain/types";

// ============= Re-export 拆分模块（P2.1 重构） =============
// 公共 API 保持与拆分前完全一致：导出名、签名、类型不变。

// 核心记忆操作（memory-core.ts）
export {
  getCoreMemory,
  saveCoreMemory,
  updatePreference,
  saveFact,
  removeFact,
  removePreference,
  clearCoreMemory,
  buildCoreMemoryPrompt,
  shouldExtract,
  getCoreMemorySize,
} from "./memory-core";

// 归档记忆操作（memory-archival.ts）
export {
  getAllArchivalMemory,
  addArchivalMemory,
  searchArchivalMemory,
  deleteArchivalMemory,
  getArchivalMemoryCount,
} from "./memory-archival";

// 检索引擎管理与 embedding 预热（memory-embeddings.ts）
export {
  _setSearchEngine,
  _getTestEmbeddingStore,
  _resetSearchEngine,
  prewarmEmbeddings,
  _resetAllMemory,
} from "./memory-embeddings";

// 种子记忆（memory-seed.ts）
export {
  ensureSeedMemory,
  getSeedMemoryStats,
  resetSeedMemoryFlag,
} from "./memory-seed";

// ============= MemoryService class（方案 3：实现 IMemoryService 接口） =============

/**
 * 记忆服务实现（实现 IMemoryService 接口）
 *
 * 方案 3 Agent 服务 DI 化的产物：将原有纯函数包装为 class，
 * 使 AgentLoop 可通过构造函数注入 IMemoryService mock 进行单元测试。
 *
 * 设计要点：
 * - 内部委托给现有纯函数（零行为变更）
 * - 现有代码继续直接调用纯函数（向后兼容）
 * - 新代码可通过 IMemoryService 接口依赖（可测试、可替换）
 * - textProvider 仍通过 container 获取（memory-service 内部实现细节，
 *   不影响 AgentLoop 可测试性——测试 mock IMemoryService 接口即可）
 */
export class MemoryService implements IMemoryService {
  async buildCoreMemoryPrompt(): Promise<string> {
    return buildCoreMemoryPrompt();
  }

  async searchRelevant(userMessage: string, limit?: number): Promise<string> {
    return searchRelevantMemory(userMessage, limit);
  }

  shouldExtract(messages: AgentMessage[]): boolean {
    return shouldExtract(messages);
  }

  async extractFromConversation(
    messages: AgentMessage[],
    sessionId?: string,
    options?: { providerId?: string; modelId?: string },
  ): Promise<ExtractedMemory | null> {
    return extractFromConversation(messages, sessionId, options);
  }

  async applyExtractedMemory(extracted: ExtractedMemory, sessionId?: string): Promise<void> {
    return applyExtractedMemory(extracted, sessionId);
  }

  async summarizeConversation(
    messages: AgentMessage[],
    existingSummary?: string,
  ): Promise<string | null> {
    return summarizeConversation(messages, existingSummary);
  }
}

/** 全局记忆服务单例（实现 IMemoryService） */
export const memoryService = new MemoryService();

// ============= RAG 自动注入（P1 深化） =============

/**
 * 根据用户消息自动检索归档记忆并格式化为 prompt 片段
 *
 * 策略：
 * - 消息长度 <= 5 时不检索（太短无意义）
 * - 调用 searchArchivalMemory 检索 top-K 相关记忆
 * - 格式化为带时间戳的条目列表
 * - 失败或无结果时返回空字符串
 *
 * @param userMessage 用户最新消息
 * @param limit 返回条数上限（默认 3）
 * @returns 格式化的记忆片段，或空字符串
 */
export async function searchRelevantMemory(
  userMessage: string,
  limit: number = 3,
): Promise<string> {
  // 太短的消息不触发检索
  if (!userMessage || userMessage.trim().length <= 5) {
    return "";
  }

  try {
    const results = await searchArchivalMemory(userMessage, limit);
    if (results.length === 0) {
      return "";
    }

    // 格式化为 prompt 片段
    const lines: string[] = [];
    for (const entry of results) {
      const time = new Date(entry.createdAt).toLocaleDateString();
      const typeLabel = entry.type === "summary" ? "摘要" : entry.type === "fact" ? "事实" : "决策";
      lines.push(`- [${typeLabel}][${time}] ${entry.content}`);
    }

    return lines.join("\n");
  } catch {
    // 检索失败不阻断 Agent Loop
    return "";
  }
}
