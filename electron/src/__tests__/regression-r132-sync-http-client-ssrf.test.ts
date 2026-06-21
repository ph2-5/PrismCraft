/**
 * R132: sync-http-client 必须在发起 HTTP 请求前调用 SSRF 校验
 * 回归防护: 确保 makeSyncRequest 在发起 HTTP 请求前调用 ssrfGuard.validate
 *           校验 URL，防止 SSRF 攻击。
 *
 * 攻击场景：攻击者配置恶意同步服务器 URL（如 http://169.254.169.254/latest/
 * meta-data/），若不校验则可访问云元数据端点获取敏感凭证，或访问内网服务
 * （如 http://127.0.0.1:8080/admin）造成内网探测。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// 提升 mock
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

vi.mock("http", () => ({
  default: { request: mockHttpRequest },
}));

vi.mock("https", () => ({
  default: { request: mockHttpsRequest },
}));

function createMockReqResponse() {
  const listeners: Record<string, Array<(data?: unknown) => void>> = {};
  const res = {
    statusCode: 200,
    on(event: string, fn: (data?: unknown) => void) {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(fn);
    },
  };
  const req = {
    setTimeout: vi.fn(),
    on: vi.fn((event: string, fn: (err: Error) => void) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(fn as (data?: unknown) => void);
    }),
    write: vi.fn(),
    end: vi.fn(() => {
      // 模拟响应到达
      listeners["data"]?.forEach((fn) => fn(Buffer.from('{"ok":true}')));
      listeners["end"]?.forEach((fn) => fn());
    }),
    destroy: vi.fn(),
  };
  return { req, res, listeners };
}

describe("R132: sync-http-client 必须在发起 HTTP 请求前调用 SSRF 校验", () => {
  let syncHttpClient: typeof import("../sync-http-client");

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    mockSsrfValidate.mockReset();
    mockHttpRequest.mockReset();
    mockHttpsRequest.mockReset();

    syncHttpClient = await import("../sync-http-client");
  });

  it("makeSyncRequest 应已导出", () => {
    expect(syncHttpClient.makeSyncRequest).toBeDefined();
    expect(typeof syncHttpClient.makeSyncRequest).toBe("function");
  });

  it("ssrfGuard.validate 返回 safe: false 时应抛出错误", async () => {
    mockSsrfValidate.mockResolvedValue({ safe: false, reason: "Private IP" });

    await expect(
      syncHttpClient.makeSyncRequest("http://127.0.0.1:8080/admin", {
        method: "GET",
      }),
    ).rejects.toThrow("URL blocked by SSRF guard");
  });

  it("ssrfGuard.validate 返回 safe: false 时不应发起 HTTP 请求", async () => {
    mockSsrfValidate.mockResolvedValue({ safe: false, reason: "Private IP" });

    try {
      await syncHttpClient.makeSyncRequest("http://127.0.0.1:8080/admin", {
        method: "GET",
      });
    } catch {
      // 预期抛出
    }

    expect(mockSsrfValidate).toHaveBeenCalledTimes(1);
    expect(mockHttpRequest).not.toHaveBeenCalled();
    expect(mockHttpsRequest).not.toHaveBeenCalled();
  });

  it("ssrfGuard.validate 返回 safe: true 时应继续发起 HTTP 请求", async () => {
    mockSsrfValidate.mockResolvedValue({ safe: true });

    const { req, res } = createMockReqResponse();
    mockHttpRequest.mockReturnValue(req);
    // 触发 callback 同步
    mockHttpRequest.mockImplementationOnce(
      (_url: string, _opts: unknown, callback: (res: unknown) => void) => {
        callback(res);
        return req;
      },
    );

    const result = await syncHttpClient.makeSyncRequest("http://example.com/api", {
      method: "GET",
    });

    expect(mockSsrfValidate).toHaveBeenCalledTimes(1);
    expect(mockSsrfValidate).toHaveBeenCalledWith("http://example.com/api");
    expect(mockHttpRequest).toHaveBeenCalled();
    expect(result.statusCode).toBe(200);
  });

  it("makeSyncRequest 应在发起请求前调用 ssrfGuard.validate", async () => {
    mockSsrfValidate.mockResolvedValue({ safe: true });

    const { req, res } = createMockReqResponse();
    mockHttpsRequest.mockImplementationOnce(
      (_url: string, _opts: unknown, callback: (res: unknown) => void) => {
        callback(res);
        return req;
      },
    );

    await syncHttpClient.makeSyncRequest("https://example.com/api", {
      method: "POST",
      body: '{"test":true}',
    });

    // ssrfGuard.validate 应被调用
    expect(mockSsrfValidate).toHaveBeenCalledTimes(1);
    expect(mockSsrfValidate).toHaveBeenCalledWith("https://example.com/api");
  });

  it("SSRF 校验应在 HTTP 请求之前执行（顺序验证）", async () => {
    const callOrder: string[] = [];
    mockSsrfValidate.mockImplementation(async () => {
      callOrder.push("ssrfValidate");
      return { safe: true };
    });

    const { req, res } = createMockReqResponse();
    mockHttpRequest.mockImplementationOnce(
      (_url: string, _opts: unknown, callback: (res: unknown) => void) => {
        callOrder.push("httpRequest");
        callback(res);
        return req;
      },
    );

    await syncHttpClient.makeSyncRequest("http://example.com/api", {
      method: "GET",
    });

    expect(callOrder[0]).toBe("ssrfValidate");
    expect(callOrder[1]).toBe("httpRequest");
  });

  it("https URL 应使用 https 模块", async () => {
    mockSsrfValidate.mockResolvedValue({ safe: true });

    const { req, res } = createMockReqResponse();
    mockHttpsRequest.mockImplementationOnce(
      (_url: string, _opts: unknown, callback: (res: unknown) => void) => {
        callback(res);
        return req;
      },
    );

    await syncHttpClient.makeSyncRequest("https://example.com/api", {
      method: "GET",
    });

    expect(mockHttpsRequest).toHaveBeenCalled();
    expect(mockHttpRequest).not.toHaveBeenCalled();
  });

  it("http URL 应使用 http 模块", async () => {
    mockSsrfValidate.mockResolvedValue({ safe: true });

    const { req, res } = createMockReqResponse();
    mockHttpRequest.mockImplementationOnce(
      (_url: string, _opts: unknown, callback: (res: unknown) => void) => {
        callback(res);
        return req;
      },
    );

    await syncHttpClient.makeSyncRequest("http://example.com/api", {
      method: "GET",
    });

    expect(mockHttpRequest).toHaveBeenCalled();
    expect(mockHttpsRequest).not.toHaveBeenCalled();
  });
});
