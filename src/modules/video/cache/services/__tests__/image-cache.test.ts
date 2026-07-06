import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => {
  const imageCacheStorage = {
    getCachedImageFile: vi.fn(),
    getImageCacheStats: vi.fn(),
    cleanImageCacheBySizeLimit: vi.fn(),
    cacheImageFile: vi.fn(),
    removeCachedImageFile: vi.fn(),
    cleanExpiredImageCache: vi.fn(),
  };
  const fileHttp = {
    writeFile: vi.fn(),
    getFileInfo: vi.fn(),
    getCacheDirectory: vi.fn(),
    getDiskSpace: vi.fn(),
    fileExists: vi.fn(),
    deleteFile: vi.fn(),
  };
  const resilientFetch = vi.fn();
  return { imageCacheStorage, fileHttp, resilientFetch };
});

vi.mock("@/infrastructure/di", () => ({
  container: { imageCacheStorage: mocks.imageCacheStorage },
}));

vi.mock("@/shared/video-cache", () => ({
  resilientFetch: mocks.resilientFetch,
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: {
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  extractErrorMessage: vi.fn((e: unknown) => String(e)),
}));

vi.mock("@/shared/constants", () => ({
  t: vi.fn((key: string) => key),
  CACHE_RETRY_INTERVAL_MS: 1000,
}));

vi.mock("@/shared/file-http", () => mocks.fileHttp);

import { cacheImageBlob } from "../image-cache";
import { getCachedImagePath } from "../image-cache";
import { getImageUrlWithCache } from "../image-cache";
import { removeCachedImage } from "../image-cache";
import { cleanExpiredImageCache } from "../image-cache";
import { getImageCacheStats } from "../image-cache";
import { recoverUncachedImages } from "../image-cache";
import { errorLogger } from "@/shared/error-logger";

function setupSuccessFileHttp(overrides?: Partial<typeof mocks.fileHttp>) {
  mocks.fileHttp.getCacheDirectory.mockResolvedValue({ success: true, path: "/cache" });
  mocks.fileHttp.getDiskSpace.mockResolvedValue({
    success: true,
    availableBytes: 100 * 1024 * 1024,
    totalBytes: 500 * 1024 * 1024,
  });
  mocks.fileHttp.writeFile.mockResolvedValue({ success: true });
  mocks.fileHttp.getFileInfo.mockResolvedValue({ success: true, size: 4 });
  mocks.fileHttp.fileExists.mockResolvedValue(true);
  mocks.fileHttp.deleteFile.mockResolvedValue({ success: true });
  if (overrides) {
    for (const [k, v] of Object.entries(overrides)) {
      (mocks.fileHttp as Record<string, unknown>)[k] = v;
    }
  }
}

describe("image-cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mocks.resilientFetch.mockReset();
    mocks.imageCacheStorage.getCachedImageFile.mockResolvedValue(null);
    mocks.imageCacheStorage.getImageCacheStats.mockResolvedValue({ count: 0, totalSize: 0 });
    mocks.imageCacheStorage.cleanImageCacheBySizeLimit.mockResolvedValue(undefined);
    mocks.imageCacheStorage.cacheImageFile.mockResolvedValue(undefined);
    mocks.imageCacheStorage.removeCachedImageFile.mockResolvedValue(undefined);
    mocks.imageCacheStorage.cleanExpiredImageCache.mockResolvedValue([]);
    setupSuccessFileHttp();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("cacheImageBlob", () => {
    it("已有缓存时直接返回 filePath", async () => {
      mocks.imageCacheStorage.getCachedImageFile.mockResolvedValue({
        filePath: "/cache/images/abc.png",
        mimeType: "image/png",
        cachedAt: Date.now(),
        fileSize: 1024,
      });

      const result = await cacheImageBlob("https://example.com/image.png");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe("/cache/images/abc.png");
      }
      expect(mocks.resilientFetch).not.toHaveBeenCalled();
    });

    it("缓存数量超限时调用 cleanImageCacheBySizeLimit", async () => {
      mocks.imageCacheStorage.getImageCacheStats.mockResolvedValue({
        count: 600,
        totalSize: 0,
      });
      mocks.resilientFetch.mockImplementation(async ({ destination }: { destination: (d: Uint8Array) => Promise<void> }) => {
        await destination(new Uint8Array([1, 2, 3, 4]));
        return { success: true, totalBytes: 4 };
      });

      const promise = cacheImageBlob("https://example.com/img.png");
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(mocks.imageCacheStorage.cleanImageCacheBySizeLimit).toHaveBeenCalledTimes(1);
      const arg = mocks.imageCacheStorage.cleanImageCacheBySizeLimit.mock.calls[0]![0];
      expect(arg).toBeGreaterThan(0);
      expect(result.ok).toBe(true);
    });

    it("缓存总大小超限时调用 cleanImageCacheBySizeLimit", async () => {
      mocks.imageCacheStorage.getImageCacheStats.mockResolvedValue({
        count: 100,
        totalSize: 512 * 1024 * 1024,
      });
      mocks.resilientFetch.mockImplementation(async ({ destination }: { destination: (d: Uint8Array) => Promise<void> }) => {
        await destination(new Uint8Array([1, 2, 3, 4]));
        return { success: true, totalBytes: 4 };
      });

      const promise = cacheImageBlob("https://example.com/img.png");
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(mocks.imageCacheStorage.cleanImageCacheBySizeLimit).toHaveBeenCalledTimes(1);
      expect(result.ok).toBe(true);
    });

    it("磁盘空间不足时返回 err", async () => {
      mocks.fileHttp.getDiskSpace.mockResolvedValue({
        success: true,
        availableBytes: 100 * 1024,
        totalBytes: 500 * 1024 * 1024,
      });

      const promise = cacheImageBlob("https://example.com/img.png");
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain("缓存图片失败");
      }
      expect(errorLogger.warn).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ message: expect.stringContaining("error.diskFull") }),
      );
    });

    it("第一次下载 HTTP 403 失败时重试一次", async () => {
      mocks.resilientFetch
        .mockRejectedValueOnce(new Error("HTTP 403: Forbidden"))
        .mockImplementationOnce(async ({ destination }: { destination: (d: Uint8Array) => Promise<void> }) => {
          await destination(new Uint8Array([1, 2, 3, 4]));
          return { success: true, totalBytes: 4 };
        });

      const promise = cacheImageBlob("https://example.com/expired.png");
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(mocks.resilientFetch).toHaveBeenCalledTimes(2);
      expect(errorLogger.warn).toHaveBeenCalledWith(
        "[ImageCache] URL过期，重试中...",
        expect.any(Error),
      );
      expect(result.ok).toBe(true);
    });

    it("第二次仍失败时返回 err '缓存图片失败'", async () => {
      mocks.resilientFetch.mockRejectedValue(new Error("HTTP 403: Forbidden"));

      const promise = cacheImageBlob("https://example.com/expired.png");
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain("缓存图片失败");
        expect(result.error.message).toContain("https://example.com/expired.png");
      }
    });

    it("下载成功但 writeFile 失败时返回 err", async () => {
      mocks.resilientFetch.mockImplementation(async ({ destination }: { destination: (d: Uint8Array) => Promise<void> }) => {
        await destination(new Uint8Array([1, 2, 3, 4]));
        return { success: true, totalBytes: 4 };
      });
      mocks.fileHttp.writeFile.mockResolvedValue({ success: false, error: "disk write fail" });

      const promise = cacheImageBlob("https://example.com/img.png");
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain("缓存图片失败");
      }
    });

    it("下载成功但文件大小不匹配时删除文件并返回 err", async () => {
      mocks.resilientFetch.mockImplementation(async ({ destination }: { destination: (d: Uint8Array) => Promise<void> }) => {
        await destination(new Uint8Array([1, 2, 3, 4]));
        return { success: true, totalBytes: 100 };
      });
      mocks.fileHttp.getFileInfo.mockResolvedValue({ success: true, size: 4 });

      const promise = cacheImageBlob("https://example.com/img.png");
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(mocks.fileHttp.deleteFile).toHaveBeenCalledWith(expect.stringContaining("/images/"));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain("缓存图片失败");
      }
      expect(errorLogger.warn).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ message: expect.stringContaining("下载不完整") }),
      );
    });

    it("DB 记录失败时清理已写入文件并返回 err", async () => {
      mocks.resilientFetch.mockImplementation(async ({ destination }: { destination: (d: Uint8Array) => Promise<void> }) => {
        await destination(new Uint8Array([1, 2, 3, 4]));
        return { success: true, totalBytes: 4 };
      });
      const dbError = new Error("DB write failed");
      mocks.imageCacheStorage.cacheImageFile.mockRejectedValue(dbError);
      mocks.fileHttp.fileExists.mockResolvedValue(true);

      const promise = cacheImageBlob("https://example.com/img.png");
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(mocks.fileHttp.fileExists).toHaveBeenCalledWith(expect.stringContaining("/images/"));
      expect(mocks.fileHttp.deleteFile).toHaveBeenCalledWith(expect.stringContaining("/images/"));
      expect(errorLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("数据库记录失败"),
        dbError,
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain("缓存图片失败");
      }
    });

    it("成功路径返回 filePath", async () => {
      mocks.resilientFetch.mockImplementation(async ({ destination }: { destination: (d: Uint8Array) => Promise<void> }) => {
        await destination(new Uint8Array([1, 2, 3, 4]));
        return { success: true, totalBytes: 4 };
      });

      const promise = cacheImageBlob("https://example.com/img.png");
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toContain("/cache/images/");
        expect(result.value).toMatch(/\.(png|jpg|webp|gif)$/);
      }
      expect(mocks.imageCacheStorage.cacheImageFile).toHaveBeenCalledWith({
        sourceUrl: "https://example.com/img.png",
        filePath: expect.stringContaining("/images/"),
        mimeType: expect.any(String),
        fileSize: 4,
      });
    });

    it("URL 含 query string 时缓存 key 去除 query", async () => {
      mocks.resilientFetch.mockImplementation(async ({ destination }: { destination: (d: Uint8Array) => Promise<void> }) => {
        await destination(new Uint8Array([1, 2, 3, 4]));
        return { success: true, totalBytes: 4 };
      });

      const promise = cacheImageBlob("https://example.com/img.png?token=abc&sig=123");
      await vi.runAllTimersAsync();
      await promise;

      expect(mocks.imageCacheStorage.cacheImageFile).toHaveBeenCalledWith({
        sourceUrl: "https://example.com/img.png",
        filePath: expect.any(String),
        mimeType: expect.any(String),
        fileSize: 4,
      });
    });

    it("URL 含 .png 后缀时 mimeType 为 image/png", async () => {
      mocks.resilientFetch.mockImplementation(async ({ destination }: { destination: (d: Uint8Array) => Promise<void> }) => {
        await destination(new Uint8Array([1, 2, 3, 4]));
        return { success: true, totalBytes: 4 };
      });

      const promise = cacheImageBlob("https://example.com/img.png");
      await vi.runAllTimersAsync();
      await promise;

      expect(mocks.imageCacheStorage.cacheImageFile).toHaveBeenCalledWith({
        sourceUrl: "https://example.com/img.png",
        filePath: expect.stringContaining(".png"),
        mimeType: "image/png",
        fileSize: 4,
      });
    });

    it("非 HTTP 403 错误也会重试一次（CACHE_RETRY_COUNT=2）", async () => {
      mocks.resilientFetch
        .mockRejectedValueOnce(new Error("Network error"))
        .mockImplementationOnce(async ({ destination }: { destination: (d: Uint8Array) => Promise<void> }) => {
          await destination(new Uint8Array([1, 2, 3, 4]));
          return { success: true, totalBytes: 4 };
        });

      const promise = cacheImageBlob("https://example.com/img.png");
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(mocks.resilientFetch).toHaveBeenCalledTimes(2);
      expect(result.ok).toBe(true);
    });

    it("getCacheDirectory 失败时返回 err", async () => {
      mocks.fileHttp.getCacheDirectory.mockResolvedValue({ success: false, error: "no cache dir" });

      const promise = cacheImageBlob("https://example.com/img.png");
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain("缓存图片失败");
      }
    });
  });

  describe("getCachedImagePath", () => {
    it("无缓存时返回 null", async () => {
      mocks.imageCacheStorage.getCachedImageFile.mockResolvedValue(null);

      const result = await getCachedImagePath("https://example.com/img.png");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeNull();
      }
    });

    it("有缓存但文件不存在时返回 null", async () => {
      mocks.imageCacheStorage.getCachedImageFile.mockResolvedValue({
        filePath: "/cache/images/abc.png",
      });
      mocks.fileHttp.fileExists.mockResolvedValue(false);

      const result = await getCachedImagePath("https://example.com/img.png");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeNull();
      }
    });

    it("有缓存且文件存在时返回 filePath", async () => {
      mocks.imageCacheStorage.getCachedImageFile.mockResolvedValue({
        filePath: "/cache/images/abc.png",
      });
      mocks.fileHttp.fileExists.mockResolvedValue(true);

      const result = await getCachedImagePath("https://example.com/img.png");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe("/cache/images/abc.png");
      }
    });
  });

  describe("getImageUrlWithCache", () => {
    it("blob: 开头的 URL 直接返回原 url, fromCache=false", async () => {
      const result = await getImageUrlWithCache("blob:https://example.com/abc");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.url).toBe("blob:https://example.com/abc");
        expect(result.value.fromCache).toBe(false);
      }
    });

    it("data: 开头的 URL 直接返回原 url, fromCache=false", async () => {
      const result = await getImageUrlWithCache("data:image/png;base64,abc");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.url).toBe("data:image/png;base64,abc");
        expect(result.value.fromCache).toBe(false);
      }
    });

    it("file:// 开头的 URL 直接返回原 url, fromCache=false", async () => {
      const result = await getImageUrlWithCache("file:///cache/images/abc.png");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.url).toBe("file:///cache/images/abc.png");
        expect(result.value.fromCache).toBe(false);
      }
    });

    it("已缓存时返回 file:// url, fromCache=true", async () => {
      mocks.imageCacheStorage.getCachedImageFile.mockResolvedValue({
        filePath: "/cache/images/abc.png",
      });
      mocks.fileHttp.fileExists.mockResolvedValue(true);

      const result = await getImageUrlWithCache("https://example.com/img.png");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.url).toBe("file:///cache/images/abc.png");
        expect(result.value.fromCache).toBe(true);
      }
    });

    it("未缓存但缓存成功时返回 file:// url, fromCache=true", async () => {
      mocks.imageCacheStorage.getCachedImageFile.mockResolvedValue(null);
      mocks.resilientFetch.mockImplementation(async ({ destination }: { destination: (d: Uint8Array) => Promise<void> }) => {
        await destination(new Uint8Array([1, 2, 3, 4]));
        return { success: true, totalBytes: 4 };
      });

      const promise = getImageUrlWithCache("https://example.com/img.png");
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.url).toMatch(/^file:\/\//);
        expect(result.value.fromCache).toBe(true);
      }
    });

    it("未缓存且缓存失败时返回原 url, fromCache=false", async () => {
      mocks.imageCacheStorage.getCachedImageFile.mockResolvedValue(null);
      mocks.resilientFetch.mockRejectedValue(new Error("Network error"));

      const promise = getImageUrlWithCache("https://example.com/img.png");
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.url).toBe("https://example.com/img.png");
        expect(result.value.fromCache).toBe(false);
      }
    });

    it("Windows 路径反斜杠被替换为正斜杠", async () => {
      mocks.imageCacheStorage.getCachedImageFile.mockResolvedValue({
        filePath: "C:\\cache\\images\\abc.png",
      });
      mocks.fileHttp.fileExists.mockResolvedValue(true);

      const result = await getImageUrlWithCache("https://example.com/img.png");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.url).toBe("file://C:/cache/images/abc.png");
      }
    });
  });

  describe("removeCachedImage", () => {
    it("调用 storage.removeCachedImageFile 并传入 cacheKey", async () => {
      mocks.imageCacheStorage.removeCachedImageFile.mockResolvedValue(undefined);

      const result = await removeCachedImage("https://example.com/img.png?token=1");

      expect(result.ok).toBe(true);
      expect(mocks.imageCacheStorage.removeCachedImageFile).toHaveBeenCalledWith("https://example.com/img.png");
    });
  });

  describe("cleanExpiredImageCache", () => {
    it("正常清理多个文件并返回数量", async () => {
      mocks.imageCacheStorage.cleanExpiredImageCache.mockResolvedValue([
        "/cache/images/old1.png",
        "/cache/images/old2.png",
        "/cache/images/old3.png",
      ]);
      mocks.fileHttp.fileExists.mockResolvedValue(true);
      mocks.fileHttp.deleteFile.mockResolvedValue({ success: true });

      const result = await cleanExpiredImageCache(30 * 24 * 60 * 60 * 1000);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(3);
      }
      expect(mocks.fileHttp.deleteFile).toHaveBeenCalledTimes(3);
    });

    it("部分文件删除失败时 warn 但继续", async () => {
      mocks.imageCacheStorage.cleanExpiredImageCache.mockResolvedValue([
        "/cache/images/ok.png",
        "/cache/images/bad.png",
      ]);
      mocks.fileHttp.fileExists.mockResolvedValue(true);
      mocks.fileHttp.deleteFile
        .mockResolvedValueOnce({ success: true })
        .mockRejectedValueOnce(new Error("delete fail"));

      const result = await cleanExpiredImageCache(1000);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(2);
      }
      expect(errorLogger.warn).toHaveBeenCalledWith(
        "[ImageCache] 删除过期缓存文件失败",
        expect.any(Error),
      );
    });

    it("文件不存在时跳过删除但仍计入数量", async () => {
      mocks.imageCacheStorage.cleanExpiredImageCache.mockResolvedValue([
        "/cache/images/missing.png",
      ]);
      mocks.fileHttp.fileExists.mockResolvedValue(false);

      const result = await cleanExpiredImageCache(1000);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(1);
      }
      expect(mocks.fileHttp.deleteFile).not.toHaveBeenCalled();
    });

    it("使用默认 maxAgeMs 参数", async () => {
      mocks.imageCacheStorage.cleanExpiredImageCache.mockResolvedValue([]);

      await cleanExpiredImageCache();

      expect(mocks.imageCacheStorage.cleanExpiredImageCache).toHaveBeenCalledWith(30 * 24 * 60 * 60 * 1000);
    });
  });

  describe("getImageCacheStats", () => {
    it("返回 count/totalSizeMB/maxCount/maxSizeMB", async () => {
      mocks.imageCacheStorage.getImageCacheStats.mockResolvedValue({
        count: 42,
        totalSize: 100 * 1024 * 1024,
      });

      const result = await getImageCacheStats();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.count).toBe(42);
        expect(result.value.totalSizeMB).toBeCloseTo(100, 0);
        expect(result.value.maxCount).toBe(500);
        expect(result.value.maxSizeMB).toBe(512);
      }
    });
  });

  describe("recoverUncachedImages", () => {
    it("blob:/data:/file:// URL 跳过", async () => {
      const result = await recoverUncachedImages([
        "blob:https://example.com/1",
        "data:image/png;base64,abc",
        "file:///cache/1.png",
      ]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(0);
      }
      expect(mocks.resilientFetch).not.toHaveBeenCalled();
    });

    it("已缓存 URL 跳过", async () => {
      mocks.imageCacheStorage.getCachedImageFile.mockResolvedValue({
        filePath: "/cache/images/abc.png",
      });
      mocks.fileHttp.fileExists.mockResolvedValue(true);

      const result = await recoverUncachedImages(["https://example.com/cached.png"]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(0);
      }
      expect(mocks.resilientFetch).not.toHaveBeenCalled();
    });

    it("未缓存 URL 成功缓存时 recovered++", async () => {
      mocks.imageCacheStorage.getCachedImageFile.mockResolvedValue(null);
      mocks.resilientFetch.mockImplementation(async ({ destination }: { destination: (d: Uint8Array) => Promise<void> }) => {
        await destination(new Uint8Array([1, 2, 3, 4]));
        return { success: true, totalBytes: 4 };
      });

      const promise = recoverUncachedImages([
        "https://example.com/1.png",
        "https://example.com/2.png",
      ]);
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(2);
      }
    });

    it("部分失败不影响其他 URL", async () => {
      mocks.imageCacheStorage.getCachedImageFile.mockResolvedValue(null);
      mocks.resilientFetch
        .mockRejectedValueOnce(new Error("Network error"))
        .mockImplementationOnce(async ({ destination }: { destination: (d: Uint8Array) => Promise<void> }) => {
          await destination(new Uint8Array([1, 2, 3, 4]));
          return { success: true, totalBytes: 4 };
        })
        .mockImplementationOnce(async ({ destination }: { destination: (d: Uint8Array) => Promise<void> }) => {
          await destination(new Uint8Array([1, 2, 3, 4]));
          return { success: true, totalBytes: 4 };
        });

      const promise = recoverUncachedImages([
        "https://example.com/fail.png",
        "https://example.com/ok1.png",
        "https://example.com/ok2.png",
      ]);
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(2);
      }
    });

    it("空数组返回 0", async () => {
      const result = await recoverUncachedImages([]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(0);
      }
    });
  });
});
