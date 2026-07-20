/**
 * 图片编辑工具 - 辅助函数与核心实现
 *
 * 从 image-edit-tools.ts 拆分而来，目的：
 * - 降低主文件行数（原 825 行 > max-lines 500）
 * - 降低 execute 方法的 complexity / max-depth（通过提取子函数）
 */

import type { ToolImpl } from "@/domain/types/agent-tools";
import { TOOL_TIMEOUTS } from "@/shared/constants/tool-timeouts";

// ============= 类型定义 =============

export type EditOperation =
  | { type: "crop"; params: { x: number; y: number; width: number; height: number } }
  | { type: "rotate"; params: { angle: 90 | 180 | 270 } }
  | { type: "resize"; params: { width: number; height: number } }
  | { type: "flip"; params: { axis: "horizontal" | "vertical" } };

// ============= 通用辅助函数 =============

/** 加载图片 */
export async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`加载图片失败：${url}`));
    img.src = url;
  });
}

/** Canvas 转 Blob */
function canvasToBlob(canvas: HTMLCanvasElement, type = "image/png"): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Canvas 转 Blob 失败"));
    }, type);
  });
}

/** 保存图片 Blob 到缓存目录，返回本地路径 */
async function saveImageBlob(blob: Blob, filename: string): Promise<string> {
  const { writeFile, getCacheDirectory } = await import("@/shared/file-http");
  const dirResult = await getCacheDirectory();
  if (!dirResult.success || !dirResult.path) {
    throw new Error("Failed to get cache directory");
  }
  const path = `${dirResult.path}/image-edits/${Date.now()}_${filename}`;
  const buffer = await blob.arrayBuffer();
  const result = await writeFile(path, buffer);
  if (!result.success) {
    throw new Error(`Failed to save image: ${result.error}`);
  }
  return path;
}

/** 创建 Canvas 并获取 2D 上下文 */
function createCanvas(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to get Canvas 2D context");
  return { canvas, ctx };
}

/** 将图片绘制到新 Canvas */
export async function imageToCanvas(img: HTMLImageElement): Promise<HTMLCanvasElement> {
  const { canvas, ctx } = createCanvas(img.naturalWidth || img.width, img.naturalHeight || img.height);
  ctx.drawImage(img, 0, 0);
  return canvas;
}

/** 应用单个编辑操作，返回新 Canvas */
export function applyOperation(canvas: HTMLCanvasElement, op: EditOperation): HTMLCanvasElement {
  switch (op.type) {
    case "crop": {
      const { x, y, width, height } = op.params;
      const { canvas: out, ctx } = createCanvas(width, height);
      ctx.drawImage(canvas, x, y, width, height, 0, 0, width, height);
      return out;
    }
    case "rotate": {
      const { angle } = op.params;
      const swap = angle === 90 || angle === 270;
      const { canvas: out, ctx } = createCanvas(
        swap ? canvas.height : canvas.width,
        swap ? canvas.width : canvas.height,
      );
      ctx.translate(out.width / 2, out.height / 2);
      ctx.rotate((angle * Math.PI) / 180);
      ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
      return out;
    }
    case "resize": {
      const { width, height } = op.params;
      const { canvas: out, ctx } = createCanvas(width, height);
      ctx.drawImage(canvas, 0, 0, width, height);
      return out;
    }
    case "flip": {
      const { axis } = op.params;
      const { canvas: out, ctx } = createCanvas(canvas.width, canvas.height);
      if (axis === "horizontal") {
        ctx.scale(-1, 1);
        ctx.drawImage(canvas, -canvas.width, 0);
      } else {
        ctx.scale(1, -1);
        ctx.drawImage(canvas, 0, -canvas.height);
      }
      return out;
    }
  }
}

/** 保存 Canvas 为 PNG 并返回路径 */
export async function saveCanvasAsImage(canvas: HTMLCanvasElement, filename: string): Promise<string> {
  const blob = await canvasToBlob(canvas, "image/png");
  return saveImageBlob(blob, filename);
}

/** 创建带 2D 上下文的 Canvas（导出供子模块使用） */
export { createCanvas };

// ============= 工具参数类型 =============

export interface MergeImagesArgs {
  imageUrls: string[];
  layout: "horizontal" | "vertical" | "grid";
  gap: number;
  background: string;
}

export interface ApplyFilterArgs {
  imageUrl: string;
  filter: "grayscale" | "sepia" | "invert" | "blur" | "sharpen" | "vintage" | "cool" | "warm";
  intensity: number;
}

