import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  cacheVideoBlob,
  getCachedVideoUrl,
  getVideoUrlWithCache,
  removeCachedVideo,
  cleanExpiredVideoCache,
  getCacheStats,
  revokeObjectURL,
  touchMemoryCache,
  clearMemoryCache,
  checkCachedVideo,
  getVideoFileStream,
  getCachedVideo,
} from "@/modules/video";

vi.mock("@/infrastructure/di", () => {
  const mockVideoCacheStorage = {
    getCachedVideoFile: vi.fn(),
    cacheVideoFile: vi.fn(),
    removeCachedVideoFile: vi.fn(),
    getVideoCacheStats: vi.fn(),
    cleanExpiredVideoCache: vi.fn(),
    cleanVideoCacheBySizeLimit: vi.fn(),
    getTotalVideoCacheSize: vi.fn(),
  };
  return {
    container: {
      videoCacheStorage: mockVideoCacheStorage,
      videoTaskStorage: {
        getVideoTasksByStatus: vi.fn(),
        getVideoTaskById: vi.fn().mockResolvedValue(null),
      },
    },
  };
});

vi.mock("@/shared/video-cache", () => ({
  registerObjectUrl: vi.fn(),
  revokeObjectUrl: vi.fn(),
  getObjectUrl: vi.fn(),
  resilientFetch: vi.fn(),
}));

