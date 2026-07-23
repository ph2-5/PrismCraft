import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ApiClientError } from "../errors";

const {
  mockApiCallWithRetry,
  mockResolveCapability,
  mockSafeTruncatePrompt,
  mockNormalizeImageToBase64,
  mockResolveImageSize,
  mockErrorLoggerWarn,
} = vi.hoisted(() => ({
  mockApiCallWithRetry: vi.fn(),
  mockResolveCapability: vi.fn(),
  mockSafeTruncatePrompt: vi.fn(),
  mockNormalizeImageToBase64: vi.fn(),
  mockResolveImageSize: vi.fn(),
  mockErrorLoggerWarn: vi.fn(),
}));

vi.mock("../core", () => ({
  apiCallWithRetry: (...args: unknown[]) => mockApiCallWithRetry(...args),
}));

vi.mock("../config", () => ({
  resolveCapability: (...args: unknown[]) => mockResolveCapability(...args),
  safeTruncatePrompt: (...args: unknown[]) => mockSafeTruncatePrompt(...args),
}));

vi.mock("../image-normalization", () => ({
  imageToBase64: (...args: unknown[]) => mockNormalizeImageToBase64(...args),
}));

vi.mock("../model-capabilities", () => ({
  resolveImageSize: (...args: unknown[]) => mockResolveImageSize(...args),
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: { warn: mockErrorLoggerWarn, error: vi.fn() },
  extractErrorMessage: (e: unknown) =>
    e instanceof Error ? e.message : String(e),
}));

import { generateImage, analyzeImage } from "../image";

const successResponse = {
  success: true,
  data: { imageUrl: "https://example.com/image.png" },
  error: undefined,
};

