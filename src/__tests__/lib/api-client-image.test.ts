import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockApiCallWithRetry } = vi.hoisted(() => ({
  mockApiCallWithRetry: vi.fn(),
}));

vi.mock("@/infrastructure/ai-providers/core", () => ({
  apiCallWithRetry: mockApiCallWithRetry,
}));

vi.mock("@/infrastructure/ai-providers/config", () => ({
  resolveCapability: vi.fn(),
  safeTruncatePrompt: vi.fn((p: string) => ({
    truncated: p,
    wasTruncated: false,
  })),
}));

vi.mock("@/infrastructure/ai-providers/image-normalization", () => ({
  imageToBase64: vi.fn((url: string) => Promise.resolve(url)),
}));

// Mock validateImageSize 依赖的 Image 对象
Object.defineProperty(global, "Image", {
  writable: true,
  value: class MockImage {
    width = 100;
    height = 100;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    src = "";
    constructor() {
      setTimeout(() => {
        if (this.onload) this.onload();
      }, 0);
    }
  },
});

import { generateImage, analyzeImage } from "@/infrastructure/ai-providers/image";
import { resolveCapability } from "@/infrastructure/ai-providers/config";

const mockResolve = vi.mocked(resolveCapability);

describe("api-client/image - providerId/modelId 配置逻辑", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiCallWithRetry.mockResolvedValue({ success: true, data: { imageUrl: "http://test.png" } });
    mockResolve.mockResolvedValue({
      provider: { id: "default-provider" },
      model: { id: "default-model" },
    } as any);
  });

  describe("generateImage - providerId/modelId 配置", () => {
    it("有 providerId+modelId 时应使用模型选择器路径", async () => {
      await generateImage("test prompt", "scene", {
        providerId: "provider-123",
        modelId: "model-456",
      });

      const callBody = JSON.parse(
        (mockApiCallWithRetry.mock.calls[0][1] as any).body,
      );

      expect(callBody.providerId).toBe("provider-123");
      expect(callBody.modelId).toBe("model-456");
    });

    it("无自定义配置时应使用 resolveCapability fallback", async () => {
      await generateImage("test prompt", "scene");

      expect(mockResolve).toHaveBeenCalledWith("image");

      const callBody = JSON.parse(
        (mockApiCallWithRetry.mock.calls[0][1] as any).body,
      );

      expect(callBody.providerId).toBe("default-provider");
      expect(callBody.modelId).toBe("default-model");
    });

    it("只有 providerId 没有 modelId 时应走 fallback", async () => {
      await generateImage("test prompt", "scene", {
        providerId: "provider-123",
      });

      expect(mockResolve).toHaveBeenCalledWith("image");
    });

    it("resolveCapability 失败时应抛出错误", async () => {
      mockResolve.mockRejectedValueOnce(new Error("无可用提供商"));

      await expect(generateImage("test prompt", "scene")).rejects.toThrow("无可用提供商");
    });

    it("API 调用失败时应传递错误", async () => {
      mockApiCallWithRetry.mockResolvedValueOnce({
        success: false,
        error: "Rate limited",
      });

      const result = await generateImage("test prompt", "scene");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Rate limited");
    });
  });

  describe("analyzeImage - 配置传递", () => {
    it("应传递 providerId/modelId 到 API", async () => {
      await analyzeImage("https://example.com/image.png", "character", "describe", {
        providerId: "openai",
        modelId: "gpt-4o",
      });

      const callBody = JSON.parse(
        (mockApiCallWithRetry.mock.calls[0][1] as any).body,
      );

      expect(callBody.providerId).toBe("openai");
      expect(callBody.modelId).toBe("gpt-4o");
    });

    it("无 providerId 时应直接传递", async () => {
      await analyzeImage("https://example.com/image.png", "character", "describe");

      const callBody = JSON.parse(
        (mockApiCallWithRetry.mock.calls[0][1] as any).body,
      );

      expect(callBody.providerId).toBeUndefined();
      expect(callBody.modelId).toBeUndefined();
    });

    it("API 失败时应返回错误", async () => {
      mockApiCallWithRetry.mockResolvedValueOnce({
        success: false,
        error: "Invalid image",
      });

      const result = await analyzeImage("https://example.com/image.png", "describe" as any);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid image");
    });
  });
});
