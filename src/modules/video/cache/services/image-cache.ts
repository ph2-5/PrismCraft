import type { Result } from "@/domain/types";
import { fromAsyncThrowable } from "@/domain/types";
import { container } from "@/infrastructure/di";
import { resilientFetch } from "@/shared/video-cache";
import { errorLogger } from "@/shared/error-logger";
import { t, CACHE_RETRY_INTERVAL_MS, DAY_MS } from "@/shared/constants";
import {
  writeFile as httpWriteFile,
  getFileInfo as httpGetFileInfo,
  getCacheDirectory as httpGetCacheDirectory,
  getDiskSpace as httpGetDiskSpace,
  fileExists as httpFileExists,
  deleteFile as httpDeleteFile,
} from "@/shared/file-http";

const CACHE_RETRY_COUNT = 2;
const MAX_IMAGE_CACHE_SIZE = 500;
const MAX_TOTAL_IMAGE_SIZE_MB = 512;
/** 图片缓存失败后的退避基数（每次重试递增） */
const CACHE_BACKOFF_BASE_MS = 2000;

function isHttpExpiredError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /HTTP (403|404|410)|(403|404|410)/.test(error.message);
}

function urlToCacheKey(url: string): string {
  return url.replace(/[?#].*$/, "");
}

function guessMimeType(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes(".png")) return "image/png";
  if (lower.includes(".webp")) return "image/webp";
  if (lower.includes(".gif")) return "image/gif";
  return "image/jpeg";
}

function guessExtension(mimeType: string): string {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("gif")) return "gif";
  return "jpg";
}

export async function cacheImageBlob(
  sourceUrl: string,
): Promise<Result<string>> {
  return fromAsyncThrowable(async () => {
    const cacheKey = urlToCacheKey(sourceUrl);

    const existing = await container.imageCacheStorage.getCachedImageFile(cacheKey);
    if (existing) return existing.filePath;

    const stats = await container.imageCacheStorage.getImageCacheStats();
    if (
      stats.count >= MAX_IMAGE_CACHE_SIZE ||
      stats.totalSize > MAX_TOTAL_IMAGE_SIZE_MB * 1024 * 1024 * 0.9
    ) {
      await container.imageCacheStorage.cleanImageCacheBySizeLimit(
        MAX_TOTAL_IMAGE_SIZE_MB * 0.7 * 1024 * 1024,
      );
    }

    const currentUrl = sourceUrl;

    for (let attempt = 0; attempt < CACHE_RETRY_COUNT; attempt++) {
      try {
        const cacheDirResult = await httpGetCacheDirectory();
        if (!cacheDirResult?.success || !cacheDirResult.path) {
          throw new Error("Failed to get cache directory");
        }
        const cacheDir = cacheDirResult.path;
        const imageDir = `${cacheDir}/images`;
        const mimeType = guessMimeType(currentUrl);
        const ext = guessExtension(mimeType);
        const hash = cacheKey.split("").reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0);
        const filePath = `${imageDir}/${Math.abs(hash).toString(36)}_${Date.now()}.${ext}`;

        const diskSpace = await httpGetDiskSpace(cacheDir);
        if (diskSpace?.success && diskSpace.availableBytes !== undefined) {
          const minRequiredBytes = 1024 * 1024;
          if (diskSpace.availableBytes < minRequiredBytes) {
            throw new Error(`${t("error.diskFull")} (${Math.round(diskSpace.availableBytes / 1024 / 1024)}MB)`);
          }
        }

        const abortController = new AbortController();
        const downloadCtx = { data: null as Uint8Array | null };

        const result = await resilientFetch({
          url: currentUrl,
          destination: async (data: Uint8Array) => {
            downloadCtx.data = data;
          },
          signal: abortController.signal,
          onProgress: () => {},
        });

        if (!result.success || !downloadCtx.data) {
          throw new Error("Download failed");
        }

        const downloadedData = downloadCtx.data;

        const writeResult = await httpWriteFile(
          filePath,
          downloadedData.buffer as ArrayBuffer,
        );
        if (!writeResult?.success) {
          throw new Error("Failed to write file to disk");
        }

        const fileInfo = await httpGetFileInfo(filePath);
        if (fileInfo && fileInfo.success && result.totalBytes > 0 && fileInfo.size !== result.totalBytes) {
          await httpDeleteFile(filePath);
          throw new Error(`下载不完整: ${fileInfo.size}/${result.totalBytes} bytes`);
        }

        try {
          await container.imageCacheStorage.cacheImageFile({
            sourceUrl: cacheKey,
            filePath,
            mimeType,
            fileSize: downloadedData.byteLength,
          });
        } catch (dbError) {
          errorLogger.warn(
            "[ImageCache] 数据库记录失败，清理已写入的缓存文件",
            dbError,
          );
          try {
            const exists = await httpFileExists(filePath);
            if (exists) await httpDeleteFile(filePath);
          } catch (cleanupError) {
            errorLogger.warn("[ImageCache] 清理失败缓存文件失败", cleanupError);
          }
          throw dbError;
        }

        return filePath;
      } catch (error) {
        if (isHttpExpiredError(error) && attempt === 0) {
          errorLogger.warn("[ImageCache] URL过期，重试中...", error);
          await new Promise((r) => setTimeout(r, CACHE_RETRY_INTERVAL_MS));
          continue;
        }

        errorLogger.warn(
          `[ImageCache] 缓存失败 (attempt ${attempt + 1})`,
          error,
        );
        if (attempt < CACHE_RETRY_COUNT - 1) {
          await new Promise((r) => setTimeout(r, CACHE_BACKOFF_BASE_MS * (attempt + 1)));
        }
      }
    }

    throw new Error(`缓存图片失败: ${sourceUrl}`);
  });
}

