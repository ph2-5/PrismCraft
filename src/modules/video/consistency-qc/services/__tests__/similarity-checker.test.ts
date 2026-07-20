/**
 * Task 2A.23: similarity-checker 单元测试
 *
 * 覆盖：
 * - computeFrameSimilarity: 正常路径 / 维度不匹配 / 空 embedding / 计算异常
 * - checkFrameConsistency: 批量计算 / 部分失败 / 空输入
 * - findWorstFrame / findWorstFrames
 * - filterFramesWithFace
 * - computeFrameStats
 */
import { describe, it, expect } from "vitest";
import {
  computeFrameSimilarity,
  checkFrameConsistency,
  findWorstFrame,
  findWorstFrames,
  filterFramesWithFace,
  computeFrameStats,
  type FrameEmbeddingInput,
} from "../similarity-checker";
import type { FrameScore } from "../../domain/qc-schema";

describe("similarity-checker", () => {
  // ── computeFrameSimilarity ────────────────────────────────────────────────

  describe("computeFrameSimilarity", () => {
    it("用例1: 相同向量返回 1.0", () => {
      const vec = [1, 0, 0, 0.5];
      const result = computeFrameSimilarity(vec, vec);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeCloseTo(1.0, 5);
      }
    });

    it("用例2: 正交向量返回 0.0", () => {
      const frame = [1, 0];
      const reference = [0, 1];
      const result = computeFrameSimilarity(frame, reference);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeCloseTo(0.0, 5);
      }
    });

    it("用例3: 维度不匹配返回 dimension_mismatch 错误", () => {
      const frame = [1, 0, 0];
      const reference = [1, 0];
      const result = computeFrameSimilarity(frame, reference);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe("dimension_mismatch");
        if (result.error.kind === "dimension_mismatch") {
          expect(result.error.frameDim).toBe(3);
          expect(result.error.refDim).toBe(2);
        }
      }
    });

    it("用例4: 空 embedding 返回 empty_embedding 错误", () => {
      const result1 = computeFrameSimilarity([], [1, 0]);
      const result2 = computeFrameSimilarity([1, 0], []);
      expect(result1.ok).toBe(false);
      expect(result2.ok).toBe(false);
      if (!result1.ok) expect(result1.error.kind).toBe("empty_embedding");
      if (!result2.ok) expect(result2.error.kind).toBe("empty_embedding");
    });

    it("用例5: 相似向量返回接近 1 的值", () => {
      const frame = [0.9, 0.1, 0.2];
      const reference = [1.0, 0.0, 0.1];
      const result = computeFrameSimilarity(frame, reference);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeGreaterThan(0.8);
        expect(result.value).toBeLessThanOrEqual(1.0);
      }
    });

    it("用例6: 反向向量（cos=-1）被截断为 0", () => {
      const frame = [1, 0];
      const reference = [-1, 0];
      const result = computeFrameSimilarity(frame, reference);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(0); // 负值被 max(0, sim) 截断
      }
    });
  });

  // ── checkFrameConsistency ─────────────────────────────────────────────────

  describe("checkFrameConsistency", () => {
    it("用例1: 批量计算多帧相似度", () => {
      const reference = [1, 0, 0];
      const frames: FrameEmbeddingInput[] = [
        { frameIndex: 0, timestamp: 0, embedding: [1, 0, 0] },
        { frameIndex: 1, timestamp: 0.5, embedding: [0.9, 0.1, 0] },
        { frameIndex: 2, timestamp: 1.0, embedding: [0, 1, 0] },
      ];
      const scores = checkFrameConsistency(frames, reference);
      expect(scores).toHaveLength(3);
      expect(scores[0]!.cosineSimilarity).toBeCloseTo(1.0, 5);
      expect(scores[1]!.cosineSimilarity).toBeGreaterThan(0.9);
      expect(scores[2]!.cosineSimilarity).toBeCloseTo(0.0, 5);
    });

    it("用例2: 维度不匹配的帧被记为 0 相似度", () => {
      const reference = [1, 0];
      const frames: FrameEmbeddingInput[] = [
        { frameIndex: 0, timestamp: 0, embedding: [1, 0] },
        { frameIndex: 1, timestamp: 0.5, embedding: [1, 0, 0] }, // 维度不匹配
      ];
      const scores = checkFrameConsistency(frames, reference);
      expect(scores).toHaveLength(2);
      expect(scores[0]!.cosineSimilarity).toBeCloseTo(1.0, 5);
      expect(scores[1]!.cosineSimilarity).toBe(0);
      expect(scores[1]!.faceDetected).toBe(false);
    });

    it("用例3: 空输入返回空数组", () => {
      expect(checkFrameConsistency([], [1, 0])).toEqual([]);
      expect(checkFrameConsistency([{ frameIndex: 0, timestamp: 0, embedding: [1] }], [])).toEqual([]);
    });

    it("用例4: faceDetected 字段正确传递", () => {
      const reference = [1, 0];
      const frames: FrameEmbeddingInput[] = [
        { frameIndex: 0, timestamp: 0, embedding: [1, 0], faceDetected: true },
        { frameIndex: 1, timestamp: 0.5, embedding: [1, 0], faceDetected: false },
        { frameIndex: 2, timestamp: 1.0, embedding: [1, 0] }, // 缺省 → true
      ];
      const scores = checkFrameConsistency(frames, reference);
      expect(scores[0]!.faceDetected).toBe(true);
      expect(scores[1]!.faceDetected).toBe(false);
      expect(scores[2]!.faceDetected).toBe(true); // 缺省值
    });

    it("用例5: 帧 embedding 为空时记为 0 相似度", () => {
      const reference = [1, 0];
      const frames: FrameEmbeddingInput[] = [
        { frameIndex: 0, timestamp: 0, embedding: [] },
      ];
      const scores = checkFrameConsistency(frames, reference);
      expect(scores).toHaveLength(1);
      expect(scores[0]!.cosineSimilarity).toBe(0);
      expect(scores[0]!.faceDetected).toBe(false);
    });
  });

  // ── findWorstFrame / findWorstFrames ──────────────────────────────────────

  describe("findWorstFrame", () => {
    it("用例1: 返回相似度最低的帧", () => {
      const scores: FrameScore[] = [
        { frameIndex: 0, timestamp: 0, cosineSimilarity: 0.9, faceDetected: true },
        { frameIndex: 1, timestamp: 0.5, cosineSimilarity: 0.3, faceDetected: true },
        { frameIndex: 2, timestamp: 1.0, cosineSimilarity: 0.7, faceDetected: true },
      ];
      const worst = findWorstFrame(scores);
      expect(worst).not.toBeNull();
      expect(worst!.frameIndex).toBe(1);
      expect(worst!.cosineSimilarity).toBe(0.3);
    });

    it("用例2: 空列表返回 null", () => {
      expect(findWorstFrame([])).toBeNull();
    });
  });

  describe("findWorstFrames", () => {
    it("用例3: 返回前 K 帧按相似度升序", () => {
      const scores: FrameScore[] = [
        { frameIndex: 0, timestamp: 0, cosineSimilarity: 0.9, faceDetected: true },
        { frameIndex: 1, timestamp: 0.5, cosineSimilarity: 0.3, faceDetected: true },
        { frameIndex: 2, timestamp: 1.0, cosineSimilarity: 0.7, faceDetected: true },
        { frameIndex: 3, timestamp: 1.5, cosineSimilarity: 0.5, faceDetected: true },
      ];
      const worst = findWorstFrames(scores, 2);
      expect(worst).toHaveLength(2);
      expect(worst[0]!.frameIndex).toBe(1); // 0.3
      expect(worst[1]!.frameIndex).toBe(3); // 0.5
    });

    it("用例4: K 超出长度时返回全部", () => {
      const scores: FrameScore[] = [
        { frameIndex: 0, timestamp: 0, cosineSimilarity: 0.9, faceDetected: true },
        { frameIndex: 1, timestamp: 0.5, cosineSimilarity: 0.3, faceDetected: true },
      ];
      expect(findWorstFrames(scores, 10)).toHaveLength(2);
    });

    it("用例5: K=0 返回空数组", () => {
      const scores: FrameScore[] = [
        { frameIndex: 0, timestamp: 0, cosineSimilarity: 0.9, faceDetected: true },
      ];
      expect(findWorstFrames(scores, 0)).toEqual([]);
    });
  });

  // ── filterFramesWithFace ──────────────────────────────────────────────────

  describe("filterFramesWithFace", () => {
    it("用例1: 过滤掉 faceDetected=false 的帧", () => {
      const scores: FrameScore[] = [
        { frameIndex: 0, timestamp: 0, cosineSimilarity: 0.9, faceDetected: true },
        { frameIndex: 1, timestamp: 0.5, cosineSimilarity: 0.3, faceDetected: false },
        { frameIndex: 2, timestamp: 1.0, cosineSimilarity: 0.7, faceDetected: true },
      ];
      const filtered = filterFramesWithFace(scores);
      expect(filtered).toHaveLength(2);
      expect(filtered[0]!.frameIndex).toBe(0);
      expect(filtered[1]!.frameIndex).toBe(2);
    });

    it("用例2: 空列表返回空数组", () => {
      expect(filterFramesWithFace([])).toEqual([]);
    });
  });

  // ── computeFrameStats ─────────────────────────────────────────────────────

  describe("computeFrameStats", () => {
    it("用例1: 正确统计通过率", () => {
      const scores: FrameScore[] = [
        { frameIndex: 0, timestamp: 0, cosineSimilarity: 0.9, faceDetected: true },
        { frameIndex: 1, timestamp: 0.5, cosineSimilarity: 0.3, faceDetected: false },
        { frameIndex: 2, timestamp: 1.0, cosineSimilarity: 0.7, faceDetected: true },
        { frameIndex: 3, timestamp: 1.5, cosineSimilarity: 0.8, faceDetected: true },
      ];
      const stats = computeFrameStats(scores, 0.6);
      expect(stats.total).toBe(4);
      expect(stats.withFace).toBe(3);
      expect(stats.aboveThreshold).toBe(3); // 0.9, 0.7, 0.8
      expect(stats.belowThreshold).toBe(1); // 0.3
      expect(stats.passRate).toBeCloseTo(0.75, 5);
    });

    it("用例2: 空列表返回零统计", () => {
      const stats = computeFrameStats([], 0.6);
      expect(stats.total).toBe(0);
      expect(stats.passRate).toBe(0);
    });

    it("用例3: 全部通过", () => {
      const scores: FrameScore[] = [
        { frameIndex: 0, timestamp: 0, cosineSimilarity: 0.9, faceDetected: true },
        { frameIndex: 1, timestamp: 0.5, cosineSimilarity: 0.8, faceDetected: true },
      ];
      const stats = computeFrameStats(scores, 0.6);
      expect(stats.aboveThreshold).toBe(2);
      expect(stats.belowThreshold).toBe(0);
      expect(stats.passRate).toBe(1);
    });

    it("用例4: 全部不通过", () => {
      const scores: FrameScore[] = [
        { frameIndex: 0, timestamp: 0, cosineSimilarity: 0.1, faceDetected: true },
        { frameIndex: 1, timestamp: 0.5, cosineSimilarity: 0.2, faceDetected: true },
      ];
      const stats = computeFrameStats(scores, 0.6);
      expect(stats.aboveThreshold).toBe(0);
      expect(stats.belowThreshold).toBe(2);
      expect(stats.passRate).toBe(0);
    });

    it("用例5: 阈值边界（等于阈值视为通过）", () => {
      const scores: FrameScore[] = [
        { frameIndex: 0, timestamp: 0, cosineSimilarity: 0.6, faceDetected: true },
      ];
      const stats = computeFrameStats(scores, 0.6);
      expect(stats.aboveThreshold).toBe(1); // >= 视为通过
      expect(stats.belowThreshold).toBe(0);
    });
  });
});
