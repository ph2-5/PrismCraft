/**
 * 向量检索策略实现（三模式：API > 本地模型 > 关键词）
 *
 * 策略链架构：
 * - ApiVectorStrategy：embedding capability 已配置时，调用 container.embeddingProvider
 * - LocalVectorStrategy：用户拖入 ONNX 模型文件时，调用本地推理引擎
 * - KeywordStrategy：以上都不可用时，退回关键词匹配 + 时间衰减
 *
 * 设计要点：
 * - 每个策略封装独立的检索方式，互不依赖
 * - isAvailable 做轻量检查（不发起真实推理），search 做实际工作
 * - 策略返回 null 表示不可用/失败，引擎尝试下一个策略
 * - 策略返回数组（含空数组）表示成功，引擎直接返回
 * - KeywordStrategy 总是可用，作为兜底策略
 *
 * Embedding 懒生成：
 * - 检索时若发现条目缺 embedding，调用 provider 批量生成
 * - 生成后通过 EmbeddingStore 持久化（独立于 archival.json）
 * - 维度版本检测：modelId/dimensions 变化时自动清空旧 embedding
 */

import { container } from "@/infrastructure/di";
import { errorLogger } from "@/shared/error-logger";
import type { IEmbeddingProvider } from "@/domain/ports";
import type { ArchivalMemoryEntry } from "@/domain/types/memory";
import type { EmbeddingStore, RetrievalStrategy, ProgressCallback } from "./types";

// ============= 通用工具 =============

/** API 批量 embedding 分批大小（与 infrastructure/ai-providers/embedding.ts 一致） */
const API_BATCH_SIZE = 64;

/** 本地模型批量 embedding 分批大小（与 local-embedding-provider.ts 一致） */
const LOCAL_BATCH_SIZE = 32;

/**
 * 调用 provider 批量生成 embedding（支持进度通知）
 *
 * 优先使用 provider.generateEmbeddings（批量接口）分批调用，无则退回逐条调用。
 * 失败时返回 null，调用方退回下一策略。
 *
 * @param provider embedding provider 实例
 * @param inputs 文本数组
 * @param batchSize 分批大小（API=64，本地=32）
 * @param onProgress 可选进度回调（每批完成时触发）
 * @param strategyName 策略名称（用于进度消息）
 * @returns 与 inputs 顺序一致的 embedding 数组；任一条失败对应位置为空数组
 */
