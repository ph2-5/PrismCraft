/**
 * Task 2A.21: animatic-exporter — 帧序列 → ffmpeg-runner → MP4 animatic
 *
 * 调用 render-service 渲染 BlockoutScene 的完整帧序列，
 * 然后通过 ffmpeg-runner 合成为 MP4 视频。
 *
 * 输出 MP4 用于：
 * 1. Seedance 2.5 白模输入包（animaticVideoPath）
 * 2. GenerationAsset.blockout_animatic 持久化
 * 3. UI 预览（<video> 标签播放）
 *
 * 依赖：render-service（Three.js） + ffmpeg-runner（HTTP API）
 */

import { getCacheDirectory, writeFile, deleteFile } from "@/shared/file-http";
import { executeFfmpeg, checkFfmpegAvailable } from "@/modules/ffmpeg-runner";
import type { BlockoutScene } from "../domain/scene-schema";
import {
  renderFrameSequence,
  renderFrame,
  renderStaticView,
  writeFramesToFiles,
  type FrameSequenceResult,
  type RenderOptions,
} from "./render-service";
import { getCameraPoseAtTime } from "./camera-animator";

// ─── 公共类型 ─────────────────────────────────────────────────────────────────

export interface AnimaticExportOptions extends RenderOptions {
  /** FPS（每秒帧数，默认 24） */
  fps?: number;
  /** 输出 MP4 文件路径（不指定时写入缓存目录） */
  outputPath?: string;
  /** 是否生成帧序列文件（默认 true，用于调试；产品环境可关闭） */
  keepFrameFiles?: boolean;
  /** 视频编码器（默认 libx264） */
  videoCodec?: "libx264" | "libx265" | "mpeg4";
  /** CRF（恒定质量，0-51，越小质量越高，默认 23） */
  crf?: number;
  /** 预设（编码速度/压缩比权衡，默认 medium） */
  preset?: "ultrafast" | "superfast" | "veryfast" | "faster" | "fast" | "medium" | "slow" | "slower";
}

const DEFAULT_ANIMATIC_OPTIONS: Required<Omit<AnimaticExportOptions, "outputPath">> = {
  width: 960,
  height: 540,
  antialias: true,
  pixelRatio: 1,
  clearColor: 0x1a1a1a,
  clearAlpha: 1,
  fps: 24,
  keepFrameFiles: false,
  videoCodec: "libx264",
  crf: 23,
  preset: "medium",
};

export interface AnimaticExportResult {
  /** 是否成功 */
  success: boolean;
  /** MP4 文件路径（成功时） */
  outputPath?: string;
  /** 错误信息（失败时） */
  error?: string;
  /** 渲染统计 */
  stats: {
    /** 帧数 */
    frameCount: number;
    /** 总时长（秒） */
    duration: number;
    /** FPS */
    fps: number;
    /** 分辨率 */
    width: number;
    height: number;
    /** 渲染耗时（ms） */
    renderTimeMs: number;
    /** ffmpeg 编码耗时（ms） */
    encodeTimeMs: number;
  };
  /** 帧序列文件路径（keepFrameFiles=true 时返回，否则为空数组） */
  framePaths: string[];
}

// ─── 主导出函数 ───────────────────────────────────────────────────────────────

/**
 * 导出 BlockoutScene 为 MP4 animatic 视频。
 *
 * 流程：
 * 1. 检查 ffmpeg 是否可用
 * 2. 通过 render-service 渲染帧序列（PNG）
 * 3. 写入临时目录
 * 4. 调用 ffmpeg 合成 MP4
 * 5. 清理临时帧文件（除非 keepFrameFiles=true）
 *
 * 失败时返回 { success: false, error, stats: {...} }，不抛异常。
 */
