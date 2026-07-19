/**
 * Task 2A.22: mask-encoder — MaskConfig → base64 PNG
 *
 * Seedance 2.5 局部重绘 API 要求 mask 以 base64 PNG 格式传输：
 * - 白色（#FFFFFF）= 重绘区域（mask 内）
 * - 黑色（#000000）= 保留区域（mask 外）
 *
 * 当 MaskConfig.inverse=true 时颜色反转。
 *
 * 实现要点：
 * - 使用 OffscreenCanvas（Web Worker 可用）或 HTMLCanvasElement（主线程）
 * - 不依赖任何外部库（纯 Canvas 2D API）
 * - mask 尺寸由调用方指定（通常与原视频分辨率一致，如 1280x720）
 * - 输出 dataURL：`data:image/png;base64,...`
 *
 * 三个绘制函数：
 * - drawRectangle：fillRect
 * - drawPolygon：moveTo/lineTo + fill
 * - drawBrush：多段 lineTo + lineWidth + lineCap='round'
 *
 * encodeMask 为入口函数，返回 Result<string>。
 */

import type { MaskConfig, MaskShape } from "../domain/mask-types";

/** mask-encoder 错误类型 */
export type MaskEncodeError =
  | { kind: "empty_mask"; message: string }
  | { kind: "invalid_shape"; message: string; shape: MaskShape }
  | { kind: "canvas_unavailable"; message: string }
  | { kind: "encode_failed"; message: string; cause?: unknown };

/** mask-encoder 成功结果 */
export interface MaskEncodeSuccess {
  /** base64 PNG dataURL：`data:image/png;base64,...` */
  dataUrl: string;
  /** 仅 base64 部分（不含 data: 前缀，用于直接传给 HTTP API body） */
  base64: string;
  /** mask 画布宽度 */
  width: number;
  /** mask 画布高度 */
  height: number;
}

/** mask-encoder 选项 */
export interface MaskEncodeOptions {
  /** mask 画布宽度（默认 1280） */
  width?: number;
  /** mask 画布高度（默认 720） */
  height?: number;
  /** 是否返回 dataURL（默认 true）。false 时 dataUrl 为空字符串，仅返回 base64 */
  includeDataUrl?: boolean;
}

const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 720;

/** Canvas 抽象接口（兼容 OffscreenCanvas 和 HTMLCanvasElement） */
interface CanvasLike {
  width: number;
  height: number;
  getContext(type: "2d"): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  toDataURL?(type: string): string;
  convertToBlob?(options?: { type: string }): Promise<Blob>;
}

