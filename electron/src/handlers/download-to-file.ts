/**
 * 主进程流式下载 handler（方案 C）。
 *
 * 直接使用 Node.js fetch + stream/promises.pipeline 把远程 URL 流式下载到本地文件，
 * 避免把整个文件读入内存。用于支持 Seedance 2.5 30秒 4K / Kling 180秒 等大视频。
 *
 * 内存占用恒定（仅 chunk buffer，~64KB），不受文件大小影响。
 *
 * 设计要点：
 * - stall 检测：每收到一块数据就重置 stall 定时器，超过 STALL_TIMEOUT_MS 无数据则中止
 * - 总超时：DOWNLOAD_TIMEOUT_MS 兜底，防止无限等待
 * - 重试：失败时清理半成品文件，整体重试（不基于 Range 续传，简单可靠）
 * - 路径校验：复用 file-routes.ts 的 ALLOWED_ROOTS 模式，防止越权写入
 * - SSRF 防护：所有 URL（含重定向每一跳）都走 ssrfGuard.validate，fail-close
 *   （R105/R118/R133 合规；视频 URL 来自 AI provider 返回值，非用户配置，不做 loopback 放行）
 * - 手动重定向循环：redirect: "manual" + 最多 3 跳，每跳 SSRF 校验
 */
import fs from "fs";
import fsp from "fs/promises";
import os from "os";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import type { ReadableStream as WebReadableStream } from "stream/web";
import { getLogger } from "../logging";
import { ssrfGuard } from "../security";
import {
  getUserDataRootDir,
  getAllUserDataDirs,
  isPathUnderAnyRoot,
} from "../app-paths";

const logger = getLogger("download-to-file");

// 5 分钟总超时（用于兜底，防止无限等待）
const DOWNLOAD_TIMEOUT_MS = 300_000;
// 30 秒无数据则认为卡住，中止下载
const STALL_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;
// 最大重定向跳数（R118 合规，与 cacheRemoteImageLocally 一致）
const MAX_REDIRECTS = 3;

const USER_DATA_ROOT = getUserDataRootDir();
const ASSETS_BASE_DIR = path.join(USER_DATA_ROOT, "Assets");
const CACHE_BASE_DIR = path.join(USER_DATA_ROOT, "Cache");
const PLUGIN_BASE_DIR = path.join(USER_DATA_ROOT, "Plugins");
const UPLOAD_BASE_DIR = path.join(os.tmpdir(), "ai-animation-studio", "uploads");

const CATEGORY_DIRS: Record<string, string> = {
  character: path.join(ASSETS_BASE_DIR, "Characters"),
  scene: path.join(ASSETS_BASE_DIR, "Scenes"),
  storyboard: path.join(ASSETS_BASE_DIR, "Storyboards"),
  "video-cache": path.join(CACHE_BASE_DIR, "Videos"),
  "image-cache": path.join(CACHE_BASE_DIR, "Images"),
  upload: UPLOAD_BASE_DIR,
  plugin: PLUGIN_BASE_DIR,
};

const ALLOWED_ROOTS = [
  ...Object.values(CATEGORY_DIRS),
  ...getAllUserDataDirs(),
];

export interface DownloadToFileOptions {
  timeout?: number;
  maxRetries?: number;
}

export interface DownloadToFileResult {
  success: boolean;
  totalBytes: number;
  duration: number;
  error?: string;
}

/**
 * 流式下载到文件。失败时会清理半成品文件。
 */
