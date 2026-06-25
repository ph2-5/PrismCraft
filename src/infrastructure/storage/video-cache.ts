import { safeQuery, safeRun } from "./sqlite-core";
import { errorLogger } from "@/shared/error-logger";
import { container } from "@/infrastructure/di";

const MAX_OBJECT_URLS = 100;
const objectUrlRegistry = new Map<string, string>();

let cacheMutex: Promise<void> = Promise.resolve();

async function withCacheMutex<T>(fn: () => Promise<T>): Promise<T> {
  const prev = cacheMutex;
  let resolve: () => void;
  cacheMutex = new Promise<void>((r) => { resolve = r; });
  await prev;
  try {
    return await fn();
  } finally {
    resolve!();
  }
}

let beforeUnloadHandler: (() => void) | null = null;
let beforeUnloadRegistered = false;

function ensureBeforeUnloadRegistered(): void {
  if (beforeUnloadRegistered || typeof window === "undefined") return;
  beforeUnloadRegistered = true;
  beforeUnloadHandler = () => {
    cleanupAllObjectUrls();
  };
  window.addEventListener("beforeunload", beforeUnloadHandler);
}

/** 清理 video-cache 的 beforeunload 监听器（测试/HMR 场景使用） */
export function cleanupVideoCache(): void {
  if (beforeUnloadHandler && typeof window !== "undefined") {
    window.removeEventListener("beforeunload", beforeUnloadHandler);
    beforeUnloadHandler = null;
    beforeUnloadRegistered = false;
  }
}

export function registerObjectUrl(taskId: string, url: string): void {
  ensureBeforeUnloadRegistered();
  // 超过上限时淘汰最旧条目（Map 保持插入顺序）
  if (objectUrlRegistry.size >= MAX_OBJECT_URLS && !objectUrlRegistry.has(taskId)) {
    const oldestKey = objectUrlRegistry.keys().next().value;
    if (oldestKey) {
      const oldUrl = objectUrlRegistry.get(oldestKey);
      if (oldUrl && oldUrl.startsWith("blob:")) {
        URL.revokeObjectURL(oldUrl);
      }
      objectUrlRegistry.delete(oldestKey);
    }
  }
  objectUrlRegistry.set(taskId, url);
}

export function getObjectUrl(taskId: string): string | undefined {
  return objectUrlRegistry.get(taskId);
}

export function revokeObjectUrl(taskId: string): void {
  const url = objectUrlRegistry.get(taskId);
  if (url && url.startsWith("blob:")) {
    URL.revokeObjectURL(url);
  }
  objectUrlRegistry.delete(taskId);
}

export function cleanupAllObjectUrls(): void {
  for (const [_taskId, url] of objectUrlRegistry.entries()) {
    if (url && url.startsWith("blob:")) {
      URL.revokeObjectURL(url);
    }
  }
  objectUrlRegistry.clear();
}

async function deleteLocalFile(filePath: string): Promise<void> {
  try {
    // 优先使用 IFileStorage 接口（支持本地/云端切换）
    const fileStorage = await container.fileStorage;
    await fileStorage.deleteFile(filePath);
  } catch (e) {
    errorLogger.warn("[VideoCache] 删除本地文件失败:", { filePath, error: e });
  }
}

async function deleteLocalFiles(filePaths: string[]): Promise<void> {
  for (const fp of filePaths) {
    await deleteLocalFile(fp);
  }
}