/** 获取可用的 Canvas（优先 OffscreenCanvas，回退到 HTMLCanvasElement） */
function createCanvas(width: number, height: number): CanvasLike | null {
  // 优先 OffscreenCanvas（性能更好，Web Worker 可用）
  if (typeof OffscreenCanvas !== "undefined") {
    try {
      return new OffscreenCanvas(width, height);
    } catch {
      // fallthrough
    }
  }
  // 回退到 HTMLCanvasElement（仅主线程可用）
  if (typeof document !== "undefined" && typeof document.createElement === "function") {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  return null;
}

/** 把 Blob 转为 base64 字符串 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("FileReader 返回非字符串结果"));
        return;
      }
      // 结果格式：`data:image/png;base64,XXXX` — 提取 base64 部分
      const commaIdx = result.indexOf(",");
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("FileReader 读取失败"));
    reader.readAsDataURL(blob);
  });
}

/** 绘制单个 MaskShape 到 Canvas 上下文 */
function drawShape(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  shape: MaskShape,
): void {
  switch (shape.type) {
    case "rectangle":
      ctx.fillRect(shape.x, shape.y, shape.width, shape.height);
      break;
    case "polygon":
      if (shape.points.length < 3) return;
      ctx.beginPath();
      ctx.moveTo(shape.points[0]!.x, shape.points[0]!.y);
      for (let i = 1; i < shape.points.length; i++) {
        ctx.lineTo(shape.points[i]!.x, shape.points[i]!.y);
      }
      ctx.closePath();
      ctx.fill();
      break;
    case "brush":
      for (const path of shape.paths) {
        if (path.length === 0) continue;
        ctx.beginPath();
        ctx.lineWidth = path[0]!.size * 2; // size 为半径，lineWidth 为直径
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.moveTo(path[0]!.x, path[0]!.y);
        for (let i = 1; i < path.length; i++) {
          ctx.lineTo(path[i]!.x, path[i]!.y);
        }
        // 单点路径：画一个圆点
        if (path.length === 1) {
          ctx.arc(path[0]!.x, path[0]!.y, path[0]!.size, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.stroke();
        }
      }
      break;
  }
}

/**
 * 把 MaskConfig 编码为 base64 PNG。
 *
 * @param mask 用户标记的 mask 配置
 * @param options 编码选项（尺寸等）
 * @returns 成功返回 MaskEncodeSuccess，失败返回 MaskEncodeError
 */
export async function encodeMask(
  mask: MaskConfig,
  options: MaskEncodeOptions = {},
): Promise<{ ok: true; value: MaskEncodeSuccess } | { ok: false; error: MaskEncodeError }> {
  if (!mask || !Array.isArray(mask.shapes) || mask.shapes.length === 0) {
    return {
      ok: false,
      error: { kind: "empty_mask", message: "MaskConfig.shapes 为空，无法编码" },
    };
  }

  const width = options.width ?? DEFAULT_WIDTH;
  const height = options.height ?? DEFAULT_HEIGHT;
  const includeDataUrl = options.includeDataUrl ?? true;

  const canvas = createCanvas(width, height);
  if (!canvas) {
    return {
      ok: false,
      error: { kind: "canvas_unavailable", message: "OffscreenCanvas 和 HTMLCanvasElement 均不可用" },
    };
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return {
      ok: false,
      error: { kind: "canvas_unavailable", message: "无法获取 Canvas 2D context" },
    };
  }

  try {
    // 1. 填充背景色（默认黑色 = 保留区域）
    // inverse=false：mask 内为白色（重绘），mask 外为黑色（保留）
    // inverse=true：mask 内为黑色（保留），mask 外为白色（重绘）
    const fillColor = mask.inverse ? "#FFFFFF" : "#000000";
    const shapeColor = mask.inverse ? "#000000" : "#FFFFFF";

    ctx.fillStyle = fillColor;
    ctx.fillRect(0, 0, width, height);

    // 2. 绘制所有 shape
    ctx.fillStyle = shapeColor;
    ctx.strokeStyle = shapeColor;

    for (const shape of mask.shapes) {
      drawShape(ctx, shape);
    }

    // 3. 导出为 base64 PNG
    let base64 = "";
    let dataUrl = "";

    if (typeof canvas.toDataURL === "function") {
      // HTMLCanvasElement 路径 — 同步
      dataUrl = canvas.toDataURL("image/png");
      const commaIdx = dataUrl.indexOf(",");
      base64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
      if (!includeDataUrl) dataUrl = "";
    } else if (typeof canvas.convertToBlob === "function") {
      // OffscreenCanvas 路径 — 异步
      const blob = await canvas.convertToBlob({ type: "image/png" });
      base64 = await blobToBase64(blob);
      if (includeDataUrl) {
        dataUrl = `data:image/png;base64,${base64}`;
      }
    } else {
      return {
        ok: false,
        error: { kind: "encode_failed", message: "Canvas 既不支持 toDataURL 也不支持 convertToBlob" },
      };
    }

    return {
      ok: true,
      value: { dataUrl, base64, width, height },
    };
  } catch (e) {
    return {
      ok: false,
      error: { kind: "encode_failed", message: e instanceof Error ? e.message : String(e), cause: e },
    };
  }
}

/** 同步版本：仅当 Canvas 为 HTMLCanvasElement 时可用（OffscreenCanvas 为异步） */
export function encodeMaskSync(
  mask: MaskConfig,
  options: MaskEncodeOptions = {},
): { ok: true; value: MaskEncodeSuccess } | { ok: false; error: MaskEncodeError } {
  if (!mask || !Array.isArray(mask.shapes) || mask.shapes.length === 0) {
    return {
      ok: false,
      error: { kind: "empty_mask", message: "MaskConfig.shapes 为空，无法编码" },
    };
  }

  const width = options.width ?? DEFAULT_WIDTH;
  const height = options.height ?? DEFAULT_HEIGHT;
  const includeDataUrl = options.includeDataUrl ?? true;

  // Sync 版本仅支持 HTMLCanvasElement
  if (typeof document === "undefined" || typeof document.createElement !== "function") {
    return {
      ok: false,
      error: { kind: "canvas_unavailable", message: "Sync 编码需要 HTMLCanvasElement（document 不可用）" },
    };
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return {
      ok: false,
      error: { kind: "canvas_unavailable", message: "无法获取 Canvas 2D context" },
    };
  }

  try {
    const fillColor = mask.inverse ? "#FFFFFF" : "#000000";
    const shapeColor = mask.inverse ? "#000000" : "#FFFFFF";

    ctx.fillStyle = fillColor;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = shapeColor;
    ctx.strokeStyle = shapeColor;

    for (const shape of mask.shapes) {
      drawShape(ctx, shape);
    }

    const dataUrl = canvas.toDataURL("image/png");
    const commaIdx = dataUrl.indexOf(",");
    const base64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;

    return {
      ok: true,
      value: {
        dataUrl: includeDataUrl ? dataUrl : "",
        base64,
        width,
        height,
      },
    };
  } catch (e) {
    return {
      ok: false,
      error: { kind: "encode_failed", message: e instanceof Error ? e.message : String(e), cause: e },
    };
  }
}

/**
 * 估算 base64 PNG 的大小（字节）。
 * 用于在调用 API 前预检 — 通常应 < 100KB。
 */
export function estimateBase64Size(base64: string): number {
  // base64 编码后字节数 ≈ 字符数 * 3/4
  return Math.ceil(base64.length * 3 / 4);
}

/**
 * 校验 base64 PNG 是否在合理大小范围内。
 * Seedance 2.5 API 要求 mask < 1MB。
 */
export function isMaskSizeValid(base64: string, maxBytes: number = 1024 * 1024): boolean {
  return estimateBase64Size(base64) <= maxBytes;
}
