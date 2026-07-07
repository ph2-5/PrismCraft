/**
 * download-to-file SSRF 回归测试
 *
 * 验证方案 C 的流式下载 handler 在以下场景下符合 SSRF 安全规范：
 * - R105: 所有 URL（含用户配置 host）走 ssrfGuard.validate 做 DNS rebinding 防护
 * - R118: 重定向每一跳都校验 SSRF，防止重定向到内网/元数据服务
 * - R133: SSRF 校验异常时 fail-close（视为不安全，阻止请求）
 *
 * 攻击场景：
 * - 攻击者控制 AI provider 账号，返回恶意 videoUrl 指向内网服务
 * - 攻击者构造重定向链：公网 URL → 302 → http://127.0.0.1:8080/admin
 * - 攻击者返回 videoUrl 指向云元数据服务 http://169.254.169.254/latest/meta-data/
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fsp from "fs/promises";
import path from "path";
import { getUserDataRootDir } from "../../app-paths";

// ── hoisted mocks ──────────────────────────────────────────────────────
const { mockSsrfValidate } = vi.hoisted(() => ({
  mockSsrfValidate: vi.fn(),
}));

vi.mock("../../security", () => ({
  ssrfGuard: { validate: mockSsrfValidate },
}));

vi.mock("../../logging", () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { downloadToFile } from "../download-to-file";

const USER_DATA_ROOT = getUserDataRootDir();
const TEST_DIR = path.join(USER_DATA_ROOT, "Cache", "Videos", "test-ssrf");
const TEST_FILE = path.join(TEST_DIR, "test.mp4");

function createResponse(opts: {
  status?: number;
  body?: string | Buffer;
  headers?: Record<string, string>;
}): Response {
  const status = opts.status ?? 200;
  const body = opts.body ?? "";
  const headers = opts.headers ?? {};
  return new Response(body, {
    status,
    headers,
  });
}

describe("download-to-file SSRF 防护", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockSsrfValidate.mockReset();
    // 默认放行（用于测试非 SSRF 路径的行为）
    mockSsrfValidate.mockResolvedValue({ safe: true });
    // 清理测试目录
    try {
      await fsp.rm(TEST_DIR, { recursive: true, force: true });
    } catch {
      // 忽略
    }
    await fsp.mkdir(TEST_DIR, { recursive: true });
    originalFetch = globalThis.fetch;
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    try {
      await fsp.rm(TEST_DIR, { recursive: true, force: true });
    } catch {
      // 忽略
    }
  });

  // ── R105: 初始 URL SSRF 校验 ──────────────────────────────────────
  describe("R105: 初始 URL SSRF 校验", () => {
    it("ssrfGuard 返回 safe: false 时应阻止下载", async () => {
      mockSsrfValidate.mockResolvedValue({
        safe: false,
        reason: "Private IP: 127.0.0.1",
      });
      globalThis.fetch = vi.fn() as unknown as typeof globalThis.fetch;

      const result = await downloadToFile(
        "http://127.0.0.1:8080/evil.mp4",
        TEST_FILE,
        { maxRetries: 1 },
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("URL blocked by SSRF guard");
      expect(result.error).toContain("Private IP: 127.0.0.1");
      // fetch 不应被调用
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it("私网 IP（10.x）应被 ssrfGuard 拒绝", async () => {
      mockSsrfValidate.mockResolvedValue({
        safe: false,
        reason: "Private IP: 10.0.0.1",
      });

      const result = await downloadToFile(
        "http://10.0.0.1/internal.mp4",
        TEST_FILE,
        { maxRetries: 1 },
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("URL blocked by SSRF guard");
    });

    it("云元数据端点应被拒绝", async () => {
      mockSsrfValidate.mockResolvedValue({
        safe: false,
        reason: "Metadata endpoint: 169.254.169.254",
      });

      const result = await downloadToFile(
        "http://169.254.169.254/latest/meta-data/iam/security-credentials/",
        TEST_FILE,
        { maxRetries: 1 },
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("URL blocked by SSRF guard");
      expect(result.error).toContain("Metadata endpoint");
    });

    it("ssrfGuard 返回 safe: true 时应放行并完成下载", async () => {
      mockSsrfValidate.mockResolvedValue({ safe: true });
      globalThis.fetch = vi.fn(async () => {
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(Buffer.from("video-data"));
            controller.close();
          },
        });
        return createResponse({
          status: 200,
          body: stream as unknown as BodyInit,
          headers: { "content-length": "9" },
        });
      }) as unknown as typeof globalThis.fetch;

      const result = await downloadToFile(
        "https://kling-api.kuaishou.com/v1/videos/xxx.mp4",
        TEST_FILE,
        { maxRetries: 1 },
      );

      expect(result.success).toBe(true);
      expect(result.totalBytes).toBe(9);
      expect(mockSsrfValidate).toHaveBeenCalledWith(
        "https://kling-api.kuaishou.com/v1/videos/xxx.mp4",
      );
    });
  });

  // ── R133: SSRF 校验异常时 fail-close ──────────────────────────────
  describe("R133: SSRF 校验异常 fail-close", () => {
    it("ssrfGuard 抛出异常时应 fail-close 阻止下载", async () => {
      mockSsrfValidate.mockRejectedValue(new Error("DNS resolution timeout"));
      globalThis.fetch = vi.fn() as unknown as typeof globalThis.fetch;

      const result = await downloadToFile(
        "http://example.com/video.mp4",
        TEST_FILE,
        { maxRetries: 1 },
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("SSRF validation failed (fail-close)");
      expect(result.error).toContain("DNS resolution timeout");
      // fetch 不应被调用
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it("DNS 解析失败时应 fail-close", async () => {
      mockSsrfValidate.mockRejectedValue(new Error("ENOTFOUND nonexistent.invalid"));
      globalThis.fetch = vi.fn() as unknown as typeof globalThis.fetch;

      const result = await downloadToFile(
        "http://nonexistent.invalid/video.mp4",
        TEST_FILE,
        { maxRetries: 1 },
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("SSRF validation failed (fail-close)");
      expect(result.error).toContain("ENOTFOUND");
    });

    it("ssrfGuard 抛出 TypeError 时也应 fail-close", async () => {
      mockSsrfValidate.mockRejectedValue(new TypeError("Cannot read property of undefined"));
      globalThis.fetch = vi.fn() as unknown as typeof globalThis.fetch;

      const result = await downloadToFile(
        "http://example.com/video.mp4",
        TEST_FILE,
        { maxRetries: 1 },
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("SSRF validation failed (fail-close)");
    });
  });

  // ── R118: 重定向每跳 SSRF 校验 ────────────────────────────────────
  describe("R118: 重定向每跳 SSRF 校验", () => {
    it("重定向到私网 IP 应被第二跳 SSRF 校验拒绝", async () => {
      // 第一跳 SSRF 通过（公网 URL）
      // 第二跳 SSRF 拒绝（重定向到 127.0.0.1）
      mockSsrfValidate
        .mockResolvedValueOnce({ safe: true }) // 初始 URL
        .mockResolvedValueOnce({
          safe: false,
          reason: "Private IP: 127.0.0.1",
        }); // 重定向目标

      globalThis.fetch = vi.fn(async () => {
        // 返回 302 重定向到内网
        return createResponse({
          status: 302,
          headers: { location: "http://127.0.0.1:8080/evil.mp4" },
        });
      }) as unknown as typeof globalThis.fetch;

      const result = await downloadToFile(
        "https://evil.com/redirect",
        TEST_FILE,
        { maxRetries: 1 },
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("URL blocked by SSRF guard");
      expect(result.error).toContain("Private IP: 127.0.0.1");
      // ssrfGuard 应被调用 2 次：初始 + 重定向
      expect(mockSsrfValidate).toHaveBeenCalledTimes(2);
      expect(mockSsrfValidate).toHaveBeenNthCalledWith(1, "https://evil.com/redirect");
      expect(mockSsrfValidate).toHaveBeenNthCalledWith(2, "http://127.0.0.1:8080/evil.mp4");
    });

    it("重定向到云元数据服务应被拒绝", async () => {
      mockSsrfValidate
        .mockResolvedValueOnce({ safe: true })
        .mockResolvedValueOnce({
          safe: false,
          reason: "Metadata endpoint: 169.254.169.254",
        });

      globalThis.fetch = vi.fn(async () => {
        return createResponse({
          status: 302,
          headers: { location: "http://169.254.169.254/latest/meta-data/" },
        });
      }) as unknown as typeof globalThis.fetch;

      const result = await downloadToFile(
        "https://evil.com/redirect",
        TEST_FILE,
        { maxRetries: 1 },
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Metadata endpoint");
      expect(mockSsrfValidate).toHaveBeenCalledTimes(2);
    });

    it("多跳重定向链：公网→公网→私网，第三跳应被拒绝", async () => {
      mockSsrfValidate
        .mockResolvedValueOnce({ safe: true }) // 初始 URL
        .mockResolvedValueOnce({ safe: true }) // 第一跳重定向
        .mockResolvedValueOnce({
          safe: false,
          reason: "Private IP: 10.0.0.1",
        }); // 第二跳重定向

      let callCount = 0;
      globalThis.fetch = vi.fn(async () => {
        callCount++;
        if (callCount === 1) {
          return createResponse({
            status: 302,
            headers: { location: "https://public2.com/redirect" },
          });
        }
        if (callCount === 2) {
          return createResponse({
            status: 302,
            headers: { location: "http://10.0.0.1/internal" },
          });
        }
        return createResponse({ status: 200 });
      }) as unknown as typeof globalThis.fetch;

      const result = await downloadToFile(
        "https://public1.com/start",
        TEST_FILE,
        { maxRetries: 1 },
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Private IP: 10.0.0.1");
      expect(mockSsrfValidate).toHaveBeenCalledTimes(3);
    });

    it("超过最大重定向次数应失败", async () => {
      mockSsrfValidate.mockResolvedValue({ safe: true });

      globalThis.fetch = vi.fn(async () => {
        // 永远返回 302
        return createResponse({
          status: 302,
          headers: { location: "https://example.com/loop" },
        });
      }) as unknown as typeof globalThis.fetch;

      const result = await downloadToFile(
        "https://example.com/loop-start",
        TEST_FILE,
        { maxRetries: 1 },
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Too many redirects");
      // ssrfGuard 应被调用 MAX_REDIRECTS + 1 次（初始 + 3 跳）
      // 实际：初始 1 次 + 每跳校验 = MAX_REDIRECTS + 1 = 4 次
      expect(mockSsrfValidate.mock.calls.length).toBeGreaterThanOrEqual(4);
    });

    it("3xx 重定向但没有 Location 头应失败", async () => {
      mockSsrfValidate.mockResolvedValue({ safe: true });

      globalThis.fetch = vi.fn(async () => {
        return createResponse({ status: 302 });
      }) as unknown as typeof globalThis.fetch;

      const result = await downloadToFile(
        "https://example.com/no-location",
        TEST_FILE,
        { maxRetries: 1 },
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Redirect 302 without Location header");
    });

    it("正常重定向链最终 200 应成功下载", async () => {
      mockSsrfValidate.mockResolvedValue({ safe: true });

      let callCount = 0;
      globalThis.fetch = vi.fn(async () => {
        callCount++;
        if (callCount === 1) {
          return createResponse({
            status: 302,
            headers: { location: "https://cdn.example.com/final.mp4" },
          });
        }
        // 最终响应
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(Buffer.from("final-video-content"));
            controller.close();
          },
        });
        return createResponse({
          status: 200,
          body: stream as unknown as BodyInit,
          headers: { "content-length": "19" },
        });
      }) as unknown as typeof globalThis.fetch;

      const result = await downloadToFile(
        "https://example.com/start",
        TEST_FILE,
        { maxRetries: 1 },
      );

      expect(result.success).toBe(true);
      expect(result.totalBytes).toBe(19);
      // ssrfGuard 应被调用 2 次：初始 + 1 跳
      expect(mockSsrfValidate).toHaveBeenCalledTimes(2);
      expect(mockSsrfValidate).toHaveBeenNthCalledWith(1, "https://example.com/start");
      expect(mockSsrfValidate).toHaveBeenNthCalledWith(2, "https://cdn.example.com/final.mp4");
    });

    it("相对路径重定向应正确解析", async () => {
      mockSsrfValidate.mockResolvedValue({ safe: true });

      let callCount = 0;
      globalThis.fetch = vi.fn(async () => {
        callCount++;
        if (callCount === 1) {
          // 相对路径重定向
          return createResponse({
            status: 302,
            headers: { location: "/videos/final.mp4" },
          });
        }
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(Buffer.from("data"));
            controller.close();
          },
        });
        return createResponse({
          status: 200,
          body: stream as unknown as BodyInit,
          headers: { "content-length": "4" },
        });
      }) as unknown as typeof globalThis.fetch;

      const result = await downloadToFile(
        "https://example.com/start",
        TEST_FILE,
        { maxRetries: 1 },
      );

      expect(result.success).toBe(true);
      // 第二跳校验的 URL 应是绝对路径
      expect(mockSsrfValidate).toHaveBeenNthCalledWith(2, "https://example.com/videos/final.mp4");
    });
  });

  // ── 路径校验与 SSRF 的协同 ────────────────────────────────────────
  describe("路径校验与 SSRF 协同", () => {
    it("路径不在 ALLOWED_ROOTS 下时应优先返回 PATH_NOT_ALLOWED（不调 SSRF）", async () => {
      const result = await downloadToFile(
        "https://example.com/video.mp4",
        path.join(__dirname, "evil.mp4"), // 不在 ALLOWED_ROOTS 下
        { maxRetries: 1 },
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("FILE_PATH_NOT_ALLOWED");
      // ssrfGuard 不应被调用（路径校验在 SSRF 之前）
      expect(mockSsrfValidate).not.toHaveBeenCalled();
    });

    it("路径合法但 URL 不安全时应返回 SSRF 错误", async () => {
      mockSsrfValidate.mockResolvedValue({
        safe: false,
        reason: "Private IP: 192.168.1.1",
      });
      globalThis.fetch = vi.fn() as unknown as typeof globalThis.fetch;

      const result = await downloadToFile(
        "http://192.168.1.1/internal.mp4",
        TEST_FILE,
        { maxRetries: 1 },
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("URL blocked by SSRF guard");
    });
  });
});
