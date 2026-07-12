/**
 * VectorSearchEngine — 向量检索引擎（策略链调度器）
 *
 * 职责：
 * - 持有有序的策略列表（RetrievalStrategy[]）
 * - 按顺序调用策略：isAvailable → search
 * - 首个返回非 null 的策略结果直接返回
 * - 全部策略失败时返回空数组（保证 searchArchivalMemory 永远有结果）
 *
 * 默认策略链（createDefaultEngine）：
 *   1. ApiVectorStrategy   — API embedding（高准确度，需联网）
 *   2. LocalVectorStrategy — 本地 ONNX 模型（离线可用）
 *   3. KeywordStrategy     — 关键词 + 时间衰减（兜底，总是可用）
 *
 * 扩展点：
 * - 自定义策略：实现 RetrievalStrategy 接口，通过 new VectorSearchEngine([策略...]) 注入
 * - 替换策略顺序：调整 strategies 数组顺序即可
 * - 添加新策略（如混合检索、重排序）：实现接口后插入到合适位置
 *
 * 设计要点：
 * - 单策略异常不阻断链式调用，记录后继续尝试下一策略
 * - isAvailable 失败也按 null 处理，进入下一策略
 * - 引擎本身无状态，策略持有各自的状态（如 EmbeddingStore）
 */

import { errorLogger } from "@/shared/error-logger";
import type { ArchivalMemoryEntry } from "../memory-service";
import type { EmbeddingStore, RetrievalStrategy, ProgressCallback } from "./types";
import { ApiVectorStrategy, LocalVectorStrategy, KeywordStrategy } from "./strategies";
import { FileEmbeddingStore } from "./embedding-store";

export class VectorSearchEngine {
  constructor(private readonly strategies: RetrievalStrategy[]) {
    if (strategies.length === 0) {
      throw new Error("VectorSearchEngine requires at least one strategy");
    }
  }

  /**
   * 执行检索
   *
   * 按策略顺序尝试：
   * 1. 调用 strategy.isAvailable()，false 则跳过
   * 2. 调用 strategy.search()，返回非 null 则直接返回
   * 3. 全部失败/不可用 → 返回空数组
   *
   * @param query 查询文本（非空，由调用方保证）
   * @param entries 所有归档记忆条目
   * @param limit 返回条数上限
   * @param onProgress 可选进度回调（透传给策略，backfill 大批量 embedding 时触发）
   * @returns 检索结果数组（永不为 null）
   */
  async search(
    query: string,
    entries: ArchivalMemoryEntry[],
    limit: number,
    onProgress?: ProgressCallback,
  ): Promise<ArchivalMemoryEntry[]> {
    for (const strategy of this.strategies) {
      try {
        const available = await strategy.isAvailable();
        if (!available) {
          continue;
        }

        const result = await strategy.search(query, entries, limit, onProgress);
        if (result !== null) {
          return result;
        }

        // 策略返回 null：不可用或失败，尝试下一个
        errorLogger.debug(
          `[vector-engine] 策略 ${strategy.name} 返回 null，尝试下一个策略`,
        );
      } catch (error) {
        // 单策略异常不阻断链式调用
        errorLogger.warn(
          `[vector-engine] 策略 ${strategy.name} 异常:`,
          error instanceof Error ? error.message : error,
        );
      }
    }

    // 全部策略都失败：返回空数组（保证调用方拿到数组而非 null）
    return [];
  }

  /**
   * 获取策略列表（用于诊断/日志）
   */
  getStrategies(): readonly RetrievalStrategy[] {
    return this.strategies;
  }

  /**
   * 预热 Embedding 缓存（预训练数据-4）
   *
   * 触发首个可用的向量策略为所有归档记忆条目预生成 embedding，
   * 避免首次 RAG 检索时因懒生成导致延迟。
   *
   * 实现复用策略的 search 内部 backfill 逻辑：
   * - 使用一个通用 query 触发 search（仅用于驱动 backfill）
   * - search 结果被丢弃，仅关心 backfill 阶段的进度
   * - 仅首个可用的向量策略会被触发（API 优先于本地）
   * - 关键词策略无 embedding，不会被触发
   *
   * @param entries 所有归档记忆条目
   * @param onProgress 可选进度回调（phase="backfill"）
   * @returns 预热结果统计；success=false 表示无可用的向量策略
   */
  async prewarmEmbeddings(
    entries: ArchivalMemoryEntry[],
    onProgress?: ProgressCallback,
  ): Promise<{ success: boolean; strategy?: string; message?: string }> {
    if (entries.length === 0) {
      return { success: true, message: "no entries" };
    }

    // 遍历策略，找到第一个可用的向量策略
    for (const strategy of this.strategies) {
      // 关键词策略无 embedding，跳过
      if (strategy.name === "keyword") continue;

      try {
        const available = await strategy.isAvailable();
        if (!available) continue;

        // 使用通用 query 触发 search，目的是 backfill 所有缺失的 embedding
        // search 结果被丢弃
        const prewarmQuery = "prewarm all archival memory embeddings";
        await strategy.search(prewarmQuery, entries, 1, onProgress);

        return {
          success: true,
          strategy: strategy.name,
        };
      } catch (error) {
        errorLogger.warn(
          `[vector-engine] prewarm 策略 ${strategy.name} 异常:`,
          error instanceof Error ? error.message : error,
        );
        // 继续尝试下一个策略
      }
    }

    return {
      success: false,
      message: "no available vector strategy (API or local model required)",
    };
  }
}

/**
 * 创建默认向量检索引擎
 *
 * 策略链：API > 本地模型 > 关键词（兜底）
 *
 * 使用单例 EmbeddingStore（API 与本地策略共享同一存储，
 * 维度版本检测时切换模型会自动清空旧 embedding）。
 *
 * @param store 可选，自定义 EmbeddingStore（测试用）；默认创建 FileEmbeddingStore
 */
export function createDefaultEngine(store?: EmbeddingStore): VectorSearchEngine {
  const embeddingStore = store ?? new FileEmbeddingStore();
  return new VectorSearchEngine([
    new ApiVectorStrategy(embeddingStore),
    new LocalVectorStrategy(embeddingStore),
    new KeywordStrategy(),
  ]);
}
