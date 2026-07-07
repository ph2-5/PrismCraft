/**
 * Task 1.0 流式改造 — api-gateway-utils.makeStreamingRequest 单元测试
 *
 * 覆盖：
 * - SSRF 校验（fail-close）
 * - 2xx 响应按行回调（onLine）
 * - 非 2xx 响应缓冲错误信息后 reject
 * - 跨 chunk 的行边界处理
 * - 末尾无换行符的残留 buffer flush
 * - res/req error 事件
 *
 * Mock 模式：参考 regression-r132-sync-http-client-ssrf.test.ts，用 vi.hoisted + vi.mock
 * 预先 mock http/https 模块，再动态 import 被测模块。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ============ Hoisted Mock 定义（必须在 vi.mock 之前定义） ============

const {
  mockSsrfValidate,
  mockHttpRequest,
  mockHttpsRequest,
} = vi.hoisted(() => ({
  mockSsrfValidate: vi.fn(),
  mockHttpRequest: vi.fn(),
  mockHttpsRequest: vi.fn(),
}));

vi.mock("../security/ssrf-guard/ssrf-guard", () => ({
  ssrfGuard: { validate: mockSsrfValidate },
}));

vi.mock("../logging/logger", () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock("../handlers/config", () => ({
  loadConfig: vi.fn(() => ({ providers: [], mapping: {} })),
  loadConfigAsync: vi.fn(async () => ({ providers: [], mapping: {} })),
}));

vi.mock("../plugins", () => ({
  pluginRegistry: { selectById: vi.fn(), select: vi.fn() },
}));

vi.mock("../app-paths", () => ({
  getUserDataRootDir: vi.fn(() => "/mock/userdata"),
}));

vi.mock("http", () => ({ default: { request: mockHttpRequest } }));
vi.mock("https", () => ({ default: { request: mockHttpsRequest } }));

// ============ Mock 控制 ============

interface MockRes {
  statusCode: number;
  on(event: string, fn: (data?: unknown) => void): void;
}

interface MockReq {
  setTimeout: ReturnType<typeof vi.fn>;
  on(event: string, fn: (err: Error) => void): void;
  write: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
}

/** 挂起的回调与监听器 */
const pending = {
  callback: null as ((res: MockRes) => void) | null,
  resListeners: {} as Record<string, Array<(data?: unknown) => void>>,
  reqListeners: {} as Record<string, Array<(data?: unknown) => void>>,
  currentReq: null as MockReq | null,
};

/**
 * 安装 mock 实现：request(url, opts, callback) 返回 req，
 * callback 在 triggerResponse 时被调用。
 * destroy(err) 会同步触发 req 'error' 事件（与真实 Node http 行为一致）。
 */
function installMock(mockFn: ReturnType<typeof vi.fn>) {
  mockFn.mockImplementation(
    (_url: string, _opts: unknown, callback: (res: MockRes) => void) => {
      pending.callback = callback;
      const req: MockReq = {
        setTimeout: vi.fn(),
        on: vi.fn((event: string, fn: (data?: unknown) => void) => {
          if (!pending.reqListeners[event]) pending.reqListeners[event] = [];
          pending.reqListeners[event].push(fn);
        }),
        write: vi.fn(),
        end: vi.fn(),
        destroy: vi.fn((err?: unknown) => {
          // 模拟真实 Node http 行为：destroy(err) 触发 'error' 事件
          if (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            pending.reqListeners["error"]?.forEach((fn) => fn(error));
          }
        }),
      };
      pending.currentReq = req;
      return req;
    },
  );
}

/** 触发 response 事件（async：先 flush microtasks 让 isPrivateUrl 完成） */
async function triggerResponse(mockFn: ReturnType<typeof vi.fn>, statusCode: number) {
  // 等待 makeStreamingRequest 中的 await isPrivateUrl(url) microtask 完成
  await flushMicrotasks();
  // 确认这个 mock 被调用过
  expect(mockFn).toHaveBeenCalled();
  if (!pending.callback) throw new Error("No pending request callback");
  const res: MockRes = {
    statusCode,
    on: vi.fn((event: string, fn: (data?: unknown) => void) => {
      if (!pending.resListeners[event]) pending.resListeners[event] = [];
      pending.resListeners[event].push(fn);
    }),
  };
  pending.callback(res);
}

/** 触发 res 'data' 事件 */
function emitData(data: Buffer | string) {
  const buf = typeof data === "string" ? Buffer.from(data) : data;
  pending.resListeners["data"]?.forEach((fn) => fn(buf));
}

/** 触发 res 'end' 事件 */
function emitEnd() {
  pending.resListeners["end"]?.forEach((fn) => fn());
}

/** 触发 res 'error' 事件 */
function emitResError(err: Error) {
  pending.resListeners["error"]?.forEach((fn) => fn(err));
}

/** 触发 req 'error' 事件 */
function emitReqError(err: Error) {
  pending.reqListeners["error"]?.forEach((fn) => fn(err));
}

