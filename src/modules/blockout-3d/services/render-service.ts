/**
 * Task 2A.21: render-service — WebGL 渲染 → PNG 帧序列
 *
 * 使用 OffscreenCanvas（或离屏 WebGLRenderer）渲染 BlockoutScene 在指定相机位姿下的画面。
 *
 * 用途：
 * 1. 生成 fallback 关键帧图（5 个时间点）
 * 2. 生成 animatic 视频帧序列（fps × duration 个 PNG）
 * 3. 生成 3D 预览快照（用于 GenerationAsset.preview_3d_snapshot）
 *
 * 依赖 Three.js — 通过 scene-builder 构建 Scene 后渲染。
 * 调用方需在 Electron 主线程或 Worker 中调用（耗时操作）。
 */

import { writeFile } from "@/shared/file-http";
import type { BlockoutScene } from "../domain/scene-schema";
import type { CameraKeyframe } from "../domain/camera-path-types";
import { buildScene, disposeScene, applyCameraPose, type BuiltScene } from "./scene-builder";
import { getCameraPoseAtTime, type CameraPose } from "./camera-animator";

// ─── 配置 ─────────────────────────────────────────────────────────────────────

export interface RenderOptions {
  /** 输出图像宽度（像素，默认 960） */
  width?: number;
  /** 输出图像高度（像素，默认 540） */
  height?: number;
  /** 是否启用抗锯齿（默认 true） */
  antialias?: boolean;
  /** 像素比（默认 1，离屏渲染不需要 devicePixelRatio） */
  pixelRatio?: number;
  /** 背景色（默认 0x1a1a1a 深灰，便于白色网格可见） */
  clearColor?: number;
  /** 背景透明度（默认 1） */
  clearAlpha?: number;
}

export const DEFAULT_RENDER_OPTIONS: Required<RenderOptions> = {
  width: 960,
  height: 540, // 16:9
  antialias: true,
  pixelRatio: 1,
  clearColor: 0x1a1a1a,
  clearAlpha: 1,
};

/** render-service 内部使用 — 强制开启 preserveDrawingBuffer 以支持 canvas.toDataURL */
function toBuilderOptions(opts: Required<RenderOptions>) {
  return {
    width: opts.width,
    height: opts.height,
    antialias: opts.antialias,
    pixelRatio: opts.pixelRatio,
    clearColor: opts.clearColor,
    clearAlpha: opts.clearAlpha,
    preserveDrawingBuffer: true,
  };
}

// ─── 单帧渲染 ─────────────────────────────────────────────────────────────────

export interface RenderResult {
  /** PNG 数据（Uint8Array） */
  data: Uint8Array;
  /** PNG data URL（可直接用于 <img src="...">） */
  dataUrl: string;
  /** 实际渲染分辨率 */
  width: number;
  height: number;
}

/**
 * 在指定相机位姿下渲染一帧。
 *
 * 调用方传入 BlockoutScene + CameraPose，函数内部构建 Three.js Scene，
 * 渲染后将 canvas 内容导出为 PNG。
 *
 * 注意：每次调用都会创建/销毁 WebGL 上下文，不适合连续渲染。
 * 批量渲染请使用 renderFrameSequence。
 */
export function renderFrame(
  blockout: BlockoutScene,
  pose: CameraPose,
  options: RenderOptions = {},
): RenderResult {
  const opts = { ...DEFAULT_RENDER_OPTIONS, ...options };
  const built = buildScene(blockout, toBuilderOptions(opts));

  try {
    applyCameraPose(built.camera, pose);
    built.camera.aspect = opts.width / opts.height;
    built.camera.updateProjectionMatrix();
    built.renderer.render(built.scene, built.camera);

    const canvas = built.renderer.domElement;
    const dataUrl = canvas.toDataURL("image/png");
    const data = dataUrlToBytes(dataUrl);

    return { data, dataUrl, width: opts.width, height: opts.height };
  } finally {
    disposeScene(built);
  }
}

/**
 * 渲染静态相机视图（无 cameraPath 时使用）。
 */
export function renderStaticView(
  blockout: BlockoutScene,
  options: RenderOptions = {},
): RenderResult {
  return renderFrame(
    blockout,
    {
      position: blockout.camera.position,
      target: blockout.camera.target,
      fov: blockout.camera.fov,
    },
    options,
  );
}

// ─── 帧序列渲染（用于 animatic） ────────────────────────────────────────────

export interface FrameSequenceResult {
  /** 帧列表（按时间升序） */
  frames: Array<{
    /** 时间点（秒） */
    time: number;
    /** PNG data URL */
    dataUrl: string;
    /** PNG 二进制数据 */
    data: Uint8Array;
  }>;
  /** 总时长（秒） */
  duration: number;
  /** FPS（每秒帧数） */
  fps: number;
  /** 实际渲染分辨率 */
  width: number;
  height: number;
}

export interface FrameSequenceOptions extends RenderOptions {
  /** FPS（每秒帧数，默认 24） */
  fps?: number;
}

/**
 * 渲染相机轨迹动画的完整帧序列。
 *
 * 适用于生成 animatic 视频素材。
 * 注意：本函数仅生成帧序列，不合成视频 — 视频合成由 animatic-exporter 完成。
 */
