/**
 * Task 2A.23: similarity-checker — 帧 embedding 相似度计算
 *
 * 职责：
 *   1. computeFrameSimilarity(frameEmbedding, referenceEmbedding) → number
 *      计算单帧 embedding 与参考 embedding 的余弦相似度
 *   2. checkFrameConsistency(frameEmbeddings, referenceEmbedding) → FrameScore[]
 *      批量计算帧级相似度并生成 FrameScore 列表
 *   3. findWorstFrame(frameScores) → FrameScore | null
 *      找出漂移最严重的帧
 *
 * 复用 @/infrastructure/embedding/similarity.ts 的 cosineSimilarity 函数，
 * 不重复实现向量计算逻辑（避免技术债）。
 *
 * 纯函数 — 不依赖 DI container / 网络 / 文件系统，可单元测试。
 */

import { cosineSimilarity } from "@/shared/embedding";
import type { FrameScore } from "../domain/qc-schema";

/** similarity-checker 错误类型 */
export type SimilarityCheckerError =
  | { kind: "dimension_mismatch"; message: string; frameDim: number; refDim: number }
  | { kind: "empty_embedding"; message: string }
  | { kind: "compute_failed"; message: string; cause?: unknown };

/** 计算结果 */
export type SimilarityResult =
  | { ok: true; value: number }
  | { ok: false; error: SimilarityCheckerError };

/**
 * 计算单帧 embedding 与参考 embedding 的余弦相似度。
 *
 * - 维度不匹配返回 dimension_mismatch 错误
 * - 任一 embedding 为空数组返回 empty_embedding 错误
 * - 计算异常返回 compute_failed 错误（不抛出）
 *
 * @returns [0, 1] 范围的相似度（夹角越小越接近 1）
 *          失败返回 SimilarityCheckerError
 */
export function computeFrameSimilarity(
  frameEmbedding: number[],
  referenceEmbedding: number[],
): SimilarityResult {
  if (frameEmbedding.length === 0 || referenceEmbedding.length === 0) {
    return {
      ok: false,
      error: {
        kind: "empty_embedding",
        message: "frame 或 reference embedding 为空数组",
      },
    };
  }

  if (frameEmbedding.length !== referenceEmbedding.length) {
    return {
      ok: false,
      error: {
        kind: "dimension_mismatch",
        message: `embedding 维度不匹配: frame=${frameEmbedding.length}, ref=${referenceEmbedding.length}`,
        frameDim: frameEmbedding.length,
        refDim: referenceEmbedding.length,
      },
    };
  }

  try {
    const sim = cosineSimilarity(frameEmbedding, referenceEmbedding);
    // 余弦相似度范围 [-1, 1]，归一化到 [0, 1] 用于 QC 判定
    // (sim + 1) / 2 把 [-1, 1] 映射到 [0, 1]
    // 但实际上对于归一化的 face embedding，sim 通常在 [0, 1] 范围内
    // 保守起见，使用 max(0, sim) 截断负值（负值意味着方向相反，应视为完全不匹配）
    return { ok: true, value: Math.max(0, sim) };
  } catch (e) {
    return {
      ok: false,
      error: {
        kind: "compute_failed",
        message: e instanceof Error ? e.message : String(e),
        cause: e,
      },
    };
  }
}

/** 帧级相似度批量计算输入项 */
export interface FrameEmbeddingInput {
  /** 帧索引（0-based） */
  frameIndex: number;
  /** 时间戳（秒） */
  timestamp: number;
  /** 帧 embedding 向量 */
  embedding: number[];
  /** 是否检测到人脸（来自 provider metadata） */
  faceDetected?: boolean;
}

/**
 * 批量计算帧级相似度并生成 FrameScore 列表。
 *
 * - 维度不匹配或空 embedding 的帧跳过（不抛出，记录为 cosineSimilarity=0, faceDetected=false）
 * - 计算失败的帧同样跳过（保证部分失败不阻塞整体 QC）
 *
 * @param frameEmbeddings 帧级 embedding 列表
 * @param referenceEmbedding 参考 embedding（角色参考图）
 * @returns FrameScore 列表，与输入顺序一致（失败的帧也会包含，但 cosineSimilarity=0）
 */
