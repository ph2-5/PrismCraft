import type { Result } from "@/domain/types";
import { fromAsyncThrowable } from "@/domain/types";
import { container } from "@/infrastructure/di";
import { registerObjectUrl, revokeObjectUrl, resilientFetch } from "@/shared/video-cache";
import { errorLogger } from "@/shared/error-logger";
import { t, CACHE_RETRY_INTERVAL_MS } from "@/shared/constants";
import { AppError } from "@/domain/types/result";
import {
  writeFile as httpWriteFile,
  readFile as httpReadFile,
  getFileInfo as httpGetFileInfo,
  getCacheDirectory as httpGetCacheDirectory,
  getDiskSpace as httpGetDiskSpace,
  fileExists as httpFileExists,
  deleteFile as httpDeleteFile,
  httpDownloadToFile,
} from "@/shared/file-http";

type RecoveryFn = (taskId: string) => Promise<Result<{ videoUrl?: string; message: string; status?: string }>>;

let _recoveryFn: RecoveryFn | null = null;

export function registerRecoveryFn(fn: RecoveryFn): void {
  _recoveryFn = fn;
}

function getRecoveryFn(): RecoveryFn | null {
  return _recoveryFn;
}

const MAX_CACHE_SIZE = 500;
const MAX_TOTAL_BLOB_SIZE_MB = 10240;
const CACHE_RETRY_COUNT = 3;
const DEFAULT_URL_TTL = 3600;
/** 视频缓存下载失败后的退避基数（每次重试递增） */
const CACHE_BACKOFF_BASE_MS = 3000;

const memoryCache = new Map<string, { blob: Blob; mimeType: string; cachedAt: number }>();

function isHttpExpiredError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /HTTP (403|404|410)|(403|404|410)/.test(error.message);
}

export function touchMemoryCache(taskId: string): void {
  const entry = memoryCache.get(taskId);
  if (entry) {
    memoryCache.delete(taskId);
    memoryCache.set(taskId, entry);
  }
}

export function clearMemoryCache(): void {
  for (const key of memoryCache.keys()) {
    revokeObjectUrl(key);
  }
  memoryCache.clear();
}

export function revokeObjectURL(blobUrl: string): void {
  if (blobUrl && typeof blobUrl === "string" && blobUrl.startsWith("blob:")) {
    URL.revokeObjectURL(blobUrl);
  }
}

async function refreshVideoUrl(taskId: string): Promise<string | null> {
  try {
    const recoveryFn = getRecoveryFn();
    if (!recoveryFn) return null;
    const result = await recoveryFn(taskId);
    if (result.ok && result.value?.videoUrl) {
      return result.value.videoUrl;
    }
  } catch (e) {
    errorLogger.warn("[VideoCache] refreshVideoUrl failed", e);
  }
  return null;
}

export async function cacheVideoBlob(
  taskId: string,
  videoUrl: string,
): Promise<Result<boolean>> {
  return fromAsyncThrowable(async () => {
    let currentUrl = await refreshUrlIfNeeded(taskId, videoUrl);

    for (let attempt = 0; attempt < CACHE_RETRY_COUNT; attempt++) {
      try {
        const cached = await container.videoCacheStorage.getCachedVideoFile(taskId);
        if (cached) return true;

        await ensureCacheSpace();
        const filePath = await prepareCacheFile(taskId);
        const { totalBytes } = await downloadVideoToFile(currentUrl, filePath);
        await verifyFileIntegrity(filePath, totalBytes);
        await cacheVideoRecord(taskId, filePath, currentUrl, totalBytes);
        await syncLocalPath(taskId, filePath);

        return true;
      } catch (error) {
        const recoveryResult = await handleDownloadError(taskId, error, attempt);
        if (recoveryResult.recovered) {
          currentUrl = recoveryResult.newUrl!;
          continue;
        }
        if (attempt >= CACHE_RETRY_COUNT - 1) break;
        await new Promise((r) => setTimeout(r, CACHE_BACKOFF_BASE_MS * (attempt + 1)));
      }
    }
    return false;
  });
}