export async function exportAnimatic(
  blockout: BlockoutScene,
  options: AnimaticExportOptions = {},
): Promise<AnimaticExportResult> {
  const opts = { ...DEFAULT_ANIMATIC_OPTIONS, ...options };
  const fps = opts.fps;

  // ── 1. ffmpeg 可用性检查 ──
  const ffmpegCheck = await checkFfmpegAvailable();
  if (!ffmpegCheck.available) {
    return {
      success: false,
      error: `ffmpeg 不可用：${ffmpegCheck.version ? `探测失败 (${ffmpegCheck.version})` : "未在系统 PATH 中找到 ffmpeg"}`,
      stats: {
        frameCount: 0,
        duration: 0,
        fps,
        width: opts.width,
        height: opts.height,
        renderTimeMs: 0,
        encodeTimeMs: 0,
      },
      framePaths: [],
    };
  }

  // ── 2. 渲染帧序列 ──
  const renderStart = Date.now();
  let frameSequence: FrameSequenceResult;
  try {
    frameSequence = renderFrameSequence(blockout, {
      width: opts.width,
      height: opts.height,
      antialias: opts.antialias,
      pixelRatio: opts.pixelRatio,
      clearColor: opts.clearColor,
      clearAlpha: opts.clearAlpha,
      fps,
    });
  } catch (e) {
    return {
      success: false,
      error: `渲染帧序列失败：${e instanceof Error ? e.message : String(e)}`,
      stats: {
        frameCount: 0,
        duration: 0,
        fps,
        width: opts.width,
        height: opts.height,
        renderTimeMs: Date.now() - renderStart,
        encodeTimeMs: 0,
      },
      framePaths: [],
    };
  }
  const renderTimeMs = Date.now() - renderStart;

  if (frameSequence.frames.length === 0) {
    return {
      success: false,
      error: "渲染未产生任何帧（场景可能为空或 WebGL 不可用）",
      stats: {
        frameCount: 0,
        duration: frameSequence.duration,
        fps,
        width: opts.width,
        height: opts.height,
        renderTimeMs,
        encodeTimeMs: 0,
      },
      framePaths: [],
    };
  }

  // ── 3. 写入临时帧文件 ──
  const cacheDir = await getCacheDirectory();
  if (!cacheDir.success || !cacheDir.path) {
    return {
      success: false,
      error: "无法获取缓存目录",
      stats: {
        frameCount: frameSequence.frames.length,
        duration: frameSequence.duration,
        fps,
        width: opts.width,
        height: opts.height,
        renderTimeMs,
        encodeTimeMs: 0,
      },
      framePaths: [],
    };
  }

  const frameDir = `${cacheDir.path}/blockout-3d/${blockout.id}_${Date.now()}`;
  const basename = "frame";
  let framePaths: string[] = [];
  try {
    framePaths = await writeFramesToFiles(
      frameSequence.frames.map((f) => ({ time: f.time, data: f.data })),
      frameDir,
      basename,
    );
  } catch (e) {
    return {
      success: false,
      error: `写入帧文件失败：${e instanceof Error ? e.message : String(e)}`,
      stats: {
        frameCount: frameSequence.frames.length,
        duration: frameSequence.duration,
        fps,
        width: opts.width,
        height: opts.height,
        renderTimeMs,
        encodeTimeMs: 0,
      },
      framePaths: [],
    };
  }

  // ── 4. 调用 ffmpeg 合成 MP4 ──
  const encodeStart = Date.now();
  const inputPattern = `${frameDir}/${basename}_%04d.png`;
  const outputPath = options.outputPath ?? `${frameDir}/animatic.mp4`;

  const ffmpegArgs = [
    "-y",
    "-framerate", String(fps),
    "-i", inputPattern,
    "-c:v", opts.videoCodec,
    "-preset", opts.preset,
    "-crf", String(opts.crf),
    "-pix_fmt", "yuv420p", // 兼容性最好的像素格式
    "-movflags", "+faststart", // web 播放优化
    "-r", String(fps),
    outputPath,
  ];

  const ffmpegResult = await executeFfmpeg(ffmpegArgs, {
    timeout: 5 * 60 * 1000, // 5 分钟超时
  });

  const encodeTimeMs = Date.now() - encodeStart;

  if (!ffmpegResult.success) {
    return {
      success: false,
      error: `ffmpeg 编码失败：${ffmpegResult.error ?? "未知错误"}`,
      stats: {
        frameCount: frameSequence.frames.length,
        duration: frameSequence.duration,
        fps,
        width: opts.width,
        height: opts.height,
        renderTimeMs,
        encodeTimeMs,
      },
      framePaths: opts.keepFrameFiles ? framePaths : [],
    };
  }

  // ── 5. 清理临时帧文件 ──
  if (!opts.keepFrameFiles) {
    await cleanupFrameFiles(framePaths);
    framePaths = [];
  }

  return {
    success: true,
    outputPath,
    stats: {
      frameCount: frameSequence.frames.length,
      duration: frameSequence.duration,
      fps,
      width: opts.width,
      height: opts.height,
      renderTimeMs,
      encodeTimeMs,
    },
    framePaths,
  };
}

// ─── 预览快照（单帧 PNG） ─────────────────────────────────────────────────────

export interface PreviewSnapshotResult {
  success: boolean;
  /** PNG 文件路径（成功时） */
  outputPath?: string;
  /** PNG data URL（成功时，可直接用于 <img src="...">） */
  dataUrl?: string;
  error?: string;
}

/**
 * 生成 3D 预览快照（单帧 PNG）。
 *
 * 用于 GenerationAsset.preview_3d_snapshot 持久化。
 * 取相机轨迹的中间时刻作为预览位姿（更能体现运镜）。
 */
export async function exportPreviewSnapshot(
  blockout: BlockoutScene,
  options: RenderOptions = {},
): Promise<PreviewSnapshotResult> {
  const cameraPath = blockout.cameraPath ?? [];

  let result;
  if (cameraPath.length === 0) {
    result = renderStaticView(blockout, options);
  } else {
    const duration = cameraPath[cameraPath.length - 1]!.time;
    const pose = getCameraPoseAtTime(cameraPath, duration / 2, blockout.camera.fov);
    result = renderFrame(blockout, pose, options);
  }

  // 写入缓存目录
  const cacheDir = await getCacheDirectory();
  if (!cacheDir.success || !cacheDir.path) {
    return {
      success: false,
      error: "无法获取缓存目录",
    };
  }

  const outputPath = `${cacheDir.path}/blockout-3d/preview_${blockout.id}_${Date.now()}.png`;
  const writeResult = await writeFile(outputPath, result.data);
  if (!writeResult.success) {
    return {
      success: false,
      error: `写入预览快照失败：${writeResult.error ?? "未知错误"}`,
    };
  }

  return {
    success: true,
    outputPath,
    dataUrl: result.dataUrl,
  };
}

// ─── 清理工具 ─────────────────────────────────────────────────────────────────

/** 清理临时帧文件 */
async function cleanupFrameFiles(paths: string[]): Promise<void> {
  for (const p of paths) {
    try {
      await deleteFile(p);
    } catch {
      // 忽略清理错误
    }
  }
}

// ─── 重新导出 ─────────────────────────────────────────────────────────────────

export type { FrameSequenceResult };
