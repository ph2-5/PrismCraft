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
 * 自动抽取流程（已拆分到 memory-service-extraction.ts）：
 * - 会话结束时（或达到抽取阈值）触发
 * - 用 textProvider 从最近 N 条消息中提取偏好、事实、摘要
 * - 偏好合并到核心记忆（覆盖同 key）
 * - 摘要追加到归档记忆
 *
 * 种子记忆（静态数据已拆分到 memory-service-seed-data.ts）：
 * - 预置通用动画创作知识与项目最佳实践
 * - 首次启动时自动注入到归档记忆
 *
 * 设计要点：
 * - 归档记忆检索委托 VectorSearchEngine，本模块只负责存储与抽取
 * - Embedding 不再混入 archival.json，独立存到 embeddings.json（S5）
 * - 所有操作 try/catch，失败不阻断 Agent Loop
 * - 核心记忆大小超限时自动淘汰最旧的 fact
 * - 向量检索失败时静默退回关键词匹配
 */

import { getConfig, setConfig, writeFile, readFile, getCacheDirectory } from "@/shared/file-http";
// Memory 领域类型从本模块 domain/types 导入（阶段2-d 迁移）
import type {
  CoreMemory,
  MemoryFact,
  ArchivalMemoryEntry,
  ExtractedMemory,
} from "../domain/types";
// AgentMessage 和 IMemoryService 仍归属于 @/modules/agent（Agent 核心类型/端口接口）。
// 通过 import type 引用，编译时擦除，无运行时循环依赖（与阶段2-b agent-session 模式一致）。
import type { AgentMessage, IMemoryService } from "@/modules/agent";
import {
  createDefaultEngine,
  type VectorSearchEngine,
  type EmbeddingStore,
  type ProgressCallback,
} from "@/modules/vector-search";
import { SEED_MEMORY_ENTRIES } from "./memory-service-seed-data";
import { errorLogger } from "@/shared/error-logger";

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

// ============= 类型定义 =============
// Memory 相关类型已迁移到 domain/types.ts（见文件顶部 re-export）。
// 此处保留注释占位，避免 Git diff 误导。

// ============= 常量 =============

/** 核心记忆配置键 */
const CORE_MEMORY_KEY = "agent.coreMemory";

/** 归档记忆文件目录（相对缓存目录） */
const MEMORY_DIR = "agent/memory";

/** 归档记忆文件名 */
const ARCHIVAL_FILE = "archival.json";

/** 核心记忆 facts 最大条数 */
const MAX_FACTS_COUNT = 20;

/** 归档记忆最大条数 */
const MAX_ARCHIVAL_ENTRIES = 200;

/** 触发自动抽取的消息阈值（用户消息数） */
const EXTRACTION_THRESHOLD = 5;

/** 空的核心记忆 */
const EMPTY_CORE_MEMORY: CoreMemory = {
  preferences: {},
  facts: [],
};

// ============= 核心记忆操作 =============

/** 读取核心记忆 */
export async function getCoreMemory(): Promise<CoreMemory> {
  try {
    const raw = await getConfig(CORE_MEMORY_KEY);
    if (!raw || typeof raw !== "object") {
      return { ...EMPTY_CORE_MEMORY };
    }
    const data = raw as Record<string, unknown>;
    const preferences =
      data.preferences && typeof data.preferences === "object"
        ? (data.preferences as CoreMemory["preferences"])
        : {};
    const facts = Array.isArray(data.facts)
      ? (data.facts as MemoryFact[]).filter(
          (f) => f && typeof f.key === "string" && typeof f.value === "string",
        )
      : [];
    return { preferences, facts };
  } catch (err) {
    errorLogger.warn("[MemoryService] 读取核心记忆失败", err);
    return { ...EMPTY_CORE_MEMORY };
  }
}

/** 保存核心记忆 */
export async function saveCoreMemory(memory: CoreMemory): Promise<boolean> {
  try {
    await setConfig(CORE_MEMORY_KEY, memory);
    return true;
  } catch {
    return false;
  }
}

