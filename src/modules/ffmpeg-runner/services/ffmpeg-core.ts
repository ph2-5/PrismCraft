/**
 * ffmpeg 核心通信层
 *
 * 职责：
 * - 封装与主进程 ffmpeg-handler 的 HTTP 通信（execute / probe）
 * - 提供 ffmpeg 可用性检查（带缓存，1 分钟 TTL）
 * - 提供输出路径解析工具（未指定时写入缓存目录）
 *
 * 对外导出：executeFfmpeg / checkFfmpegAvailable / resetFfmpegCache / resolveOutputPath
 * 内部使用：executeFfmpegCommand / ffmpegAvailableCache
 */

import { API_SERVER_PORT, ELECTRON_APP_HEADERS } from "@/config/constants";
import { getConfig, getCacheDirectory } from "@/shared/file-http";
import type { FfmpegResult, FfmpegApiResponse, FfmpegProbeResponse } from "./ffmpeg-types";

// ============= 缓存 =============

let ffmpegAvailableCache: { available: boolean; path?: string; version?: string } | null = null;
let ffmpegCheckTime = 0;
const FFMPEG_CACHE_TTL = 60_000; // 1 分钟内不重复 probe

// ============= 核心通信函数 =============

/** 调用主进程执行 ffmpeg 命令 */
async function executeFfmpegCommand(
  args: string[],
  options?: { timeout?: number },
): Promise<FfmpegResult> {
  // 获取用户配置的 ffmpeg 路径（可选）
  const ffmpegPath = (await getConfig("ffmpegPath")) as string | undefined;

  try {
    const response = await fetch(`http://localhost:${API_SERVER_PORT}/api/ffmpeg/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ELECTRON_APP_HEADERS },
      body: JSON.stringify({
        args,
        ffmpegPath: ffmpegPath || undefined,
        timeout: options?.timeout,
      }),
      signal: AbortSignal.timeout(options?.timeout ?? 10 * 60 * 1000),
    });

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const result = (await response.json()) as FfmpegApiResponse;
    if (!result.success) {
      return {
        success: false,
        error: result.error ?? "ffmpeg 执行失败",
        stderr: result.data?.stderr,
        duration: result.data?.duration,
      };
    }

    return {
      success: true,
      duration: result.data?.duration,
      stderr: result.data?.stderr,
    };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * 执行原始 ffmpeg 命令（高级 API 不覆盖的场景使用）
 *
 * 用途：
 * - 图像序列 → 视频（blockout-3d animatic-exporter 使用）
 * - 自定义滤镜图（filter_complex）
 * - 其他高级用法
 *
 * 注意：调用方需要自行构造 ffmpeg 参数，建议优先使用高级 API。
 */
export async function executeFfmpeg(
  args: string[],
  options?: { timeout?: number },
): Promise<FfmpegResult> {
  return executeFfmpegCommand(args, options);
}

// ============= 可用性检查（带缓存） =============

/**
 * 检查 ffmpeg 是否可用（带缓存）
 *
 * 优先使用用户配置的 ffmpegPath，否则探测系统 PATH。
 * 结果缓存 1 分钟，避免频繁 probe。
 */
export async function checkFfmpegAvailable(): Promise<{
  available: boolean;
  path?: string;
  version?: string;
}> {
  // 缓存未过期时直接返回
  if (ffmpegAvailableCache && Date.now() - ffmpegCheckTime < FFMPEG_CACHE_TTL) {
    return ffmpegAvailableCache;
  }

  const ffmpegPath = (await getConfig("ffmpegPath")) as string | undefined;

  try {
    const response = await fetch(`http://localhost:${API_SERVER_PORT}/api/ffmpeg/probe`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ELECTRON_APP_HEADERS },
      body: JSON.stringify({ ffmpegPath: ffmpegPath || undefined }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      ffmpegAvailableCache = { available: false };
      ffmpegCheckTime = Date.now();
      return ffmpegAvailableCache;
    }

    const result = (await response.json()) as FfmpegProbeResponse;
    const data = result.data;

    if (result.success && data?.available) {
      ffmpegAvailableCache = {
        available: true,
        path: data.path,
        version: data.version,
      };
    } else {
      ffmpegAvailableCache = { available: false };
    }
    ffmpegCheckTime = Date.now();
    return ffmpegAvailableCache;
  } catch {
    ffmpegAvailableCache = { available: false };
    ffmpegCheckTime = Date.now();
    return ffmpegAvailableCache;
  }
}

/** 重置 ffmpeg 可用性缓存（配置变更后调用） */
export function resetFfmpegCache(): void {
  ffmpegAvailableCache = null;
  ffmpegCheckTime = 0;
}

/** 解析输出路径（未指定时写入缓存目录） */
export async function resolveOutputPath(
  outputPath: string | undefined,
  subdir: string,
  filename: string,
): Promise<string> {
  if (outputPath) return outputPath;
  const dirResult = await getCacheDirectory();
  if (!dirResult.success || !dirResult.path) {
    throw new Error("Failed to get cache directory");
  }
  return `${dirResult.path}/agent/ffmpeg/${subdir}/${Date.now()}_${filename}`;
}

// 导出内部函数供其他模块使用
export { executeFfmpegCommand };
