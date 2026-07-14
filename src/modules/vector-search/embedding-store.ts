/**
 * Embedding 独立存储实现（FileEmbeddingStore）
 *
 * 替代将 embedding 混入 archival.json 的旧做法。
 * 独立文件存储，支持维度版本检测与自动失效（S2 雏形）。
 *
 * 存储结构：
 *   <cacheDir>/agent/memory/embeddings.json
 *   {
 *     meta: { modelId, dimensions, updatedAt } | null,
 *     entries: {
 *       [id]: { embedding: number[], updatedAt: number }
 *     }
 *   }
 *
 * 设计要点：
 * - 模块级内存缓存：首次 load 后缓存解析结果，避免每次 search 重读文件
 * - 失败静默：读写失败时退化为空 store，不阻断检索流程
 * - 维度版本检测：setEmbeddings 时若 modelId/dimensions 与 meta 不一致，先清空旧 entries
 * - 原子写：先序列化为字符串再一次性写入，避免半写入状态
 * - 零外部依赖：仅用 @/shared/file-http 与 @/shared/error-logger
 */

import { writeFile, readFile, fileExists, getCacheDirectory } from "@/shared/file-http";
import { errorLogger } from "@/shared/error-logger";
import type { EmbeddingStore, EmbeddingMeta } from "./types";

/** 归档记忆目录（相对缓存目录，与 memory-service 保持一致） */
const MEMORY_DIR = "agent/memory";

/** Embedding 独立存储文件名 */
const EMBEDDINGS_FILE = "embeddings.json";

/** 空存储结构（首次创建或损坏时使用） */
const EMPTY_STORE: EmbeddingStoreData = {
  meta: null,
  entries: {},
};

/** 存储文件结构 */
interface EmbeddingStoreData {
  /** 模型 + 维度元信息（用于版本检测） */
  meta: EmbeddingMeta | null;
  /** id → embedding 条目 */
  entries: Record<string, { embedding: number[]; updatedAt: number }>;
}

/**
 * 解析存储文件内容
 *
 * 容错处理：
 * - 非对象 / 缺字段 → 返回空 store
 * - 单条 entry 损坏 → 跳过该条，保留其他
 */
function parseStore(raw: unknown): EmbeddingStoreData {
  if (!raw || typeof raw !== "object") return { ...EMPTY_STORE };

  const obj = raw as Record<string, unknown>;
  const meta = parseMeta(obj.meta);
  const entries = parseEntries(obj.entries);

  return { meta, entries };
}

function parseMeta(raw: unknown): EmbeddingMeta | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const modelId = obj.modelId;
  const dimensions = obj.dimensions;
  const updatedAt = obj.updatedAt;
  if (typeof modelId !== "string" || typeof dimensions !== "number" || typeof updatedAt !== "number") {
    return null;
  }
  return { modelId, dimensions, updatedAt };
}

function parseEntries(raw: unknown): Record<string, { embedding: number[]; updatedAt: number }> {
  if (!raw || typeof raw !== "object") return {};
  const obj = raw as Record<string, unknown>;
  const result: Record<string, { embedding: number[]; updatedAt: number }> = {};
  for (const [id, value] of Object.entries(obj)) {
    if (!value || typeof value !== "object") continue;
    const entry = value as Record<string, unknown>;
    const embedding = entry.embedding;
    const updatedAt = entry.updatedAt;
    if (!Array.isArray(embedding) || typeof updatedAt !== "number") continue;
    // 全部元素必须是 number
    const validEmbedding = embedding.every((v) => typeof v === "number");
    if (!validEmbedding) continue;
    result[id] = { embedding: embedding as number[], updatedAt };
  }
  return result;
}

/**
 * File-based EmbeddingStore 实现
 *
 * 单实例负责一个 embeddings.json 文件的读写。
 * 模块级缓存：同一文件路径只读取一次，后续从内存返回。
 * 失效通过 invalidateAll() 或 setEmbeddings() 触发。
 */
export class FileEmbeddingStore implements EmbeddingStore {
  /** 文件路径缓存（避免每次操作重读 cacheDir） */
  private filePath: string | null = null;

  /** 数据缓存（首次 load 后驻留，写入时同步更新） */
  private cache: EmbeddingStoreData | null = null;

  /** 是否已加载过（区分"未加载"与"加载到空 store"） */
  private loaded = false;

  /** 加载锁（避免并发首次加载） */
  private loadingPromise: Promise<EmbeddingStoreData> | null = null;

  /**
   * 获取存储文件完整路径
   *
   * 返回 null 表示无法获取缓存目录（如非 Electron 环境）。
   */
  private async getFilePath(): Promise<string | null> {
    if (this.filePath) return this.filePath;
    const result = await getCacheDirectory();
    if (!result.success || !result.path) return null;
    this.filePath = `${result.path}/${MEMORY_DIR}/${EMBEDDINGS_FILE}`;
    return this.filePath;
  }

