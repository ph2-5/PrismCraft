import { safeQuery, safeRun, safeTransaction } from "./sqlite-core";
import { errorLogger } from "@/shared/error-logger";

const MAX_IMAGE_CACHE_BYTES = 500 * 1024 * 1024;

let cacheMutex: Promise<void> = Promise.resolve();

const ACCESS_UPDATE_BATCH_INTERVAL = 5000;
const pendingAccessUpdates = new Map<string, number>();
let accessUpdateTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleAccessUpdate(sourceUrl: string): void {
  pendingAccessUpdates.set(sourceUrl, Math.floor(Date.now() / 1000));
  if (accessUpdateTimer) return;
  accessUpdateTimer = setTimeout(async () => {
    accessUpdateTimer = null;
    const updates = new Map(pendingAccessUpdates);
    pendingAccessUpdates.clear();
    if (updates.size === 0) return;
    try {
      const statements: { sql: string; params: unknown[] }[] = [];
      for (const [url, timestamp] of updates) {
        statements.push({
          sql: "UPDATE image_cache SET last_accessed_at = ? WHERE source_url = ?",
          params: [timestamp, url],
        });
      }
      await safeTransaction(statements);
    } catch (e) {
      errorLogger.warn("[ImageCache] 批量更新last_accessed_at失败", e);
    }
  }, ACCESS_UPDATE_BATCH_INTERVAL);
}

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

async function deleteLocalFile(filePath: string): Promise<void> {
  if (typeof window !== "undefined" && window.electronAPI?.deleteFile) {
    try {
      await window.electronAPI.deleteFile(filePath);
    } catch (e) {
      errorLogger.warn("[ImageCache] 删除本地文件失败:", { filePath, error: e });
    }
  }
}

async function deleteLocalFiles(filePaths: string[]): Promise<void> {
  for (const fp of filePaths) {
    await deleteLocalFile(fp);
  }
}

export const imageCacheStorage = {
  async cacheImageFile(meta: {
    sourceUrl: string;
    filePath: string;
    mimeType?: string;
    fileSize: number;
    width?: number;
    height?: number;
  }): Promise<void> {
    return withCacheMutex(async () => {
      const currentSize = await imageCacheStorage.getTotalImageCacheSize();
      if (currentSize + meta.fileSize > MAX_IMAGE_CACHE_BYTES) {
        await imageCacheStorage.cleanImageCacheBySizeLimit(MAX_IMAGE_CACHE_BYTES - meta.fileSize);
      }

      const old = await imageCacheStorage.getCachedImageFile(meta.sourceUrl);
      const oldFilePath = old && old.filePath !== meta.filePath ? old.filePath : null;

      await safeRun(
        `INSERT OR REPLACE INTO image_cache
         (source_url, file_path, mime_type, file_size, width, height, cached_at, last_accessed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          meta.sourceUrl,
          meta.filePath,
          meta.mimeType || null,
          meta.fileSize,
          meta.width || null,
          meta.height || null,
          Math.floor(Date.now() / 1000),
          Math.floor(Date.now() / 1000),
        ],
      );

      if (oldFilePath) {
        await deleteLocalFile(oldFilePath).catch((e) =>
          errorLogger.warn("[ImageCache] 删除旧文件失败:", { oldFilePath, error: e }),
        );
      }
    });
  },

  async getCachedImageFile(sourceUrl: string): Promise<{
    filePath: string;
    mimeType: string;
    fileSize?: number;
    width?: number;
    height?: number;
    cachedAt: number;
  } | null> {
    const result = await safeQuery<{
      file_path: string;
      mime_type: string;
      file_size: number;
      width: number | null;
      height: number | null;
      cached_at: number;
    }>(
      "SELECT file_path, mime_type, file_size, width, height, cached_at FROM image_cache WHERE source_url = ?",
      [sourceUrl],
    );
    if (result.length === 0) return null;

    scheduleAccessUpdate(sourceUrl);

    return {
      filePath: result[0].file_path,
      mimeType: result[0].mime_type,
      fileSize: result[0].file_size,
      width: result[0].width ?? undefined,
      height: result[0].height ?? undefined,
      cachedAt: result[0].cached_at,
    };
  },

  async removeCachedImageFile(sourceUrl: string): Promise<string | null> {
    const image = await this.getCachedImageFile(sourceUrl);
    if (image) {
      await safeRun("DELETE FROM image_cache WHERE source_url = ?", [sourceUrl]);
      await deleteLocalFile(image.filePath).catch((e) =>
        errorLogger.warn("[ImageCache] 删除本地文件失败:", { filePath: image.filePath, error: e }),
      );
      return image.filePath;
    }
    return null;
  },

  async getTotalImageCacheSize(): Promise<number> {
    const result = await safeQuery<{ total: number }>(
      "SELECT COALESCE(SUM(file_size), 0) as total FROM image_cache",
    );
    return result[0]?.total || 0;
  },

  async getImageCacheStats(): Promise<{
    count: number;
    totalSize: number;
  }> {
    const result = await safeQuery<{
      count: number;
      totalSize: number;
    }>(
      "SELECT COUNT(*) as count, COALESCE(SUM(file_size), 0) as totalSize FROM image_cache",
    );
    return {
      count: result[0]?.count || 0,
      totalSize: result[0]?.totalSize || 0,
    };
  },

  async cleanExpiredImageCache(
    maxAgeMs: number = 30 * 24 * 60 * 60 * 1000,
  ): Promise<string[]> {
    const cutoff = Math.floor((Date.now() - maxAgeMs) / 1000);
    const result = await safeQuery<{
      source_url: string;
      file_path: string;
    }>("SELECT source_url, file_path FROM image_cache WHERE cached_at < ?", [cutoff]);

    if (result.length === 0) return [];

    const sourceUrls = result.map((r) => r.source_url);
    const filePaths = result.map((r) => r.file_path);

    const placeholders = sourceUrls.map(() => "?").join(",");
    await safeRun(
      `DELETE FROM image_cache WHERE source_url IN (${placeholders})`,
      sourceUrls,
    );

    await deleteLocalFiles(filePaths).catch((e) =>
      errorLogger.warn("[ImageCache] 批量删除文件失败:", e),
    );

    return filePaths;
  },

  async cleanImageCacheBySizeLimit(
    maxTotalSizeBytes: number,
  ): Promise<string[]> {
    const currentTotal = await this.getTotalImageCacheSize();
    if (currentTotal <= maxTotalSizeBytes) return [];

    const toDelete = await safeQuery<{
      source_url: string;
      file_path: string;
      running_total: number;
    }>(
      `SELECT source_url, file_path, SUM(file_size) OVER (ORDER BY last_accessed_at ASC) as running_total FROM image_cache ORDER BY last_accessed_at ASC`,
    );

    const filesToDelete: string[] = [];
    const urlsToDelete: string[] = [];

    for (const item of toDelete) {
      if (item.running_total <= maxTotalSizeBytes) continue;
      filesToDelete.push(item.file_path);
      urlsToDelete.push(item.source_url);
    }

    if (urlsToDelete.length > 0) {
      const placeholders = urlsToDelete.map(() => "?").join(",");
      await safeRun(
        `DELETE FROM image_cache WHERE source_url IN (${placeholders})`,
        urlsToDelete,
      );

      await deleteLocalFiles(filesToDelete).catch((e) =>
        errorLogger.warn("[ImageCache] 批量删除文件失败:", e),
      );
    }

    return filesToDelete;
  },
};
