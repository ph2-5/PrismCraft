import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockApiCallWithRetry,
  mockResolveCapability,
  mockSafeTruncatePrompt,
  mockExtractErrorMessage,
} = vi.hoisted(() => ({
  mockApiCallWithRetry: vi.fn(),
  mockResolveCapability: vi.fn(),
  mockSafeTruncatePrompt: vi.fn(),
  mockExtractErrorMessage: vi.fn(),
}));

vi.mock("../core", () => ({
  apiCallWithRetry: mockApiCallWithRetry,
}));

vi.mock("../errors", () => ({
  ApiClientError: class ApiClientError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "ApiClientError";
    }
  },
}));

vi.mock("../config", () => ({
  resolveCapability: mockResolveCapability,
  safeTruncatePrompt: mockSafeTruncatePrompt,
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
  },
  extractErrorMessage: mockExtractErrorMessage,
}));

import { generateText } from "../text";
import { ApiClientError } from "../errors";

beforeEach(() => {
  vi.clearAllMocks();
  mockSafeTruncatePrompt.mockImplementation((prompt: string) => ({
    truncated: prompt,
    wasTruncated: false,
  }));
});

describe("generateText", () => {
  it("应使用提供的 providerId 和 modelId 调用 API", async () => {
    mockApiCallWithRetry.mockResolvedValue({
      success: true,
      data: { text: "生成的文本" },
    });

    const result = await generateText("测试提示词", {
      providerId: "openai",
      modelId: "gpt-4",
    });

    expect(result.success).toBe(true);
    expect(result.data?.text).toBe("生成的文本");
    expect(mockApiCallWithRetry).toHaveBeenCalledWith(
      "generate-text",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"providerId":"openai"'),
      }),
    );
    expect(mockResolveCapability).not.toHaveBeenCalled();
  });

  it("未提供 provider/model 时应通过 resolveCapability 解析", async () => {
    mockResolveCapability.mockResolvedValue({
      provider: { id: "anthropic" },
      model: { id: "claude-3" },
    });
    mockApiCallWithRetry.mockResolvedValue({
      success: true,
      data: { text: "Claude 生成的文本" },
    });

    const result = await generateText("测试提示词");

    expect(result.success).toBe(true);
    expect(mockResolveCapability).toHaveBeenCalledWith("text");
    expect(mockApiCallWithRetry).toHaveBeenCalledWith(
      "generate-text",
      expect.objectContaining({
        body: expect.stringContaining('"providerId":"anthropic"'),
      }),
    );
  });

  it("应使用默认 maxTokens 和 temperature", async () => {
    mockApiCallWithRetry.mockResolvedValue({
      success: true,
      data: { text: "结果" },
    });

    await generateText("提示词", {
      providerId: "openai",
      modelId: "gpt-4",
    });

    const callBody = JSON.parse(mockApiCallWithRetry.mock.calls[0][1].body);
    expect(callBody.maxTokens).toBe(300);
    expect(callBody.temperature).toBe(0.7);
  });

  it("应支持自定义 maxTokens 和 temperature", async () => {
    mockApiCallWithRetry.mockResolvedValue({
      success: true,
      data: { text: "结果" },
    });

    await generateText("提示词", {
      providerId: "openai",
      modelId: "gpt-4",
      maxTokens: 1000,
      temperature: 0.5,
    });

    const callBody = JSON.parse(mockApiCallWithRetry.mock.calls[0][1].body);
    expect(callBody.maxTokens).toBe(1000);
    expect(callBody.temperature).toBe(0.5);
  });

  it("提示词被截断时应设置 promptWasTruncated 为 true", async () => {
    mockSafeTruncatePrompt.mockReturnValue({
      truncated: "截断后的提示词",
      wasTruncated: true,
    });
    mockApiCallWithRetry.mockResolvedValue({
      success: true,
      data: { text: "结果" },
    });

    await generateText("超长提示词", {
      providerId: "openai",
      modelId: "gpt-4",
    });

    const callBody = JSON.parse(mockApiCallWithRetry.mock.calls[0][1].body);
    expect(callBody.prompt).toBe("截断后的提示词");
    expect(callBody.promptWasTruncated).toBe(true);
  });

  it("ApiClientError 应直接抛出", async () => {
    const apiError = new ApiClientError("API 错误");
    mockApiCallWithRetry.mockRejectedValue(apiError);

    await expect(
      generateText("提示词", { providerId: "openai", modelId: "gpt-4" }),
    ).rejects.toThrow("API 错误");
    expect(mockExtractErrorMessage).not.toHaveBeenCalled();
  });

  it("非 ApiClientError 应通过 extractErrorMessage 包装", async () => {
    mockApiCallWithRetry.mockRejectedValue(new Error("网络错误"));
    mockExtractErrorMessage.mockReturnValue("提取的错误消息");

    await expect(
      generateText("提示词", { providerId: "openai", modelId: "gpt-4" }),
    ).rejects.toThrow("提取的错误消息");
    expect(mockExtractErrorMessage).toHaveBeenCalled();
  });

  it("resolveCapability 失败时应抛出错误", async () => {
    mockResolveCapability.mockRejectedValue(new Error("无可用提供商"));

    await expect(generateText("提示词")).rejects.toThrow();
  });
});