export interface ResizeImageArgs {
  imageUrl: string;
  width?: number;
  height?: number;
  maintainAspect: boolean;
  maxWidth?: number;
  maxHeight?: number;
}

// ============= mergeImages 核心实现 =============

interface GridLayout {
  cols: number;
  rows: number;
  colWidths: number[];
  rowHeights: number[];
  canvasWidth: number;
  canvasHeight: number;
}

function computeGridLayout(imgs: HTMLImageElement[], gap: number): GridLayout {
  const cols = Math.ceil(Math.sqrt(imgs.length));
  const rows = Math.ceil(imgs.length / cols);
  const colWidths: number[] = [];
  const rowHeights: number[] = [];
  for (let c = 0; c < cols; c++) {
    let maxW = 0;
    for (let r = 0; r < rows; r++) {
      const idx = r * cols + c;
      if (idx < imgs.length) maxW = Math.max(maxW, imgs[idx]?.naturalWidth ?? 0);
    }
    colWidths[c] = maxW;
  }
  for (let r = 0; r < rows; r++) {
    let maxH = 0;
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      if (idx < imgs.length) maxH = Math.max(maxH, imgs[idx]?.naturalHeight ?? 0);
    }
    rowHeights[r] = maxH;
  }
  return {
    cols,
    rows,
    colWidths,
    rowHeights,
    canvasWidth: colWidths.reduce((s, w) => s + w, 0) + gap * (cols - 1),
    canvasHeight: rowHeights.reduce((s, h) => s + h, 0) + gap * (rows - 1),
  };
}

function computeMergeCanvasSize(
  imgs: HTMLImageElement[],
  layout: "horizontal" | "vertical" | "grid",
  gap: number,
): { canvasWidth: number; canvasHeight: number; grid?: GridLayout } {
  if (layout === "horizontal") {
    return {
      canvasWidth: imgs.reduce((sum, im) => sum + im.naturalWidth, 0) + gap * (imgs.length - 1),
      canvasHeight: Math.max(...imgs.map((im) => im.naturalHeight)),
    };
  }
  if (layout === "vertical") {
    return {
      canvasWidth: Math.max(...imgs.map((im) => im.naturalWidth)),
      canvasHeight: imgs.reduce((sum, im) => sum + im.naturalHeight, 0) + gap * (imgs.length - 1),
    };
  }
  const grid = computeGridLayout(imgs, gap);
  return { canvasWidth: grid.canvasWidth, canvasHeight: grid.canvasHeight, grid };
}

function drawGridLayout(
  ctx: CanvasRenderingContext2D,
  imgs: HTMLImageElement[],
  grid: GridLayout,
  gap: number,
) {
  let offsetY = 0;
  for (let r = 0; r < grid.rows; r++) {
    let offsetX = 0;
    for (let c = 0; c < grid.cols; c++) {
      const idx = r * grid.cols + c;
      if (idx < imgs.length) {
        const im = imgs[idx];
        if (im) ctx.drawImage(im, offsetX, offsetY);
      }
      offsetX += (grid.colWidths[c] ?? 0) + gap;
    }
    offsetY += (grid.rowHeights[r] ?? 0) + gap;
  }
}

function drawLayout(
  ctx: CanvasRenderingContext2D,
  imgs: HTMLImageElement[],
  layout: "horizontal" | "vertical" | "grid",
  gap: number,
  grid?: GridLayout,
) {
  if (layout === "horizontal") {
    let offsetX = 0;
    for (const im of imgs) {
      ctx.drawImage(im, offsetX, 0);
      offsetX += im.naturalWidth + gap;
    }
    return;
  }
  if (layout === "vertical") {
    let offsetY = 0;
    for (const im of imgs) {
      ctx.drawImage(im, 0, offsetY);
      offsetY += im.naturalHeight + gap;
    }
    return;
  }
  if (grid) drawGridLayout(ctx, imgs, grid, gap);
}

/** mergeImages 工具核心实现 */
export async function executeMergeImages(args: MergeImagesArgs): Promise<{ outputUrl: string; layout: string; imageCount: number }> {
  const { imageUrls, layout, gap, background } = args;
  const imgs = await Promise.all(imageUrls.map((u) => loadImage(u)));
  const { canvasWidth, canvasHeight, grid } = computeMergeCanvasSize(imgs, layout, gap);
  const { canvas, ctx } = createCanvas(canvasWidth, canvasHeight);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  drawLayout(ctx, imgs, layout, gap, grid);
  const outputUrl = await saveCanvasAsImage(canvas, "merged.png");
  return { outputUrl, layout, imageCount: imgs.length };
}

