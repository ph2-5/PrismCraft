/**
 * R133: SSRF 校验异常时必须 fail-close
 * 回归防护: 确保 isPrivateUrl 在 ssrfGuard.validate 抛出异常时返回 true
 *           （视为私有 URL），阻止请求通过。这是 fail-close 策略，确保校验
 *           失败时不会放行请求。
 *
 * 攻击场景：若 SSRF 校验异常时 fail-open（返回 false = 非私有 URL），攻击者
 * 可通过构造导致 DNS 解析异常的 URL 绕过 SSRF 防护，访问内网服务或云元数据
 * 端点。例如使用不存在的域名导致 DNS 超时，若 fail-open 则请求被放行。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// 提升 mock
const { mockSsrfValidate } = vi.hoisted(() => ({
  mockSsrfValidate: vi.fn(),
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

vi.mock("../api-gateway-error-codes", () => ({
  API_ERROR_CODES: {
    API_NOT_CONFIGURED: "api_not_configured",
    API_KEY_INVALID: "api_key_invalid",
  },
}));

vi.mock("http", () => ({
  default: { request: vi.fn() },
}));

vi.mock("https", () => ({
  default: { request: vi.fn() },
}));

describe("R133: SSRF fail-close 策略", () => {
  let testConnection: typeof import("../handlers/test-connection");

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    mockSsrfValidate.mockReset();
    testConnection = await import("../handlers/test-connection");
  });

  it("handleTestConnection 应已导出", () => {
    expect(testConnection.handleTestConnection).toBeDefined();
    expect(typeof testConnection.handleTestConnection).toBe("function");
  });

  it("ssrfGuard.validate 抛出异常时，请求应被阻止（fail-close）", async () => {
    // ssrfGuard.validate 抛出异常
    mockSsrfValidate.mockRejectedValue(new Error("DNS resolution timeout"));

    const result = await testConnection.handleTestConnection("POST", {
      apiUrl: "http://example.com",
      apiKey: "test-key",
      mode: "lightweight",
    });

    // fail-close：校验异常时请求应失败
    expect(result.success).toBe(false);
    // 应返回错误信息（而非成功）
    expect(result.error).toBeDefined();
    // ssrfGuard.validate 应被调用
    expect(mockSsrfValidate).toHaveBeenCalled();
  });

  it("ssrfGuard.validate 抛出异常时，错误消息应包含 'Cannot access private'", async () => {
    mockSsrfValidate.mockRejectedValue(new Error("DNS lookup failed"));

    const result = await testConnection.handleTestConnection("POST", {
      apiUrl: "http://example.com",
      apiKey: "test-key",
      mode: "lightweight",
    });

    expect(result.success).toBe(false);
    // fail-close 导致 isPrivateUrl 返回 true，makeRequest 抛出
    // "Cannot access private/internal URLs"
    expect(result.error).toContain("Cannot access private");
  });

  it("ssrfGuard.validate 返回 safe: false 时，请求应被阻止", async () => {
    mockSsrfValidate.mockResolvedValue({ safe: false, reason: "Private IP" });

    const result = await testConnection.handleTestConnection("POST", {
      apiUrl: "http://127.0.0.1:8080",
      apiKey: "test-key",
      mode: "lightweight",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Cannot access private");
  });

  it("ssrfGuard.validate 返回 safe: true 时，请求应继续执行", async () => {
    mockSsrfValidate.mockResolvedValue({ safe: true });

    // 由于 http/https 被 mock，请求会失败，但不应是 "Cannot access private" 错误
    const result = await testConnection.handleTestConnection("POST", {
      apiUrl: "http://example.com",
      apiKey: "test-key",
      mode: "lightweight",
    });

    // 请求应继续执行（不会因 SSRF 被阻止）
    // 由于 http.request 是 mock，会失败，但错误不应是 "Cannot access private"
    expect(result.success).toBe(false);
    expect(result.error).not.toContain("Cannot access private");
  });

  it("fail-close 应在 ssrfGuard.validate 抛出各种异常时生效", async () => {
    const testErrors = [
      new Error("DNS resolution timeout"),
      new Error("Network unreachable"),
      new TypeError("Cannot read property of undefined"),
      new RangeError("Index out of bounds"),
    ];

    for (const error of testErrors) {
      mockSsrfValidate.mockRejectedValueOnce(error);

      const result = await testConnection.handleTestConnection("POST", {
        apiUrl: "http://example.com",
        apiKey: "test-key",
        mode: "lightweight",
      });

      // 所有异常情况都应 fail-close
      expect(result.success).toBe(false);
      expect(result.error).toContain("Cannot access private");
    }
  });

  it("ssrfGuard.validate 抛出异常时仍应被调用", async () => {
    mockSsrfValidate.mockRejectedValue(new Error("Unexpected error"));

    await testConnection.handleTestConnection("POST", {
      apiUrl: "http://example.com",
      apiKey: "test-key",
      mode: "lightweight",
    });

    // 即使抛出异常，ssrfGuard.validate 也应被调用
    expect(mockSsrfValidate).toHaveBeenCalledTimes(1);
    expect(mockSsrfValidate).toHaveBeenCalledWith("http://example.com/models");
  });
});