async function refreshUrlIfNeeded(taskId: string, videoUrl: string): Promise<string> {
  const task = await container.videoTaskStorage.getVideoTaskById(taskId);
  if (!task?.urlObtainedAt || !task?.videoUrl) return videoUrl;

  const urlTtl = task.urlTtl ?? DEFAULT_URL_TTL;
  const elapsed = Math.floor(Date.now() / 1000) - task.urlObtainedAt;
  if (elapsed <= urlTtl * 0.8) return videoUrl;

  const freshUrl = await refreshVideoUrl(taskId);
  return freshUrl || videoUrl;
}

async function ensureCacheSpace(): Promise<void> {
  const stats = await container.videoCacheStorage.getVideoCacheStats();
  const needsCleanup =
    stats.count >= MAX_CACHE_SIZE ||
    stats.totalSize > MAX_TOTAL_BLOB_SIZE_MB * 1024 * 1024 * 0.9;
  if (!needsCleanup) return;

  const filesToDelete = await container.videoCacheStorage.cleanVideoCacheBySizeLimit(
    MAX_TOTAL_BLOB_SIZE_MB * 0.7 * 1024 * 1024,
  );
  for (const file of filesToDelete) {
    try {
      const exists = await httpFileExists(file);
      if (exists) await httpDeleteFile(file);
    } catch (e) {
      errorLogger.warn(
        new AppError("CACHE_CLEANUP_ERROR", "删除过期缓存文件失败", e),
        "VideoCache",
      );
    }
  }
}

async function prepareCacheFile(taskId: string): Promise<string> {
  const cacheDirResult = await httpGetCacheDirectory();
  if (!cacheDirResult?.success || !cacheDirResult.path) {
    throw new Error("Failed to get cache directory");
  }
  const cacheDir = cacheDirResult.path;
  const filePath = `${cacheDir}/${taskId}.mp4`;

  const diskSpace = await httpGetDiskSpace(cacheDir);
  if (diskSpace?.success && diskSpace.availableBytes !== undefined) {
    const minRequiredBytes = 10 * 1024 * 1024;
    if (diskSpace.availableBytes < minRequiredBytes) {
      throw new Error(`${t("error.diskFull")} (${Math.round(diskSpace.availableBytes / 1024 / 1024)}MB)`);
    }
  }

  return filePath;
}

async function downloadVideoData(url: string): Promise<{ data: Uint8Array; totalBytes: number }> {
  const abortController = new AbortController();
  const downloadCtx = { data: null as Uint8Array | null };

  const result = await resilientFetch({
    url,
    destination: async (data: Uint8Array) => {
      downloadCtx.data = data;
    },
    signal: abortController.signal,
    onProgress: () => {},
  });

  if (!result.success || !downloadCtx.data) {
    throw new Error("Download failed");
  }

  return { data: downloadCtx.data, totalBytes: result.totalBytes };
}

async function writeVideoFile(filePath: string, data: Uint8Array): Promise<void> {
  const writeResult = await httpWriteFile(
    filePath,
    data.buffer as ArrayBuffer,
  );
  if (!writeResult?.success) {
    throw new Error("Failed to write file to disk");
  }
}

/**
 * 下载视频到文件（方案 C）。
 *
 * 优先走流式下载（主进程直接 fetch + pipeline，数据不进渲染进程内存），
 * 用于支持 Seedance 2.5 30秒 4K / Kling 180秒 等大视频。
 *
 * 若主进程 HTTP API 不可用（httpDownloadToFile 返回 null），回退到
 * resilientFetch + httpWriteFile 路径——此路径会占用渲染进程内存（整个视频 Uint8Array），
 * 但功能仍可用，作为兜底保证。
 */
async function downloadVideoToFile(url: string, filePath: string): Promise<{ totalBytes: number }> {
  const streamResult = await httpDownloadToFile(url, filePath);
  if (streamResult !== null) {
    if (!streamResult.success || !streamResult.data) {
      throw new Error(streamResult.error ?? "Stream download failed");
    }
    return { totalBytes: streamResult.data.totalBytes };
  }

  // Fallback: resilientFetch + httpWriteFile（占用渲染进程内存）
  errorLogger.warn("[VideoCache] httpDownloadToFile 不可用，回退到 resilientFetch + httpWriteFile 路径");
  const { data, totalBytes } = await downloadVideoData(url);
  await writeVideoFile(filePath, data);
  return { totalBytes };
}

