/**
 * Task 2A.23: face-embedding-service 单元测试
 *
 * 覆盖：
 * - parseVlmAnalysis: 裸 JSON / 代码块 / 正则提取 / 无效输入
 * - normalizeVlmResult: score/similarityScore 归一化 / faceDetected 缺省
 * - NoopFaceEmbeddingProvider: isAvailable=false / extractEmbedding 返回错误
 * - VlmEmbeddingProvider: isAvailable 检查 / extractEmbedding 成功路径
 * - getFaceEmbeddingProvider: 降级链路
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock 依赖 ──────────────────────────────────────────────────────────────
const {
  mockImageApi,
  mockContainer,
  mockErrorLogger,
} = vi.hoisted(() => {
  const mockImageApi = {
    analyze: vi.fn(),
  };

  const mockContainer = {
    imageApi: mockImageApi,
  };

  const mockErrorLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  return { mockImageApi, mockContainer, mockErrorLogger };
});

vi.mock("@/infrastructure/di", () => ({
  container: mockContainer,
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: mockErrorLogger,
}));

// mock @/shared/file-http（OnnxFaceEmbeddingProvider 通过动态 import 读取配置）
vi.mock("@/shared/file-http", () => ({
  getConfig: vi.fn().mockResolvedValue(undefined), // 默认无模型路径
}));

import {
  _testExports,
  clearFaceEmbeddingProviderCache,
  getFaceEmbeddingProvider,
  isFaceEmbeddingAvailable,
  extractFaceEmbedding,
} from "../face-embedding-service";

const { parseVlmAnalysis, normalizeVlmResult, NoopFaceEmbeddingProvider, VlmEmbeddingProvider } = _testExports;

describe("face-embedding-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearFaceEmbeddingProviderCache();
  });

  // ── parseVlmAnalysis ──────────────────────────────────────────────────────

  describe("parseVlmAnalysis", () => {
    it("用例1: 解析裸 JSON（含 similarityScore）", () => {
      const text = '{"similarityScore": 0.85, "faceDetected": true}';
      const result = parseVlmAnalysis(text);
      expect(result).not.toBeNull();
      expect(result!.similarityScore).toBe(0.85);
      expect(result!.faceDetected).toBe(true);
    });

    it("用例2: 解析裸 JSON（含 score 字段，归一化为 similarityScore）", () => {
      const text = '{"score": 0.7, "faceDetected": false}';
      const result = parseVlmAnalysis(text);
      expect(result).not.toBeNull();
      expect(result!.similarityScore).toBe(0.7);
      expect(result!.faceDetected).toBe(false);
    });

    it("用例3: 解析代码块包裹的 JSON", () => {
      const text = '```json\n{"similarityScore": 0.9, "faceDetected": true}\n```';
      const result = parseVlmAnalysis(text);
      expect(result).not.toBeNull();
      expect(result!.similarityScore).toBe(0.9);
    });

    it("用例4: 正则提取嵌入文本中的 JSON", () => {
      const text = '分析结果如下：{"score": 0.65, "faceDetected": true}，请参考。';
      const result = parseVlmAnalysis(text);
      expect(result).not.toBeNull();
      expect(result!.similarityScore).toBe(0.65);
    });

    it("用例5: 无效输入返回 null", () => {
      expect(parseVlmAnalysis("")).toBeNull();
      expect(parseVlmAnalysis("not json at all")).toBeNull();
      expect(parseVlmAnalysis('{"foo": "bar"}')).toBeNull(); // 缺 score/similarityScore
    });

    it("用例6: faceDetected 缺省时视为 true（保守策略）", () => {
      const text = '{"score": 0.8}';
      const result = parseVlmAnalysis(text);
      expect(result).not.toBeNull();
      expect(result!.faceDetected).toBe(true);
    });

    it("用例7: score 超出 [0,1] 被截断", () => {
      const text = '{"score": 1.5}';
      const result = parseVlmAnalysis(text);
      expect(result).not.toBeNull();
      expect(result!.similarityScore).toBe(1);
    });
  });

  // ── normalizeVlmResult ────────────────────────────────────────────────────

  describe("normalizeVlmResult", () => {
    it("用例1: similarityScore 字段正常归一化", () => {
      const result = normalizeVlmResult({ similarityScore: 0.8 });
      expect(result).not.toBeNull();
      expect(result!.similarityScore).toBe(0.8);
    });

    it("用例2: score 字段归一化为 similarityScore", () => {
      const result = normalizeVlmResult({ score: 0.6 });
      expect(result).not.toBeNull();
      expect(result!.similarityScore).toBe(0.6);
    });

    it("用例3: 无 score 字段返回 null", () => {
      expect(normalizeVlmResult({ foo: "bar" })).toBeNull();
      expect(normalizeVlmResult(null)).toBeNull();
      expect(normalizeVlmResult(undefined)).toBeNull();
      expect(normalizeVlmResult("string")).toBeNull();
    });

    it("用例4: rawAnalysis 字段传递", () => {
      const result = normalizeVlmResult({ score: 0.5, rawAnalysis: "face looks similar" });
      expect(result).not.toBeNull();
      expect(result!.rawAnalysis).toBe("face looks similar");
    });

    it("用例5: 非对象返回 null", () => {
      expect(normalizeVlmResult(42)).toBeNull();
      expect(normalizeVlmResult([1, 2, 3])).toBeNull();
    });
  });

  // ── NoopFaceEmbeddingProvider ─────────────────────────────────────────────

  describe("NoopFaceEmbeddingProvider", () => {
    it("用例1: isAvailable 恒返回 false", async () => {
      const provider = new NoopFaceEmbeddingProvider();
      expect(await provider.isAvailable()).toBe(false);
    });

    it("用例2: extractEmbedding 返回错误", async () => {
      const provider = new NoopFaceEmbeddingProvider();
      const result = await provider.extractEmbedding("https://example.com/img.jpg");
      expect(result.ok).toBe(false);
    });

    it("用例3: providerType 为 'none'", () => {
      const provider = new NoopFaceEmbeddingProvider();
      expect(provider.providerType).toBe("none");
    });
  });

  // ── VlmEmbeddingProvider ──────────────────────────────────────────────────

  describe("VlmEmbeddingProvider", () => {
    it("用例4: imageApi 存在时 isAvailable 返回 true", async () => {
      const provider = new VlmEmbeddingProvider();
      expect(await provider.isAvailable()).toBe(true);
    });

    it("用例5: extractEmbedding 成功路径返回 1 维 embedding", async () => {
      mockImageApi.analyze.mockResolvedValueOnce({
        ok: true,
        value: { analysis: '{"similarityScore": 0.85, "faceDetected": true}' },
      });
      const provider = new VlmEmbeddingProvider();
      const result = await provider.extractEmbedding("https://example.com/img.jpg");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.embedding).toEqual([0.85]);
        expect(result.value.metadata.providerType).toBe("vlm");
        expect(result.value.metadata.dimensions).toBe(1);
        expect(result.value.metadata.faceDetected).toBe(true);
      }
    });

    it("用例6: VLM analyze 失败时返回错误", async () => {
      mockImageApi.analyze.mockResolvedValueOnce({
        ok: false,
        error: new Error("API error"),
      });
      const provider = new VlmEmbeddingProvider();
      const result = await provider.extractEmbedding("https://example.com/img.jpg");
      expect(result.ok).toBe(false);
    });

    it("用例7: VLM 返回无法解析的文本时返回错误", async () => {
      mockImageApi.analyze.mockResolvedValueOnce({
        ok: true,
        value: { analysis: "无法解析的文本" },
      });
      const provider = new VlmEmbeddingProvider();
      const result = await provider.extractEmbedding("https://example.com/img.jpg");
      expect(result.ok).toBe(false);
    });
  });

  // ── getFaceEmbeddingProvider（降级链路） ──────────────────────────────────

  describe("getFaceEmbeddingProvider", () => {
    it("用例8: ONNX 不可用时降级到 VLM provider", async () => {
      // file-http mock 默认返回 undefined（无模型路径）
      const provider = await getFaceEmbeddingProvider();
      expect(provider.providerType).toBe("vlm");
    });

    it("用例9: 缓存机制 — 重复调用返回同一实例", async () => {
      const provider1 = await getFaceEmbeddingProvider();
      const provider2 = await getFaceEmbeddingProvider();
      expect(provider1).toBe(provider2);
    });

    it("用例10: clearFaceEmbeddingProviderCache 后重新解析", async () => {
      const provider1 = await getFaceEmbeddingProvider();
      clearFaceEmbeddingProviderCache();
      const provider2 = await getFaceEmbeddingProvider();
      // 不同实例（重新解析）
      expect(provider1).not.toBe(provider2);
      // 但类型相同
      expect(provider1.providerType).toBe(provider2.providerType);
    });
  });

  // ── 便捷方法 ──────────────────────────────────────────────────────────────

  describe("isFaceEmbeddingAvailable", () => {
    it("用例11: VLM 可用时返回 true", async () => {
      expect(await isFaceEmbeddingAvailable()).toBe(true);
    });
  });

  describe("extractFaceEmbedding", () => {
    it("用例12: 委托给 provider.extractEmbedding", async () => {
      mockImageApi.analyze.mockResolvedValueOnce({
        ok: true,
        value: { analysis: '{"score": 0.9}' },
      });
      const result = await extractFaceEmbedding("https://example.com/img.jpg");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.embedding).toEqual([0.9]);
      }
    });
  });
});