export const videoCacheStorage = {
  async cacheVideoFile(meta: {
    taskId: string;
    filePath: string;
    originalUrl?: string;
    mimeType?: string;
    fileSize: number;
  }): Promise<void> {
    return withCacheMutex(async () => {
      const MAX_CACHE_BYTES = 2 * 1024 * 1024 * 1024;
      const currentSize = await videoCacheStorage.getTotalVideoCacheSize();
      if (currentSize + meta.fileSize > MAX_CACHE_BYTES) {
        await videoCacheStorage.cleanVideoCacheBySizeLimit(MAX_CACHE_BYTES - meta.fileSize);
      }

      const old = await videoCacheStorage.getCachedVideoFile(meta.taskId);
      const oldFilePath =
        old && old.filePath !== meta.filePath ? old.filePath : null;

      await safeRun(
        `INSERT OR REPLACE INTO video_cache
         (task_id, file_path, original_url, mime_type, file_size, cached_at, owner_id, version, sync_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          meta.taskId,
          meta.filePath,
          meta.originalUrl || null,
          meta.mimeType || null,
          meta.fileSize,
          Math.floor(Date.now() / 1000),
          1,
          1,
          null,
        ],
      );

      if (oldFilePath) {
        await deleteLocalFile(oldFilePath).catch((e) =>
          errorLogger.warn("[VideoCache] 删除旧文件失败:", { oldFilePath, error: e }),
        );
      }
    });
  },

  async getCachedVideoFile(taskId: string): Promise<{
    filePath: string;
    mimeType: string;
    originalUrl?: string;
    cachedAt: number;
    fileSize?: number;
  } | null> {
    const result = await safeQuery<{
      file_path: string;
      mime_type: string;
      original_url?: string;
      cached_at: number;
      file_size: number;
    }>(
      "SELECT file_path, mime_type, original_url, cached_at, file_size FROM video_cache WHERE task_id = ?",
      [taskId],
    );
    return result.length > 0
      ? {
          filePath: result[0]!.file_path,
          mimeType: result[0]!.mime_type,
          originalUrl: result[0]!.original_url,
          cachedAt: result[0]!.cached_at,
          fileSize: result[0]!.file_size,
        }
      : null;
  },

  async removeCachedVideoFile(taskId: string): Promise<string | null> {
    const video = await this.getCachedVideoFile(taskId);
    if (video) {
      revokeObjectUrl(taskId);

      await safeRun("DELETE FROM video_cache WHERE task_id = ?", [taskId]);

      await deleteLocalFile(video.filePath).catch((e) =>
        errorLogger.warn("[VideoCache] 删除本地文件失败:", { filePath: video.filePath, error: e }),
      );

      return video.filePath;
    }
    return null;
  },

  async getTotalVideoCacheSize(): Promise<number> {
    const result = await safeQuery<{ total: number }>(
      "SELECT COALESCE(SUM(file_size), 0) as total FROM video_cache",
    );
    return result[0]?.total || 0;
  },

  async getVideoCacheStats(): Promise<{
    count: number;
    totalSize: number;
  }> {
    const result = await safeQuery<{
      count: number;
      totalSize: number;
    }>(
      "SELECT COUNT(*) as count, COALESCE(SUM(file_size), 0) as totalSize FROM video_cache",
    );
    return {
      count: result[0]?.count || 0,
      totalSize: result[0]?.totalSize || 0,
    };
  },

  async cleanExpiredVideoCache(
    maxAgeMs: number = 30 * 24 * 60 * 60 * 1000,
  ): Promise<string[]> {
    const cutoff = Math.floor((Date.now() - maxAgeMs) / 1000);
    const result = await safeQuery<{
      task_id: string;
      file_path: string;
    }>("SELECT task_id, file_path FROM video_cache WHERE cached_at < ?", [
      cutoff,
    ]);

    if (result.length > 0) {
      const ids = result.map((r) => r.task_id);
      const filePaths = result.map((r) => r.file_path);

      ids.forEach((id) => revokeObjectUrl(id));

      const placeholders = ids.map(() => "?").join(",");
      await safeRun(
        `DELETE FROM video_cache WHERE task_id IN (${placeholders})`,
        ids,
      );

      await deleteLocalFiles(filePaths).catch((e) =>
        errorLogger.warn("[VideoCache] 批量删除文件失败:", e),
      );

      return filePaths;
    }
    return [];
  },

  async cleanVideoCacheBySizeLimit(
    maxTotalSizeBytes: number,
  ): Promise<string[]> {
    const currentTotal = await this.getTotalVideoCacheSize();

    if (currentTotal <= maxTotalSizeBytes) {
      return [];
    }

    const toDelete = await safeQuery<{
      task_id: string;
      file_path: string;
      running_total: number;
    }>(
      `SELECT task_id, file_path, SUM(file_size) OVER (ORDER BY cached_at) as running_total FROM video_cache ORDER BY cached_at ASC`,
    );

    const filesToDelete: string[] = [];
    const idsToDelete: string[] = [];

    for (const item of toDelete) {
      if (item.running_total <= maxTotalSizeBytes) {
        continue;
      }
      filesToDelete.push(item.file_path);
      idsToDelete.push(item.task_id);
    }

    if (idsToDelete.length > 0) {
      idsToDelete.forEach((id) => revokeObjectUrl(id));

      const placeholders = idsToDelete.map(() => "?").join(",");
      await safeRun(
        `DELETE FROM video_cache WHERE task_id IN (${placeholders})`,
        idsToDelete,
      );

      await deleteLocalFiles(filesToDelete).catch((e) =>
        errorLogger.warn("[VideoCache] 批量删除文件失败:", e),
      );
    }

    return filesToDelete;
  },
};