export async function downloadToFile(
  url: string,
  filePath: string,
  options: DownloadToFileOptions = {},
  onProgress?: (loaded: number, total: number) => void,
): Promise<DownloadToFileResult> {
  const startTime = Date.now();
  const maxRetries = options.maxRetries ?? MAX_RETRIES;

  const resolvedPath = path.resolve(filePath);
  if (!(await isPathAllowed(resolvedPath))) {
    return {
      success: false,
      totalBytes: 0,
      duration: 0,
      error: "FILE_PATH_NOT_ALLOWED",
    };
  }

  // 确保父目录存在
  const parentDir = path.dirname(resolvedPath);
  try {
    await fsp.mkdir(parentDir, { recursive: true });
  } catch (error) {
    return {
      success: false,
      totalBytes: 0,
      duration: Date.now() - startTime,
      error: `Failed to create parent directory: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await downloadOnce(url, resolvedPath, options, onProgress);
      return {
        success: true,
        totalBytes: result.totalBytes,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      logger.warn(`[DownloadToFile] attempt ${attempt + 1}/${maxRetries} failed`, {
        url,
        error: lastError.message,
      });

      // 清理半成品文件
      try {
        await fsp.unlink(resolvedPath);
      } catch {
        // 文件可能不存在，忽略
      }

      // AbortError 不重试（用户主动取消）
      if (lastError.name === "AbortError") break;

      // 最后一次不等待
      if (attempt < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, RETRY_BASE_DELAY_MS * (attempt + 1)));
      }
    }
  }

  return {
    success: false,
    totalBytes: 0,
    duration: Date.now() - startTime,
    error: lastError?.message ?? "Unknown error",
  };
}

/**
 * 执行一次下载。失败时抛出错误（由上层 downloadToFile 决定是否重试）。
 *
 * SSRF 防护：所有 URL（含重定向每一跳）都走 ssrfGuard.validate，fail-close。
 * 重定向使用 manual 模式手动循环，每跳校验目标 URL，防止 R118 类型攻击
 * （重定向到 file:// / 内网地址 / 元数据服务）。
 */
async function downloadOnce(
  url: string,
  filePath: string,
  options: DownloadToFileOptions,
  onProgress?: (loaded: number, total: number) => void,
): Promise<{ totalBytes: number }> {
  const controller = new AbortController();
  const totalTimeout = options.timeout ?? DOWNLOAD_TIMEOUT_MS;

  // stall 检测：每次有数据就重置定时器
  let stallTimer: NodeJS.Timeout | null = null;
  const resetStallTimer = () => {
    if (stallTimer) clearTimeout(stallTimer);
    stallTimer = setTimeout(() => {
      const err = new Error(`Download stalled (no data for ${STALL_TIMEOUT_MS}ms)`);
      err.name = "AbortError";
      controller.abort();
    }, STALL_TIMEOUT_MS);
  };

  // 总超时
  const totalTimer = setTimeout(() => {
    const err = new Error(`Download timed out after ${totalTimeout}ms`);
    err.name = "AbortError";
    controller.abort();
  }, totalTimeout);

  try {
    resetStallTimer();

    // 初始 URL SSRF 校验
    await validateUrlWithSsrf(url);

    // 手动重定向循环（R118 合规）
    let currentUrl = url;
    let response: Response | null = null;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      response = await fetch(currentUrl, {
        signal: controller.signal,
        redirect: "manual",
      });

      // 3xx 重定向：校验 Location 头后继续
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) {
          throw new Error(`Redirect ${response.status} without Location header`);
        }
        const nextUrl = new URL(location, currentUrl).href;
        if (hop >= MAX_REDIRECTS) {
          throw new Error(`Too many redirects (max ${MAX_REDIRECTS})`);
        }
        // 每跳都校验 SSRF
        await validateUrlWithSsrf(nextUrl);
        currentUrl = nextUrl;
        continue;
      }

      // 非 3xx，结束循环
      break;
    }

    if (!response) {
      throw new Error("No response received");
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentLength = response.headers.get("content-length");
    const total = contentLength ? parseInt(contentLength, 10) : 0;
    let loaded = 0;

    if (!response.body) {
      throw new Error("Response body is null");
    }

    // 用 Readable.fromWeb 把 Web ReadableStream 转为 Node Readable
    const nodeStream = Readable.fromWeb(response.body as WebReadableStream<Uint8Array>);
    const writeStream = fs.createWriteStream(filePath);

    // 进度跟踪 + stall 重置
    nodeStream.on("data", (chunk: Buffer) => {
      loaded += chunk.length;
      resetStallTimer();
      if (onProgress) {
        onProgress(loaded, total);
      }
    });

    await pipeline(nodeStream, writeStream);

    return { totalBytes: total || loaded };
  } finally {
    if (stallTimer) clearTimeout(stallTimer);
    clearTimeout(totalTimer);
  }
}

/**
 * SSRF 校验：fail-close 策略（R133 合规）。
 * 视频 URL 来自 AI provider 返回值，非用户配置，不做 loopback 放行。
 */
async function validateUrlWithSsrf(urlStr: string): Promise<void> {
  try {
    const result = await ssrfGuard.validate(urlStr);
    if (!result.safe) {
      throw new Error(`URL blocked by SSRF guard: ${result.reason ?? "unknown"}`);
    }
  } catch (error) {
    // 校验抛错时也视为不安全（fail-close，R133 合规）
    if (error instanceof Error && error.message.startsWith("URL blocked by SSRF guard")) {
      throw error;
    }
    logger.warn("[DownloadToFile] SSRF validation failed, blocking by default (fail-close)", {
      url: urlStr,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error(`SSRF validation failed (fail-close): ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function isPathAllowed(filePath: string): Promise<boolean> {
  try {
    const resolved = await fsp.realpath(path.resolve(filePath));
    return isPathUnderAnyRoot(resolved, ALLOWED_ROOTS);
  } catch {
    // realpath 失败（文件不存在等），用 path.resolve 后的路径校验
    const resolved = path.resolve(filePath);
    if (filePath.includes("..") || resolved.includes("..")) return false;
    return isPathUnderAnyRoot(resolved, ALLOWED_ROOTS);
  }
}
