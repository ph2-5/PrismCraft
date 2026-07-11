/**
 * 记忆服务（Memory Service）
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
 * 自动抽取流程：
 * - 会话结束时（或达到抽取阈值）触发
 * - 用 textProvider 从最近 N 条消息中提取偏好、事实、摘要
 * - 偏好合并到核心记忆（覆盖同 key）
 * - 摘要追加到归档记忆
 *
 * 设计要点：
 * - 归档记忆检索委托 VectorSearchEngine，本模块只负责存储与抽取
 * - Embedding 不再混入 archival.json，独立存到 embeddings.json（S5）
 * - 所有操作 try/catch，失败不阻断 Agent Loop
 * - 核心记忆大小超限时自动淘汰最旧的 fact
 * - 向量检索失败时静默退回关键词匹配
 */

import { container } from "@/infrastructure/di";
import { getConfig, setConfig, writeFile, readFile, getCacheDirectory } from "@/shared/file-http";
import type {
  AgentMessage,
  CoreMemory,
  MemoryFact,
  ArchivalMemoryEntry,
  ExtractedMemory,
} from "../domain/types";
import type { IMemoryService } from "../domain/ports";
import {
  createDefaultEngine,
  type VectorSearchEngine,
  type EmbeddingStore,
  type ProgressCallback,
} from "./vector-search";

// Re-export memory types from domain/types for backward compatibility
// （类型已迁移到 domain/types.ts，此处 re-export 保持现有 import 路径不破坏）
export type {
  CoreMemory,
  MemoryFact,
  ArchivalMemoryEntry,
  ExtractedMemory,
} from "../domain/types";

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
  } catch {
    return { ...EMPTY_CORE_MEMORY };
  }
}