  /**
   * 加载存储文件（带缓存与并发保护）
   *
   * 失败时返回空 store 并缓存，避免反复重试。
   */
  private async load(): Promise<EmbeddingStoreData> {
    if (this.loaded && this.cache) return this.cache;
    if (this.loadingPromise) return this.loadingPromise;

    this.loadingPromise = (async () => {
      try {
        const filePath = await this.getFilePath();
        if (!filePath) {
          this.cache = { ...EMPTY_STORE };
          this.loaded = true;
          return this.cache;
        }

        const exists = await fileExists(filePath);
        if (!exists) {
          this.cache = { ...EMPTY_STORE };
          this.loaded = true;
          return this.cache;
        }

        const result = await readFile(filePath);
        if (!result?.success || !result.data) {
          this.cache = { ...EMPTY_STORE };
          this.loaded = true;
          return this.cache;
        }

        const text = new TextDecoder().decode(result.data);
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          // 文件损坏：当作空 store，不删除文件（保留以便人工排查）
          errorLogger.warn("[embedding-store] 存储文件 JSON 解析失败，使用空 store");
          this.cache = { ...EMPTY_STORE };
          this.loaded = true;
          return this.cache;
        }

        this.cache = parseStore(parsed);
        this.loaded = true;
        return this.cache;
      } catch (error) {
        errorLogger.warn(
          "[embedding-store] 加载失败:",
          error instanceof Error ? error.message : error,
        );
        this.cache = { ...EMPTY_STORE };
        this.loaded = true;
        return this.cache;
      } finally {
        this.loadingPromise = null;
      }
    })();

    return this.loadingPromise;
  }

  /**
   * 持久化存储到文件
   *
   * 写入成功后同步更新内存缓存；失败时缓存保持原样，调用方按 false 处理。
   */
  private async persist(data: EmbeddingStoreData): Promise<boolean> {
    try {
      const filePath = await this.getFilePath();
      if (!filePath) return false;

      const jsonStr = JSON.stringify(data, null, 2);
      const result = await writeFile(filePath, jsonStr);
      if (!result.success) {
        errorLogger.warn("[embedding-store] 持久化失败:", result.error);
        return false;
      }

      // 同步内存缓存
      this.cache = {
        meta: data.meta ? { ...data.meta } : null,
        entries: { ...data.entries },
      };
      return true;
    } catch (error) {
      errorLogger.warn(
        "[embedding-store] 持久化异常:",
        error instanceof Error ? error.message : error,
      );
      return false;
    }
  }

  async getMeta(): Promise<EmbeddingMeta | null> {
    const data = await this.load();
    return data.meta ? { ...data.meta } : null;
  }

  async isCompatible(modelId: string, dimensions: number): Promise<boolean> {
    const data = await this.load();
    if (!data.meta) return true; // 无 meta 视为首次写入，兼容
    return data.meta.modelId === modelId && data.meta.dimensions === dimensions;
  }

  async getEmbedding(id: string): Promise<number[] | null> {
    const data = await this.load();
    const entry = data.entries[id];
    if (!entry) return null;
    return [...entry.embedding];
  }

  async getEmbeddings(ids: string[]): Promise<Map<string, number[]>> {
    const data = await this.load();
    const result = new Map<string, number[]>();
    for (const id of ids) {
      const entry = data.entries[id];
      if (entry) {
        result.set(id, [...entry.embedding]);
      }
    }
    return result;
  }

  async setEmbeddings(
    updates: Map<string, number[]>,
    modelId: string,
    dimensions: number,
  ): Promise<void> {
    if (updates.size === 0) return;

    const data = await this.load();

    // 维度版本检测：modelId 或 dimensions 变化时清空旧 entries（S2）
    const compatible = data.meta
      ? data.meta.modelId === modelId && data.meta.dimensions === dimensions
      : true;

    const newData: EmbeddingStoreData = compatible
      ? {
          meta: { modelId, dimensions, updatedAt: Date.now() },
          entries: { ...data.entries },
        }
      : {
          meta: { modelId, dimensions, updatedAt: Date.now() },
          entries: {},
        };

    if (!compatible && Object.keys(data.entries).length > 0) {
      errorLogger.info(
        `[embedding-store] 维度变更检测：${data.meta?.modelId}/${data.meta?.dimensions} → ${modelId}/${dimensions}，清空 ${Object.keys(data.entries).length} 条旧 embedding`,
      );
    }

    const now = Date.now();
    for (const [id, embedding] of updates) {
      // 防御：维度不匹配的单条 embedding 跳过（不应发生，但避免污染）
      if (embedding.length !== dimensions) {
        errorLogger.warn(
          `[embedding-store] 跳过维度不匹配的 embedding：id=${id}, 期望=${dimensions}, 实际=${embedding.length}`,
        );
        continue;
      }
      newData.entries[id] = { embedding: [...embedding], updatedAt: now };
    }

    await this.persist(newData);
  }

  async invalidateAll(): Promise<void> {
    const newData: EmbeddingStoreData = {
      meta: null,
      entries: {},
    };
    await this.persist(newData);
  }

  /**
   * 重置内存缓存（测试用）
   *
   * 下次操作会重新从文件加载。
   */
  resetCache(): void {
    this.cache = null;
    this.loaded = false;
    this.loadingPromise = null;
  }
}

/**
 * 创建默认 EmbeddingStore 实例
 *
 * 使用 FileEmbeddingStore，存储路径为 <cacheDir>/agent/memory/embeddings.json。
 * 调用方通常通过 createDefaultEngine() 间接使用，无需手动创建。
 */
export function createEmbeddingStore(): EmbeddingStore {
  return new FileEmbeddingStore();
}