describe("generateImage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSafeTruncatePrompt.mockReturnValue({ truncated: "test prompt", wasTruncated: false });
    mockResolveImageSize.mockReturnValue("1920x1920");
    mockApiCallWithRetry.mockResolvedValue(successResponse);
  });

  it("应使用提供的 providerId 和 modelId", async () => {
    const result = await generateImage("prompt", "character", {
      providerId: "custom-provider",
      modelId: "custom-model",
      size: "1024x1024",
    });

    expect(result).toEqual(successResponse);
    expect(mockResolveCapability).not.toHaveBeenCalled();
    expect(mockApiCallWithRetry).toHaveBeenCalledWith(
      "generate-image",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("custom-provider"),
      }),
    );
  });

  it("应在未提供 providerId/modelId 时调用 resolveCapability", async () => {
    mockResolveCapability.mockResolvedValue({
      provider: { id: "resolved-provider" },
      model: { id: "resolved-model" },
    });

    const result = await generateImage("prompt");

    expect(mockResolveCapability).toHaveBeenCalledWith("image");
    expect(result).toEqual(successResponse);
  });

  it("应仅缺少 providerId 时也调用 resolveCapability", async () => {
    mockResolveCapability.mockResolvedValue({
      provider: { id: "resolved-provider" },
      model: { id: "resolved-model" },
    });

    await generateImage("prompt", "character", { modelId: "some-model" });

    expect(mockResolveCapability).toHaveBeenCalledWith("image");
  });

  it("应仅缺少 modelId 时也调用 resolveCapability", async () => {
    mockResolveCapability.mockResolvedValue({
      provider: { id: "resolved-provider" },
      model: { id: "resolved-model" },
    });

    await generateImage("prompt", "character", { providerId: "some-provider" });

    expect(mockResolveCapability).toHaveBeenCalledWith("image");
  });

  it("应使用 purpose 参数解析图片尺寸", async () => {
    mockResolveCapability.mockResolvedValue({
      provider: { id: "p1" },
      model: { id: "m1" },
    });

    await generateImage("prompt", "character", { purpose: "scene" });

    expect(mockResolveImageSize).toHaveBeenCalledWith("m1", "scene", undefined);
  });

  it("应使用 type 作为默认 purpose", async () => {
    mockResolveCapability.mockResolvedValue({
      provider: { id: "p1" },
      model: { id: "m1" },
    });

    await generateImage("prompt", "keyframe");

    expect(mockResolveImageSize).toHaveBeenCalledWith("m1", "keyframe", undefined);
  });

  it("应传递 promptWasTruncated 到请求体", async () => {
    mockSafeTruncatePrompt.mockReturnValue({ truncated: "truncated prompt", wasTruncated: true });

    await generateImage("long prompt", "character", {
      providerId: "p1",
      modelId: "m1",
    });

    const body = JSON.parse(mockApiCallWithRetry.mock.calls[0]![1]!.body);
    expect(body.promptWasTruncated).toBe(true);
    expect(body.prompt).toBe("truncated prompt");
  });

  it("PrismCraft 第四章: 应传递参考图字段到请求体", async () => {
    await generateImage("prompt", "compositor", {
      providerId: "p1",
      modelId: "m1",
      characterImageUrl: "https://example.com/char.png",
      sceneImageUrl: "https://example.com/scene.png",
      referenceImageUrl: "https://example.com/ref.png",
      previousFrameUrl: "https://example.com/prev.png",
    });

    const body = JSON.parse(mockApiCallWithRetry.mock.calls[0]![1]!.body);
    expect(body.characterImageUrl).toBe("https://example.com/char.png");
    expect(body.sceneImageUrl).toBe("https://example.com/scene.png");
    expect(body.referenceImageUrl).toBe("https://example.com/ref.png");
    expect(body.previousFrameUrl).toBe("https://example.com/prev.png");
  });

  it("PrismCraft 第四章: 未传参考图时请求体中对应字段为 undefined（不会被序列化）", async () => {
    await generateImage("prompt", "character", {
      providerId: "p1",
      modelId: "m1",
    });

    const body = JSON.parse(mockApiCallWithRetry.mock.calls[0]![1]!.body);
    expect(body.characterImageUrl).toBeUndefined();
    expect(body.sceneImageUrl).toBeUndefined();
    expect(body.referenceImageUrl).toBeUndefined();
    expect(body.previousFrameUrl).toBeUndefined();
  });

  it("ApiClientError 应直接抛出", async () => {
    const apiError = new ApiClientError("API error", 400, "CONFIG_MISSING");
    mockApiCallWithRetry.mockRejectedValue(apiError);

    await expect(generateImage("prompt", "character", {
      providerId: "p1",
      modelId: "m1",
    })).rejects.toThrow(apiError);
  });

  it("非 ApiClientError 应包装为普通 Error 抛出", async () => {
    mockApiCallWithRetry.mockRejectedValue(new Error("network failure"));

    await expect(generateImage("prompt", "character", {
      providerId: "p1",
      modelId: "m1",
    })).rejects.toThrow("network failure");
  });

  it("非 Error 类型的异常应正确提取消息", async () => {
    mockApiCallWithRetry.mockRejectedValue("string error");

    await expect(generateImage("prompt", "character", {
      providerId: "p1",
      modelId: "m1",
    })).rejects.toThrow();
  });
});