export function renderFrameSequence(
  blockout: BlockoutScene,
  options: FrameSequenceOptions = {},
): FrameSequenceResult {
  const opts = { ...DEFAULT_RENDER_OPTIONS, ...options };
  const fps = options.fps ?? 24;

  const cameraPath = blockout.cameraPath ?? [];
  if (cameraPath.length === 0) {
    // 无轨迹：单帧
    const result = renderStaticView(blockout, opts);
    return {
      frames: [{ time: 0, dataUrl: result.dataUrl, data: result.data }],
      duration: 0,
      fps,
      width: opts.width,
      height: opts.height,
    };
  }

  const duration = cameraPath[cameraPath.length - 1]!.time;
  const totalFrames = Math.max(1, Math.ceil(duration * fps));
  const defaultFov = blockout.camera.fov;

  // 复用 built scene 跨多帧渲染（性能优化）
  const built = buildScene(blockout, toBuilderOptions(opts));

  const frames: FrameSequenceResult["frames"] = [];

  try {
    for (let i = 0; i < totalFrames; i++) {
      const time = (i / fps);
      const pose = getCameraPoseAtTime(cameraPath, time, defaultFov);
      applyCameraPose(built.camera, pose);
      built.camera.aspect = opts.width / opts.height;
      built.camera.updateProjectionMatrix();
      built.renderer.render(built.scene, built.camera);

      const canvas = built.renderer.domElement;
      const dataUrl = canvas.toDataURL("image/png");
      frames.push({
        time,
        dataUrl,
        data: dataUrlToBytes(dataUrl),
      });
    }

    return {
      frames,
      duration,
      fps,
      width: opts.width,
      height: opts.height,
    };
  } finally {
    disposeScene(built);
  }
}

// ─── 关键帧图集渲染（用于 fallback-adapter） ────────────────────────────────

export interface KeyframeSetRenderResult {
  /** 5 个时间点的 PNG 帧（0/0.25/0.5/0.75/1.0） */
  frames: Array<{
    time: number;
    ratio: number;
    dataUrl: string;
    data: Uint8Array;
  }>;
  /** 总时长 */
  duration: number;
  /** 实际渲染分辨率 */
  width: number;
  height: number;
}

/**
 * 渲染 fallback 关键帧图集（5 个时间点）。
 *
 * 用于不支持 3D 白模输入的模型作为参考图组。
 */
export function renderKeyframeSet(
  blockout: BlockoutScene,
  options: RenderOptions = {},
): KeyframeSetRenderResult {
  const opts = { ...DEFAULT_RENDER_OPTIONS, ...options };
  const cameraPath = blockout.cameraPath ?? [];

  if (cameraPath.length === 0) {
    const result = renderStaticView(blockout, opts);
    return {
      frames: [{ time: 0, ratio: 0, dataUrl: result.dataUrl, data: result.data }],
      duration: 0,
      width: opts.width,
      height: opts.height,
    };
  }

  const duration = cameraPath[cameraPath.length - 1]!.time;
  const defaultFov = blockout.camera.fov;
  const ratios = [0, 0.25, 0.5, 0.75, 1.0];

  const built = buildScene(blockout, toBuilderOptions(opts));

  try {
    const frames: KeyframeSetRenderResult["frames"] = ratios.map((ratio) => {
      const time = duration * ratio;
      const pose = getCameraPoseAtTime(cameraPath, time, defaultFov);
      applyCameraPose(built.camera, pose);
      built.camera.aspect = opts.width / opts.height;
      built.camera.updateProjectionMatrix();
      built.renderer.render(built.scene, built.camera);

      const canvas = built.renderer.domElement;
      const dataUrl = canvas.toDataURL("image/png");
      return { time, ratio, dataUrl, data: dataUrlToBytes(dataUrl) };
    });

    return {
      frames,
      duration,
      width: opts.width,
      height: opts.height,
    };
  } finally {
    disposeScene(built);
  }
}

// ─── 写入文件 ────────────────────────────────────────────────────────────────

/**
 * 将渲染结果写入本地文件。
 * 返回写入的文件路径列表。
 */
export async function writeFramesToFiles(
  frames: Array<{ time: number; data: Uint8Array }>,
  outputDir: string,
  basename: string,
): Promise<string[]> {
  const paths: string[] = [];
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i]!;
    const index = String(i).padStart(4, "0");
    const path = `${outputDir}/${basename}_${index}.png`;
    const result = await writeFile(path, frame.data);
    if (!result.success) {
      throw new Error(`Failed to write frame ${i}: ${result.error ?? "unknown error"}`);
    }
    paths.push(path);
  }
  return paths;
}

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

/** data URL → Uint8Array（base64 解码） */
function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1] ?? "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * 探测 WebGL 是否可用。
 * 用于 UI 决定是否显示 3D 白模 Tab（WebGL 不可用时降级为提示文案）。
 */
export function isWebGLAvailable(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    return !!gl;
  } catch {
    return false;
  }
}

/** 探测 OffscreenCanvas 是否可用（用于 Worker 渲染） */
export function isOffscreenCanvasAvailable(): boolean {
  return typeof OffscreenCanvas !== "undefined";
}

// ─── 重新导出 ─────────────────────────────────────────────────────────────────

export type { BuiltScene, CameraPose, CameraKeyframe };
