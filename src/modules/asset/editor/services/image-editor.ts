/**
 * 图片编辑器服务（Task 4.5）
 *
 * 提供 Canvas 图片编辑的核心工具函数：
 * - 调色（亮度/对比度/饱和度）：Canvas ImageData pixel manipulation
 * - 旋转：Canvas rotate
 * - 裁剪：Canvas drawImage with source rect
 * - 标注绘制：文字/箭头/矩形框
 * - 保存为新版本：通过 file-http 写入本地文件
 *
 * 所有操作在本地 Canvas 完成，不调用外部 API
 */

import { writeFile, getCacheDirectory } from "@/shared/file-http";
import { errorLogger } from "@/shared/error-logger";

/** 调色参数 */
export interface ColorAdjustments {
  /** 亮度 (-100 ~ 100，0 为原始) */
  brightness: number;
  /** 对比度 (-100 ~ 100，0 为原始) */
  contrast: number;
  /** 饱和度 (-100 ~ 100，0 为原始) */
  saturation: number;
}

/** 默认调色参数 */
export const DEFAULT_ADJUSTMENTS: ColorAdjustments = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
};

/** 裁剪区域 */
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 裁剪预设比例 */
export interface CropPreset {
  label: string;
  ratio: number | null; // null = 自由比例
}

export const CROP_PRESETS: CropPreset[] = [
  { label: "自由", ratio: null },
  { label: "1:1 正方形", ratio: 1 },
  { label: "4:3", ratio: 4 / 3 },
  { label: "16:9", ratio: 16 / 9 },
  { label: "3:4 竖版", ratio: 3 / 4 },
  { label: "9:16 竖版", ratio: 9 / 16 },
];

/** 标注类型 */
export type AnnotationType = "text" | "arrow" | "rect";

/** 标注基础 */
export interface AnnotationBase {
  id: string;
  type: AnnotationType;
  color: string;
}

/** 文字标注 */
export interface TextAnnotation extends AnnotationBase {
  type: "text";
  x: number;
  y: number;
  text: string;
  fontSize: number;
}

/** 箭头标注 */
export interface ArrowAnnotation extends AnnotationBase {
  type: "arrow";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  lineWidth: number;
}

/** 矩形框标注 */
export interface RectAnnotation extends AnnotationBase {
  type: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
  lineWidth: number;
}

/** 所有标注联合类型 */
export type Annotation = TextAnnotation | ArrowAnnotation | RectAnnotation;

/**
 * 将调色参数应用到 Canvas
 *
 * 使用 ImageData pixel manipulation 实现真实的亮度/对比度/饱和度调整
 */
export function applyColorAdjustments(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  adjustments: ColorAdjustments,
): void {
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const { brightness, contrast, saturation } = adjustments;

  // 亮度：-100 ~ 100 → -100 ~ 100 像素值偏移
  const brightnessFactor = (brightness / 100) * 128;
  // 对比度：-100 ~ 100 → 0 ~ 2 因子
  const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));
  // 饱和度：-100 ~ 100 → 0 ~ 2 因子
  const saturationFactor = 1 + saturation / 100;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i]!;
    let g = data[i + 1]!;
    let b = data[i + 2]!;

    // 亮度
    r += brightnessFactor;
    g += brightnessFactor;
    b += brightnessFactor;

    // 对比度
    r = contrastFactor * (r - 128) + 128;
    g = contrastFactor * (g - 128) + 128;
    b = contrastFactor * (b - 128) + 128;

    // 饱和度（基于灰度的偏移）
    const gray = 0.2989 * r + 0.587 * g + 0.114 * b;
    r = gray + (r - gray) * saturationFactor;
    g = gray + (g - gray) * saturationFactor;
    b = gray + (b - gray) * saturationFactor;

    data[i] = Math.max(0, Math.min(255, r));
    data[i + 1] = Math.max(0, Math.min(255, g));
    data[i + 2] = Math.max(0, Math.min(255, b));
  }

  ctx.putImageData(imageData, 0, 0);
}

/**
 * 旋转 Canvas 内容
 *
 * @param sourceCanvas 源 Canvas
 * @param degrees 旋转角度（90/180/270/-90）
 * @returns 新的旋转后 Canvas
 */
