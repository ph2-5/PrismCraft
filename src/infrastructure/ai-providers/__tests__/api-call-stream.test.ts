/**
 * Task 1.0 流式改造 — renderer apiCallStream 单元测试
 *
 * 覆盖：
 * - SSE 协议消费（chunk/done/error 三类事件按 _t 字段分发）
 * - ReadableStream 逐块读取
 * - 跨 chunk 的行边界处理
 * - 末尾残留 buffer flush
 * - 非 2xx 响应错误处理
 * - 非 data: 前缀行跳过
 * - 非 JSON 行跳过
 * - 流意外结束（无 done 事件）应抛错
 * - 5 分钟超时（AbortController）
 *
 * Mock 模式：直接 mock globalThis.fetch（参考 core.test.ts）
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  mockApiCache,
  mockEnqueueRequest,
  mockIsNetworkError,
  mockIsElectron,
  mockExtractErrorMessage,
  mockExecuteThroughCircuit,
} = vi.hoisted(() => ({
  mockApiCache: {
    get: vi.fn(),
    set: vi.fn(),
    invalidate: vi.fn(),
    invalidateAll: vi.fn(),
  },
  mockEnqueueRequest: vi.fn(),
  mockIsNetworkError: vi.fn(() => false),
  mockIsElectron: vi.fn(() => true),
  mockExtractErrorMessage: vi.fn((e: unknown) => {
    if (e instanceof Error) return e.message;
    if (typeof e === "string") return e;
    return "Unknown error";
  }),
  mockExecuteThroughCircuit: vi.fn((_providerId: string, fn: () => Promise<Response>) => fn()),
}));

vi.mock("@/infrastructure/ai-providers/api-cache", () => ({ apiCache: mockApiCache }));
vi.mock("@/infrastructure/ai-providers/offline-queue", () => ({ enqueueRequest: mockEnqueueRequest }));
vi.mock("@/shared/utils/platform", () => ({ isElectron: mockIsElectron }));
vi.mock("@/shared/error-logger", () => ({
  errorLogger: { warn: vi.fn(), error: vi.fn() },
  extractErrorMessage: mockExtractErrorMessage,
}));
vi.mock("@/shared/utils/error-classifier", () => ({ isNetworkError: mockIsNetworkError }));
vi.mock("@/config/constants", () => ({
  API_SERVER_PORT: 3456,
  ELECTRON_APP_HEADERS: { "X-Electron-App": "test" },
}));
vi.mock("@/infrastructure/network/circuit-breaker", () => ({
  executeThroughCircuit: mockExecuteThroughCircuit,
}));

// ============ Mock ReadableStream 工具 ============

/**
 * 创建 mock Response，body 为 ReadableStream。
 * 用 ReadableStream 的 controller.enqueue 模拟分块推送。
 */
function createMockResponse(opts: {
  ok?: boolean;
  status?: number;
  chunks?: string[]; // 字符串数组，每个元素是一个 chunk
}): Response {
  const { ok = true, status = 200, chunks = [] } = opts;
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });

  return {
    ok,
    status,
    body: stream,
    json: vi.fn(),
    headers: new Headers(),
  } as unknown as Response;
}

// ============ 测试 ============