/** 保存核心记忆 */
async function saveCoreMemory(memory: CoreMemory): Promise<boolean> {
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
  const memory = await getCoreMemory();
  memory.preferences[key] = value;
  return saveCoreMemory(memory);
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
  const memory = await getCoreMemory();
  const before = memory.facts.length;
  memory.facts = memory.facts.filter((f) => f.key !== key);
  if (memory.facts.length === before) return true; // 不存在也算成功
  return saveCoreMemory(memory);
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

/** 追加归档记忆条目 */
export async function addArchivalMemory(
  entry: Omit<ArchivalMemoryEntry, "id" | "createdAt"> & { id?: string; createdAt?: number },
): Promise<boolean> {
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
  const all = await getAllArchivalMemory();
  const filtered = all.filter((e) => e.id !== id);
  if (filtered.length === all.length) return true;
  return saveArchivalMemory(filtered);
}

// ============= 自动抽取 =============

/**
 * 从对话中自动抽取记忆
 *
 * 使用 textProvider 分析最近的消息，提取：
 * - 用户偏好（如风格、provider 偏好）
 * - 项目事实（如改编来源、目标时长）
 * - 会话摘要（追加到归档记忆）
 *
 * 失败时不抛异常，返回 null。
 */
export async function extractFromConversation(
  messages: AgentMessage[],
  _sessionId?: string,
  options?: { providerId?: string; modelId?: string },
): Promise<ExtractedMemory | null> {
  // 过滤出最近的消息（最多 20 条，跳过 tool 消息）
  const recentMessages = messages
    .filter((m) => m.role === "user" || (m.role === "assistant" && m.content))
    .slice(-20);

  if (recentMessages.length < 3) {
    // 消息太少，不值得抽取
    return null;
  }

  const conversationText = recentMessages
    .map((m) => {
      const role = m.role === "user" ? "用户" : "助手";
      return `[${role}] ${m.content}`;
    })
    .join("\n\n");

  const prompt = `请分析以下对话，提取值得长期记住的信息。严格按 JSON 格式输出，不要输出其他内容。

对话内容：
${conversationText}

请输出以下 JSON 结构：
{
  "preferences": {
    "preferred_style": "用户偏好的视觉风格（如有）",
    "preferred_provider": "用户偏好的 API provider（如有）",
    "language": "用户使用语言（如 zh-CN）"
  },
  "facts": [
    { "key": "source_novel", "value": "项目改编来源（如有）" },
    { "key": "target_duration", "value": "目标视频时长（如有）" }
  ],
  "summary": "本次对话的 200 字摘要，包含用户的核心需求和达成的结果"
}

要求：
1. 只提取明确出现的信息，不要臆测
2. preferences 和 facts 可以为空对象/数组
3. summary 必须填写
4. 不要输出 JSON 以外的内容`;

  try {
    const result = await container.textProvider.generateText(prompt, {
      maxTokens: 1024,
      temperature: 0.3,
      providerId: options?.providerId,
      modelId: options?.modelId,
    });

    if (!result.success || !result.data) return null;

    const text = result.data.text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

    const preferences: Record<string, string | number | boolean> = {};
    if (parsed.preferences && typeof parsed.preferences === "object") {
      for (const [k, v] of Object.entries(parsed.preferences as Record<string, unknown>)) {
        if (v != null && (typeof v === "string" || typeof v === "number" || typeof v === "boolean")) {
          preferences[k] = v;
        }
      }
    }

    const facts: Array<{ key: string; value: string }> = [];
    if (Array.isArray(parsed.facts)) {
      for (const f of parsed.facts as Array<Record<string, unknown>>) {
        if (f && typeof f.key === "string" && typeof f.value === "string" && f.value) {
          facts.push({ key: f.key, value: f.value });
        }
      }
    }

    const summary =
      typeof parsed.summary === "string" && parsed.summary.trim()
        ? parsed.summary.trim()
        : "";

    return { preferences, facts, summary };
  } catch {
    return null;
  }
}

/**
 * 应用抽取结果到记忆系统
 *
 * - 偏好合并到核心记忆（覆盖同 key）
 * - 事实追加到核心记忆（同 key 覆盖）
 * - 摘要追加到归档记忆
 */
export async function applyExtractedMemory(
  extracted: ExtractedMemory,
  sessionId?: string,
): Promise<void> {
  const memory = await getCoreMemory();

  // 合并偏好
  for (const [k, v] of Object.entries(extracted.preferences)) {
    memory.preferences[k] = v;
  }

  // 合并事实
  const now = Date.now();
  for (const fact of extracted.facts) {
    const idx = memory.facts.findIndex((f) => f.key === fact.key);
    if (idx >= 0) {
      memory.facts[idx] = { ...fact, updatedAt: now };
    } else {
      memory.facts.push({ ...fact, updatedAt: now });
    }
  }

  // 限制 facts 数量
  if (memory.facts.length > MAX_FACTS_COUNT) {
    memory.facts.sort((a, b) => a.updatedAt - b.updatedAt);
    memory.facts = memory.facts.slice(memory.facts.length - MAX_FACTS_COUNT);
  }

  await saveCoreMemory(memory);

  // 追加摘要到归档记忆
  if (extracted.summary) {
    await addArchivalMemory({
      type: "summary",
      content: extracted.summary,
      sessionId,
      tags: ["auto-extracted"],
    });
  }
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

// ============= 上下文摘要压缩（P2 深化） =============

/**
 * 摘要对话历史（P2 上下文摘要压缩）
 *
 * 将旧消息压缩为摘要，释放上下文空间。
 * - 使用 textProvider 从消息中提取关键信息
 * - 支持增量摘要（合并已有摘要 + 新消息）
 * - 失败时返回 null，不阻断 Agent Loop
 *
 * @param messages 需要摘要的消息列表
 * @param existingSummary 已有的摘要（增量合并，传 undefined 表示首次摘要）
 * @returns 新的摘要文本，或 null
 */
export async function summarizeConversation(
  messages: AgentMessage[],
  existingSummary?: string,
): Promise<string | null> {
  // 过滤出 user + assistant 消息（跳过 tool 消息，太结构化不适合摘要）
  const dialogueMessages = messages.filter(
    (m) => (m.role === "user" || (m.role === "assistant" && m.content)) && m.content,
  );

  if (dialogueMessages.length < 3) {
    // 消息太少，不值得摘要
    return null;
  }

  // 构建摘要 prompt
  const conversationText = dialogueMessages
    .map((m) => `${m.role === "user" ? "用户" : "助手"}: ${m.content!.slice(0, 500)}`)
    .join("\n");

  const summaryPrompt = existingSummary
    ? `请更新以下对话摘要。合并已有摘要与新对话内容，保持简洁（200字以内）：

已有摘要：
${existingSummary}

新对话：
${conversationText}

更新后的摘要（只输出摘要内容，不要其他文字）：`
    : `请将以下对话摘要为简洁的要点（200字以内），保留关键决策、用户偏好和重要上下文：

${conversationText}

摘要（只输出摘要内容，不要其他文字）：`;

  try {
    const result = await container.textProvider.generateText(summaryPrompt, {
      maxTokens: 300,
      temperature: 0.3,
    });

    if (!result.success || !result.data?.text) {
      return null;
    }

    return result.data.text.trim();
  } catch {
    return null;
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
      const time = new Date(entry.createdAt).toLocaleDateString("zh-CN");
      const typeLabel = entry.type === "summary" ? "摘要" : entry.type === "fact" ? "事实" : "决策";
      lines.push(`- [${typeLabel}][${time}] ${entry.content}`);
    }

    return lines.join("\n");
  } catch {
    // 检索失败不阻断 Agent Loop
    return "";
  }
}