async function generateBatchEmbeddings(
  provider: IEmbeddingProvider,
  inputs: string[],
  batchSize: number,
  onProgress?: ProgressCallback,
  strategyName?: string,
): Promise<number[][] | null> {
  if (inputs.length === 0) return [];

  try {
    // 优先批量接口（分批调用以支持进度通知）
    if (provider.generateEmbeddings) {
      const allEmbeddings: number[][] = [];
      for (let i = 0; i < inputs.length; i += batchSize) {
        const batchEnd = Math.min(i + batchSize, inputs.length);
        const batch = inputs.slice(i, batchEnd);

        onProgress?.({
          phase: "backfill",
          current: i,
          total: inputs.length,
          strategy: strategyName,
          message: `正在生成 embedding ${i + 1}-${batchEnd}/${inputs.length}`,
        });

        const result = await provider.generateEmbeddings(batch);
        if (!result.success || !result.data?.embeddings) {
          // 批量失败：不退回逐条（可能加重 API 负担），直接返回 null
          errorLogger.warn(
            "[vector-strategy] 批量 embedding 失败（批次 " +
              Math.floor(i / batchSize) +
              1 +
              "）:",
            result.error || "unknown",
          );
          return null;
        }
        allEmbeddings.push(...result.data.embeddings);
      }

      onProgress?.({
        phase: "backfill",
        current: inputs.length,
        total: inputs.length,
        strategy: strategyName,
        message: "embedding 生成完成",
      });
      return allEmbeddings;
    }

    // 无批量接口：逐条调用
    const embeddings: number[][] = [];
    for (let i = 0; i < inputs.length; i++) {
      onProgress?.({
        phase: "backfill",
        current: i,
        total: inputs.length,
        strategy: strategyName,
        message: `正在生成 embedding ${i + 1}/${inputs.length}`,
      });

      const result = await provider.generateEmbedding(inputs[i]!);
      if (result.success && result.data?.embedding) {
        embeddings.push(result.data.embedding);
      } else {
        // 单条失败：占位空数组，调用方按维度判断跳过
        embeddings.push([]);
      }
    }

    onProgress?.({
      phase: "backfill",
      current: inputs.length,
      total: inputs.length,
      strategy: strategyName,
      message: "embedding 生成完成",
    });
    return embeddings;
  } catch (error) {
    errorLogger.warn(
      "[vector-strategy] 批量生成 embedding 异常:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

/**
 * 计算余弦相似度 Top-K
 *
 * 动态 import 避免在非向量模式下加载 similarity 模块。
 *
 * @returns 按相似度降序排列的 { entry, similarity } 数组
 */
async function computeTopK(
  queryEmbedding: number[],
  candidates: Array<{ entry: ArchivalMemoryEntry; embedding: number[] }>,
  limit: number,
): Promise<ArchivalMemoryEntry[]> {
  if (candidates.length === 0) return [];

  const { findTopK } = await import("@/shared/embedding");
  const candidateEmbeddings = candidates.map((c) => c.embedding);
  const topK = findTopK(queryEmbedding, candidateEmbeddings, limit);
  return topK.map(({ index }) => candidates[index]!.entry);
}

/** 批量生成缺失的 embedding 并写入 store，返回更新后的 allEmbeddings */
async function fillMissingEmbeddings(
  provider: IEmbeddingProvider,
  entries: ArchivalMemoryEntry[],
  store: EmbeddingStore,
  modelId: string,
  dimensions: number,
  batchSize: number,
  onProgress: ProgressCallback | undefined,
  strategyName: string,
): Promise<Map<string, number[]>> {
  const ids = entries.map((e) => e.id);
  const existing = await store.getEmbeddings(ids);
  const missing = entries.filter(
    (e) => !existing.has(e.id) || existing.get(e.id)!.length === 0,
  );

  if (missing.length > 0) {
    const newEmbeddings = await generateBatchEmbeddings(
      provider,
      missing.map((e) => e.content),
      batchSize,
      onProgress,
      strategyName,
    );
    if (newEmbeddings) {
      const updates = new Map<string, number[]>();
      for (let i = 0; i < missing.length && i < newEmbeddings.length; i++) {
        const emb = newEmbeddings[i]!;
        if (emb.length === dimensions) {
          updates.set(missing[i]!.id, emb);
        }
      }
      if (updates.size > 0) {
        await store.setEmbeddings(updates, modelId, dimensions);
      }
    }
  }

  // 重新读取全部 embedding（包含刚写入的）
  return store.getEmbeddings(ids);
}

/** 从 allEmbeddings 构建候选列表（维度匹配的 entry） */
function buildCandidates(
  entries: ArchivalMemoryEntry[],
  allEmbeddings: Map<string, number[]>,
  dimensions: number,
): Array<{ entry: ArchivalMemoryEntry; embedding: number[] }> {
  const candidates: Array<{ entry: ArchivalMemoryEntry; embedding: number[] }> = [];
  for (const entry of entries) {
    const emb = allEmbeddings.get(entry.id);
    if (emb && emb.length === dimensions) {
      candidates.push({ entry, embedding: emb });
    }
  }
  return candidates;
}

// ============= 策略 1：API 向量检索 =============

/**
 * API 向量检索策略
 *
 * 使用 container.embeddingProvider（OpenAI 兼容 /embeddings 接口）。
 * 适合配置了 embedding capability 的场景，准确度高但需联网。
 *
 * modelId 标识："api"（统一标识，维度版本检测粒度足够）
 */
export class ApiVectorStrategy implements RetrievalStrategy {
  readonly name = "api";

  constructor(private readonly store: EmbeddingStore) {}

  async isAvailable(): Promise<boolean> {
    try {
      // 轻量检查：provider 存在且 generateEmbedding 方法可用
      // 不发起真实 API 调用，实际可用性在 search 中验证
      const provider = container.embeddingProvider;
      return !!provider && typeof provider.generateEmbedding === "function";
    } catch {
      return false;
    }
  }

  async search(
    query: string,
    entries: ArchivalMemoryEntry[],
    limit: number,
    onProgress?: ProgressCallback,
  ): Promise<ArchivalMemoryEntry[] | null> {
    try {
      const provider = container.embeddingProvider;

      // 1. 生成 query embedding
      const queryResult = await provider.generateEmbedding(query);
      if (!queryResult.success || !queryResult.data?.embedding) {
        return null;
      }
      const queryEmbedding = queryResult.data.embedding;
      const dimensions = queryEmbedding.length;
      const modelId = "api";

      // 2. 维度版本检测：不兼容则清空 store（S2）
      if (!(await this.store.isCompatible(modelId, dimensions))) {
        await this.store.invalidateAll();
      }

      // 3. 懒生成缺失 embedding + 重新读取全部
      const allEmbeddings = await fillMissingEmbeddings(
        provider, entries, this.store, modelId, dimensions, API_BATCH_SIZE, onProgress, this.name,
      );

      // 4. 构建候选列表
      const candidates = buildCandidates(entries, allEmbeddings, dimensions);
      if (candidates.length === 0) return null;

      // 5. 计算 Top-K
      onProgress?.({
        phase: "search",
        current: candidates.length,
        total: candidates.length,
        strategy: this.name,
        message: `正在计算相似度（${candidates.length} 条候选）`,
      });
      return computeTopK(queryEmbedding, candidates, limit);
    } catch (error) {
      errorLogger.warn(
        "[vector-strategy] API 策略异常:",
        error instanceof Error ? error.message : error,
      );
      return null;
    }
  }
}

// ============= 策略 2：本地 ONNX 模型向量检索 =============

/**
 * 本地向量检索策略
 *
 * 使用 @/shared/embedding 代理的本地 ONNX 模型（transformers.js）。
 * 适合离线场景或隐私敏感场景，准确度略低但零网络依赖。
 *
 * modelId 标识：模型 modelName（如 "all-MiniLM-L6-v2"）
 */
export class LocalVectorStrategy implements RetrievalStrategy {
  readonly name = "local";

  constructor(private readonly store: EmbeddingStore) {}

  async isAvailable(): Promise<boolean> {
    try {
      // 轻量检查：本地模型文件是否存在（不加载模型）
      const { detectLocalModel } = await import("@/shared/embedding");
      const status = await detectLocalModel();
      return status.available;
    } catch {
      return false;
    }
  }

  async search(
    query: string,
    entries: ArchivalMemoryEntry[],
    limit: number,
    onProgress?: ProgressCallback,
  ): Promise<ArchivalMemoryEntry[] | null> {
    try {
      const { getLocalEmbeddingProvider } = await import("@/shared/embedding");
      const provider = await getLocalEmbeddingProvider();
      if (!provider) return null;

      // 1. 生成 query embedding
      const queryResult = await provider.generateEmbedding(query);
      if (!queryResult.success || !queryResult.data?.embedding) {
        return null;
      }
      const queryEmbedding = queryResult.data.embedding;
      const dimensions = queryEmbedding.length;

      // 2. 获取本地模型 id（用 modelName 作为唯一标识）
      const { detectLocalModel } = await import("@/shared/embedding");
      const status = await detectLocalModel();
      const modelId = status.info?.modelName ?? "local-unknown";

      // 3. 维度版本检测
      if (!(await this.store.isCompatible(modelId, dimensions))) {
        await this.store.invalidateAll();
      }

      // 4. 懒生成缺失 embedding + 重新读取全部
      const allEmbeddings = await fillMissingEmbeddings(
        provider, entries, this.store, modelId, dimensions, LOCAL_BATCH_SIZE, onProgress, this.name,
      );

      // 5. 构建候选列表
      const candidates = buildCandidates(entries, allEmbeddings, dimensions);
      if (candidates.length === 0) return null;

      // 6. 计算 Top-K
      onProgress?.({
        phase: "search",
        current: candidates.length,
        total: candidates.length,
        strategy: this.name,
        message: `正在计算相似度（${candidates.length} 条候选）`,
      });
      return computeTopK(queryEmbedding, candidates, limit);
    } catch (error) {
      errorLogger.warn(
        "[vector-strategy] 本地策略异常:",
        error instanceof Error ? error.message : error,
      );
      return null;
    }
  }
}

// ============= 策略 3：关键词匹配（兜底） =============

/** 一天的毫秒数（时间衰减用） */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 关键词匹配 + 时间衰减排序
 *
 * 算法：
 * 1. 将 query 分词（中英文标点统一处理）
 * 2. 每条记忆按关键词命中次数计分
 * 3. 时间衰减：7 天内 ×1.5，30 天内 ×1.0，更早 ×0.7
 * 4. 按总分倒序返回
 *
 * 此策略总是可用，作为兜底，返回数组（含空数组）而非 null。
 */
export class KeywordStrategy implements RetrievalStrategy {
  readonly name = "keyword";

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async search(
    query: string,
    entries: ArchivalMemoryEntry[],
    limit: number,
    onProgress?: ProgressCallback,
  ): Promise<ArchivalMemoryEntry[]> {
    // 关键词匹配是同步纯计算，无 backfill 阶段；
    // 仍触发一次 search 阶段进度，便于 UI 统一显示"检索中"状态。
    if (onProgress) {
      onProgress({
        phase: "search",
        current: 0,
        total: entries.length,
        strategy: this.name,
        message: `正在关键词匹配（${entries.length} 条候选）`,
      });
    }
    return keywordSearch(query, entries, limit);
  }
}

/**
 * 关键词匹配核心算法（函数式实现，便于单测）
 */
export function keywordSearch(
  query: string,
  all: ArchivalMemoryEntry[],
  limit: number,
): ArchivalMemoryEntry[] {
  const keywords = query
    .toLowerCase()
    .split(/[\s,，。、;；:：?？!！]+/)
    .filter((k) => k.length > 0);

  if (keywords.length === 0) {
    // 无关键词：按时间倒序返回前 limit 条
    return [...all].sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
  }

  const now = Date.now();

  const scored = all.map((entry) => {
    const content = entry.content.toLowerCase();
    const tags = (entry.tags ?? []).join(" ").toLowerCase();
    const haystack = `${content} ${tags}`;

    let score = 0;
    for (const kw of keywords) {
      if (haystack.includes(kw)) {
        score += 1;
      }
    }

    // 时间衰减
    const ageDays = (now - entry.createdAt) / DAY_MS;
    if (ageDays < 7) {
      score *= 1.5;
    } else if (ageDays > 30) {
      score *= 0.7;
    }

    return { entry, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.entry);
}
