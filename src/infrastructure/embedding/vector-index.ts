/**
 * 向量索引抽象（L4）
 *
 * 抽象出向量索引的构建与检索接口，当前默认实现为 FlatIndex（暴力搜索）。
 * 未来当记忆条目规模超过 10K 时，可替换为 HNSW/IVF 等近似最近邻（ANN）实现，
 * 无需修改 VectorSearchEngine 或策略链代码。
 *
 * 设计要点：
 * - 接口最小化：build + search + 可选 dispose
 * - FlatIndex 复用现有 findTopK 纯函数，零额外开销
 * - 不修改现有 strategies.ts 的 computeTopK（向后兼容）
 * - 未来迁移路径：strategies.ts 可改为持有 VectorIndex 实例而非直接调用 findTopK
 *
 * 使用示例：
 * ```typescript
 * import { FlatIndex } from "@/infrastructure/embedding";
 *
 * const index = new FlatIndex();
 * index.build(candidateEmbeddings);
 * const topK = index.search(queryEmbedding, limit);
 * // topK: Array<{ index: number; similarity: number }>
 * ```
 *
 * 未来扩展（HNSW 示例）：
 * ```typescript
 * export class HnswIndex implements VectorIndex {
 *   readonly name = "hnsw";
 *   private index: HnswLibInstance | null = null;
 *
 *   async build(vectors: number[][]) {
 *     this.index = await createHnswLib(vectors);
 *   }
 *
 *   search(query: number[], k: number) {
 *     return this.index?.search(query, k) ?? [];
 *   }
 *
 *   dispose() {
 *     this.index?.free();
 *     this.index = null;
 *   }
 * }
 * ```
 */

import { findTopK } from "./similarity";

/**
 * 向量索引接口
 *
 * 抽象向量存储与 Top-K 检索，支持未来替换为 ANN 实现。
 */
export interface VectorIndex {
  /** 索引类型名称（如 "flat" / "hnsw" / "ivf"） */
  readonly name: string;

  /**
   * 构建索引
   *
   * @param vectors 候选向量数组（索引按数组顺序建立）
   */
  build(vectors: number[][]): Promise<void> | void;

  /**
   * 搜索 Top-K 最相似向量
   *
   * @param query 查询向量
   * @param k 返回条数上限
   * @returns 按相似度降序排列的 { index, similarity } 数组，长度 ≤ k
   *          index 对应 build 时传入的向量数组索引
   */
  search(query: number[], k: number): Array<{ index: number; similarity: number }>;

  /**
   * 释放索引资源（可选）
   *
   * HNSW/IVF 等 native 实现需释放内存；FlatIndex 无需实现。
   */
  dispose?(): void;
}

/**
 * Flat Index 暴力搜索实现（默认）
 *
 * 复用 similarity.ts 的 findTopK 纯函数，O(n) 复杂度。
 * 适合记忆条目 < 10K 的场景，无额外内存开销。
 *
 * 规模参考：
 * - 1000 条 × 384 维：搜索 < 1ms
 * - 5000 条 × 384 维：搜索 < 5ms
 * - 10000 条 × 384 维：搜索 < 10ms（仍可接受，超过此规模建议迁移 HNSW）
 */
export class FlatIndex implements VectorIndex {
  readonly name = "flat";

  private vectors: number[][] = [];

  /**
   * 构建索引（存储向量引用，不复制）
   *
   * 注意：调用方不应在 build 后修改 vectors 数组内容，
   * 否则 search 结果可能不一致。
   */
  build(vectors: number[][]): void {
    this.vectors = vectors;
  }

  /**
   * 搜索 Top-K 最相似向量
   *
   * 委托给 findTopK 纯函数，O(n) 暴力搜索。
   * 若未 build 或 build 空数组，返回空数组。
   */
  search(query: number[], k: number): Array<{ index: number; similarity: number }> {
    if (this.vectors.length === 0 || k <= 0) return [];
    return findTopK(query, this.vectors, k);
  }
}

/**
 * 创建默认向量索引（FlatIndex）
 *
 * 工厂函数，未来可扩展为根据向量规模自动选择索引类型：
 * - < 10K 条 → FlatIndex
 * - ≥ 10K 条 → HnswIndex（待实现）
 *
 * @returns VectorIndex 实例（当前固定返回 FlatIndex）
 */
export function createDefaultIndex(): VectorIndex {
  return new FlatIndex();
}
