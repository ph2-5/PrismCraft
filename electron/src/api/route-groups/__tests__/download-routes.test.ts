/**
 * download-routes.ts 路由 handler 测试
 *
 * 验证：
 * 1. download/to-file 路由注册正确
 * 2. schema 校验
 * 3. handler 正确调用 downloadToFile 并包装返回值
 * 4. 错误处理
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── hoisted mocks ──────────────────────────────────────────────────────
const { mockDownloadToFile } = vi.hoisted(() => ({
  mockDownloadToFile: vi.fn(),
}));

vi.mock("../../../handlers/download-to-file", () => ({
  downloadToFile: mockDownloadToFile,
}));

vi.mock("../../logging", () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { downloadRoutes } from "../download-routes";

describe("download-routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("路由注册", () => {
    it("download/to-file 路由应存在且只支持 POST", () => {
      const route = downloadRoutes["download/to-file"];
      expect(route).toBeDefined();
      expect(route.methods).toEqual(["POST"]);
      expect(route.schema).toBeDefined();
    });
  });

  describe("download/to-file handler", () => {
    it("下载成功时应返回 success:true 和 totalBytes/duration", async () => {
      mockDownloadToFile.mockResolvedValue({
        success: true,
        totalBytes: 1024,
        duration: 500,
      });

      const route = downloadRoutes["download/to-file"];
      const result = (await route.handler("POST", {
        url: "https://example.com/video.mp4",
        filePath: "/cache/test.mp4",
      }, {} as never)) as { success: boolean; data?: { totalBytes: number; duration: number } };

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ totalBytes: 1024, duration: 500 });
      expect(mockDownloadToFile).toHaveBeenCalledWith(
        "https://example.com/video.mp4",
        "/cache/test.mp4",
        { timeout: undefined, maxRetries: undefined },
      );
    });

    it("下载失败时应返回 success:false 和 error", async () => {
      mockDownloadToFile.mockResolvedValue({
        success: false,
        totalBytes: 0,
        duration: 100,
        error: "HTTP 404: Not Found",
      });

      const route = downloadRoutes["download/to-file"];
      const result = (await route.handler("POST", {
        url: "https://example.com/notfound.mp4",
        filePath: "/cache/test.mp4",
      }, {} as never)) as { success: boolean; error?: string };

      expect(result.success).toBe(false);
      expect(result.error).toBe("HTTP 404: Not Found");
    });

    it("应透传 timeout 和 maxRetries 选项", async () => {
      mockDownloadToFile.mockResolvedValue({
        success: true,
        totalBytes: 100,
        duration: 50,
      });

      const route = downloadRoutes["download/to-file"];
      await route.handler("POST", {
        url: "https://example.com/video.mp4",
        filePath: "/cache/test.mp4",
        timeout: 60000,
        maxRetries: 5,
      }, {} as never);

      expect(mockDownloadToFile).toHaveBeenCalledWith(
        "https://example.com/video.mp4",
        "/cache/test.mp4",
        { timeout: 60000, maxRetries: 5 },
      );
    });

    it("handler 抛出异常时应返回 success:false", async () => {
      mockDownloadToFile.mockRejectedValue(new Error("Unexpected error"));

      const route = downloadRoutes["download/to-file"];
      const result = (await route.handler("POST", {
        url: "https://example.com/video.mp4",
        filePath: "/cache/test.mp4",
      }, {} as never)) as { success: boolean; error?: string };

      expect(result.success).toBe(false);
      expect(result.error).toBe("Unexpected error");
    });

    it("FILE_PATH_NOT_ALLOWED 错误应透传", async () => {
      mockDownloadToFile.mockResolvedValue({
        success: false,
        totalBytes: 0,
        duration: 0,
        error: "FILE_PATH_NOT_ALLOWED",
      });

      const route = downloadRoutes["download/to-file"];
      const result = (await route.handler("POST", {
        url: "https://example.com/video.mp4",
        filePath: "/etc/passwd",
      }, {} as never)) as { success: boolean; error?: string };

      expect(result.success).toBe(false);
      expect(result.error).toBe("FILE_PATH_NOT_ALLOWED");
    });
  });

  describe("schema 校验", () => {
    it("缺少 url 应被 schema 拒绝", () => {
      const route = downloadRoutes["download/to-file"];
      expect(route.schema).toBeDefined();
      // schema 是 Zod 对象，安全解析无效输入应返回失败
      const parsed = route.schema!.safeParse({ filePath: "/cache/test.mp4" });
      expect(parsed.success).toBe(false);
    });

    it("无效 url 应被 schema 拒绝", () => {
      const route = downloadRoutes["download/to-file"];
      const parsed = route.schema!.safeParse({
        url: "not-a-url",
        filePath: "/cache/test.mp4",
      });
      expect(parsed.success).toBe(false);
    });

    it("缺少 filePath 应被 schema 拒绝", () => {
      const route = downloadRoutes["download/to-file"];
      const parsed = route.schema!.safeParse({
        url: "https://example.com/video.mp4",
      });
      expect(parsed.success).toBe(false);
    });

    it("有效输入应通过 schema 校验", () => {
      const route = downloadRoutes["download/to-file"];
      const parsed = route.schema!.safeParse({
        url: "https://example.com/video.mp4",
        filePath: "/cache/test.mp4",
      });
      expect(parsed.success).toBe(true);
    });
  });
});
