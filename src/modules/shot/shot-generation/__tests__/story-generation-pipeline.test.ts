import { describe, it, expect, vi } from "vitest";

const { mockError, mockWarn, mockInfo, mockDebug } = vi.hoisted(() => ({
  mockError: vi.fn(),
  mockWarn: vi.fn(),
  mockInfo: vi.fn(),
  mockDebug: vi.fn(),
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: { warn: mockWarn, error: mockError, info: mockInfo, debug: mockDebug },
  extractErrorMessage: (e: unknown) => e instanceof Error ? e.message : String(e),
}));

vi.mock("@/shared/constants", () => ({
  t: (key: string, params?: Record<string, unknown>) => {
    if (key === "pipeline.completed") return `完成：${params?.count}个分镜`;
    if (key === "pipeline.validatingRetry") return `验证重试 ${params?.attempt}`;
    if (key === "pipeline.genFailedRetry") return `生成失败重试 ${params?.attempt}`;
    if (key === "pipeline.postValidating") return "后验证";
    if (key === "pipeline.validationFailed") return "验证失败";
    if (key === "pipeline.validationFailedNoAutoFix") return "验证失败无自动修复";
    if (key === "error.storyPlanParseFailed") return "解析失败";
    if (key === "error.storyPlanGenFailed") return "生成失败";
    if (key === "error.storyPlanValidationFailed") return "验证失败";
    return key;
  },
}));

vi.mock("@/shared/model-capabilities", () => ({
  getVideoGenerationStrategy: () => ({ promptLanguage: "zh", useCharacterRef: false, useSceneRef: false, characterRefMode: "none", sceneRefMode: "none", useFirstFrame: true, useLastFrame: true, imageUploadMode: "base64", maxCharacterRefs: 4, referenceStrategy: { characterRef: "bake_into_first", sceneRef: "bake_into_first" }, supportsReferenceVideo: false }),
  supportsLastFrame: () => true,
}));

vi.mock("@/infrastructure/di", () => ({
  container: {
    textProvider: {
      generateText: vi.fn().mockResolvedValue({ success: true, data: { text: '[{"t":"标题","c":"内容描述足够长的分镜内容","st":"wide","ca":"eye_level","cm":"static","d":5,"tp":"scene","ci":[],"si":""}]' } }),
    },
  },
}));

import { DEFAULT_OPTIONS, STRICT_OPTIONS } from "../../shot-generation/story-generation-pipeline";

describe("getRetryParams (通过 story-generation-pipeline)", () => {
  describe("DEFAULT_OPTIONS", () => {
    it("应有默认 maxRetries=5", () => {
      expect(DEFAULT_OPTIONS.maxRetries).toBe(5);
    });

    it("应有 autoFix=true", () => {
      expect(DEFAULT_OPTIONS.autoFix).toBe(true);
    });

    it("应有 enhancedGeneration=true", () => {
      expect(DEFAULT_OPTIONS.enhancedGeneration).toBe(true);
    });
  });

  describe("STRICT_OPTIONS", () => {
    it("应有 maxRetries=8", () => {
      expect(STRICT_OPTIONS.maxRetries).toBe(8);
    });

    it("应有 autoFix=false", () => {
      expect(STRICT_OPTIONS.autoFix).toBe(false);
    });

    it("应有 strictMode=true", () => {
      expect(STRICT_OPTIONS.strictMode).toBe(true);
    });
  });
});

describe("getRetryParams 计算逻辑", () => {
  function getRetryParams(attempt: number, maxAttempts: number): { temperature: number; maxTokens: number } {
    const safeMaxAttempts = Math.max(maxAttempts, 1);
    const progress = attempt / safeMaxAttempts;
    const temperature = Math.max(0.3, 0.7 - progress * 0.4);
    const maxTokens = Math.max(2000, 4000 - Math.floor(progress * 2000));
    return { temperature, maxTokens };
  }

  it("getRetryParams(0, 5) 应返回默认参数 (temperature=0.7, maxTokens=4000)", () => {
    const result = getRetryParams(0, 5);
    expect(result.temperature).toBeCloseTo(0.7, 5);
    expect(result.maxTokens).toBe(4000);
  });

  it("getRetryParams(4, 5) 应返回保守参数", () => {
    const result = getRetryParams(4, 5);
    expect(result.temperature).toBeLessThan(0.7);
    expect(result.temperature).toBeGreaterThanOrEqual(0.3);
    expect(result.maxTokens).toBeLessThan(4000);
    expect(result.maxTokens).toBeGreaterThanOrEqual(2000);
  });

  it("getRetryParams(0, 0) 应安全处理 maxAttempts=0 (不除零)", () => {
    const result = getRetryParams(0, 0);
    expect(result.temperature).toBeTypeOf("number");
    expect(result.maxTokens).toBeTypeOf("number");
    expect(isNaN(result.temperature)).toBe(false);
    expect(isNaN(result.maxTokens)).toBe(false);
  });

  it("getRetryParams(0, -1) 应安全处理负数 maxAttempts", () => {
    const result = getRetryParams(0, -1);
    expect(result.temperature).toBeTypeOf("number");
    expect(result.maxTokens).toBeTypeOf("number");
    expect(isNaN(result.temperature)).toBe(false);
    expect(isNaN(result.maxTokens)).toBe(false);
  });

  it("temperature 不应低于 0.3", () => {
    const result = getRetryParams(100, 1);
    expect(result.temperature).toBeGreaterThanOrEqual(0.3);
  });

  it("maxTokens 不应低于 2000", () => {
    const result = getRetryParams(100, 1);
    expect(result.maxTokens).toBeGreaterThanOrEqual(2000);
  });

  it("随着 attempt 增加，temperature 应递减", () => {
    const r0 = getRetryParams(0, 5);
    const r1 = getRetryParams(1, 5);
    const r2 = getRetryParams(2, 5);
    expect(r0.temperature).toBeGreaterThan(r1.temperature);
    expect(r1.temperature).toBeGreaterThan(r2.temperature);
  });

  it("随着 attempt 增加，maxTokens 应递减", () => {
    const r0 = getRetryParams(0, 5);
    const r1 = getRetryParams(1, 5);
    const r2 = getRetryParams(2, 5);
    expect(r0.maxTokens).toBeGreaterThan(r1.maxTokens);
    expect(r1.maxTokens).toBeGreaterThan(r2.maxTokens);
  });
});
