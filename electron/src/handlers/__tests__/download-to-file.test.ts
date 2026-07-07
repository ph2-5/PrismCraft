/**
 * download-to-file.ts handler 测试
 *
 * 验证方案 C 的核心下载逻辑：
 * 1. 路径校验（PATH_NOT_ALLOWED / 通过）
 * 2. 自动建父目录
 * 3. 成功下载（mock fetch + stream pipeline）
 * 4. HTTP 错误（4xx/5xx）
 * 5. 重试逻辑（前 N-1 次失败，最后成功）
 * 6. AbortError 不重试
 * 7. 清理半成品文件
 *
 * 不 mock app-paths，使用真实的 USER_DATA_ROOT 构造测试路径，
 * 避免 ALLOWED_ROOTS 在模块加载时被冻结成 mock 值的问题（同 file-routes.test.ts 模式）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import os from "os";
import { getUserDataRootDir } from "../../app-paths";

// mock ssrfGuard 避免 DNS 解析（测试用 example.com 无法解析）
vi.mock("../../security", () => ({
  ssrfGuard: {
    validate: vi.fn().mockResolvedValue({ safe: true }),
  },
}));

import { downloadToFile } from "../download-to-file";

// 使用真实的 USER_DATA_ROOT 构造测试路径
const USER_DATA_ROOT = getUserDataRootDir();
const TEST_DIR = path.join(USER_DATA_ROOT, "Cache", "Videos", "test-download");
const TEST_FILE = path.join(TEST_DIR, "test.mp4");

// 测试用的小视频内容（模拟）
const FAKE_VIDEO_CONTENT = Buffer.from("fake-video-content-for-testing");

describe("download-to-file", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(async () => {
    vi.clearAllMocks();
    // 清理测试目录
    try {
      await fsp.rm(TEST_DIR, { recursive: true, force: true });
    } catch {
      // 目录不存在，忽略
    }
    await fsp.mkdir(TEST_DIR, { recursive: true });
    // 保存原始 fetch
    originalFetch = globalThis.fetch;
  });

  afterEach(async () => {
    // 恢复 fetch
    globalThis.fetch = originalFetch;
    // 清理测试目录
    try {
      await fsp.rm(TEST_DIR, { recursive: true, force: true });
    } catch {
      // 忽略
    }
  });

  describe("路径校验", () => {
    it("路径不在 ALLOWED_ROOTS 下应返回 PATH_NOT_ALLOWED", async () => {
      const result = await downloadToFile(
        "https://example.com/video.mp4",
        path.join(os.homedir(), "evil-path", "test.mp4"),
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("FILE_PATH_NOT_ALLOWED");
    });

    it("路径在 USER_DATA_ROOT 下应通过校验", async () => {
      // mock fetch 返回成功响应
      globalThis.fetch = vi.fn(async () => {
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(FAKE_VIDEO_CONTENT);
            controller.close();
          },
        });
        return new Response(stream, {
          status: 200,
          headers: { "content-length": String(FAKE_VIDEO_CONTENT.length) },
        });
      }) as typeof globalThis.fetch;

      const result = await downloadToFile(
        "https://example.com/video.mp4",
        TEST_FILE,
        { maxRetries: 1 },
      );

      expect(result.success).toBe(true);
      expect(result.totalBytes).toBe(FAKE_VIDEO_CONTENT.length);
      // 验证文件确实写入
      const stat = await fsp.stat(TEST_FILE);
      expect(stat.size).toBe(FAKE_VIDEO_CONTENT.length);
    });
  });

  describe("自动建父目录", () => {
    it("父目录不存在时应自动创建", async () => {
      const nestedFile = path.join(TEST_DIR, "nested", "deep", "video.mp4");

      globalThis.fetch = vi.fn(async () => {
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(Buffer.from("data"));
            controller.close();
          },
        });
        return new Response(stream, {
          status: 200,
          headers: { "content-length": "4" },
        });
      }) as typeof globalThis.fetch;

      const result = await downloadToFile(
        "https://example.com/video.mp4",
        nestedFile,
        { maxRetries: 1 },
      );

      expect(result.success).toBe(true);
      expect(fs.existsSync(nestedFile)).toBe(true);
    });
  });

  describe("HTTP 错误", () => {
    it("HTTP 404 应失败并重试", async () => {
      let callCount = 0;
      globalThis.fetch = vi.fn(async () => {
        callCount++;
        return new Response("Not Found", { status: 404 });
      }) as typeof globalThis.fetch;

      const result = await downloadToFile(
        "https://example.com/notfound.mp4",
        TEST_FILE,
        { maxRetries: 3 },
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("HTTP 404");
      // 应该重试 3 次
      expect(callCount).toBe(3);
      // 不应留下半成品文件
      expect(fs.existsSync(TEST_FILE)).toBe(false);
    });

    it("HTTP 500 应失败并重试", async () => {
      let callCount = 0;
      globalThis.fetch = vi.fn(async () => {
        callCount++;
        return new Response("Server Error", { status: 500 });
      }) as typeof globalThis.fetch;

      const result = await downloadToFile(
        "https://example.com/error.mp4",
        TEST_FILE,
        { maxRetries: 2 },
      );

      expect(result.success).toBe(false);
      expect(callCount).toBe(2);
    });
  });

  describe("重试逻辑", () => {
    it("前 N-1 次失败、最后成功时应返回成功", async () => {
      let callCount = 0;
      globalThis.fetch = vi.fn(async () => {
        callCount++;
        if (callCount < 3) {
          return new Response("Fail", { status: 500 });
        }
        // 第 3 次成功
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(Buffer.from("success-data"));
            controller.close();
          },
        });
        return new Response(stream, {
          status: 200,
          headers: { "content-length": "12" },
        });
      }) as typeof globalThis.fetch;

      const result = await downloadToFile(
        "https://example.com/retry.mp4",
        TEST_FILE,
        { maxRetries: 3 },
      );

      expect(result.success).toBe(true);
      expect(result.totalBytes).toBe(12);
      expect(callCount).toBe(3);
      // 最终文件应存在
      const content = await fsp.readFile(TEST_FILE);
      expect(content.toString()).toBe("success-data");
    });

    it("AbortError 不应重试", async () => {
      let callCount = 0;
      globalThis.fetch = vi.fn(async () => {
        callCount++;
        const err = new Error("Aborted");
        err.name = "AbortError";
        throw err;
      }) as typeof globalThis.fetch;

      const result = await downloadToFile(
        "https://example.com/aborted.mp4",
        TEST_FILE,
        { maxRetries: 3 },
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Aborted");
      // AbortError 应立即停止，不重试
      expect(callCount).toBe(1);
    });
  });

  describe("清理半成品", () => {
    it("下载失败时应删除半成品文件", async () => {
      // 先创建一个已存在的文件，模拟半成品
      await fsp.writeFile(TEST_FILE, "partial-content");

      globalThis.fetch = vi.fn(async () => {
        return new Response("Not Found", { status: 404 });
      }) as typeof globalThis.fetch;

      await downloadToFile(
        "https://example.com/fail.mp4",
        TEST_FILE,
        { maxRetries: 1 },
      );

      // 半成品应被清理
      expect(fs.existsSync(TEST_FILE)).toBe(false);
    });
  });

  describe("进度回调", () => {
    it("应调用 onProgress 回调报告进度", async () => {
      const chunk1 = Buffer.from("chunk1-data-1234567890"); // 20 bytes
      const chunk2 = Buffer.from("chunk2-data-1234567890"); // 20 bytes
      const totalSize = chunk1.length + chunk2.length;

      globalThis.fetch = vi.fn(async () => {
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(chunk1);
            controller.enqueue(chunk2);
            controller.close();
          },
        });
        return new Response(stream, {
          status: 200,
          headers: { "content-length": String(totalSize) },
        });
      }) as typeof globalThis.fetch;

      const progressCalls: { loaded: number; total: number }[] = [];
      const result = await downloadToFile(
        "https://example.com/progress.mp4",
        TEST_FILE,
        { maxRetries: 1 },
        (loaded, total) => progressCalls.push({ loaded, total }),
      );

      expect(result.success).toBe(true);
      expect(progressCalls.length).toBeGreaterThanOrEqual(2);
      // 最后一次应是完成状态
      const last = progressCalls[progressCalls.length - 1];
      expect(last.loaded).toBe(totalSize);
      expect(last.total).toBe(totalSize);
    });
  });
});