/** 重置 pending 状态 */
function resetPending() {
  pending.callback = null;
  pending.resListeners = {};
  pending.reqListeners = {};
  pending.currentReq = null;
}

/**
 * 等待 microtask 完成。
 * makeStreamingRequest 是 async 函数，先 await isPrivateUrl(url) 才会调用 https.request。
 * 测试中需要在 triggerResponse 之前让 isPrivateUrl 的 microtask 完成。
 */
const flushMicrotasks = () => new Promise<void>((r) => setTimeout(r, 0));

// ============ 测试 ============

describe("makeStreamingRequest (Task 1.0 流式 HTTP 请求)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockSsrfValidate.mockReset();
    mockSsrfValidate.mockResolvedValue({ safe: true, reason: "allowed" });
    mockHttpRequest.mockReset();
    mockHttpsRequest.mockReset();
    installMock(mockHttpRequest);
    installMock(mockHttpsRequest);
    resetPending();
  });

  it("SSRF 校验通过时应该正常发起请求（HTTPS）", async () => {
    const { makeStreamingRequest } = await import("../api-gateway-utils");
    const onLine = vi.fn();

    const promise = makeStreamingRequest("https://api.example.com/v1/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"prompt":"hello"}',
      onLine,
    });

    await triggerResponse(mockHttpsRequest, 200);
    emitData('data: {"delta":"hi"}\n\n');
    emitEnd();

    await promise;

    expect(mockSsrfValidate).toHaveBeenCalledWith("https://api.example.com/v1/chat");
    expect(onLine).toHaveBeenCalledWith('data: {"delta":"hi"}');
  });

  it("SSRF 校验失败时应 reject（fail-close）", async () => {
    mockSsrfValidate.mockResolvedValue({ safe: false, reason: "Private IP" });
    const { makeStreamingRequest } = await import("../api-gateway-utils");

    await expect(
      makeStreamingRequest("https://internal.example.com/v1/chat", {
        method: "POST",
        onLine: vi.fn(),
      }),
    ).rejects.toThrow(/private|internal/i);
  });

  it("SSRF 校验抛异常时应 reject（fail-close）", async () => {
    mockSsrfValidate.mockRejectedValue(new Error("DNS resolver crashed"));
    const { makeStreamingRequest } = await import("../api-gateway-utils");

    await expect(
      makeStreamingRequest("https://api.example.com/v1/chat", {
        method: "POST",
        onLine: vi.fn(),
      }),
    ).rejects.toThrow(/private|internal/i);
  });

  it("2xx 响应应按行回调 onLine（每个 \\n 分隔的行）", async () => {
    const { makeStreamingRequest } = await import("../api-gateway-utils");
    const onLine = vi.fn();

    const promise = makeStreamingRequest("https://api.example.com/v1/chat", {
      method: "POST",
      onLine,
    });

    await triggerResponse(mockHttpsRequest, 200);
    emitData("line1\nline2\nline3\n");
    emitEnd();

    await promise;

    expect(onLine).toHaveBeenCalledWith("line1");
    expect(onLine).toHaveBeenCalledWith("line2");
    expect(onLine).toHaveBeenCalledWith("line3");
    expect(onLine).toHaveBeenCalledTimes(3);
  });

  it("跨 chunk 的不完整行应保留在 buffer 等待下一个 chunk", async () => {
    const { makeStreamingRequest } = await import("../api-gateway-utils");
    const onLine = vi.fn();

    const promise = makeStreamingRequest("https://api.example.com/v1/chat", {
      method: "POST",
      onLine,
    });

    await triggerResponse(mockHttpsRequest, 200);
    emitData("partial-line");
    emitData("-continued\n");
    emitEnd();

    await promise;

    expect(onLine).toHaveBeenCalledWith("partial-line-continued");
    expect(onLine).toHaveBeenCalledTimes(1);
  });

  it("流结束时残留 buffer 应 flush（最后一行无换行符）", async () => {
    const { makeStreamingRequest } = await import("../api-gateway-utils");
    const onLine = vi.fn();

    const promise = makeStreamingRequest("https://api.example.com/v1/chat", {
      method: "POST",
      onLine,
    });

    await triggerResponse(mockHttpsRequest, 200);
    emitData("last line without newline");
    emitEnd();

    await promise;

    expect(onLine).toHaveBeenCalledWith("last line without newline");
  });

  it("非 2xx 状态码应缓冲完整 body 后 reject", async () => {
    const { makeStreamingRequest } = await import("../api-gateway-utils");
    const onLine = vi.fn();

    const promise = makeStreamingRequest("https://api.example.com/v1/chat", {
      method: "POST",
      onLine,
    });

    await triggerResponse(mockHttpsRequest, 500);
    emitData('{"error":"Internal Server Error"}');
    emitEnd();

    await expect(promise).rejects.toThrow(/HTTP 500/);
    await expect(promise).rejects.toThrow(/Internal Server Error/);
    expect(onLine).not.toHaveBeenCalled();
  });

  it("onLine 回调抛错应 reject（含错误信息）", async () => {
    const { makeStreamingRequest } = await import("../api-gateway-utils");
    const onLine = vi.fn(() => {
      throw new Error("callback error");
    });

    const promise = makeStreamingRequest("https://api.example.com/v1/chat", {
      method: "POST",
      onLine,
    });

    await triggerResponse(mockHttpsRequest, 200);
    emitData("line1\n");
    emitEnd();

    await expect(promise).rejects.toThrow(/callback error/);
  });

  it("res 'error' 事件应 reject", async () => {
    const { makeStreamingRequest } = await import("../api-gateway-utils");

    const promise = makeStreamingRequest("https://api.example.com/v1/chat", {
      method: "POST",
      onLine: vi.fn(),
    });

    await triggerResponse(mockHttpsRequest, 200);
    emitResError(new Error("network error"));

    await expect(promise).rejects.toThrow(/network error/);
  });

  it("req 'error' 事件应 reject", async () => {
    const { makeStreamingRequest } = await import("../api-gateway-utils");

    const promise = makeStreamingRequest("https://api.example.com/v1/chat", {
      method: "POST",
      onLine: vi.fn(),
    });

    await flushMicrotasks();
    emitReqError(new Error("connection refused"));

    await expect(promise).rejects.toThrow(/connection refused/);
  });

  it("HTTP（非 HTTPS）URL 应使用 http 模块", async () => {
    const { makeStreamingRequest } = await import("../api-gateway-utils");
    const onLine = vi.fn();

    const promise = makeStreamingRequest("http://localhost:8080/test", {
      method: "GET",
      onLine,
    });

    await triggerResponse(mockHttpRequest, 200);
    emitEnd();

    await promise;
    expect(mockHttpRequest).toHaveBeenCalled();
    expect(mockHttpsRequest).not.toHaveBeenCalled();
  });

  it("请求 body 应通过 req.write 写入", async () => {
    const { makeStreamingRequest } = await import("../api-gateway-utils");

    const promise = makeStreamingRequest("https://api.example.com/v1/chat", {
      method: "POST",
      body: '{"prompt":"test"}',
      onLine: vi.fn(),
    });

    await triggerResponse(mockHttpsRequest, 200);
    emitEnd();

    await promise;
    expect(pending.currentReq?.write).toHaveBeenCalledWith('{"prompt":"test"}');
    expect(pending.currentReq?.end).toHaveBeenCalled();
  });

  it("空 body 时不应该调用 req.write", async () => {
    const { makeStreamingRequest } = await import("../api-gateway-utils");

    const promise = makeStreamingRequest("https://api.example.com/v1/chat", {
      method: "GET",
      onLine: vi.fn(),
    });

    await triggerResponse(mockHttpsRequest, 200);
    emitEnd();

    await promise;
    expect(pending.currentReq?.write).not.toHaveBeenCalled();
  });

  it("多行 SSE 数据应正确解析（含空行分隔）", async () => {
    const { makeStreamingRequest } = await import("../api-gateway-utils");
    const onLine = vi.fn();

    const promise = makeStreamingRequest("https://api.example.com/v1/chat", {
      method: "POST",
      onLine,
    });

    await triggerResponse(mockHttpsRequest, 200);
    emitData('data: {"delta":"hello"}\n\ndata: {"delta":" world"}\n\n');
    emitEnd();

    await promise;

    expect(onLine).toHaveBeenCalledWith('data: {"delta":"hello"}');
    expect(onLine).toHaveBeenCalledWith('data: {"delta":" world"}');
  });

  it("非 2xx 错误响应超过 1MB 应销毁请求", async () => {
    const { makeStreamingRequest } = await import("../api-gateway-utils");

    const promise = makeStreamingRequest("https://api.example.com/v1/chat", {
      method: "POST",
      onLine: vi.fn(),
    });

    await triggerResponse(mockHttpsRequest, 500);
    const largeData = Buffer.alloc(2 * 1024 * 1024, 0x41); // 2MB 'A'
    emitData(largeData);

    await expect(promise).rejects.toThrow();
    expect(pending.currentReq?.destroy).toHaveBeenCalled();
  });

  it("2xx 流式响应超过 50MB 应销毁请求", async () => {
    const { makeStreamingRequest } = await import("../api-gateway-utils");

    const promise = makeStreamingRequest("https://api.example.com/v1/chat", {
      method: "POST",
      onLine: vi.fn(),
    });

    await triggerResponse(mockHttpsRequest, 200);
    const largeData = Buffer.alloc(51 * 1024 * 1024, 0x41); // 51MB
    emitData(largeData);

    await expect(promise).rejects.toThrow();
    expect(pending.currentReq?.destroy).toHaveBeenCalled();
  });
});