// ============= applyFilter 核心实现 =============

const CSS_FILTERS: Record<"grayscale" | "sepia" | "invert" | "blur", (intensity: number) => string> = {
  grayscale: (i) => `grayscale(${i * 100}%)`,
  sepia: (i) => `sepia(${i * 100}%)`,
  invert: (i) => `invert(${i * 100}%)`,
  blur: (i) => `blur(${i * 4}px)`,
};

function applyCssFilter(
  img: HTMLImageElement,
  filter: "grayscale" | "sepia" | "invert" | "blur",
  intensity: number,
): HTMLCanvasElement {
  const { canvas, ctx } = createCanvas(img.naturalWidth, img.naturalHeight);
  ctx.filter = CSS_FILTERS[filter](intensity);
  ctx.drawImage(img, 0, 0);
  ctx.filter = "none";
  return canvas;
}

/** 3x3 锐化卷积 */
function applySharpenConvolution(data: Uint8ClampedArray, width: number, height: number, intensity: number): void {
  const src = new Uint8ClampedArray(data);
  const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      applySharpenAtPixel(src, data, width, x, y, kernel, intensity);
    }
  }
}

function applySharpenAtPixel(
  src: Uint8ClampedArray,
  dst: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
  kernel: number[],
  intensity: number,
): void {
  for (let ch = 0; ch < 3; ch++) {
    let sum = 0;
    let ki = 0;
    for (let ky = -1; ky <= 1; ky++) {
      for (let kx = -1; kx <= 1; kx++) {
        const idx = ((y + ky) * width + (x + kx)) * 4 + ch;
        const srcVal = src[idx] ?? 0;
        const kVal = kernel[ki] ?? 0;
        ki++;
        sum += srcVal * kVal;
      }
    }
    const di = (y * width + x) * 4 + ch;
    dst[di] = Math.round((src[di] ?? 0) * (1 - intensity) + Math.min(255, Math.max(0, sum)) * intensity);
  }
}

function applyVintageFilter(data: Uint8ClampedArray, intensity: number): void {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    data[i] = Math.min(255, Math.round(r * (1 + 0.08 * intensity) + 20 * intensity));
    data[i + 1] = Math.min(255, Math.round(g * (1 - 0.05 * intensity)));
    data[i + 2] = Math.min(255, Math.round(b * (1 - 0.3 * intensity)));
  }
}

function applyCoolFilter(data: Uint8ClampedArray, intensity: number): void {
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.max(0, Math.round((data[i] ?? 0) * (1 - 0.1 * intensity)));
    data[i + 2] = Math.min(255, Math.round((data[i + 2] ?? 0) * (1 + 0.1 * intensity)));
  }
}

function applyWarmFilter(data: Uint8ClampedArray, intensity: number): void {
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.min(255, Math.round((data[i] ?? 0) * (1 + 0.1 * intensity)));
    data[i + 2] = Math.max(0, Math.round((data[i + 2] ?? 0) * (1 - 0.1 * intensity)));
  }
}

