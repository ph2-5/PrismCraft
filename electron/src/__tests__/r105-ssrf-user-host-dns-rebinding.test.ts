/**
 * R105: SSRF 用户 host DNS 重绑定防护测试
 * 回归防护: 确保用户配置的 loopback host 直接放行（不走 SSRF），
 *           用户配置的非 loopback host 走 ssrfGuard.validate 做 DNS rebinding 检查，
 *           非用户配置的 URL 走完整 SSRF 校验，
 *           ssrfGuard.validate 返回 unsafe 时应拦截请求。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSsrfValidate, mockHttpRequest, mockHttpsRequest } = vi.hoisted(() => ({
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
}));

vi.mock("../plugins", () => ({
  pluginRegistry: { selectById: vi.fn(), select: vi.fn() },
}));

vi.mock("http", () => ({
  default: { request: mockHttpRequest, get: vi.fn() },
}));

vi.mock("https", () => ({
  default: { request: mockHttpsRequest, get: vi.fn() },
}));

/**
 * 设置 mock HTTP/HTTPS request，模拟成功响应。
 * 当 isPrivateUrl 返回 false 时，makeRequest 会调用 http.request，
 * 此 mock 确保请求能正常完成并返回 JSON 响应。
 */
function setupMockRequest(mockFn: ReturnType<typeof vi.fn>): void {
  mockFn.mockImplementation(
    (_url: string, _options: unknown, callback: (res: unknown) => void) => {
      const listeners: Record<string, Array<(data?: unknown) => void>> = {};
      const res = {
        statusCode: 200,
        headers: {},
        on: (event: string, fn: (data?: unknown) => void) => {
          if (!listeners[event]) listeners[event] = [];
          listeners[event].push(fn);
        },
      };
      callback(res);
      // 同步触发 data 和 end 事件（此时 listener 已注册）
      listeners["data"]?.forEach((fn) => fn(Buffer.from('{"ok":true}')));
      listeners["end"]?.forEach((fn) => fn());
      return {
        setTimeout: vi.fn(),
        on: vi.fn(),
        write: vi.fn(),
        end: vi.fn(),
        destroy: vi.fn(),
      };
    },
  );
}