export function rotateCanvas(
  sourceCanvas: HTMLCanvasElement,
  degrees: number,
): HTMLCanvasElement {
  const normalized = ((degrees % 360) + 360) % 360;
  const isQuarter = normalized === 90 || normalized === 270;

  const output = document.createElement("canvas");
  output.width = isQuarter ? sourceCanvas.height : sourceCanvas.width;
  output.height = isQuarter ? sourceCanvas.width : sourceCanvas.height;

  const ctx = output.getContext("2d");
  if (!ctx) return sourceCanvas;

  ctx.translate(output.width / 2, output.height / 2);
  ctx.rotate((normalized * Math.PI) / 180);
  ctx.drawImage(sourceCanvas, -sourceCanvas.width / 2, -sourceCanvas.height / 2);

  return output;
}

/**
 * 裁剪 Canvas
 *
 * @param sourceCanvas 源 Canvas
 * @param rect 裁剪区域（基于源 Canvas 坐标）
 * @returns 裁剪后的新 Canvas
 */
export function cropCanvas(
  sourceCanvas: HTMLCanvasElement,
  rect: CropRect,
): HTMLCanvasElement {
  const output = document.createElement("canvas");
  output.width = Math.max(1, Math.floor(rect.width));
  output.height = Math.max(1, Math.floor(rect.height));

  const ctx = output.getContext("2d");
  if (!ctx) return sourceCanvas;

  ctx.drawImage(
    sourceCanvas,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    0,
    0,
    output.width,
    output.height,
  );

  return output;
}

/**
 * 在 Canvas 上绘制标注
 */
export function drawAnnotations(
  ctx: CanvasRenderingContext2D,
  annotations: Annotation[],
): void {
  for (const ann of annotations) {
    ctx.strokeStyle = ann.color;
    ctx.fillStyle = ann.color;
    if (ann.type === "text") {
      ctx.font = `${ann.fontSize}px sans-serif`;
      ctx.fillText(ann.text, ann.x, ann.y);
    } else if (ann.type === "arrow") {
      ctx.lineWidth = ann.lineWidth;
      ctx.beginPath();
      ctx.moveTo(ann.x1, ann.y1);
      ctx.lineTo(ann.x2, ann.y2);
      ctx.stroke();
      // 箭头头部
      const angle = Math.atan2(ann.y2 - ann.y1, ann.x2 - ann.x1);
      const headLen = Math.max(10, ann.lineWidth * 4);
      ctx.beginPath();
      ctx.moveTo(ann.x2, ann.y2);
      ctx.lineTo(
        ann.x2 - headLen * Math.cos(angle - Math.PI / 6),
        ann.y2 - headLen * Math.sin(angle - Math.PI / 6),
      );
      ctx.moveTo(ann.x2, ann.y2);
      ctx.lineTo(
        ann.x2 - headLen * Math.cos(angle + Math.PI / 6),
        ann.y2 - headLen * Math.sin(angle + Math.PI / 6),
      );
      ctx.stroke();
    } else if (ann.type === "rect") {
      ctx.lineWidth = ann.lineWidth;
      ctx.strokeRect(ann.x, ann.y, ann.width, ann.height);
    }
  }
}

/**
 * 将 Canvas 转为 Blob
 */
export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string = "image/png",
  quality?: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob),
      type,
      quality,
    );
  });
}

/**
 * 保存编辑后的图片为新版本（不覆盖原图）
 *
 * @param blob 图片数据
 * @param originalPath 原图路径（用于生成新版本文件名）
 * @returns 保存后的文件路径
 */
export async function saveEditedImage(
  blob: Blob,
  originalPath: string,
): Promise<{ success: boolean; path?: string; error?: string }> {
  try {
    // 生成新版本文件名：原图名_edited_时间戳.png
    const ext = originalPath.split(".").pop() ?? "png";
    const baseName = originalPath.replace(/\.[^.]+$/, "");
    const timestamp = Date.now();
    const newPath = `${baseName}_edited_${timestamp}.${ext}`;

    const buffer = new Uint8Array(await blob.arrayBuffer());
    const result = await writeFile(newPath, buffer);

    if (!result.success) {
      return { success: false, error: result.error ?? "写入文件失败" };
    }

    return { success: true, path: newPath };
  } catch (e) {
    errorLogger.warn("[image-editor] 保存编辑图片失败", e);
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * 获取缓存目录下的编辑图片保存目录
 */
export async function getEditorSaveDirectory(): Promise<string | null> {
  const result = await getCacheDirectory();
  if (!result.success || !result.path) return null;
  return result.path.replace(/[\\\/]+$/, "") + "/image-editor";
}
