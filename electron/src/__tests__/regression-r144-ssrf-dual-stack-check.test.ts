/**
 * R144: SSRF DNS 双栈检查
 * 回归防护: 确保 ssrfGuard.validate 并行解析 IPv4 和 IPv6 地址，
 *           对两个地址列表都做私有 IP 检查。防止攻击者构造同时返回
 *           公网 IPv4 和私有 IPv6 的域名绕过 SSRF 防护。
 *
 * 攻击场景：若仅检查 IPv4 地址，攻击者可配置 DNS 返回公网 IPv4 + 私有 IPv6，
 *           请求时客户端可能优先使用 IPv6 地址访问内网服务（DNS rebinding）。
 *           修复后 Promise.all 同时解析 v4 和 v6，任一私有即拒绝。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// 提升 dns mock，确保在 ssrf-guard 模块导入前生效
const { mockResolve4, mockResolve6 } = vi.hoisted(() => ({
  mockResolve4: vi.fn(),
  mockResolve6: vi.fn(),
}));

vi.mock("dns", () => ({
  default: {
    resolve4: mockResolve4,
    resolve6: mockResolve6,
  },
  resolve4: mockResolve4,
  resolve6: mockResolve6,
}));

vi.mock("../logging/logger", () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { SsrfGuard } from "../security/ssrf-guard/ssrf-guard";

describe("R144: SSRF DNS 双栈检查", () => {
  let guard: SsrfGuard;

  beforeEach(() => {
    vi.clearAllMocks();
    // 每个测试创建新实例，避免 DNS 缓存干扰
    guard = new SsrfGuard({
      enableDnsResolution: true,
      dnsFailurePolicy: "deny",
    });
  });

  it("主机名解析到私有 IPv4 应被拒绝", async () => {
    mockResolve4.mockImplementation(
      (_hostname: string, cb: (err: Error | null, addrs: string[]) => void) =>
        cb(null, ["10.0.0.1"]),
    );
    mockResolve6.mockImplementation(
      (_hostname: string, cb: (err: Error | null, addrs: string[]) => void) =>
        cb(null, []),
    );

    const result = await guard.validate("https://evil-v4.example.com/api");

    expect(result.safe).toBe(false);
    expect(result.reason).toMatch(/private IPv4|private IP/i);
  });

  it("主机名解析到私有 IPv6（如 ::1）应被拒绝", async () => {
    mockResolve4.mockImplementation(
      (_hostname: string, cb: (err: Error | null, addrs: string[]) => void) =>
        cb(null, []),
    );
    mockResolve6.mockImplementation(
      (_hostname: string, cb: (err: Error | null, addrs: string[]) => void) =>
        cb(null, ["::1"]),
    );

    const result = await guard.validate("https://evil-v6.example.com/api");

    expect(result.safe).toBe(false);
    expect(result.reason).toMatch(/private IPv6|private IP/i);
  });

  it("主机名解析到公网 IPv4 + 私有 IPv6 应被拒绝（DNS rebinding 防护）", async () => {
    mockResolve4.mockImplementation(
      (_hostname: string, cb: (err: Error | null, addrs: string[]) => void) =>
        cb(null, ["8.8.8.8"]),
    );
    mockResolve6.mockImplementation(
      (_hostname: string, cb: (err: Error | null, addrs: string[]) => void) =>
        cb(null, ["fc00::1"]),
    );

    const result = await guard.validate("https://rebinding.example.com/api");

    // 即使 IPv4 是公网，IPv6 私有也应拒绝
    expect(result.safe).toBe(false);
    expect(result.reason).toMatch(/private IPv6|private IP/i);
  });

  it("主机名解析到公网 IPv4 + 公网 IPv6 应通过", async () => {
    mockResolve4.mockImplementation(
      (_hostname: string, cb: (err: Error | null, addrs: string[]) => void) =>
        cb(null, ["8.8.8.8"]),
    );
    mockResolve6.mockImplementation(
      (_hostname: string, cb: (err: Error | null, addrs: string[]) => void) =>
        cb(null, ["2001:4860:4860::8888"]),
    );

    const result = await guard.validate("https://public.example.com/api");

    expect(result.safe).toBe(true);
  });

  it("主机名解析失败（NXDOMAIN）应按 dnsFailurePolicy=deny 处理（拒绝）", async () => {
    mockResolve4.mockImplementation(
      (_hostname: string, cb: (err: Error | null, addrs: string[]) => void) =>
        cb(new Error("ENOTFOUND") as NodeJS.ErrnoException, []),
    );
    mockResolve6.mockImplementation(
      (_hostname: string, cb: (err: Error | null, addrs: string[]) => void) =>
        cb(new Error("ENOTFOUND") as NodeJS.ErrnoException, []),
    );

    const result = await guard.validate("https://nonexistent.example.com/api");

    expect(result.safe).toBe(false);
    expect(result.reason).toMatch(/DNS|resolution/i);
  });

  it("dnsFailurePolicy=allow 时 NXDOMAIN 应放行", async () => {
    const permissiveGuard = new SsrfGuard({
      enableDnsResolution: true,
      dnsFailurePolicy: "allow",
    });

    mockResolve4.mockImplementation(
      (_hostname: string, cb: (err: Error | null, addrs: string[]) => void) =>
        cb(new Error("ENOTFOUND") as NodeJS.ErrnoException, []),
    );
    mockResolve6.mockImplementation(
      (_hostname: string, cb: (err: Error | null, addrs: string[]) => void) =>
        cb(new Error("ENOTFOUND") as NodeJS.ErrnoException, []),
    );

    const result = await permissiveGuard.validate(
      "https://nonexistent-allow.example.com/api",
    );

    expect(result.safe).toBe(true);
  });

  it("应同时调用 dns.resolve4 和 dns.resolve6（双栈解析）", async () => {
    mockResolve4.mockImplementation(
      (_hostname: string, cb: (err: Error | null, addrs: string[]) => void) =>
        cb(null, ["8.8.8.8"]),
    );
    mockResolve6.mockImplementation(
      (_hostname: string, cb: (err: Error | null, addrs: string[]) => void) =>
        cb(null, ["2001:4860:4860::8888"]),
    );

    await guard.validate("https://dual-stack.example.com/api");

    // 双栈检查：两个 resolve 函数都应被调用
    expect(mockResolve4).toHaveBeenCalled();
    expect(mockResolve6).toHaveBeenCalled();
  });

  it("仅 IPv4 私有 + IPv6 解析失败应被拒绝", async () => {
    mockResolve4.mockImplementation(
      (_hostname: string, cb: (err: Error | null, addrs: string[]) => void) =>
        cb(null, ["192.168.1.1"]),
    );
    mockResolve6.mockImplementation(
      (_hostname: string, cb: (err: Error | null, addrs: string[]) => void) =>
        cb(new Error("ENOTFOUND") as NodeJS.ErrnoException, []),
    );

    const result = await guard.validate("https://v4-private.example.com/api");

    expect(result.safe).toBe(false);
    expect(result.reason).toMatch(/private IPv4|private IP/i);
  });
});
