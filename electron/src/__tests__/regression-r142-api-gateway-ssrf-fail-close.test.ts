/**
 * R142: api-gateway-utils isPrivateUrl 必须采用 fail-close 策略
 * 回归防护: 确保 isPrivateUrl 在 SSRF 校验抛出异常时返回 true（视为私有 URL），
 *           阻止请求通过，与 test-connection.ts 的 fail-close 行为一致。
 *
 * 攻击场景：若 isPrivateUrl 在异常时返回 false（fail-open），攻击者可构造
 *           导致 ssrfGuard.validate 抛异常的 URL，绕过 SSRF 防护访问内网服务。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSsrfValidate = vi.fn();

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

describe("R142: api-gateway-utils isPrivateUrl fail-close 策略", () => {
  beforeEach(() => {
    mockSsrfValidate.mockReset();
  });

  it("ssrfGuard.validate 抛异常时应阻止请求（fail-close）", async () => {
    mockSsrfValidate.mockRejectedValue(new Error("DNS resolver crashed"));

    const { makeRequest } = await import("../api-gateway-utils");

    // makeRequest 在 isPrivateUrl 返回 true 时抛异常 "Cannot access private/internal URLs"
    await expect(
      makeRequest({
        url: "https://api.example.com/v1/test",
        method: "GET",
      }),
    ).rejects.toThrow(/private|internal/i);
  });

  it("ssrfGuard.validate 返回 safe: false 时应阻止请求", async () => {
    mockSsrfValidate.mockResolvedValue({
      safe: false,
      reason: "Private IP detected",
    });

    const { makeRequest } = await import("../api-gateway-utils");

    await expect(
      makeRequest({
        url: "https://api.example.com/v1/test",
        method: "GET",
      }),
    ).rejects.toThrow(/private|internal/i);
  });
});