/** 更新单个偏好（覆盖同 key） */
export async function updatePreference(
  key: string,
  value: string | number | boolean,
): Promise<boolean> {
  if (!key || typeof key !== "string") return false;
  // 串行化 read-modify-write，防止并发覆盖（复用 archivalWriteChain）
  const result = archivalWriteChain.then(() => withWriteTimeout(async () => {
    const memory = await getCoreMemory();
    memory.preferences[key] = value;
    return saveCoreMemory(memory);
  })).catch(() => false);

  archivalWriteChain = result.then(() => undefined).catch(() => undefined);

  return result;
}

/** 保存事实（同 key 覆盖） */
export async function saveFact(key: string, value: string): Promise<boolean> {
  if (!key || !value) return false;
  const memory = await getCoreMemory();
  const now = Date.now();
  const existingIdx = memory.facts.findIndex((f) => f.key === key);
  if (existingIdx >= 0) {
    memory.facts[existingIdx] = { key, value, updatedAt: now };
  } else {
    memory.facts.push({ key, value, updatedAt: now });
    // 超限时淘汰最旧的
    if (memory.facts.length > MAX_FACTS_COUNT) {
      memory.facts.sort((a, b) => a.updatedAt - b.updatedAt);
      memory.facts = memory.facts.slice(memory.facts.length - MAX_FACTS_COUNT);
    }
  }
  return saveCoreMemory(memory);
}

/** 删除事实 */
export async function removeFact(key: string): Promise<boolean> {
  // 串行化 read-modify-write，防止并发覆盖（复用 archivalWriteChain）
  const result = archivalWriteChain.then(() => withWriteTimeout(async () => {
    const memory = await getCoreMemory();
    const before = memory.facts.length;
    memory.facts = memory.facts.filter((f) => f.key !== key);
    if (memory.facts.length === before) return true; // 不存在也算成功
    return saveCoreMemory(memory);
  })).catch(() => false);

  archivalWriteChain = result.then(() => undefined).catch(() => undefined);

  return result;
}

/** 删除偏好 */
export async function removePreference(key: string): Promise<boolean> {
  const memory = await getCoreMemory();
  if (!(key in memory.preferences)) return true;
  delete memory.preferences[key];
  return saveCoreMemory(memory);
}

/** 清空核心记忆 */
export async function clearCoreMemory(): Promise<boolean> {
  return saveCoreMemory({ ...EMPTY_CORE_MEMORY });
}

// ============= 归档记忆操作 =============

/** 获取归档记忆文件路径 */
async function getArchivalFilePath(): Promise<string | null> {
  const result = await getCacheDirectory();
  if (!result.success || !result.path) return null;
  return `${result.path}/${MEMORY_DIR}/${ARCHIVAL_FILE}`;
}

/** 读取所有归档记忆 */
export async function getAllArchivalMemory(): Promise<ArchivalMemoryEntry[]> {
  const filePath = await getArchivalFilePath();
  if (!filePath) return [];

  try {
    const result = await readFile(filePath);
    if (!result?.success || !result.data) return [];
    const text = new TextDecoder().decode(result.data);
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e) => e && typeof e.id === "string" && typeof e.content === "string",
    ) as ArchivalMemoryEntry[];
  } catch {
    return [];
  }
}

/**
 * P1-2 修复：addArchivalMemory 串行化锁
 *
 * 原问题：addArchivalMemory 是 read-modify-write 模式（getAllArchivalMemory → push → saveArchivalMemory），
 * 并发调用时后写入会覆盖先写入的数据。
 * 修复：用 promise 链串行化所有写操作。
 */
let archivalWriteChain: Promise<unknown> = Promise.resolve();

/**
 * 为 archivalWriteChain 上的 read-modify-write 操作添加超时保护。
 * 防止单次操作卡住（如 file-http 永久阻塞）导致整条串行链死锁。
 */
const WRITE_OP_TIMEOUT_MS = 10000;

function withWriteTimeout<T>(op: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("[memory-service] archival write operation timed out"));
    }, WRITE_OP_TIMEOUT_MS);
    op().then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/** 追加归档记忆条目 */
