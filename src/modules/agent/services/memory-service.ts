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

// ============= 种子记忆（预训练数据-3） =============

/**
 * 种子记忆 — 预置通用动画创作知识与项目最佳实践
 *
 * 设计目的：
 * - 解决 Agent 记忆系统冷启动问题（首次使用归档记忆为空，RAG 检索无结果）
 * - 为 Agent 提供通用动画创作领域知识，提升建议质量
 * - 记录项目工作流程和工具使用最佳实践
 *
 * 实现要点：
 * - 种子记忆 id 以 "seed_" 前缀标识，便于识别和管理
 * - 首次启动时（archival.json 不存在或为空）自动注入
 * - Embedding 采用懒生成（与现有机制一致），首次 RAG 检索时按需生成
 * - 用户清空归档记忆后不会重新注入（通过 _seedMemoryInjected 标记保护）
 * - 种子记忆与用户记忆共存，遵循统一的容量限制（200 条）
 */

/** 种子记忆注入标记配置键（独立于 archival.json，防止用户清空后被重复注入） */
const SEED_MEMORY_FLAG_KEY = "agent.seedMemoryInjected";

/** 种子记忆条目定义（id 由 ensureSeedMemory 内部统一加 "seed_" 前缀） */
const SEED_MEMORY_ENTRIES: Array<{
  localId: string;
  type: "fact" | "decision" | "summary";
  content: string;
  tags: string[];
}> = [
  {
    localId: "project_overview",
    type: "fact",
    content:
      "本项目是 AI 动画创作工作站，核心能力包括：角色管理（创建/编辑/绑定）、场景管理（背景/环境）、故事分镜（beat-based 结构）、视频生成（多模型支持）、Agent 助手（工具调用 + 记忆系统）。工作流程通常为：导入小说 → 拆分故事 beat → 生成角色/场景 → 生成镜头 → 生成视频。",
    tags: ["project", "overview", "workflow"],
  },
  {
    localId: "character_design_principles",
    type: "fact",
    content:
      "角色设计原则：1) 主角应有鲜明视觉特征（发型/服装/配色），便于 AI 生成一致性；2) 为每个角色绑定参考图，提升跨镜头一致性；3) 角色描述包含身高、体型、发型、瞳色、服装、配饰 6 个维度；4) 配角可简化描述，但需有辨识度；5) 角色关系图应在故事分镜阶段建立。",
    tags: ["character", "design", "best-practice"],
  },
  {
    localId: "scene_design_principles",
    type: "fact",
    content:
      "场景设计原则：1) 场景应服务于故事氛围，与角色风格统一；2) 包含时间（日/夜）、天气、光照方向 3 个维度；3) 复杂场景建议拆分为多个子场景（如『客厅-白天』和『客厅-夜晚』）；4) 场景参考图应包含整体氛围和关键道具；5) 避免场景描述过于抽象，应有具体视觉元素。",
    tags: ["scene", "design", "best-practice"],
  },
  {
    localId: "story_structure",
    type: "fact",
    content:
      "故事结构建议：1) 短视频（<60s）采用三段式：引入-冲突-解决；2) 中等长度（1-3min）可采用起承转合四幕结构；3) 每个 beat 应有明确的视觉焦点和情绪基调；4) beat 之间的过渡应自然，避免突兀切换；5) 角色动机在每个 beat 中应清晰可辨；6) 高潮 beat 应有更详细的镜头描述。",
    tags: ["story", "structure", "narrative"],
  },
  {
    localId: "shot_composition",
    type: "fact",
    content:
      "镜头语言指南：1) 远景建立环境，近景强调情绪，特写突出细节；2) 运镜方式：推（强调）、拉（揭示）、摇（跟随）、移（并行）；3) 角色对话用中景，情绪表达用近景；4) 避免连续多个相同景别，应有节奏变化；5) 关键转折点建议用 Dutch angle 或低角度增强戏剧性；6) 生成视频时首尾帧应明确指定以保持连贯。",
    tags: ["shot", "cinematography", "composition"],
  },
  {
    localId: "video_generation_tips",
    type: "fact",
    content:
      "视频生成最佳实践：1) 优先为首帧和尾帧提供参考图，提升画面连贯性；2) 描述应包含动作、运镜、氛围三层信息；3) 复杂动作拆分为多个短视频片段分别生成；4) 生成失败时检查 API key 配额和模型能力映射；5) 不同 provider 适配不同场景：Kling 适合写实、Pika 适合风格化、Runway 适合运镜；6) 批量生成时建议先测试单个镜头确认风格。",
    tags: ["video", "generation", "best-practice"],
  },
  {
    localId: "agent_tool_usage",
    type: "decision",
    content:
      "Agent 工具使用规范：1) 危险操作（delete_file/move_file/delete_character 等）必须用户确认；2) 文件操作限制在项目目录内，禁止路径遍历；3) 跨模块协作优先使用模块 public API（如 useVideoTaskManager），避免直接操作 Store；4) 长任务（视频生成/批量处理）应使用轮询机制，不阻塞 Agent Loop；5) delegate_to_specialist 用于复杂子任务，子 Agent 权限不超过父 Agent。",
    tags: ["agent", "tool", "permission", "best-practice"],
  },
  {
    localId: "consistency_check",
    type: "fact",
    content:
      "一致性检查要点：1) 角色一致性：跨镜头检查发型、服装、瞳色、体型；2) 场景一致性：同一场景的光照、道具位置应一致；3) 故事一致性：时间线、角色关系、情节逻辑；4) 使用 reference-engine 进行视觉一致性校验；5) 发现不一致时优先调整描述而非重新生成；6) 关键角色建议建立 reference sheet 作为基准。",
    tags: ["consistency", "quality", "reference"],
  },
  {
    localId: "api_config_guide",
    type: "fact",
    content:
      "API 配置指南：1) API key 通过系统级加密存储（macOS Keychain / Windows Credential Manager）；2) 13+ provider 支持：DeepSeek、Kling、Pika、Runway、MiniMax、OpenAI 等；3) 模型能力通过 mapping 配置（text/image/vision/video）；4) 未知模型自动降级到保守默认能力；5) 声明式 JSON 插件可零代码接入新 provider；6) 建议为不同能力配置不同 provider 以优化成本。",
    tags: ["api", "config", "provider"],
  },
  {
    localId: "iteration_workflow",
    type: "decision",
    content:
      "迭代工作流建议：1) 先生成静态画面（角色/场景）确认风格，再生成动态视频；2) 每个 beat 的视频生成后立即检查一致性，问题及时修正；3) 批量处理时保持参数一致（分辨率/时长/风格）；4) 使用项目状态查询工具（get_project_state）跟踪进度；5) 失败任务可通过 video-recovery 恢复；6) 最终成片前进行全局一致性检查。",
    tags: ["workflow", "iteration", "best-practice"],
  },
  {
    localId: "memory_system_guide",
    type: "fact",
    content:
      "记忆系统说明：1) 核心记忆常驻 system prompt，存储用户偏好和项目事实（≤20 条）；2) 归档记忆按需 RAG 检索，存储会话摘要和重要决策（≤200 条）；3) 自动抽取在每 5 条用户消息后触发；4) Embedding 支持 API/本地模型/关键词三策略链；5) 本地 ONNX 模型需手动下载并拖入设置页面；6) 工具调用 few-shot 缓存记录成功调用示例辅助 LLM 决策。",
    tags: ["memory", "system", "agent"],
  },
  {
    localId: "common_pitfalls",
    type: "decision",
    content:
      "常见陷阱与规避：1) 不要在 system prompt 中硬编码项目路径，使用 get_project_state 动态查询；2) 不要直接调用 electronAPI，应通过 file-http 统一层；3) 不要跨模块直接 import Store，使用 public API hook；4) 不要假设模型能力，使用 model-capabilities 查询；5) 不要在 shared-logic 中引入项目依赖，保持零依赖；6) 不要跳过 Zod schema 校验直接调用 API。",
    tags: ["pitfall", "architecture", "best-practice"],
  },
];

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