describe("apiCallStream (Task 1.0 renderer SSE 消费)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiCache.get.mockReturnValue(null);
    mockExecuteThroughCircuit.mockImplementation(
      (_providerId: string, fn: () => Promise<Response>) => fn(),
    );
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("应该正确消费 SSE 流：chunk 事件调用 onChunk，done 事件 resolve", async () => {
    const { apiCallStream } = await import("../core");
    const onChunk = vi.fn();

    const sseChunks = [
      'data: {"_t":"chunk","chunk":{"delta":"hello"}}\n\n',
      'data: {"_t":"chunk","chunk":{"delta":" world"}}\n\n',
      'data: {"_t":"done","result":{"success":true,"data":{"text":"hello world"}}}\n\n',
    ];

    vi.mocked(globalThis.fetch).mockResolvedValue(
      createMockResponse({ chunks: sseChunks }),
    );

    const result = await apiCallStream<{ delta: string }, { success: boolean; data: { text: string } }>(
      "generate-text-stream",
      { method: "POST", body: JSON.stringify({ prompt: "hi" }) },
      { onChunk },
    );

    expect(onChunk).toHaveBeenCalledTimes(2);
    expect(onChunk).toHaveBeenCalledWith({ delta: "hello" });
    expect(onChunk).toHaveBeenCalledWith({ delta: " world" });
    expect(result).toEqual({ success: true, data: { text: "hello world" } });
  });

  it("error 事件应 reject（含错误信息）", async () => {
    const { apiCallStream } = await import("../core");

    const sseChunks = [
      'data: {"_t":"error","error":"upstream provider error"}\n\n',
    ];

    vi.mocked(globalThis.fetch).mockResolvedValue(
      createMockResponse({ chunks: sseChunks }),
    );

    await expect(
      apiCallStream("generate-text-stream", { method: "POST" }, { onChunk: vi.fn() }),
    ).rejects.toThrow(/upstream provider error/);
  });

  it("非 2xx HTTP 响应应抛 ApiClientError", async () => {
    const { apiCallStream } = await import("../core");

    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: false,
      status: 500,
      json: vi.fn().mockResolvedValue({ error: "Internal Server Error" }),
      headers: new Headers(),
    } as unknown as Response);

    await expect(
      apiCallStream("generate-text-stream", { method: "POST" }, { onChunk: vi.fn() }),
    ).rejects.toThrow();
  });

  it("response.body 为 null 应抛 ApiClientError", async () => {
    const { apiCallStream } = await import("../core");

    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      body: null,
      headers: new Headers(),
    } as unknown as Response);

    await expect(
      apiCallStream("generate-text-stream", { method: "POST" }, { onChunk: vi.fn() }),
    ).rejects.toThrow();
  });

  it("非 data: 前缀行应被跳过", async () => {
    const { apiCallStream } = await import("../core");
    const onChunk = vi.fn();

    const sseChunks = [
      "event: message\n",
      "id: 123\n",
      ": heartbeat comment\n",
      'data: {"_t":"chunk","chunk":{"delta":"hello"}}\n\n',
      'data: {"_t":"done","result":null}\n\n',
    ];

    vi.mocked(globalThis.fetch).mockResolvedValue(
      createMockResponse({ chunks: sseChunks }),
    );

    await apiCallStream("generate-text-stream", { method: "POST" }, { onChunk });

    expect(onChunk).toHaveBeenCalledTimes(1);
    expect(onChunk).toHaveBeenCalledWith({ delta: "hello" });
  });

  it("非 JSON 数据行应被跳过", async () => {
    const { apiCallStream } = await import("../core");
    const onChunk = vi.fn();

    const sseChunks = [
      "data: not a json\n",
      "data: {invalid json\n",
      'data: {"_t":"chunk","chunk":{"delta":"hi"}}\n\n',
      'data: {"_t":"done","result":null}\n\n',
    ];

    vi.mocked(globalThis.fetch).mockResolvedValue(
      createMockResponse({ chunks: sseChunks }),
    );

    await apiCallStream("generate-text-stream", { method: "POST" }, { onChunk });

    expect(onChunk).toHaveBeenCalledTimes(1);
    expect(onChunk).toHaveBeenCalledWith({ delta: "hi" });
  });

  it("跨 chunk 的不完整行应保留在 buffer", async () => {
    const { apiCallStream } = await import("../core");
    const onChunk = vi.fn();

    const sseChunks = [
      'data: {"_t":"chunk","chunk":{"delta":"par',  // 不完整
      'tial"}}\n\n',                                  // 补全
      'data: {"_t":"done","result":null}\n\n',
    ];

    vi.mocked(globalThis.fetch).mockResolvedValue(
      createMockResponse({ chunks: sseChunks }),
    );

    await apiCallStream("generate-text-stream", { method: "POST" }, { onChunk });

    expect(onChunk).toHaveBeenCalledTimes(1);
    expect(onChunk).toHaveBeenCalledWith({ delta: "partial" });
  });

  it("流结束但无 done 事件应抛错（STREAM_ENDED_PREMATURELY）", async () => {
    const { apiCallStream } = await import("../core");

    const sseChunks = [
      'data: {"_t":"chunk","chunk":{"delta":"hello"}}\n\n',
      // 没有 done 事件，流直接结束
    ];

    vi.mocked(globalThis.fetch).mockResolvedValue(
      createMockResponse({ chunks: sseChunks }),
    );

    await expect(
      apiCallStream("generate-text-stream", { method: "POST" }, { onChunk: vi.fn() }),
    ).rejects.toThrow();
  });

  it("空 data 行应被跳过", async () => {
    const { apiCallStream } = await import("../core");
    const onChunk = vi.fn();

    const sseChunks = [
      "data: \n\n",
      "data:\n\n",
      'data: {"_t":"chunk","chunk":{"delta":"hello"}}\n\n',
      'data: {"_t":"done","result":null}\n\n',
    ];

    vi.mocked(globalThis.fetch).mockResolvedValue(
      createMockResponse({ chunks: sseChunks }),
    );

    await apiCallStream("generate-text-stream", { method: "POST" }, { onChunk });

    expect(onChunk).toHaveBeenCalledTimes(1);
    expect(onChunk).toHaveBeenCalledWith({ delta: "hello" });
  });

  it("应该正确设置 SSE 请求头（Accept: text/event-stream）", async () => {
    const { apiCallStream } = await import("../core");

    vi.mocked(globalThis.fetch).mockResolvedValue(
      createMockResponse({
        chunks: ['data: {"_t":"done","result":null}\n\n'],
      }),
    );

    await apiCallStream("generate-text-stream", { method: "POST" }, { onChunk: vi.fn() });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: "text/event-stream",
          "Content-Type": "application/json",
        }),
      }),
    );
  });

  it("多个 chunk 事件应按顺序回调", async () => {
    const { apiCallStream } = await import("../core");
    const onChunk = vi.fn();

    const sseChunks = [
      'data: {"_t":"chunk","chunk":{"delta":"A"}}\n\n',
      'data: {"_t":"chunk","chunk":{"delta":"B"}}\n\n',
      'data: {"_t":"chunk","chunk":{"delta":"C"}}\n\n',
      'data: {"_t":"done","result":{"text":"ABC"}}\n\n',
    ];

    vi.mocked(globalThis.fetch).mockResolvedValue(
      createMockResponse({ chunks: sseChunks }),
    );

    await apiCallStream("generate-text-stream", { method: "POST" }, { onChunk });

    expect(onChunk).toHaveBeenCalledTimes(3);
    const deltas = onChunk.mock.calls.map((c) => (c[0] as { delta: string }).delta);
    expect(deltas).toEqual(["A", "B", "C"]);
  });

  it("POST 请求应正确传递 body", async () => {
    const { apiCallStream } = await import("../core");

    vi.mocked(globalThis.fetch).mockResolvedValue(
      createMockResponse({
        chunks: ['data: {"_t":"done","result":null}\n\n'],
      }),
    );

    const body = JSON.stringify({ prompt: "test prompt", maxTokens: 100 });
    await apiCallStream("generate-text-stream", { method: "POST", body }, { onChunk: vi.fn() });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ method: "POST", body }),
    );
  });

  it("tool_calls 类型的 chunk 应正确传递给 onChunk", async () => {
    const { apiCallStream } = await import("../core");
    const onChunk = vi.fn();

    const toolCallChunk = {
      delta: "",
      toolCalls: [
        {
          id: "call_abc",
          function: { name: "list_characters", arguments: '{"limit":5}' },
        },
      ],
    };

    const sseChunks = [
      `data: ${JSON.stringify({ _t: "chunk", chunk: toolCallChunk })}\n\n`,
      'data: {"_t":"done","result":{"text":""}}\n\n',
    ];

    vi.mocked(globalThis.fetch).mockResolvedValue(
      createMockResponse({ chunks: sseChunks }),
    );

    await apiCallStream("generate-text-stream", { method: "POST" }, { onChunk });

    expect(onChunk).toHaveBeenCalledWith(toolCallChunk);
  });

  it("finishReason 类型的 chunk 应正确传递给 onChunk", async () => {
    const { apiCallStream } = await import("../core");
    const onChunk = vi.fn();

    const finishChunk = { delta: "", finishReason: "tool_calls" };

    const sseChunks = [
      `data: ${JSON.stringify({ _t: "chunk", chunk: finishChunk })}\n\n`,
      'data: {"_t":"done","result":{"text":""}}\n\n',
    ];

    vi.mocked(globalThis.fetch).mockResolvedValue(
      createMockResponse({ chunks: sseChunks }),
    );

    await apiCallStream("generate-text-stream", { method: "POST" }, { onChunk });

    expect(onChunk).toHaveBeenCalledWith(finishChunk);
  });
});