export function checkFrameConsistency(
  frameEmbeddings: FrameEmbeddingInput[],
  referenceEmbedding: number[],
): FrameScore[] {
  if (frameEmbeddings.length === 0 || referenceEmbedding.length === 0) {
    return [];
  }

  const results: FrameScore[] = [];
  for (const frame of frameEmbeddings) {
    const simResult = computeFrameSimilarity(frame.embedding, referenceEmbedding);
    if (simResult.ok) {
      results.push({
        frameIndex: frame.frameIndex,
        timestamp: frame.timestamp,
        cosineSimilarity: simResult.value,
        faceDetected: frame.faceDetected ?? true,
      });
    } else {
      // 计算失败的帧：记录为 0 相似度，faceDetected=false
      // QC 编排器会根据 verdict 决定是否触发 fallback
      results.push({
        frameIndex: frame.frameIndex,
        timestamp: frame.timestamp,
        cosineSimilarity: 0,
        faceDetected: false,
      });
    }
  }
  return results;
}

/**
 * 找出漂移最严重的帧（cosineSimilarity 最低）。
 *
 * @returns FrameScore | null（空列表返回 null）
 */
export function findWorstFrame(frameScores: FrameScore[]): FrameScore | null {
  if (frameScores.length === 0) return null;
  return frameScores.reduce((worst, current) =>
    current.cosineSimilarity < worst.cosineSimilarity ? current : worst,
  );
}

/**
 * 找出漂移最严重的 N 帧。
 *
 * @param frameScores 帧级评分列表
 * @param k 返回的帧数（超出长度时返回全部）
 * @returns 按 cosineSimilarity 升序排列的前 K 帧
 */
export function findWorstFrames(frameScores: FrameScore[], k: number): FrameScore[] {
  if (frameScores.length === 0 || k <= 0) return [];
  return [...frameScores]
    .sort((a, b) => a.cosineSimilarity - b.cosineSimilarity)
    .slice(0, Math.min(k, frameScores.length));
}

/**
 * 过滤掉未检测到人脸的帧（用于动画风格的 QC，disableFaceDetection=false 时使用）。
 *
 * 动画风格若无 face 检测，相似度分数本身意义不大，应单独标记。
 */
export function filterFramesWithFace(frameScores: FrameScore[]): FrameScore[] {
  return frameScores.filter((f) => f.faceDetected);
}

/**
 * 统计帧级评分中的关键指标（用于 UI 展示）。
 */
export interface FrameScoreStats {
  /** 总帧数 */
  total: number;
  /** 检测到人脸的帧数 */
  withFace: number;
  /** 相似度 >= 阈值的帧数 */
  aboveThreshold: number;
  /** 相似度 < 阈值的帧数 */
  belowThreshold: number;
  /** 通过率 [0, 1] */
  passRate: number;
}

export function computeFrameStats(
  frameScores: FrameScore[],
  threshold: number,
): FrameScoreStats {
  const total = frameScores.length;
  if (total === 0) {
    return { total: 0, withFace: 0, aboveThreshold: 0, belowThreshold: 0, passRate: 0 };
  }
  const withFace = frameScores.filter((f) => f.faceDetected).length;
  const aboveThreshold = frameScores.filter((f) => f.cosineSimilarity >= threshold).length;
  const belowThreshold = total - aboveThreshold;
  return {
    total,
    withFace,
    aboveThreshold,
    belowThreshold,
    passRate: aboveThreshold / total,
  };
}

// ─── 测试辅助导出 ─────────────────────────────────────────────────────────────

/** 内部错误类型导出（仅用于测试断言） */
export type { SimilarityCheckerError as _SimilarityCheckerError };