export async function addArchivalMemory(
  entry: Omit<ArchivalMemoryEntry, "id" | "createdAt"> & { id?: string; createdAt?: number },
): Promise<boolean> {
  // P1-2 修复：串行化整个 read-modify-write 流程
  const result = archivalWriteChain.then(() => withWriteTimeout(async () => {
    const all = await getAllArchivalMemory();
    const newEntry: ArchivalMemoryEntry = {
      id: entry.id ?? `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: entry.type,
      content: entry.content,
      sessionId: entry.sessionId,
      createdAt: entry.createdAt ?? Date.now(),
      tags: entry.tags,
    };

    all.push(newEntry);

    // 容量限制：按时间排序后保留最新的 N 条
    if (all.length > MAX_ARCHIVAL_ENTRIES) {
      all.sort((a, b) => a.createdAt - b.createdAt);
      all.splice(0, all.length - MAX_ARCHIVAL_ENTRIES);
    }

    return saveArchivalMemory(all);
  })).catch(() => false);

  // 更新链头，使后续调用排队
  archivalWriteChain = result.then(() => undefined).catch(() => undefined);

  return result;
}

/** 保存归档记忆（全量覆盖） */
async function saveArchivalMemory(entries: ArchivalMemoryEntry[]): Promise<boolean> {
  const filePath = await getArchivalFilePath();
  if (!filePath) return false;

  try {
    const jsonStr = JSON.stringify(entries, null, 2);
    const result = await writeFile(filePath, jsonStr);
    return result.success;
  } catch {
    return false;
  }
}

/**
 * 检索归档记忆（委托 VectorSearchEngine 三策略链）
 *
 * 策略链顺序：API 向量 > 本地模型向量 > 关键词匹配（兜底）
 * - API/本地策略失败时自动退回关键词匹配
 * - Embedding 独立存储在 embeddings.json（与 archival.json 解耦）
 * - 维度版本检测：切换模型时自动清空旧 embedding（S2）
 *
 * @param query 检索关键词或自然语言查询；空 query 返回最近 N 条
 * @param limit 返回条数上限，默认 5
 * @param onProgress 可选进度回调（backfill 大批量 embedding 时触发，UI 显示进度条）
 *                   - phase="backfill"：正在生成缺失 embedding
 *                   - phase="search"：正在计算相似度
 *                   - strategy：当前生效的策略名称（"api" / "local" / "keyword"）
 */
export async function searchArchivalMemory(
  query: string,
  limit: number = 5,
  onProgress?: ProgressCallback,
): Promise<ArchivalMemoryEntry[]> {
  if (!query || !query.trim()) {
    // 空 query 返回最近 N 条
    const all = await getAllArchivalMemory();
    return all.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
  }

  const all = await getAllArchivalMemory();
  if (all.length === 0) return [];

  return getSearchEngine().search(query, all, limit, onProgress);
}

// ============= VectorSearchEngine 单例管理 =============

/**
 * 模块级引擎单例
 *
 * 首次调用 searchArchivalMemory 时懒初始化。
 * 测试可通过 _setSearchEngine / _resetSearchEngine 替换或重置。
 */
let _searchEngine: VectorSearchEngine | null = null;

/** 获取引擎单例（首次调用时创建默认引擎） */
function getSearchEngine(): VectorSearchEngine {
  if (!_searchEngine) {
    _searchEngine = createDefaultEngine();
  }
  return _searchEngine;
}

/**
 * 注入自定义引擎（测试用）
 *
 * 允许测试替换引擎实现，避免真实文件 I/O 与 API 调用。
 * 必须在测试 beforeEach 中调用，测试 afterEach 中调用 _resetSearchEngine。
 *
 * @param engine 自定义引擎实例；传 null 等同于 _resetSearchEngine
 * @param store 可选，同时暴露 EmbeddingStore 供测试断言
 */
export function _setSearchEngine(
  engine: VectorSearchEngine | null,
  store?: EmbeddingStore,
): void {
  _searchEngine = engine;
  _testStore = store ?? null;
}

/** 测试用 EmbeddingStore 引用（_setSearchEngine 时设置） */
let _testStore: EmbeddingStore | null = null;

/** 获取测试注入的 EmbeddingStore（无注入时返回 null） */
export function _getTestEmbeddingStore(): EmbeddingStore | null {
  return _testStore;
}

/** 重置引擎单例（测试用，恢复默认懒初始化行为） */
export function _resetSearchEngine(): void {
  _searchEngine = null;
  _testStore = null;
}

/** 删除归档记忆条目 */
export async function deleteArchivalMemory(id: string): Promise<boolean> {
  // P1-2 修复：同样通过串行化锁防止并发覆盖
  const result = archivalWriteChain.then(async () => {
    const all = await getAllArchivalMemory();
    const filtered = all.filter((e) => e.id !== id);
    if (filtered.length === all.length) return true;
    return saveArchivalMemory(filtered);
  }).catch(() => false);

  archivalWriteChain = result.then(() => undefined).catch(() => undefined);

  return result;
}

// ============= Prompt 构建 =============

/**
 * 构建核心记忆的 prompt 片段（注入 system prompt）
 *
 * 格式：
 * ## 用户偏好
 * - 偏好风格：赛博朋克
 * - 语言：zh-CN
 *
 * ## 项目事实
 * - source_novel: 三体
 * - target_duration: 30s
 */
export async function buildCoreMemoryPrompt(): Promise<string> {
  const memory = await getCoreMemory();

  const prefEntries = Object.entries(memory.preferences);
  const factEntries = memory.facts;

  if (prefEntries.length === 0 && factEntries.length === 0) {
    return ""; // 无记忆时不输出
  }

  const lines: string[] = ["## 记忆"];

  if (prefEntries.length > 0) {
    lines.push("### 用户偏好");
    for (const [k, v] of prefEntries) {
      lines.push(`- ${k}: ${v}`);
    }
  }

  if (factEntries.length > 0) {
    lines.push("### 项目事实");
    for (const f of factEntries) {
      lines.push(`- ${f.key}: ${f.value}`);
    }
  }

  return lines.join("\n");
}

// ============= 辅助函数 =============

/** 判断是否应该触发自动抽取（按用户消息数） */
export function shouldExtract(messages: AgentMessage[]): boolean {
  const userMsgCount = messages.filter((m) => m.role === "user").length;
  return userMsgCount >= EXTRACTION_THRESHOLD;
}

/** 获取核心记忆大小（序列化后字符数） */
export async function getCoreMemorySize(): Promise<number> {
  const memory = await getCoreMemory();
  try {
    return JSON.stringify(memory).length;
  } catch {
    return 0;
  }
}

/** 获取归档记忆条目数 */
export async function getArchivalMemoryCount(): Promise<number> {
  const all = await getAllArchivalMemory();
  return all.length;
}

/** 测试用：重置所有记忆 */
export async function _resetAllMemory(): Promise<void> {
  await saveCoreMemory({ ...EMPTY_CORE_MEMORY });
  await saveArchivalMemory([]);
}

// ============= 种子记忆（预训练数据-3） =============

/**
 * 种子记忆 — 预置通用动画创作知识与项目最佳实践
 *
 * 静态数据 SEED_MEMORY_ENTRIES 已拆分到 memory-service-seed-data.ts。
 * 此处保留函数实现，依赖 storage 函数（getAllArchivalMemory / saveArchivalMemory）。
 */

/** 种子记忆注入标记配置键（独立于 archival.json，防止用户清空后被重复注入） */
const SEED_MEMORY_FLAG_KEY = "agent.seedMemoryInjected";

/**
 * 检查种子记忆是否已注入
 *
 * 通过 config 标记判断，独立于 archival.json 文件存在性。
 * 这样即使用户清空了归档记忆，也不会被重复注入。
 */
async function isSeedMemoryInjected(): Promise<boolean> {
  try {
    const flag = await getConfig(SEED_MEMORY_FLAG_KEY);
    return flag === true;
  } catch {
    return false;
  }
}

/** 标记种子记忆已注入 */
async function markSeedMemoryInjected(): Promise<void> {
  try {
    await setConfig(SEED_MEMORY_FLAG_KEY, true);
  } catch {
    // 标记失败不阻断，下次启动可能重复注入（幂等检查会跳过已存在的种子）
  }
}

/**
 * 确保种子记忆已注入（首次启动时调用）
 *
 * 行为：
 * - 若已注入（config 标记为 true）→ 直接返回，跳过
 * - 若未注入 → 检查 archival.json 是否已有种子条目（防止标记丢失导致重复）
 * - 注入缺失的种子条目，最后设置标记
 *
 * 幂等性：通过 seed_ 前缀 id 检查，已存在的种子不会被重复添加。
 */
export async function ensureSeedMemory(): Promise<void> {
  try {
    // 已注入标记存在 → 跳过
    if (await isSeedMemoryInjected()) {
      return;
    }

    // 获取现有归档记忆（检查是否已有种子条目，防止标记丢失导致重复注入）
    const existing = await getAllArchivalMemory();
    const existingSeedIds = new Set(
      existing
        .map((e) => e.id)
        .filter((id): id is string => typeof id === "string" && id.startsWith("seed_")),
    );

    // 注入缺失的种子条目
    const now = Date.now();
    let injectedCount = 0;
    for (const entry of SEED_MEMORY_ENTRIES) {
      const seedId = `seed_${entry.localId}`;
      if (existingSeedIds.has(seedId)) continue;

      existing.push({
        id: seedId,
        type: entry.type,
        content: entry.content,
        createdAt: now + injectedCount, // 错开时间戳便于排序
        tags: entry.tags,
      });
      injectedCount++;
    }

    if (injectedCount > 0) {
      // 容量限制：种子记忆 + 用户记忆总数不超过上限
      if (existing.length > MAX_ARCHIVAL_ENTRIES) {
        existing.sort((a, b) => a.createdAt - b.createdAt);
        existing.splice(0, existing.length - MAX_ARCHIVAL_ENTRIES);
      }
      await saveArchivalMemory(existing);
    }

    // 标记已注入（无论本次是否实际注入，只要检查过就标记）
    await markSeedMemoryInjected();
  } catch {
    // 种子注入失败不阻断主流程，下次启动会重试
  }
}

/** 获取种子记忆统计信息（用于 UI 展示） */
export async function getSeedMemoryStats(): Promise<{
  total: number;
  injected: number;
}> {
  try {
    const existing = await getAllArchivalMemory();
    const injected = existing.filter(
      (e) => typeof e.id === "string" && e.id.startsWith("seed_"),
    ).length;
    return {
      total: SEED_MEMORY_ENTRIES.length,
      injected,
    };
  } catch {
    return { total: SEED_MEMORY_ENTRIES.length, injected: 0 };
  }
}

/**
 * 重置种子记忆注入标记（测试用 + 用户手动重新注入）
 *
 * 注意：此函数不会删除已注入的种子条目，仅清除标记。
 * 下次调用 ensureSeedMemory 时会检查并补充缺失的种子。
 */
export async function resetSeedMemoryFlag(): Promise<void> {
  try {
    await setConfig(SEED_MEMORY_FLAG_KEY, false);
  } catch {
    // 静默失败
  }
}

// ============= Embedding 缓存预热（预训练数据-4） =============

/**
 * 预热 Embedding 缓存
 *
 * 为所有归档记忆条目预生成 embedding，避免首次 RAG 检索时因懒生成导致延迟。
 *
 * 触发条件（用户主动调用）：
 * - 安装/启用本地 embedding 模型后
 * - 配置 API embedding capability 后
 * - 注入新的种子记忆后
 *
 * 行为：
 * - 遍历可用的向量策略（API 优先于本地），找到首个可用策略
 * - 使用通用 query 触发 search，复用策略内部的 backfill 逻辑
 * - 通过 onProgress 回调报告进度（phase="backfill"）
 * - 已有 embedding 的条目会被跳过（由 EmbeddingStore 判断）
 *
 * @param onProgress 可选进度回调
 * @returns 预热结果统计
 */
export async function prewarmEmbeddings(
  onProgress?: (progress: {
    phase: "backfill" | "search";
    current: number;
    total: number;
    strategy?: string;
    message?: string;
  }) => void,
): Promise<{
  success: boolean;
  total: number;
  strategy?: string;
  message?: string;
}> {
  try {
    const entries = await getAllArchivalMemory();
    if (entries.length === 0) {
      return { success: true, total: 0, message: "no entries" };
    }

    const engine = getSearchEngine();
    const result = await engine.prewarmEmbeddings(entries, onProgress);

    return {
      success: result.success,
      total: entries.length,
      strategy: result.strategy,
      message: result.message,
    };
  } catch (e) {
    return {
      success: false,
      total: 0,
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

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