async function verifyFileIntegrity(filePath: string, expectedBytes: number): Promise<void> {
  if (expectedBytes <= 0) return;
  const fileInfo = await httpGetFileInfo(filePath);
  if (!fileInfo || !fileInfo.success || fileInfo.size === expectedBytes) return;

  await httpDeleteFile(filePath);
  throw new Error(`下载不完整: ${fileInfo.size}/${expectedBytes} bytes`);
}

async function cacheVideoRecord(
  taskId: string,
  filePath: string,
  originalUrl: string,
  totalBytes: number,
): Promise<void> {
  try {
    await container.videoCacheStorage.cacheVideoFile({
      taskId,
      filePath,
      originalUrl,
      mimeType: "video/mp4",
      fileSize: totalBytes,
    });
  } catch (dbError) {
    errorLogger.warn(
      new AppError("CACHE_DB_ERROR", "数据库记录失败，清理已写入的缓存文件", dbError),
      "VideoCache",
    );
    try {
      const exists = await httpFileExists(filePath);
      if (exists) await httpDeleteFile(filePath);
    } catch (cleanupError) {
      errorLogger.warn(
        new AppError("CACHE_CLEANUP_ERROR", "清理失败缓存文件失败", cleanupError),
        "VideoCache",
      );
    }
    throw dbError;
  }
}

async function syncLocalPath(taskId: string, filePath: string): Promise<void> {
  try {
    await container.videoTaskStorage.updateVideoTask(taskId, {
      localVideoPath: filePath,
    });
  } catch (syncError) {
    errorLogger.warn(
      new AppError("CACHE_SYNC_ERROR", "同步本地路径到 video_tasks 失败", syncError),
      "VideoCache",
    );
  }
}

async function handleDownloadError(
  taskId: string,
  error: unknown,
  attempt: number,
): Promise<{ recovered: boolean; newUrl?: string }> {
  errorLogger.warn(
    new AppError("CACHE_VIDEO_ERROR", `Failed (attempt ${attempt + 1})`, error),
    "VideoCache",
  );

  if (!isHttpExpiredError(error) || attempt !== 0) {
    return { recovered: false };
  }

  try {
    const recoveryFn = getRecoveryFn();
    const recoveryResult = recoveryFn ? await recoveryFn(taskId) : null;
    if (recoveryResult?.ok && recoveryResult.value?.videoUrl) {
      errorLogger.warn(
        new AppError("CACHE_VIDEO_ERROR", `URL过期，已刷新重试 (attempt ${attempt + 1})`, error),
        "VideoCache",
      );
      await new Promise((r) => setTimeout(r, CACHE_RETRY_INTERVAL_MS));
      return { recovered: true, newUrl: recoveryResult.value.videoUrl };
    }
  } catch (recoveryError) {
    errorLogger.warn(
      new AppError("CACHE_VIDEO_ERROR", "URL刷新失败", recoveryError),
      "VideoCache",
    );
  }

  return { recovered: false };
}

export async function recoverUncachedVideos(): Promise<Result<number>> {
  return fromAsyncThrowable(async () => {
    const tasks = await container.videoTaskStorage.getVideoTasksByStatus("completed");
    let recovered = 0;
    for (const task of tasks) {
      if (!task.videoUrl) continue;
      const cached = await container.videoCacheStorage.getCachedVideoFile(task.taskId);
      if (!cached) {
        const result = await cacheVideoBlob(task.taskId, task.videoUrl);
        if (result.ok && result.value) recovered++;
      }
    }
    return recovered;
  });
}

export async function getCachedVideoUrl(taskId: string): Promise<Result<string | null>> {
  return fromAsyncThrowable(async () => {
    const cached = await container.videoCacheStorage.getCachedVideoFile(taskId);
    if (!cached) return null;

    const fileUrl = `vcache://${taskId}`;
    registerObjectUrl(taskId, fileUrl);
    return fileUrl;
  });
}