export async function getCachedImagePath(sourceUrl: string): Promise<Result<string | null>> {
  return fromAsyncThrowable(async () => {
    const cacheKey = urlToCacheKey(sourceUrl);
    const cached = await container.imageCacheStorage.getCachedImageFile(cacheKey);
    if (!cached) return null;

    const exists = await httpFileExists(cached.filePath);
    if (!exists) return null;

    return cached.filePath;
  });
}

export async function getImageUrlWithCache(
  sourceUrl: string,
): Promise<Result<{ url: string; fromCache: boolean }>> {
  return fromAsyncThrowable(async () => {
    if (!sourceUrl || sourceUrl.startsWith("blob:") || sourceUrl.startsWith("data:") || sourceUrl.startsWith("file://")) {
      return { url: sourceUrl, fromCache: false };
    }

    const cachedPathResult = await getCachedImagePath(sourceUrl);
    const cachedPath = cachedPathResult.ok ? cachedPathResult.value : null;

    if (cachedPath) {
      return { url: `file://${cachedPath.replace(/\\/g, "/")}`, fromCache: true };
    }

    try {
      const cacheResult = await cacheImageBlob(sourceUrl);
      if (cacheResult.ok && cacheResult.value) {
        return { url: `file://${cacheResult.value.replace(/\\/g, "/")}`, fromCache: true };
      }
    } catch (error) {
      errorLogger.debug("[ImageCache] 缓存图片失败，回退到远程 URL:", error instanceof Error ? error.message : error);
    }

    return { url: sourceUrl, fromCache: false };
  });
}

export async function removeCachedImage(sourceUrl: string): Promise<Result<void>> {
  return fromAsyncThrowable(async () => {
    const cacheKey = urlToCacheKey(sourceUrl);
    await container.imageCacheStorage.removeCachedImageFile(cacheKey);
  });
}

export async function cleanExpiredImageCache(
  maxAgeMs: number = 30 * DAY_MS,
): Promise<Result<number>> {
  return fromAsyncThrowable(async () => {
    const filesToDelete = await container.imageCacheStorage.cleanExpiredImageCache(maxAgeMs);
    for (const file of filesToDelete) {
      try {
        const exists = await httpFileExists(file);
        if (exists) await httpDeleteFile(file);
      } catch (e) {
        errorLogger.warn("[ImageCache] 删除过期缓存文件失败", e);
      }
    }
    return filesToDelete.length;
  });
}

export async function getImageCacheStats(): Promise<Result<{
  count: number;
  totalSizeMB: number;
  maxCount: number;
  maxSizeMB: number;
}>> {
  return fromAsyncThrowable(async () => {
    const stats = await container.imageCacheStorage.getImageCacheStats();
    return {
      count: stats.count,
      totalSizeMB: stats.totalSize / (1024 * 1024),
      maxCount: MAX_IMAGE_CACHE_SIZE,
      maxSizeMB: MAX_TOTAL_IMAGE_SIZE_MB,
    };
  });
}

export async function recoverUncachedImages(urls: string[]): Promise<Result<number>> {
  return fromAsyncThrowable(async () => {
    let recovered = 0;
    for (const url of urls) {
      if (!url || url.startsWith("blob:") || url.startsWith("data:") || url.startsWith("file://")) continue;
      const cached = await getCachedImagePath(url);
      if (cached.ok && cached.value) continue;
      const result = await cacheImageBlob(url);
      if (result.ok) recovered++;
    }
    return recovered;
  });
}