function applyPixelFilter(
  img: HTMLImageElement,
  filter: "sharpen" | "vintage" | "cool" | "warm",
  intensity: number,
): HTMLCanvasElement {
  const { canvas, ctx } = createCanvas(img.naturalWidth, img.naturalHeight);
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  switch (filter) {
    case "sharpen":
      applySharpenConvolution(data, canvas.width, canvas.height, intensity);
      break;
    case "vintage":
      applyVintageFilter(data, intensity);
      break;
    case "cool":
      applyCoolFilter(data, intensity);
      break;
    case "warm":
      applyWarmFilter(data, intensity);
      break;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/** applyFilter 工具核心实现 */
export async function executeApplyFilter(args: ApplyFilterArgs): Promise<{ outputUrl: string; filter: string; intensity: number }> {
  const { imageUrl, filter, intensity } = args;
  const img = await loadImage(imageUrl);
  const canvas = isCssFilter(filter)
    ? applyCssFilter(img, filter, intensity)
    : applyPixelFilter(img, filter, intensity);
  const outputUrl = await saveCanvasAsImage(canvas, "filtered.png");
  return { outputUrl, filter, intensity };
}

function isCssFilter(filter: string): filter is "grayscale" | "sepia" | "invert" | "blur" {
  return filter === "grayscale" || filter === "sepia" || filter === "invert" || filter === "blur";
}

// ============= resizeImage 核心实现 =============

interface ResizeTarget {
  targetW: number;
  targetH: number;
}

function computeResizeTarget(
  origW: number,
  origH: number,
  args: ResizeImageArgs,
): ResizeTarget | { error: string } {
  const { width, height, maintainAspect, maxWidth, maxHeight } = args;
  let targetW = width;
  let targetH = height;

  if (targetW === undefined && targetH === undefined && (maxWidth || maxHeight)) {
    // 按最大尺寸约束缩小（不放大）
    let scaleW = 1;
    let scaleH = 1;
    if (maxWidth && origW > maxWidth) scaleW = maxWidth / origW;
    if (maxHeight && origH > maxHeight) scaleH = maxHeight / origH;
    const scale = Math.min(scaleW, scaleH);
    return { targetW: Math.round(origW * scale), targetH: Math.round(origH * scale) };
  }

  if (maintainAspect) {
    if (targetW !== undefined && targetH === undefined) {
      targetH = Math.round((targetW / origW) * origH);
    } else if (targetH !== undefined && targetW === undefined) {
      targetW = Math.round((targetH / origH) * origW);
    }
  }

  if (targetW === undefined || targetH === undefined) {
    return { error: "必须指定 width/height/maxWidth/maxHeight 中的至少一项" };
  }
  if (targetW <= 0 || targetH <= 0) {
    return { error: "目标尺寸必须大于 0" };
  }
  return { targetW, targetH };
}

/** resizeImage 工具核心实现 */
export async function executeResizeImage(args: ResizeImageArgs): Promise<{
  outputUrl: string;
  originalSize: { width: number; height: number };
  newSize: { width: number; height: number };
}> {
  const { imageUrl } = args;
  const img = await loadImage(imageUrl);
  const origW = img.naturalWidth;
  const origH = img.naturalHeight;
  const target = computeResizeTarget(origW, origH, args);
  if ("error" in target) {
    throw new Error(target.error);
  }
  const { targetW, targetH } = target;
  const canvas = applyOperation(await imageToCanvas(img), {
    type: "resize",
    params: { width: targetW, height: targetH },
  });
  const outputUrl = await saveCanvasAsImage(canvas, "resized.png");
  return {
    outputUrl,
    originalSize: { width: origW, height: origH },
    newSize: { width: targetW, height: targetH },
  };
}

// ============= compositeImage 工具完整实现 =============

/** 错误信息格式化 */
function formatError(prefix: string, e: unknown): string {
  return `${prefix}：${e instanceof Error ? e.message : String(e)}`;
}

/** 4. 图片合成（完整 ToolImpl 定义） */
export const compositeImageTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "composite_image",
      description: "将前景图片叠加到背景图片上，支持指定位置、缩放比例和透明度。结果保存为 PNG。",
      parameters: {
        type: "object",
        properties: {
          backgroundUrl: { type: "string", maxLength: 2048, description: "背景图片 URL" },
          foregroundUrl: { type: "string", maxLength: 2048, description: "前景图片 URL" },
          x: { type: "number", minimum: 0, description: "前景左上角 X 坐标，默认 0", default: 0 },
          y: { type: "number", minimum: 0, description: "前景左上角 Y 坐标，默认 0", default: 0 },
          scale: { type: "number", minimum: 0.01, maximum: 100, description: "前景缩放比例，默认 1.0", default: 1.0 },
          opacity: { type: "number", minimum: 0, maximum: 1, description: "前景透明度（0-1），默认 1", default: 1 },
        },
        required: ["backgroundUrl", "foregroundUrl"],
      },
    },
  },
  domain: "image-edit",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.mutation,
  async execute(args) {
    const backgroundUrl = String(args.backgroundUrl);
    const foregroundUrl = String(args.foregroundUrl);
    const x = Number(args.x) ?? 0;
    const y = Number(args.y) ?? 0;
    const scale = Number(args.scale) ?? 1.0;
    const opacity = Math.min(Math.max(Number(args.opacity) ?? 1, 0), 1);
    try {
      const [bg, fg] = await Promise.all([loadImage(backgroundUrl), loadImage(foregroundUrl)]);
      const { canvas, ctx } = createCanvas(bg.naturalWidth, bg.naturalHeight);
      ctx.drawImage(bg, 0, 0);
      ctx.globalAlpha = opacity;
      const fw = Math.round(fg.naturalWidth * scale);
      const fh = Math.round(fg.naturalHeight * scale);
      ctx.drawImage(fg, x, y, fw, fh);
      ctx.globalAlpha = 1;
      const outputUrl = await saveCanvasAsImage(canvas, "composite.png");
      return { success: true, data: { outputUrl } };
    } catch (e) {
      return { success: false, error: formatError("图片合成失败", e) };
    }
  },
};