describe("analyzeImage", () => {
  const originalWindow = globalThis.window;
  const originalImage = globalThis.Image;

  afterEach(() => {
    (globalThis as Record<string, unknown>).window = originalWindow;
    (globalThis as Record<string, unknown>).Image = originalImage;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockApiCallWithRetry.mockResolvedValue({
      success: true,
      data: { analysis: "test analysis", analyzed: {} },
    });
  });

  function createMockImageConstructor(width: number | null, height: number | null) {
    return function () {
      const img = {
        onload: null as (() => void) | null,
        onerror: null as (() => void) | null,
        src: "",
        width: width ?? 0,
        height: height ?? 0,
        crossOrigin: "",
      };
      setTimeout(() => {
        if (width !== null && height !== null) {
          if (img.onload) img.onload();
        } else {
          if (img.onerror) img.onerror();
        }
      }, 0);
      return img;
    };
  }

  function setupBrowserEnv(ImageConstructor: () => unknown) {
    (globalThis as Record<string, unknown>).window = { Image: ImageConstructor };
    (globalThis as Record<string, unknown>).Image = ImageConstructor;
  }

  it("在非浏览器环境中应跳过图片尺寸验证和 base64 转换", async () => {
    (globalThis as Record<string, unknown>).window = undefined;

    const result = await analyzeImage("https://example.com/img.png", "character");

    expect(result.success).toBe(true);
    expect(mockApiCallWithRetry).toHaveBeenCalledWith(
      "analyze-image",
      expect.objectContaining({
        method: "POST",
        body: expect.not.stringContaining("base64"),
      }),
    );
  });

  it("在浏览器环境中应调用 normalizeImageToBase64", async () => {
    setupBrowserEnv(createMockImageConstructor(100, 100));
    mockNormalizeImageToBase64.mockResolvedValue("data:image/png;base64,abc");

    const result = await analyzeImage("https://example.com/img.png", "character");

    expect(mockNormalizeImageToBase64).toHaveBeenCalledWith("https://example.com/img.png");
    expect(result.success).toBe(true);
  });

  it("图片尺寸过小时应返回失败响应", async () => {
    setupBrowserEnv(createMockImageConstructor(10, 10));

    const result = await analyzeImage("https://example.com/img.png", "character");

    expect(result.success).toBe(false);
    expect(result.error).toContain("图片尺寸过小");
  });

  it("图片宽度正常但高度过小时应返回失败", async () => {
    setupBrowserEnv(createMockImageConstructor(100, 5));

    const result = await analyzeImage("https://example.com/img.png", "character");

    expect(result.success).toBe(false);
    expect(result.error).toContain("图片尺寸过小");
  });

  it("图片加载失败时应继续分析（catch 分支）", async () => {
    setupBrowserEnv(createMockImageConstructor(null, null));

    const result = await analyzeImage("https://example.com/broken.png", "character");

    expect(mockErrorLoggerWarn).toHaveBeenCalledWith(
      expect.stringContaining("图片尺寸验证失败"),
      expect.any(Error),
    );
    expect(result.success).toBe(true);
  });

  it("normalizeImageToBase64 失败时应使用原始 URL", async () => {
    setupBrowserEnv(createMockImageConstructor(100, 100));
    mockNormalizeImageToBase64.mockRejectedValue(new Error("conversion failed"));

    const result = await analyzeImage("https://example.com/img.png", "character");

    expect(mockErrorLoggerWarn).toHaveBeenCalledWith(
      expect.stringContaining("图片转 base64 失败"),
      expect.any(Error),
    );
    expect(result.success).toBe(true);
  });

  it("type=character 时应使用角色分析 prompt", async () => {
    (globalThis as Record<string, unknown>).window = undefined;

    await analyzeImage("https://example.com/img.png", "character");

    const body = JSON.parse(mockApiCallWithRetry.mock.calls[0]![1]!.body);
    expect(body.prompt).toContain("角色");
  });

  it("type=scene 时应使用场景分析 prompt", async () => {
    (globalThis as Record<string, unknown>).window = undefined;

    await analyzeImage("https://example.com/img.png", "scene");

    const body = JSON.parse(mockApiCallWithRetry.mock.calls[0]![1]!.body);
    expect(body.prompt).toContain("场景");
  });

  it("提供自定义 prompt 时应使用自定义 prompt", async () => {
    (globalThis as Record<string, unknown>).window = undefined;

    await analyzeImage("https://example.com/img.png", "character", "自定义分析指令");

    const body = JSON.parse(mockApiCallWithRetry.mock.calls[0]![1]!.body);
    expect(body.prompt).toBe("自定义分析指令");
  });

  it("应传递 providerId 和 modelId 到请求体", async () => {
    (globalThis as Record<string, unknown>).window = undefined;

    await analyzeImage("https://example.com/img.png", "character", undefined, {
      providerId: "test-provider",
      modelId: "test-model",
    });

    const body = JSON.parse(mockApiCallWithRetry.mock.calls[0]![1]!.body);
    expect(body.providerId).toBe("test-provider");
    expect(body.modelId).toBe("test-model");
  });

  it("ApiClientError 应直接抛出", async () => {
    (globalThis as Record<string, unknown>).window = undefined;
    const apiError = new ApiClientError("API error", 401);
    mockApiCallWithRetry.mockRejectedValue(apiError);

    await expect(analyzeImage("https://example.com/img.png")).rejects.toThrow(apiError);
  });

  it("非 ApiClientError 应包装为 Error 抛出", async () => {
    (globalThis as Record<string, unknown>).window = undefined;
    mockApiCallWithRetry.mockRejectedValue(new Error("server error"));

    await expect(analyzeImage("https://example.com/img.png")).rejects.toThrow("server error");
  });
});
