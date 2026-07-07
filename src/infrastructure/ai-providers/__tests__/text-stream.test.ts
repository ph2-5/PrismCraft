/**
 * Task 1.0 流式改造 — generateTextStream 集成测试
 *
 * 验证 generateTextStream 函数：
 * - 正确包装 prompt/options 调用 apiCallStream
 * - onChunk 回调正确传递
 * - tools 字段正确传递
 * - providerId/modelId 解析逻辑
 * - 错误处理（ApiClientError 透传，普通错误包装）
 * - prompt 截断
 *
 * Mock 模式：mock "../core" 的 apiCallStream（参考 text.test.ts 模式）
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockApiCallStream,
  mockApiCallWithRetry,
  mockResolveCapability,
  mockSafeTruncatePrompt,
  mockExtractErrorMessage,
} = vi.hoisted(() => ({
  mockApiCallStream: vi.fn(),
  mockApiCallWithRetry: vi.fn(),
  mockResolveCapability: vi.fn(),
  mockSafeTruncatePrompt: vi.fn(),
  mockExtractErrorMessage: vi.fn((e: unknown) => {
    if (e instanceof Error) return e.message;
    return String(e);
  }),
}));

vi.mock("../core", () => ({
  apiCallWithRetry: mockApiCallWithRetry,
  apiCallStream: mockApiCallStream,
}));

vi.mock("../errors", () => ({
  ApiClientError: class ApiClientError extends Error {
    constructor(message: string, public status?: number, public code?: string) {
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

import { generateTextStream } from "../text";
import { ApiClientError } from "../errors";
import type { StreamChunk, ToolDef } from "@/domain/ports/ai-provider-port";

beforeEach(() => {
  vi.clearAllMocks();
  mockSafeTruncatePrompt.mockImplementation((prompt: string) => ({
    truncated: prompt,
    wasTruncated: false,
  }));
});

describe("generateTextStream (Task 1.0 流式文本生成)", () => {
  it("应调用 apiCallStream 并正确传递 prompt 和 onChunk", async () => {
    const chunks: StreamChunk[] = [];
    mockApiCallStream.mockResolvedValue({
      success: true,
      data: { text: "hello world" },
    });

    const result = await generateTextStream("测试提示词", {
      providerId: "openai",
      modelId: "gpt-4o",
      onChunk: (chunk) => chunks.push(chunk),
    });

    expect(result.success).toBe(true);
    expect(result.data?.text).toBe("hello world");
    expect(mockApiCallStream).toHaveBeenCalledTimes(1);
    expect(mockApiCallStream).toHaveBeenCalledWith(
      "generate-text-stream",
      expect.objectContaining({ method: "POST" }),
      expect.objectContaining({ onChunk: expect.any(Function) }),
    );
    // body 应包含 prompt
    const callArgs = mockApiCallStream.mock.calls[0][1];
    expect(callArgs.body).toContain("测试提示词");
  });

  it("未提供 provider/model 时应通过 resolveCapability 解析", async () => {
    mockResolveCapability.mockResolvedValue({
      provider: { id: "deepseek", name: "DeepSeek" },
      model: { id: "deepseek-chat", name: "DeepSeek Chat" },
    });
    mockApiCallStream.mockResolvedValue({ success: true, data: { text: "ok" } });

    await generateTextStream("hello", { onChunk: () => {} });

    expect(mockResolveCapability).toHaveBeenCalledWith("text");
    const callArgs = mockApiCallStream.mock.calls[0][1];
    expect(callArgs.body).toContain('"providerId":"deepseek"');
    expect(callArgs.body).toContain('"modelId":"deepseek-chat"');
  });

  it("应正确传递 maxTokens 和 temperature", async () => {
    mockApiCallStream.mockResolvedValue({ success: true, data: { text: "" } });

    await generateTextStream("hi", {
      maxTokens: 2048,
      temperature: 0.3,
      providerId: "openai",
      modelId: "gpt-4o",
      onChunk: () => {},
    });

    const callArgs = mockApiCallStream.mock.calls[0][1];
    expect(callArgs.body).toContain('"maxTokens":2048');
    expect(callArgs.body).toContain('"temperature":0.3');
  });

  it("未提供 maxTokens 时应使用默认值 300", async () => {
    mockApiCallStream.mockResolvedValue({ success: true, data: { text: "" } });

    await generateTextStream("hi", {
      providerId: "openai",
      modelId: "gpt-4o",
      onChunk: () => {},
    });

    const callArgs = mockApiCallStream.mock.calls[0][1];
    expect(callArgs.body).toContain('"maxTokens":300');
  });

  it("未提供 temperature 时应使用默认值 0.7", async () => {
    mockApiCallStream.mockResolvedValue({ success: true, data: { text: "" } });

    await generateTextStream("hi", {
      providerId: "openai",
      modelId: "gpt-4o",
      onChunk: () => {},
    });

    const callArgs = mockApiCallStream.mock.calls[0][1];
    expect(callArgs.body).toContain('"temperature":0.7');
  });

  it("应正确传递 tools 字段（OpenAI function-calling 格式）", async () => {
    mockApiCallStream.mockResolvedValue({ success: true, data: { text: "" } });

    const tools: ToolDef[] = [
      {
        type: "function",
        function: {
          name: "list_characters",
          description: "列出所有角色",
          parameters: { type: "object", properties: {} },
        },
      },
    ];

    await generateTextStream("列出角色", {
      providerId: "openai",
      modelId: "gpt-4o",
      tools,
      onChunk: () => {},
    });

    const callArgs = mockApiCallStream.mock.calls[0][1];
    const body = JSON.parse(callArgs.body);
    expect(body.tools).toEqual(tools);
  });

  it("空 tools 数组不应添加 tools 字段到 body", async () => {
    mockApiCallStream.mockResolvedValue({ success: true, data: { text: "" } });

    await generateTextStream("hi", {
      providerId: "openai",
      modelId: "gpt-4o",
      tools: [],
      onChunk: () => {},
    });

    const callArgs = mockApiCallStream.mock.calls[0][1];
    const body = JSON.parse(callArgs.body);
    expect(body.tools).toBeUndefined();
  });

  it("onChunk 回调应被正确传递给 apiCallStream", async () => {
    mockApiCallStream.mockResolvedValue({ success: true, data: { text: "" } });

    const receivedChunks: StreamChunk[] = [];
    const onChunk = (chunk: StreamChunk) => receivedChunks.push(chunk);

    await generateTextStream("hi", {
      providerId: "openai",
      modelId: "gpt-4o",
      onChunk,
    });

    // 模拟 apiCallStream 内部调用 onChunk
    const callbacks = mockApiCallStream.mock.calls[0][2];
    callbacks.onChunk({ delta: "hello" });
    callbacks.onChunk({ delta: " world" });

    expect(receivedChunks).toEqual([{ delta: "hello" }, { delta: " world" }]);
  });

  it("应正确处理 prompt 截断", async () => {
    mockSafeTruncatePrompt.mockReturnValue({
      truncated: "truncated prompt",
      wasTruncated: true,
    });
    mockApiCallStream.mockResolvedValue({ success: true, data: { text: "" } });

    await generateTextStream("超长 prompt", {
      providerId: "openai",
      modelId: "gpt-4o",
      onChunk: () => {},
    });

    const callArgs = mockApiCallStream.mock.calls[0][1];
    const body = JSON.parse(callArgs.body);
    expect(body.prompt).toBe("truncated prompt");
    expect(body.promptWasTruncated).toBe(true);
  });

  it("apiCallStream 返回的 result 应原样返回", async () => {
    const expected = { success: true, data: { text: "final text" } };
    mockApiCallStream.mockResolvedValue(expected);

    const result = await generateTextStream("hi", {
      providerId: "openai",
      modelId: "gpt-4o",
      onChunk: () => {},
    });

    expect(result).toBe(expected);
  });

  it("apiCallStream 返回失败时应原样返回失败结果", async () => {
    const expected = { success: false, error: "provider error" };
    mockApiCallStream.mockResolvedValue(expected);

    const result = await generateTextStream("hi", {
      providerId: "openai",
      modelId: "gpt-4o",
      onChunk: () => {},
    });

    expect(result).toEqual(expected);
  });

  it("ApiClientError 应原样抛出（不包装）", async () => {
    const apiError = new ApiClientError("API error", 500, "INTERNAL");
    mockApiCallStream.mockRejectedValue(apiError);

    await expect(
      generateTextStream("hi", {
        providerId: "openai",
        modelId: "gpt-4o",
        onChunk: () => {},
      }),
    ).rejects.toThrow(apiError);
  });

  it("普通 Error 应被包装为 Error（通过 extractErrorMessage）", async () => {
    mockApiCallStream.mockRejectedValue(new Error("network failure"));

    await expect(
      generateTextStream("hi", {
        providerId: "openai",
        modelId: "gpt-4o",
        onChunk: () => {},
      }),
    ).rejects.toThrow(/network failure/);
  });

  it("未知错误类型应被转换为 Error", async () => {
    mockApiCallStream.mockRejectedValue("string error");

    await expect(
      generateTextStream("hi", {
        providerId: "openai",
        modelId: "gpt-4o",
        onChunk: () => {},
      }),
    ).rejects.toThrow();
  });
});