export async function getVideoUrlWithCache(
  taskId: string,
  remoteUrl?: string,
): Promise<Result<{ url: string | null; fromCache: boolean; cacheFailed: boolean }>> {
  return fromAsyncThrowable(async () => {
    const task = await container.videoTaskStorage.getVideoTaskById(taskId);
    if (task?.localVideoPath) {
      const exists = await httpFileExists(task.localVideoPath);
      if (exists) {
        return { url: `file://${task.localVideoPath}`, fromCache: true, cacheFailed: false };
      }
    }

    const cachedUrlResult = await getCachedVideoUrl(taskId);
    const cachedUrl = cachedUrlResult.ok ? cachedUrlResult.value : null;

    if (cachedUrl) {
      return { url: cachedUrl, fromCache: true, cacheFailed: false };
    }

    if (remoteUrl) {
      try {
        const cacheResult = await cacheVideoBlob(taskId, remoteUrl);
        if (cacheResult.ok && cacheResult.value) {
          const newCachedUrlResult = await getCachedVideoUrl(taskId);
          const newCachedUrl = newCachedUrlResult.ok ? newCachedUrlResult.value : null;
          if (newCachedUrl) {
            return { url: newCachedUrl, fromCache: true, cacheFailed: false };
          }
        }
      } catch (error) {
        errorLogger.debug("[VideoCache] 缓存视频失败，回退到远程 URL:", error instanceof Error ? error.message : error);
      }
      return { url: remoteUrl, fromCache: false, cacheFailed: true };
    }

    return { url: null, fromCache: false, cacheFailed: false };
  });
}

export async function removeCachedVideo(taskId: string): Promise<Result<void>> {
  return fromAsyncThrowable(async () => {
    const filePath = await container.videoCacheStorage.removeCachedVideoFile(taskId);
    if (filePath) {
      try {
        const exists = await httpFileExists(filePath);
        if (exists) await httpDeleteFile(filePath);
      } catch (e) {
        errorLogger.warn(
          new AppError("CACHE_CLEANUP_ERROR", "删除缓存文件失败", e),
          "VideoCache",
        );
      }
    }
  });
}

export async function cleanExpiredVideoCache(
  maxAgeMs: number = 30 * 24 * 60 * 60 * 1000,
): Promise<Result<number>> {
  return fromAsyncThrowable(async () => {
    const filesToDelete = await container.videoCacheStorage.cleanExpiredVideoCache(maxAgeMs);
    {
      for (const file of filesToDelete) {
        try {
          const exists = await httpFileExists(file);
          if (exists) await httpDeleteFile(file);
        } catch (e) {
          errorLogger.warn(
            new AppError("CACHE_CLEANUP_ERROR", "删除过期缓存文件失败", e),
            "VideoCache",
          );
        }
      }
    }
    return filesToDelete.length;
  });
}

export async function getCacheStats(): Promise<Result<{
  count: number;
  totalSizeMB: number;
  maxCount: number;
  maxSizeMB: number;
}>> {
  return fromAsyncThrowable(async () => {
    const stats = await container.videoCacheStorage.getVideoCacheStats();
    return {
      count: stats.count,
      totalSizeMB: stats.totalSize / (1024 * 1024),
      maxCount: MAX_CACHE_SIZE,
      maxSizeMB: MAX_TOTAL_BLOB_SIZE_MB,
    };
  });
}

export async function checkCachedVideo(taskId: string): Promise<{ exists: boolean; fileSizeMB?: number }> {
  try {
    const cached = await container.videoCacheStorage.getCachedVideoFile(taskId);
    if (cached) {
      return {
        exists: true,
        fileSizeMB: cached.fileSize ? cached.fileSize / (1024 * 1024) : undefined,
      };
    }
    return { exists: false };
  } catch (e) {
    errorLogger.warn("[VideoCache] checkCachedVideo failed", e);
    return { exists: false };
  }
}

export async function getVideoFileStream(taskId: string): Promise<string | null> {
  try {
    const cached = await container.videoCacheStorage.getCachedVideoFile(taskId);
    return cached?.filePath || null;
  } catch (e) {
    errorLogger.warn("[VideoCache] getVideoFileStream failed", e);
    return null;
  }
}

export async function getCachedVideo(taskId: string): Promise<Blob | null> {
  try {
    const cached = await container.videoCacheStorage.getCachedVideoFile(taskId);
    if (!cached) return null;

    const result = await httpReadFile(cached.filePath);
    if (!result?.success || !result.data) {
      return null;
    }

    const blob = new Blob([result.data], { type: cached.mimeType });
    return blob;
  } catch (e) {
    errorLogger.warn("[VideoCache] getCachedVideo failed", e);
    return null;
  }
}
