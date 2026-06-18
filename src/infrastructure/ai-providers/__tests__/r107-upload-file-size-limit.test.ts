/**
 * R107: 上传文件 50MB 大小限制测试
 * 回归防护: 确保 uploadFile 在文件超过 50MB 时拒绝上传并返回包含
 *           实际大小和限制大小的错误消息，且不调用网络上传；
 *           小于等于 50MB 的文件应正常进入上传流程。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockApiCallWithRetry } = vi.hoisted(() => ({
  mockApiCallWithRetry: vi.fn(),
}));

vi.mock("../core", () => ({
  apiCallWithRetry: mockApiCallWithRetry,
}));

vi.mock("../api-cache", () => ({
  withCache: vi.fn(),
  clearCacheByPrefix: vi.fn(),
}));

vi.mock("../image-normalization", () => ({
  imageToBase64: vi.fn(),
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: { warn: vi.fn(), error: vi.fn() },
  extractErrorMessage: (e: unknown) =>
    e instanceof Error ? e.message : String(e),
}));

import { uploadFile } from "../utils";

/** 50MB 对应的字节数 */
const MAX_UPLOAD_FILE_BYTES = 50 * 1024 * 1024;

/**
 * 创建指定大小的 File 对象。
 * 使用 Object.defineProperty 覆盖 size 属性，避免实际分配大块内存。
 */
function createFileOfSize(size: number, name = "test.mp4"): File {
  const file = new File([new Blob(["x"])], name, { type: "video/mp4" });
  Object.defineProperty(file, "size", { value: size, configurable: true });
  return file;
}

/**
 * Mock FileReader，避免依赖 jsdom 的 FileReader 异步行为。
 * 使用微任务触发 onloadend，确保 await 能正确等待。
 */
class MockFileReader {
  onloadend: (() => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  result: string | ArrayBuffer | null =
    "data:application/octet-stream;base64,SGVsbG8=";
  readAsDataURL(_file: File): void {
    Promise.resolve().then(() => {
      this.onloadend?.();
    });
  }
}

describe("R107: 上传文件 50MB 大小限制", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("FileReader", MockFileReader);

    mockApiCallWithRetry.mockResolvedValue({
      success: true,
      data: { url: "/api/upload/test-file.mp4" },
    });
  });

  describe("小于 50MB 的文件应继续上传流程", () => {
    it("1MB 文件应调用 apiCallWithRetry 进行上传", async () => {
      const file = createFileOfSize(1 * 1024 * 1024, "small.mp4");

      const result = await uploadFile(file);

      expect(result.success).toBe(true);
      expect(mockApiCallWithRetry).toHaveBeenCalledTimes(1);
      expect(mockApiCallWithRetry).toHaveBeenCalledWith(
        "upload",
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("49.9MB 文件应继续上传流程", async () => {
      const file = createFileOfSize(
        Math.floor(49.9 * 1024 * 1024),
        "medium.mp4",
      );

      const result = await uploadFile(file);

      expect(result.success).toBe(true);
      expect(mockApiCallWithRetry).toHaveBeenCalledTimes(1);
    });
  });

  describe("大于 50MB 的文件应返回错误且不调用上传", () => {
    it("60MB 文件应返回 success: false", async () => {
      const file = createFileOfSize(60 * 1024 * 1024, "large.mp4");

      const result = await uploadFile(file);

      expect(result.success).toBe(false);
    });

    it("60MB 文件不应调用 apiCallWithRetry", async () => {
      const file = createFileOfSize(60 * 1024 * 1024, "large.mp4");

      await uploadFile(file);

      expect(mockApiCallWithRetry).not.toHaveBeenCalled();
    });

    it("100MB 文件也应被拦截", async () => {
      const file = createFileOfSize(100 * 1024 * 1024, "huge.mp4");

      const result = await uploadFile(file);

      expect(result.success).toBe(false);
      expect(mockApiCallWithRetry).not.toHaveBeenCalled();
    });
  });

  describe("错误消息应包含实际大小和限制大小", () => {
    it("60MB 文件的错误消息应包含实际大小 (60.0MB) 和限制大小 (50MB)", async () => {
      const file = createFileOfSize(60 * 1024 * 1024, "large.mp4");

      const result = await uploadFile(file);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("60.0");
        expect(result.error).toContain("50");
        expect(result.error).toMatch(/文件过大/);
      }
    });

    it("80MB 文件的错误消息应包含实际大小 (80.0MB)", async () => {
      const file = createFileOfSize(80 * 1024 * 1024, "big.mp4");

      const result = await uploadFile(file);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("80.0");
        expect(result.error).toContain("50");
      }
    });
  });

  describe("边界：恰好 50MB 应允许上传", () => {
    it("恰好 50MB (50 * 1024 * 1024 bytes) 应继续上传流程", async () => {
      const file = createFileOfSize(MAX_UPLOAD_FILE_BYTES, "boundary.mp4");

      const result = await uploadFile(file);

      expect(result.success).toBe(true);
      expect(mockApiCallWithRetry).toHaveBeenCalledTimes(1);
    });

    it("恰好 50MB 不应返回错误消息", async () => {
      const file = createFileOfSize(MAX_UPLOAD_FILE_BYTES, "boundary.mp4");

      const result = await uploadFile(file);

      expect(result.success).toBe(true);
    });

    it("50MB + 1 byte 应被拒绝", async () => {
      const file = createFileOfSize(MAX_UPLOAD_FILE_BYTES + 1, "over.mp4");

      const result = await uploadFile(file);

      expect(result.success).toBe(false);
      expect(mockApiCallWithRetry).not.toHaveBeenCalled();
    });
  });
});
