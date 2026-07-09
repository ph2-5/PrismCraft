/**
 * 余弦相似度计算工具
 *
 * 用于记忆系统的向量检索：
 * - cosineSimilarity(a, b)：计算两个向量的余弦相似度
 * - batchCosineSimilarity(query, candidates)：批量计算
 *
 * 余弦相似度范围 [-1, 1]，越接近 1 越相似。
 * 归一化后的向量（transformers.js normalize=true）余弦相似度等于点积。
 */

/**
 * 计算两个向量的余弦相似度
 *
 * cos(a, b) = (a · b) / (||a|| × ||b||)
 *
 * 若任一向量为零向量（模为 0），返回 0 避免除零。
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  }
  if (a.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const av = a[i]!;
    const bv = b[i]!;
    dotProduct += av * bv;
    normA += av * av;
    normB += bv * bv;
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

/**
 * 批量计算 query 向量与候选向量的余弦相似度
 *
 * @returns 相似度数组，索引与 candidates 对应
 */
export function batchCosineSimilarity(query: number[], candidates: number[][]): number[] {
  return candidates.map((candidate) => {
    try {
      return cosineSimilarity(query, candidate);
    } catch {
      return 0;
    }
  });
}

/**
 * 找出与 query 最相似的 Top-K 候选
 *
 * @returns 按相似度降序排列的 { index, similarity } 数组
 */
export function findTopK(
  query: number[],
  candidates: number[][],
  k: number,
): Array<{ index: number; similarity: number }> {
  const similarities = batchCosineSimilarity(query, candidates);
  return similarities
    .map((similarity, index) => ({ index, similarity }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, k);
}