vi.mock("@/shared/utils/platform", () => ({
  isElectron: vi.fn(() => false),
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: {
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  extractErrorMessage: vi.fn((e: unknown) => String(e)),
}));

vi.mock("@/modules/video/recovery", () => ({
  recoverVideoByTaskId: vi.fn(),
}));

// Mock @/shared/file-http 统一通信层，委托到测试设置的 electronAPI mock
// 避免真实 HTTP 探测命中本地服务器导致 IPC fallback 不触发
vi.mock("@/shared/file-http", () => ({
  writeFile: vi.fn(async (filePath: string, data: unknown) => {
    const api = (window as unknown as { electronAPI?: { writeFile?: (p: string, d: ArrayBuffer) => Promise<{ success: boolean; error?: string }> } }).electronAPI;
    if (!api?.writeFile) return { success: false, error: "No electronAPI" };
    const buffer = data instanceof ArrayBuffer ? data : new TextEncoder().encode(String(data)).buffer as ArrayBuffer;
    return api.writeFile(filePath, buffer);
  }),
  readFile: vi.fn(async (filePath: string) => {
    const api = (window as unknown as { electronAPI?: { readFile?: (p: string) => Promise<{ success: boolean; data?: ArrayBuffer; error?: string }> } }).electronAPI;
    if (!api?.readFile) return null;
    return api.readFile(filePath);
  }),
  getFileInfo: vi.fn(async (filePath: string) => {
    const api = (window as unknown as { electronAPI?: { getFileInfo?: (p: string) => Promise<{ success: boolean; size?: number; error?: string } | null> } }).electronAPI;
    if (!api?.getFileInfo) return null;
    return api.getFileInfo(filePath);
  }),
  getCacheDirectory: vi.fn(async () => {
    const api = (window as unknown as { electronAPI?: { getCacheDirectory?: () => Promise<{ success: boolean; path?: string; error?: string }> } }).electronAPI;
    if (!api?.getCacheDirectory) return { success: false, error: "No electronAPI" };
    return api.getCacheDirectory();
  }),
  getDiskSpace: vi.fn(async (dirPath: string) => {
    const api = (window as unknown as { electronAPI?: { getDiskSpace?: (p: string) => Promise<{ success: boolean; availableBytes?: number; totalBytes?: number; error?: string } | null> } }).electronAPI;
    if (!api?.getDiskSpace) return null;
    return api.getDiskSpace(dirPath);
  }),
  fileExists: vi.fn(async (filePath: string) => {
    const api = (window as unknown as { electronAPI?: { fileExists?: (p: string) => Promise<boolean | { exists?: boolean }> } }).electronAPI;
    if (!api?.fileExists) return false;
    const result = await api.fileExists(filePath);
    return typeof result === "boolean" ? result : !!result?.exists;
  }),
  deleteFile: vi.fn(async (filePath: string) => {
    const api = (window as unknown as { electronAPI?: { deleteFile?: (p: string) => Promise<boolean | { success?: boolean }> } }).electronAPI;
    if (!api?.deleteFile) return false;
    const result = await api.deleteFile(filePath);
    return typeof result === "boolean" ? result : !!result?.success;
  }),
}));

import { container } from "@/infrastructure/di";
import { resilientFetch } from "@/shared/video-cache";
import { isElectron } from "@/shared/utils/platform";
import { recoverVideoByTaskId } from "@/modules/video/recovery";

function setupElectronAPIMock(overrides?: Record<string, unknown>) {
  (window as unknown as { electronAPI: Record<string, unknown> }).electronAPI = {
    getCacheDirectory: vi.fn().mockResolvedValue({ success: true, path: "/cache" }),
    getDiskSpace: vi.fn().mockResolvedValue({ success: true, availableBytes: 1024 * 1024 * 1024, totalBytes: 1024 * 1024 * 1024 * 10 }),
    getFileInfo: vi.fn().mockResolvedValue({ success: true, size: 1024 }),
    writeFile: vi.fn().mockResolvedValue({ success: true }),
    fileExists: vi.fn().mockResolvedValue({ success: true, exists: true }),
    deleteFile: vi.fn().mockResolvedValue({ success: true }),
    readFile: vi.fn().mockResolvedValue({ success: true, data: new ArrayBuffer(1024) }),
    ...overrides,
  };
}

describe("video-cache-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (isElectron as ReturnType<typeof vi.fn>).mockReturnValue(false);
    clearMemoryCache();
    if (!URL.createObjectURL) {
      (globalThis.URL as unknown as Record<string, unknown>).createObjectURL = vi.fn(() => "blob:https://example.com/mock");
    }
    if (!URL.revokeObjectURL) {
      (globalThis.URL as unknown as Record<string, unknown>).revokeObjectURL = vi.fn();
    }
    (resilientFetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Download failed"));
    (recoverVideoByTaskId as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, error: new Error("Recovery failed") });
  });

  describe("revokeObjectURL", () => {
    it("should revoke a blob URL", () => {
      const revokeSpy = vi.spyOn(URL, "revokeObjectURL");
      revokeObjectURL("blob:https://example.com/test");
      expect(revokeSpy).toHaveBeenCalledWith("blob:https://example.com/test");
      revokeSpy.mockRestore();
    });

    it("should not revoke a non-blob URL", () => {
      const revokeSpy = vi.spyOn(URL, "revokeObjectURL");
      revokeObjectURL("https://example.com/video.mp4");
      expect(revokeSpy).not.toHaveBeenCalled();
      revokeSpy.mockRestore();
    });

    it("should handle empty string", () => {
      const revokeSpy = vi.spyOn(URL, "revokeObjectURL");
      revokeObjectURL("");
      expect(revokeSpy).not.toHaveBeenCalled();
      revokeSpy.mockRestore();
    });
  });

  describe("touchMemoryCache", () => {
    it("should not throw for non-existent key", () => {
      expect(() => touchMemoryCache("nonexistent")).not.toThrow();
    });
  });

  describe("clearMemoryCache", () => {
    it("should clear memory cache without error", () => {
      clearMemoryCache();
      expect(() => clearMemoryCache()).not.toThrow();
    });
  });

  describe("cacheVideoBlob (non-Electron)", () => {
    it("should return false when download fails", async () => {
      setupElectronAPIMock();
      (container.videoCacheStorage.getCachedVideoFile as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (container.videoCacheStorage.getVideoCacheStats as ReturnType<typeof vi.fn>).mockResolvedValue({
        count: 0,
        totalSize: 0,
      });
      (resilientFetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Network error"));

      const result = await cacheVideoBlob("task-1", "https://example.com/video.mp4");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(false);
      }
    }, 30000);

    it("should return false when resilientFetch returns unsuccessful result", async () => {
      setupElectronAPIMock();
      (container.videoCacheStorage.getCachedVideoFile as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (container.videoCacheStorage.getVideoCacheStats as ReturnType<typeof vi.fn>).mockResolvedValue({
        count: 0,
        totalSize: 0,
      });
      (resilientFetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: false,
        totalBytes: 0,
        duration: 100,
        fromCache: false,
      });

      const result = await cacheVideoBlob("task-2", "https://example.com/notfound.mp4");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(false);
      }
    }, 30000);

    it("should return ok with false when caching fails", async () => {
      setupElectronAPIMock();
      (container.videoCacheStorage.getCachedVideoFile as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (container.videoCacheStorage.getVideoCacheStats as ReturnType<typeof vi.fn>).mockResolvedValue({
        count: 0,
        totalSize: 0,
      });
      (resilientFetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Network error"));

      const result = await cacheVideoBlob("task-3", "https://example.com/error.mp4");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(false);
      }
    }, 30000);
  });

  describe("getCachedVideoUrl (non-Electron)", () => {
    it("should return null when no cached video exists", async () => {
      (isElectron as ReturnType<typeof vi.fn>).mockReturnValue(false);
      clearMemoryCache();

      const result = await getCachedVideoUrl("nonexistent");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeNull();
      }
    });

    it("should return vcache URL when video is cached in storage", async () => {
      (isElectron as ReturnType<typeof vi.fn>).mockReturnValue(false);
      (container.videoCacheStorage.getCachedVideoFile as ReturnType<typeof vi.fn>).mockResolvedValue({
        filePath: "/cache/task-1.mp4",
        mimeType: "video/mp4",
        cachedAt: Date.now(),
        fileSize: 1024,
      });

      const result = await getCachedVideoUrl("task-1");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe("vcache://task-1");
      }
    });
  });

  describe("getCachedVideoUrl (Electron)", () => {
    it("should return vcache URL when video is cached on disk", async () => {
      (isElectron as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (container.videoCacheStorage.getCachedVideoFile as ReturnType<typeof vi.fn>).mockResolvedValue({
        filePath: "/cache/task-1.mp4",
        mimeType: "video/mp4",
        cachedAt: Date.now(),
        fileSize: 1024,
      });

      const result = await getCachedVideoUrl("task-1");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe("vcache://task-1");
      }
    });

    it("should return null when no cached video on disk", async () => {
      (isElectron as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (container.videoCacheStorage.getCachedVideoFile as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await getCachedVideoUrl("nonexistent");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeNull();
      }
    });
  });

  describe("getVideoUrlWithCache", () => {
    it("should return cached URL when available", async () => {
      (isElectron as ReturnType<typeof vi.fn>).mockReturnValue(false);
      (container.videoCacheStorage.getCachedVideoFile as ReturnType<typeof vi.fn>).mockResolvedValue({
        filePath: "/cache/task-1.mp4",
        mimeType: "video/mp4",
        cachedAt: Date.now(),
        fileSize: 1024,
      });

      const result = await getVideoUrlWithCache("task-1");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.fromCache).toBe(true);
        expect(result.value.url).toBe("vcache://task-1");
      }
    });

    it("should return null URL when no cache and no remote URL", async () => {
      (isElectron as ReturnType<typeof vi.fn>).mockReturnValue(false);
      (container.videoCacheStorage.getCachedVideoFile as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      clearMemoryCache();
      const result = await getVideoUrlWithCache("nonexistent");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.url).toBeNull();
        expect(result.value.fromCache).toBe(false);
      }
    });

    it("should fall back to remote URL when cache fails", async () => {
      setupElectronAPIMock();
      (isElectron as ReturnType<typeof vi.fn>).mockReturnValue(false);
      clearMemoryCache();
      (container.videoCacheStorage.getCachedVideoFile as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (container.videoCacheStorage.getVideoCacheStats as ReturnType<typeof vi.fn>).mockResolvedValue({
        count: 0,
        totalSize: 0,
      });
      (resilientFetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Network error"));

      const result = await getVideoUrlWithCache("nonexistent", "https://example.com/remote.mp4");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.fromCache).toBe(false);
        expect(result.value.cacheFailed).toBe(true);
        expect(result.value.url).toBe("https://example.com/remote.mp4");
      }
    }, 30000);
  });

  describe("removeCachedVideo", () => {
    it("should remove cached video file on Electron", async () => {
      (isElectron as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (container.videoCacheStorage.removeCachedVideoFile as ReturnType<typeof vi.fn>).mockResolvedValue("/cache/task-1.mp4");

      const result = await removeCachedVideo("task-1");
      expect(result.ok).toBe(true);
      expect(container.videoCacheStorage.removeCachedVideoFile).toHaveBeenCalledWith("task-1");
    });

    it("should handle null file path", async () => {
      (isElectron as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (container.videoCacheStorage.removeCachedVideoFile as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await removeCachedVideo("nonexistent");
      expect(result.ok).toBe(true);
    });
  });

  describe("cleanExpiredVideoCache", () => {
    it("should clean expired cache and return count", async () => {
      (isElectron as ReturnType<typeof vi.fn>).mockReturnValue(false);
      (container.videoCacheStorage.cleanExpiredVideoCache as ReturnType<typeof vi.fn>).mockResolvedValue([
        "/cache/old-1.mp4",
        "/cache/old-2.mp4",
      ]);

      const result = await cleanExpiredVideoCache();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(2);
      }
    });

    it("should return 0 when no expired cache", async () => {
      (isElectron as ReturnType<typeof vi.fn>).mockReturnValue(false);
      (container.videoCacheStorage.cleanExpiredVideoCache as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await cleanExpiredVideoCache();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(0);
      }
    });
  });

  describe("getCacheStats", () => {
    it("should return cache statistics", async () => {
      (container.videoCacheStorage.getVideoCacheStats as ReturnType<typeof vi.fn>).mockResolvedValue({
        count: 5,
        totalSize: 1024 * 1024 * 100,
      });

      const result = await getCacheStats();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.count).toBe(5);
        expect(result.value.totalSizeMB).toBeCloseTo(100, 0);
        expect(result.value.maxCount).toBe(500);
        expect(result.value.maxSizeMB).toBe(10240);
      }
    });
  });

  describe("checkCachedVideo", () => {
    it("should return exists true when video is cached", async () => {
      (container.videoCacheStorage.getCachedVideoFile as ReturnType<typeof vi.fn>).mockResolvedValue({
        filePath: "/cache/task-1.mp4",
        mimeType: "video/mp4",
        cachedAt: Date.now(),
        fileSize: 5 * 1024 * 1024,
      });

      const result = await checkCachedVideo("task-1");
      expect(result.exists).toBe(true);
      expect(result.fileSizeMB).toBeCloseTo(5, 0);
    });

    it("should return exists false when video is not cached", async () => {
      (container.videoCacheStorage.getCachedVideoFile as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await checkCachedVideo("nonexistent");
      expect(result.exists).toBe(false);
    });

    it("should return exists false on error", async () => {
      (container.videoCacheStorage.getCachedVideoFile as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("DB error"));

      const result = await checkCachedVideo("error");
      expect(result.exists).toBe(false);
    });
  });

  describe("getVideoFileStream", () => {
    it("should return null when not Electron", async () => {
      (isElectron as ReturnType<typeof vi.fn>).mockReturnValue(false);

      const result = await getVideoFileStream("task-1");
      expect(result).toBeNull();
    });

    it("should return file path when Electron and cached", async () => {
      (isElectron as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (container.videoCacheStorage.getCachedVideoFile as ReturnType<typeof vi.fn>).mockResolvedValue({
        filePath: "/cache/task-1.mp4",
        mimeType: "video/mp4",
        cachedAt: Date.now(),
      });

      const result = await getVideoFileStream("task-1");
      expect(result).toBe("/cache/task-1.mp4");
    });

    it("should return null when Electron but not cached", async () => {
      (isElectron as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (container.videoCacheStorage.getCachedVideoFile as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await getVideoFileStream("nonexistent");
      expect(result).toBeNull();
    });

    it("should return null on error", async () => {
      (isElectron as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (container.videoCacheStorage.getCachedVideoFile as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("DB error"));

      const result = await getVideoFileStream("error");
      expect(result).toBeNull();
    });
  });

  describe("getCachedVideo", () => {
    it("should return null when not Electron and no memory cache", async () => {
      (isElectron as ReturnType<typeof vi.fn>).mockReturnValue(false);
      clearMemoryCache();

      const result = await getCachedVideo("nonexistent");
      expect(result).toBeNull();
    });

    it("should return blob from file when Electron and cached", async () => {
      (isElectron as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (container.videoCacheStorage.getCachedVideoFile as ReturnType<typeof vi.fn>).mockResolvedValue({
        filePath: "/cache/task-mem.mp4",
        mimeType: "video/mp4",
        cachedAt: Date.now(),
        fileSize: 1024,
      });
      (window as unknown as { electronAPI: Record<string, unknown> }).electronAPI = {
        readFile: vi.fn().mockResolvedValue({
          success: true,
          data: new ArrayBuffer(1024),
        }),
      };

      const result = await getCachedVideo("task-mem");
      expect(result).not.toBeNull();
      expect(result).toBeInstanceOf(Blob);
    });

    it("should return null when Electron and no cached file", async () => {
      (isElectron as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (container.videoCacheStorage.getCachedVideoFile as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await getCachedVideo("nonexistent");
      expect(result).toBeNull();
    });

    it("should return null on error", async () => {
      (isElectron as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (container.videoCacheStorage.getCachedVideoFile as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("DB error"));

      const result = await getCachedVideo("error");
      expect(result).toBeNull();
    });
  });
});