describe("R105: SSRF 用户 host DNS 重绑定防护", () => {
  let apiGatewayUtils: typeof import("../api-gateway-utils");

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    mockSsrfValidate.mockResolvedValue({ safe: true });
    setupMockRequest(mockHttpRequest);
    setupMockRequest(mockHttpsRequest);

    apiGatewayUtils = await import("../api-gateway-utils");
  });

  describe("用户配置的 loopback host 直接放行", () => {
    it("127.0.0.1 应直接放行，不调用 ssrfGuard.validate", async () => {
      apiGatewayUtils.registerUserEndpoint("http://127.0.0.1:11434");

      mockSsrfValidate.mockClear();
      mockHttpRequest.mockClear();

      const result = await apiGatewayUtils.makeRequest(
        "http://127.0.0.1:11434/test",
        {},
      );

      expect(result).toBeDefined();
      expect(mockHttpRequest).toHaveBeenCalled();
      // loopback host 应直接放行，不走 SSRF 校验
      expect(mockSsrfValidate).not.toHaveBeenCalled();
    });

    it("localhost 应直接放行，不调用 ssrfGuard.validate", async () => {
      apiGatewayUtils.registerUserEndpoint("http://localhost:3000");

      mockSsrfValidate.mockClear();
      mockHttpRequest.mockClear();

      const result = await apiGatewayUtils.makeRequest(
        "http://localhost:3000/api",
        {},
      );

      expect(result).toBeDefined();
      expect(mockHttpRequest).toHaveBeenCalled();
      expect(mockSsrfValidate).not.toHaveBeenCalled();
    });

    it("127.x.x.x 网段应直接放行（loopback 段）", async () => {
      apiGatewayUtils.registerUserEndpoint("http://127.1.2.3:8080");

      mockSsrfValidate.mockClear();
      mockHttpRequest.mockClear();

      const result = await apiGatewayUtils.makeRequest(
        "http://127.1.2.3:8080/test",
        {},
      );

      expect(result).toBeDefined();
      expect(mockHttpRequest).toHaveBeenCalled();
      expect(mockSsrfValidate).not.toHaveBeenCalled();
    });
  });

  describe("用户配置的非 loopback host 走 DNS rebinding 检查", () => {
    it("应调用 ssrfGuard.validate 做 DNS rebinding 检查", async () => {
      apiGatewayUtils.registerUserEndpoint(
        "http://user-server.example.com:8080",
      );

      mockSsrfValidate.mockResolvedValue({ safe: true });
      mockSsrfValidate.mockClear();
      mockHttpRequest.mockClear();

      const result = await apiGatewayUtils.makeRequest(
        "http://user-server.example.com:8080/test",
        {},
      );

      expect(result).toBeDefined();
      expect(mockHttpRequest).toHaveBeenCalled();
      // 用户配置的非 loopback host 仍需走 SSRF 校验
      expect(mockSsrfValidate).toHaveBeenCalledWith(
        "http://user-server.example.com:8080/test",
      );
    });

    it("ssrfGuard.validate 返回 unsafe 时应拦截用户配置的非 loopback host", async () => {
      apiGatewayUtils.registerUserEndpoint(
        "http://rebinding-server.example.com:9090",
      );

      mockSsrfValidate.mockResolvedValue({
        safe: false,
        reason: "DNS resolved to private IP",
      });
      mockSsrfValidate.mockClear();
      mockHttpRequest.mockClear();

      await expect(
        apiGatewayUtils.makeRequest(
          "http://rebinding-server.example.com:9090/api",
          {},
        ),
      ).rejects.toThrow("Cannot access private/internal URLs");

      expect(mockSsrfValidate).toHaveBeenCalledWith(
        "http://rebinding-server.example.com:9090/api",
      );
      // 被拦截时不应发起 HTTP 请求
      expect(mockHttpRequest).not.toHaveBeenCalled();
    });
  });

  describe("非用户配置的 URL 走完整 SSRF 校验", () => {
    it("应调用 ssrfGuard.validate 进行完整 SSRF 校验", async () => {
      mockSsrfValidate.mockResolvedValue({ safe: true });
      mockSsrfValidate.mockClear();
      mockHttpRequest.mockClear();

      const result = await apiGatewayUtils.makeRequest(
        "http://public-api.example.org/v1/chat",
        {},
      );

      expect(result).toBeDefined();
      expect(mockHttpRequest).toHaveBeenCalled();
      expect(mockSsrfValidate).toHaveBeenCalledWith(
        "http://public-api.example.org/v1/chat",
      );
    });

    it("ssrfGuard.validate 返回 unsafe 时应拦截非用户配置的 URL", async () => {
      mockSsrfValidate.mockResolvedValue({
        safe: false,
        reason: "Private hostname detected",
      });
      mockSsrfValidate.mockClear();
      mockHttpRequest.mockClear();

      await expect(
        apiGatewayUtils.makeRequest(
          "http://malicious.example.net/admin",
          {},
        ),
      ).rejects.toThrow("Cannot access private/internal URLs");

      expect(mockSsrfValidate).toHaveBeenCalledWith(
        "http://malicious.example.net/admin",
      );
      expect(mockHttpRequest).not.toHaveBeenCalled();
    });
  });

  describe("HTTPS URL 的 SSRF 校验", () => {
    it("HTTPS 非用户配置 URL 应走 ssrfGuard.validate 并使用 https.request", async () => {
      mockSsrfValidate.mockResolvedValue({ safe: true });
      mockSsrfValidate.mockClear();
      mockHttpsRequest.mockClear();

      const result = await apiGatewayUtils.makeRequest(
        "https://secure-api.example.com/v1/data",
        {},
      );

      expect(result).toBeDefined();
      expect(mockHttpsRequest).toHaveBeenCalled();
      expect(mockSsrfValidate).toHaveBeenCalledWith(
        "https://secure-api.example.com/v1/data",
      );
    });
  });
});
