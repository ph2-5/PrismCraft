import { describe, it, expect, vi, beforeEach } from "vitest";

if (typeof URL.revokeObjectURL !== "function") {
  URL.revokeObjectURL = vi.fn();
}

import {
  videoCacheStorage,
  registerObjectUrl,
  getObjectUrl,
  revokeObjectUrl,
  cleanupAllObjectUrls,
} from "@/infrastructure/storage/video-cache";

vi.mock("@/infrastructure/storage/sqlite-core", () => ({
  safeQuery: vi.fn(),
  safeRun: vi.fn(),
}));

vi.mock("@/infrastructure/di", () => ({
  container: {},
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: {
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { safeQuery, safeRun } from "@/infrastructure/storage/sqlite-core";

describe("video-cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cleanupAllObjectUrls();
  });

  describe("objectUrlRegistry", () => {
    describe("registerObjectUrl", () => {
      it("should register an object URL", () => {
        registerObjectUrl("task-1", "blob:https://example.com/1");
        expect(getObjectUrl("task-1")).toBe("blob:https://example.com/1");
      });

      it("should overwrite existing URL", () => {
        registerObjectUrl("task-1", "blob:https://example.com/1");
        registerObjectUrl("task-1", "blob:https://example.com/2");
        expect(getObjectUrl("task-1")).toBe("blob:https://example.com/2");
      });
    });

    describe("getObjectUrl", () => {
      it("should return undefined for non-existent task", () => {
        expect(getObjectUrl("nonexistent")).toBeUndefined();
      });

      it("should return registered URL", () => {
        registerObjectUrl("task-1", "blob:https://example.com/1");
        expect(getObjectUrl("task-1")).toBe("blob:https://example.com/1");
      });
    });

    describe("revokeObjectUrl", () => {
      it("should revoke and remove blob URL", () => {
        const revokeSpy = vi.spyOn(URL, "revokeObjectURL");
        registerObjectUrl("task-1", "blob:https://example.com/1");
        revokeObjectUrl("task-1");
        expect(getObjectUrl("task-1")).toBeUndefined();
        expect(revokeSpy).toHaveBeenCalledWith("blob:https://example.com/1");
        revokeSpy.mockRestore();
      });

      it("should remove non-blob URL without calling revokeObjectURL", () => {
        const revokeSpy = vi.spyOn(URL, "revokeObjectURL");
        registerObjectUrl("task-2", "vcache://task-2");
        revokeObjectUrl("task-2");
        expect(getObjectUrl("task-2")).toBeUndefined();
        expect(revokeSpy).not.toHaveBeenCalled();
        revokeSpy.mockRestore();
      });

      it("should handle non-existent task gracefully", () => {
        expect(() => revokeObjectUrl("nonexistent")).not.toThrow();
      });
    });

    describe("cleanupAllObjectUrls", () => {
      it("should revoke all blob URLs and clear registry", () => {
        const revokeSpy = vi.spyOn(URL, "revokeObjectURL");
        registerObjectUrl("task-1", "blob:https://example.com/1");
        registerObjectUrl("task-2", "blob:https://example.com/2");
        registerObjectUrl("task-3", "vcache://task-3");

        cleanupAllObjectUrls();

        expect(getObjectUrl("task-1")).toBeUndefined();
        expect(getObjectUrl("task-2")).toBeUndefined();
        expect(getObjectUrl("task-3")).toBeUndefined();
        expect(revokeSpy).toHaveBeenCalledTimes(2);
        revokeSpy.mockRestore();
      });
    });
  });

  describe("videoCacheStorage", () => {
    describe("cacheVideoFile", () => {
      it("should insert new cache record", async () => {
        (safeQuery as ReturnType<typeof vi.fn>).mockResolvedValue([]);
        (safeRun as ReturnType<typeof vi.fn>).mockResolvedValue({});

        await videoCacheStorage.cacheVideoFile({
          taskId: "task-1",
          filePath: "/cache/task-1.mp4",
          originalUrl: "https://example.com/video.mp4",
          mimeType: "video/mp4",
          fileSize: 1024 * 1024,
        });

        expect(safeRun).toHaveBeenCalled();
      });

      it("should delete old file when replacing cache", async () => {
        (safeQuery as ReturnType<typeof vi.fn>).mockResolvedValue([
          { file_path: "/cache/old-task-1.mp4", mime_type: "video/mp4", cached_at: 1000, file_size: 512 },
        ]);
        (safeRun as ReturnType<typeof vi.fn>).mockResolvedValue({});

        await videoCacheStorage.cacheVideoFile({
          taskId: "task-1",
          filePath: "/cache/new-task-1.mp4",
          mimeType: "video/mp4",
          fileSize: 2048,
        });

        expect(safeRun).toHaveBeenCalled();
      });

      it("should not delete old file when same path", async () => {
        (safeQuery as ReturnType<typeof vi.fn>).mockResolvedValue([
          { file_path: "/cache/task-1.mp4", mime_type: "video/mp4", cached_at: 1000, file_size: 512 },
        ]);
        (safeRun as ReturnType<typeof vi.fn>).mockResolvedValue({});

        await videoCacheStorage.cacheVideoFile({
          taskId: "task-1",
          filePath: "/cache/task-1.mp4",
          mimeType: "video/mp4",
          fileSize: 2048,
        });

        expect(safeRun).toHaveBeenCalled();
      });
    });

    describe("getCachedVideoFile", () => {
      it("should return cached file when found", async () => {
        (safeQuery as ReturnType<typeof vi.fn>).mockResolvedValue([
          {
            file_path: "/cache/task-1.mp4",
            mime_type: "video/mp4",
            original_url: "https://example.com/video.mp4",
            cached_at: 1700000000,
            file_size: 1024 * 1024,
          },
        ]);

        const result = await videoCacheStorage.getCachedVideoFile("task-1");
        expect(result).not.toBeNull();
        expect(result!.filePath).toBe("/cache/task-1.mp4");
        expect(result!.mimeType).toBe("video/mp4");
        expect(result!.fileSize).toBe(1024 * 1024);
      });

      it("should return null when not found", async () => {
        (safeQuery as ReturnType<typeof vi.fn>).mockResolvedValue([]);

        const result = await videoCacheStorage.getCachedVideoFile("nonexistent");
        expect(result).toBeNull();
      });
    });

    describe("removeCachedVideoFile", () => {
      it("should remove cached video and return file path", async () => {
        (safeQuery as ReturnType<typeof vi.fn>).mockResolvedValue([
          {
            file_path: "/cache/task-1.mp4",
            mime_type: "video/mp4",
            cached_at: 1700000000,
            file_size: 1024,
          },
        ]);
        (safeRun as ReturnType<typeof vi.fn>).mockResolvedValue({});

        const result = await videoCacheStorage.removeCachedVideoFile("task-1");
        expect(result).toBe("/cache/task-1.mp4");
        expect(safeRun).toHaveBeenCalledWith(
          expect.stringContaining("DELETE"),
          ["task-1"]
        );
      });

      it("should return null when video not found", async () => {
        (safeQuery as ReturnType<typeof vi.fn>).mockResolvedValue([]);

        const result = await videoCacheStorage.removeCachedVideoFile("nonexistent");
        expect(result).toBeNull();
      });
    });

    describe("getTotalVideoCacheSize", () => {
      it("should return total cache size", async () => {
        (safeQuery as ReturnType<typeof vi.fn>).mockResolvedValue([
          { total: 1024 * 1024 * 50 },
        ]);

        const result = await videoCacheStorage.getTotalVideoCacheSize();
        expect(result).toBe(1024 * 1024 * 50);
      });

      it("should return 0 when no cache", async () => {
        (safeQuery as ReturnType<typeof vi.fn>).mockResolvedValue([
          { total: 0 },
        ]);

        const result = await videoCacheStorage.getTotalVideoCacheSize();
        expect(result).toBe(0);
      });
    });

    describe("getVideoCacheStats", () => {
      it("should return cache statistics", async () => {
        (safeQuery as ReturnType<typeof vi.fn>).mockResolvedValue([
          { count: 5, totalSize: 1024 * 1024 * 100 },
        ]);

        const result = await videoCacheStorage.getVideoCacheStats();
        expect(result.count).toBe(5);
        expect(result.totalSize).toBe(1024 * 1024 * 100);
      });

      it("should handle empty cache", async () => {
        (safeQuery as ReturnType<typeof vi.fn>).mockResolvedValue([
          { count: 0, totalSize: 0 },
        ]);

        const result = await videoCacheStorage.getVideoCacheStats();
        expect(result.count).toBe(0);
        expect(result.totalSize).toBe(0);
      });
    });

    describe("cleanExpiredVideoCache", () => {
      it("should clean expired cache entries", async () => {
        (safeQuery as ReturnType<typeof vi.fn>).mockResolvedValue([
          { task_id: "old-1", file_path: "/cache/old-1.mp4" },
          { task_id: "old-2", file_path: "/cache/old-2.mp4" },
        ]);
        (safeRun as ReturnType<typeof vi.fn>).mockResolvedValue({});

        const result = await videoCacheStorage.cleanExpiredVideoCache();
        expect(result).toEqual(["/cache/old-1.mp4", "/cache/old-2.mp4"]);
        expect(safeRun).toHaveBeenCalled();
      });

      it("should return empty array when no expired entries", async () => {
        (safeQuery as ReturnType<typeof vi.fn>).mockResolvedValue([]);

        const result = await videoCacheStorage.cleanExpiredVideoCache();
        expect(result).toEqual([]);
      });

      it("should use custom maxAgeMs", async () => {
        (safeQuery as ReturnType<typeof vi.fn>).mockResolvedValue([]);

        await videoCacheStorage.cleanExpiredVideoCache(1000);
        expect(safeQuery).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(Array)
        );
      });
    });

    describe("cleanVideoCacheBySizeLimit", () => {
      it("should return empty array when under size limit", async () => {
        (safeQuery as ReturnType<typeof vi.fn>).mockResolvedValue([
          { total: 1024 },
        ]);

        const result = await videoCacheStorage.cleanVideoCacheBySizeLimit(1024 * 1024);
        expect(result).toEqual([]);
      });

      it("should delete files exceeding size limit", async () => {
        (safeQuery as ReturnType<typeof vi.fn>).mockImplementation((sql: string) => {
          if (sql.includes("COALESCE(SUM")) {
            return Promise.resolve([{ total: 1024 * 1024 * 200 }]);
          }
          if (sql.includes("running_total")) {
            return Promise.resolve([
              { task_id: "old-1", file_path: "/cache/old-1.mp4", running_total: 1024 * 1024 * 50 },
              { task_id: "old-2", file_path: "/cache/old-2.mp4", running_total: 1024 * 1024 * 120 },
              { task_id: "old-3", file_path: "/cache/old-3.mp4", running_total: 1024 * 1024 * 200 },
            ]);
          }
          return Promise.resolve([]);
        });
        (safeRun as ReturnType<typeof vi.fn>).mockResolvedValue({});

        const result = await videoCacheStorage.cleanVideoCacheBySizeLimit(1024 * 1024 * 100);
        expect(result.length).toBeGreaterThan(0);
        expect(safeRun).toHaveBeenCalled();
      });

      it("should not delete files within size limit", async () => {
        (safeQuery as ReturnType<typeof vi.fn>).mockImplementation((sql: string) => {
          if (sql.includes("COALESCE(SUM")) {
            return Promise.resolve([{ total: 1024 * 1024 * 200 }]);
          }
          if (sql.includes("running_total")) {
            return Promise.resolve([
              { task_id: "keep-1", file_path: "/cache/keep-1.mp4", running_total: 1024 * 1024 * 50 },
              { task_id: "delete-1", file_path: "/cache/delete-1.mp4", running_total: 1024 * 1024 * 150 },
            ]);
          }
          return Promise.resolve([]);
        });
        (safeRun as ReturnType<typeof vi.fn>).mockResolvedValue({});

        const result = await videoCacheStorage.cleanVideoCacheBySizeLimit(1024 * 1024 * 100);
        expect(result).toContain("/cache/delete-1.mp4");
        expect(result).not.toContain("/cache/keep-1.mp4");
      });
    });
  });
});
