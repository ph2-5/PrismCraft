/**
 * 图片编辑工具（Image Edit Tools）
 *
 * 包含工具（10 个）：
 * - edit_image：基础编辑（裁剪+旋转+缩放+翻转，按操作序列依次应用）
 * - crop_image：裁剪图片
 * - merge_images：合并多张图片（水平/垂直/网格）
 * - composite_image：图片合成（前景叠加到背景）
 * - remove_background：去除背景（AI，优雅降级）
 * - apply_filter：应用滤镜（灰度/棕褐/反色/模糊/锐化/复古/冷色/暖色）
 * - adjust_colors：调整颜色（亮度/对比度/饱和度/色相）
 * - inpaint：图像修复（AI，优雅降级）
 * - add_text_overlay：添加文字水印
 * - resize_image：调整图片尺寸
 *
 * 设计要点：
 * - 渲染进程使用 Canvas API 实现基础编辑
 * - AI 能力（去背景/修复）调用 imageProvider，不支持时优雅降级
 * - 通过 @/shared/file-http 统一保存到缓存目录
 * - 跨域图片设置 crossOrigin = "anonymous"
 */

import type { ToolImpl } from "@/domain/types/agent-tools";
import { TOOL_TIMEOUTS } from "@/shared/constants/tool-timeouts";

// ============= 类型定义（内部使用，不导出） =============

type EditOperation =
  | { type: "crop"; params: { x: number; y: number; width: number; height: number } }
  | { type: "rotate"; params: { angle: 90 | 180 | 270 } }
  | { type: "resize"; params: { width: number; height: number } }
  | { type: "flip"; params: { axis: "horizontal" | "vertical" } };

// ============= 辅助函数（内部使用，不导出） =============

/** 加载图片 */
async function loadImage(url: string): Promise<HTMLImageElement> {
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
async function imageToCanvas(img: HTMLImageElement): Promise<HTMLCanvasElement> {
  const { canvas, ctx } = createCanvas(img.naturalWidth || img.width, img.naturalHeight || img.height);
  ctx.drawImage(img, 0, 0);
  return canvas;
}

/** 应用单个编辑操作，返回新 Canvas */
function applyOperation(canvas: HTMLCanvasElement, op: EditOperation): HTMLCanvasElement {
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
async function saveCanvasAsImage(canvas: HTMLCanvasElement, filename: string): Promise<string> {
  const blob = await canvasToBlob(canvas, "image/png");
  return saveImageBlob(blob, filename);
}

// ============= 工具实现 =============

/** 1. 基础编辑：裁剪+旋转+缩放+翻转 */
export const editImageTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "edit_image",
      description:
        "对图片执行基础编辑操作（裁剪、旋转、缩放、翻转）。支持按操作序列依次应用多个操作。结果保存为 PNG 到缓存目录。",
      parameters: {
        type: "object",
        properties: {
          imageUrl: { type: "string", maxLength: 2048, description: "输入图片 URL" },
          operations: {
            type: "array",
            description: "操作序列，按顺序依次应用。每个元素包含 type 和 params。",
            items: {
              type: "object",
              properties: {
                type: { type: "string", enum: ["crop", "rotate", "resize", "flip"] },
                params: {
                  type: "object",
                  description: "操作参数：crop={x,y,width,height}; rotate={angle:90|180|270}; resize={width,height}; flip={axis:'horizontal'|'vertical'}",
                },
              },
              required: ["type", "params"],
            },
          },
        },
        required: ["imageUrl", "operations"],
      },
    },
  },
  domain: "image-edit",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.mutation,
  async execute(args) {
    const imageUrl = String(args.imageUrl);
    const operations = (args.operations as EditOperation[]) ?? [];
    if (operations.length === 0) {
      return { success: false, error: "操作列表不能为空" };
    }
    try {
      const img = await loadImage(imageUrl);
      let canvas = await imageToCanvas(img);
      for (const op of operations) {
        canvas = applyOperation(canvas, op);
      }
      const outputUrl = await saveCanvasAsImage(canvas, "edited.png");
      return {
        success: true,
        data: {
          outputUrl,
          operations: operations.map((o) => `${o.type}`),
        },
      };
    } catch (e) {
      return {
        success: false,
        error: `图片编辑失败：${e instanceof Error ? e.message : String(e)}`,
      };
    }
  },
};

/** 2. 裁剪图片 */
export const cropImageTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "crop_image",
      description: "裁剪图片到指定矩形区域。结果保存为 PNG。",
      parameters: {
        type: "object",
        properties: {
          imageUrl: { type: "string", maxLength: 2048, description: "输入图片 URL 或本地路径" },
          x: { type: "number", minimum: 0, description: "裁剪起始 X 坐标（像素）" },
          y: { type: "number", minimum: 0, description: "裁剪起始 Y 坐标（像素）" },
          width: { type: "number", minimum: 1, maximum: 10000, description: "裁剪宽度（像素）" },
          height: { type: "number", minimum: 1, maximum: 10000, description: "裁剪高度（像素）" },
        },
        required: ["imageUrl", "x", "y", "width", "height"],
      },
    },
  },
  domain: "image-edit",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.mutation,
  async execute(args) {
    const imageUrl = String(args.imageUrl);
    const x = Number(args.x);
    const y = Number(args.y);
    const width = Number(args.width);
    const height = Number(args.height);
    if (width <= 0 || height <= 0) {
      return { success: false, error: "裁剪宽高必须大于 0" };
    }
    try {
      const img = await loadImage(imageUrl);
      const canvas = applyOperation(await imageToCanvas(img), {
        type: "crop",
        params: { x, y, width, height },
      });
      const outputUrl = await saveCanvasAsImage(canvas, "cropped.png");
      return { success: true, data: { outputUrl } };
    } catch (e) {
      return {
        success: false,
        error: `裁剪图片失败：${e instanceof Error ? e.message : String(e)}`,
      };
    }
  },
};

/** 3. 合并多张图片 */
export const mergeImagesTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "merge_images",
      description:
        "将多张图片（2-9 张）合并为一张。支持水平排列、垂直排列、网格布局。结果保存为 PNG。",
      parameters: {
        type: "object",
        properties: {
          imageUrls: {
            type: "array",
            items: { type: "string", maxLength: 2048 },
            description: "图片 URL 数组（2-9 张）",
            maxItems: 9,
          },
          layout: {
            type: "string",
            enum: ["horizontal", "vertical", "grid"],
            description: "排列方式：horizontal=水平排列, vertical=垂直排列, grid=网格排列",
          },
          gap: { type: "number", minimum: 0, maximum: 1000, description: "图片间距（像素），默认 10", default: 10 },
          background: { type: "string", maxLength: 200, description: "背景色，默认 #ffffff", default: "#ffffff" },
        },
        required: ["imageUrls", "layout"],
      },
    },
  },
  domain: "image-edit",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.mutation,
  async execute(args) {
    const imageUrls = (args.imageUrls as string[]) ?? [];
    if (imageUrls.length < 2 || imageUrls.length > 9) {
      return { success: false, error: "图片数量必须在 2-9 张之间" };
    }
    const layout = String(args.layout) as "horizontal" | "vertical" | "grid";
    const gap = Number(args.gap) ?? 10;
    const background = String(args.background ?? "#ffffff");
    try {
      const imgs = await Promise.all(imageUrls.map((u) => loadImage(u)));
      let canvasWidth = 0;
      let canvasHeight = 0;
      let cols = 1;
      let rows = 1;
      const gridColWidths: number[] = [];
      const gridRowHeights: number[] = [];
      if (layout === "horizontal") {
        cols = imgs.length;
        rows = 1;
        canvasWidth = imgs.reduce((sum, im) => sum + im.naturalWidth, 0) + gap * (imgs.length - 1);
        canvasHeight = Math.max(...imgs.map((im) => im.naturalHeight));
      } else if (layout === "vertical") {
        cols = 1;
        rows = imgs.length;
        canvasWidth = Math.max(...imgs.map((im) => im.naturalWidth));
        canvasHeight = imgs.reduce((sum, im) => sum + im.naturalHeight, 0) + gap * (imgs.length - 1);
      } else {
        cols = Math.ceil(Math.sqrt(imgs.length));
        rows = Math.ceil(imgs.length / cols);
        for (let c = 0; c < cols; c++) {
          let maxW = 0;
          for (let r = 0; r < rows; r++) {
            const idx = r * cols + c;
            if (idx < imgs.length) maxW = Math.max(maxW, imgs[idx]?.naturalWidth ?? 0);
          }
          gridColWidths[c] = maxW;
        }
        for (let r = 0; r < rows; r++) {
          let maxH = 0;
          for (let c = 0; c < cols; c++) {
            const idx = r * cols + c;
            if (idx < imgs.length) maxH = Math.max(maxH, imgs[idx]?.naturalHeight ?? 0);
          }
          gridRowHeights[r] = maxH;
        }
        canvasWidth = gridColWidths.reduce((s, w) => s + w, 0) + gap * (cols - 1);
        canvasHeight = gridRowHeights.reduce((s, h) => s + h, 0) + gap * (rows - 1);
      }
      const { canvas, ctx } = createCanvas(canvasWidth, canvasHeight);
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
      if (layout === "horizontal") {
        let offsetX = 0;
        for (const im of imgs) {
          ctx.drawImage(im, offsetX, 0);
          offsetX += im.naturalWidth + gap;
        }
      } else if (layout === "vertical") {
        let offsetY = 0;
        for (const im of imgs) {
          ctx.drawImage(im, 0, offsetY);
          offsetY += im.naturalHeight + gap;
        }
      } else {
        let offsetY = 0;
        for (let r = 0; r < rows; r++) {
          let offsetX = 0;
          for (let c = 0; c < cols; c++) {
            const idx = r * cols + c;
            if (idx < imgs.length) {
              const im = imgs[idx];
              if (im) ctx.drawImage(im, offsetX, offsetY);
            }
            offsetX += (gridColWidths[c] ?? 0) + gap;
          }
          offsetY += (gridRowHeights[r] ?? 0) + gap;
        }
      }
      const outputUrl = await saveCanvasAsImage(canvas, "merged.png");
      return {
        success: true,
        data: { outputUrl, layout, imageCount: imgs.length },
      };
    } catch (e) {
      return {
        success: false,
        error: `合并图片失败：${e instanceof Error ? e.message : String(e)}`,
      };
    }
  },
};

/** 4. 图片合成 */
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
      return {
        success: false,
        error: `图片合成失败：${e instanceof Error ? e.message : String(e)}`,
      };
    }
  },
};

/** 5. 去除背景（AI，优雅降级） */
export const removeBackgroundTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "remove_background",
      description:
        "去除图片背景（抠图），生成透明背景 PNG。需 AI 能力支持。当前 imageProvider 仅支持图像分析，可能无法直接生成去背景图片；如不支持将返回友好提示。",
      parameters: {
        type: "object",
        properties: {
          imageUrl: { type: "string", maxLength: 2048, description: "输入图片 URL" },
          providerId: { type: "string", maxLength: 100, description: "指定 AI provider ID（可选）" },
          modelId: { type: "string", maxLength: 100, description: "指定 AI 模型 ID（可选）" },
        },
        required: ["imageUrl"],
      },
    },
  },
  domain: "image-edit",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.generation,
  async execute(args) {
    const imageUrl = String(args.imageUrl);
    const providerId = args.providerId ? String(args.providerId) : undefined;
    const modelId = args.modelId ? String(args.modelId) : undefined;
    try {
      const { container } = await import("@/infrastructure/di");
      const result = await container.imageProvider.analyzeImage(
        imageUrl,
        "character",
        "请生成这张图片的去除背景后的图片，返回透明背景的 PNG",
        { providerId, modelId },
      );
      if (!result.success) {
        return {
          success: false,
          error: "当前 AI provider 不支持背景去除。建议配置支持抠图的 API（如 remove.bg API）",
          data: {
            suggestion:
              "可配置 remove.bg API、Photoroom API 或其他支持抠图的服务。当前 imageProvider.analyzeImage 仅返回文本分析，无法生成图片。",
            originalError: result.error,
          },
        };
      }
      // analyzeImage 返回 { analysis: string, analyzed?: Record }，是文本分析而非图片
      // 无法直接获取去背景图片，返回友好降级
      return {
        success: false,
        error: "当前 AI provider 返回的是文本分析结果，不支持直接生成去背景图片。",
        data: {
          suggestion:
            "建议配置支持抠图的 API（如 remove.bg API、Photoroom API），或使用支持图像编辑生成的多模态模型。",
          analysis: result.data.analysis,
        },
      };
    } catch (e) {
      return {
        success: false,
        error: `去除背景失败：${e instanceof Error ? e.message : String(e)}`,
      };
    }
  },
};

/** 6. 应用滤镜 */
export const applyFilterTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "apply_filter",
      description:
        "对图片应用滤镜效果。支持：grayscale（灰度）、sepia（棕褐）、invert（反色）、blur（模糊）、sharpen（锐化）、vintage（复古）、cool（冷色）、warm（暖色）。结果保存为 PNG。",
      parameters: {
        type: "object",
        properties: {
          imageUrl: { type: "string", maxLength: 2048, description: "输入图片 URL" },
          filter: {
            type: "string",
            enum: ["grayscale", "sepia", "invert", "blur", "sharpen", "vintage", "cool", "warm"],
            description: "滤镜类型",
          },
          intensity: { type: "number", minimum: 0, maximum: 1, description: "强度（0-1），默认 1", default: 1 },
        },
        required: ["imageUrl", "filter"],
      },
    },
  },
  domain: "image-edit",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.mutation,
  async execute(args) {
    const imageUrl = String(args.imageUrl);
    const filter = String(args.filter) as
      | "grayscale"
      | "sepia"
      | "invert"
      | "blur"
      | "sharpen"
      | "vintage"
      | "cool"
      | "warm";
    const intensity = Math.min(Math.max(Number(args.intensity) ?? 1, 0), 1);
    try {
      const img = await loadImage(imageUrl);
      const { canvas, ctx } = createCanvas(img.naturalWidth, img.naturalHeight);
      // CSS filter 类滤镜
      if (filter === "grayscale" || filter === "sepia" || filter === "invert" || filter === "blur") {
        let filterStr = "";
        switch (filter) {
          case "grayscale":
            filterStr = `grayscale(${intensity * 100}%)`;
            break;
          case "sepia":
            filterStr = `sepia(${intensity * 100}%)`;
            break;
          case "invert":
            filterStr = `invert(${intensity * 100}%)`;
            break;
          case "blur":
            filterStr = `blur(${intensity * 4}px)`;
            break;
        }
        ctx.filter = filterStr;
        ctx.drawImage(img, 0, 0);
        ctx.filter = "none";
      } else {
        // 先绘制原图，再进行像素操作
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        if (filter === "sharpen") {
          // 3x3 锐化卷积核
          const src = new Uint8ClampedArray(data);
          const w = canvas.width;
          const h = canvas.height;
          const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];
          for (let y = 1; y < h - 1; y++) {
            for (let x = 1; x < w - 1; x++) {
              for (let ch = 0; ch < 3; ch++) {
                let sum = 0;
                let ki = 0;
                for (let ky = -1; ky <= 1; ky++) {
                  for (let kx = -1; kx <= 1; kx++) {
                    const idx = ((y + ky) * w + (x + kx)) * 4 + ch;
                    const srcVal = src[idx] ?? 0;
                    const kVal = kernel[ki] ?? 0;
                    ki++;
                    sum += srcVal * kVal;
                  }
                }
                const di = (y * w + x) * 4 + ch;
                // 按 intensity 混合原图与锐化结果
                data[di] = Math.round((src[di] ?? 0) * (1 - intensity) + Math.min(255, Math.max(0, sum)) * intensity);
              }
            }
          }
        } else if (filter === "vintage") {
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i] ?? 0;
            const g = data[i + 1] ?? 0;
            const b = data[i + 2] ?? 0;
            data[i] = Math.min(255, Math.round(r * (1 + 0.08 * intensity) + 20 * intensity));
            data[i + 1] = Math.min(255, Math.round(g * (1 - 0.05 * intensity)));
            data[i + 2] = Math.min(255, Math.round(b * (1 - 0.3 * intensity)));
          }
        } else if (filter === "cool") {
          for (let i = 0; i < data.length; i += 4) {
            data[i] = Math.max(0, Math.round((data[i] ?? 0) * (1 - 0.1 * intensity)));
            data[i + 2] = Math.min(255, Math.round((data[i + 2] ?? 0) * (1 + 0.1 * intensity)));
          }
        } else if (filter === "warm") {
          for (let i = 0; i < data.length; i += 4) {
            data[i] = Math.min(255, Math.round((data[i] ?? 0) * (1 + 0.1 * intensity)));
            data[i + 2] = Math.max(0, Math.round((data[i + 2] ?? 0) * (1 - 0.1 * intensity)));
          }
        }
        ctx.putImageData(imageData, 0, 0);
      }
      const outputUrl = await saveCanvasAsImage(canvas, "filtered.png");
      return {
        success: true,
        data: { outputUrl, filter, intensity },
      };
    } catch (e) {
      return {
        success: false,
        error: `应用滤镜失败：${e instanceof Error ? e.message : String(e)}`,
      };
    }
  },
};

/** 7. 调整颜色 */
export const adjustColorsTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "adjust_colors",
      description: "调整图片颜色参数：亮度、对比度、饱和度、色相。使用 CSS filter 实现。结果保存为 PNG。",
      parameters: {
        type: "object",
        properties: {
          imageUrl: { type: "string", maxLength: 2048, description: "输入图片 URL" },
          brightness: { type: "number", minimum: -100, maximum: 100, description: "亮度调整（-100 到 100），默认 0", default: 0 },
          contrast: { type: "number", minimum: -100, maximum: 100, description: "对比度调整（-100 到 100），默认 0", default: 0 },
          saturation: { type: "number", minimum: -100, maximum: 100, description: "饱和度调整（-100 到 100），默认 0", default: 0 },
          hue: { type: "number", minimum: -180, maximum: 180, description: "色相旋转（-180 到 180 度），默认 0", default: 0 },
        },
        required: ["imageUrl"],
      },
    },
  },
  domain: "image-edit",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.mutation,
  async execute(args) {
    const imageUrl = String(args.imageUrl);
    const brightness = Math.min(Math.max(Number(args.brightness) ?? 0, -100), 100);
    const contrast = Math.min(Math.max(Number(args.contrast) ?? 0, -100), 100);
    const saturation = Math.min(Math.max(Number(args.saturation) ?? 0, -100), 100);
    const hue = Math.min(Math.max(Number(args.hue) ?? 0, -180), 180);
    try {
      const img = await loadImage(imageUrl);
      const { canvas, ctx } = createCanvas(img.naturalWidth, img.naturalHeight);
      ctx.filter = `brightness(${100 + brightness}%) contrast(${100 + contrast}%) saturate(${100 + saturation}%) hue-rotate(${hue}deg)`;
      ctx.drawImage(img, 0, 0);
      ctx.filter = "none";
      const outputUrl = await saveCanvasAsImage(canvas, "adjusted.png");
      return {
        success: true,
        data: {
          outputUrl,
          adjustments: { brightness, contrast, saturation, hue },
        },
      };
    } catch (e) {
      return {
        success: false,
        error: `调整颜色失败：${e instanceof Error ? e.message : String(e)}`,
      };
    }
  },
};

/** 8. 图像修复（AI，优雅降级） */
export const inpaintTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "inpaint",
      description:
        "图像修复（去除瑕疵/补全指定区域）。需 AI 能力支持。当前 imageProvider 不支持图像修复生成，将返回友好提示与建议。",
      parameters: {
        type: "object",
        properties: {
          imageUrl: { type: "string", maxLength: 2048, description: "输入图片 URL" },
          maskUrl: { type: "string", maxLength: 2048, description: "蒙版图片 URL（白色区域表示需修复），可选" },
          maskRegions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                x: { type: "number", minimum: 0 },
                y: { type: "number", minimum: 0 },
                width: { type: "number", minimum: 1, maximum: 10000 },
                height: { type: "number", minimum: 1, maximum: 10000 },
              },
            },
            description: "需修复的矩形区域列表（可选）",
          },
          prompt: { type: "string", maxLength: 5000, description: "修复提示词（可选）" },
          providerId: { type: "string", maxLength: 100, description: "指定 AI provider ID（可选）" },
          modelId: { type: "string", maxLength: 100, description: "指定 AI 模型 ID（可选）" },
        },
        required: ["imageUrl"],
      },
    },
  },
  domain: "image-edit",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.generation,
  async execute(args) {
    const imageUrl = String(args.imageUrl);
    const maskUrl = args.maskUrl ? String(args.maskUrl) : undefined;
    const maskRegions = args.maskRegions as Array<{ x: number; y: number; width: number; height: number }> | undefined;
    const prompt = args.prompt ? String(args.prompt) : undefined;
    // 当前 imageProvider.analyzeImage 仅返回文本分析，无法执行图像修复生成
    return {
      success: false,
      error: "当前 AI provider 不支持图像修复（inpainting）生成。",
      data: {
        suggestion:
          "图像修复需要支持 inpainting 的多模态模型（如 Stable Diffusion Inpainting、DALL·E 2 Edit、Flux Fill 等）。请配置支持图像编辑的 AI 服务后重试。",
        input: {
          imageUrl,
          hasMask: !!maskUrl,
          maskRegionCount: maskRegions?.length ?? 0,
          hasPrompt: !!prompt,
        },
      },
    };
  },
};

/** 9. 添加文字水印 */
export const addTextOverlayTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "add_text_overlay",
      description: "在图片上添加文字水印，支持字体、颜色、描边、透明度、旋转。结果保存为 PNG。",
      parameters: {
        type: "object",
        properties: {
          imageUrl: { type: "string", maxLength: 2048, description: "输入图片 URL" },
          text: { type: "string", maxLength: 1000, description: "水印文字内容" },
          x: { type: "number", minimum: 0, description: "文字左上角 X 坐标，默认 10", default: 10 },
          y: { type: "number", minimum: 0, description: "文字基线 Y 坐标，默认 10", default: 10 },
          fontSize: { type: "number", minimum: 1, maximum: 500, description: "字体大小（px），默认 24", default: 24 },
          fontFamily: { type: "string", maxLength: 200, description: "字体族，默认 Arial", default: "Arial" },
          color: { type: "string", maxLength: 200, description: "文字颜色，默认 #ffffff", default: "#ffffff" },
          strokeColor: { type: "string", maxLength: 200, description: "描边颜色，默认 #000000", default: "#000000" },
          strokeWidth: { type: "number", minimum: 0, maximum: 50, description: "描边宽度（px），默认 2", default: 2 },
          opacity: { type: "number", minimum: 0, maximum: 1, description: "透明度（0-1），默认 1", default: 1 },
          rotation: { type: "number", minimum: -360, maximum: 360, description: "旋转角度（度），默认 0", default: 0 },
        },
        required: ["imageUrl", "text"],
      },
    },
  },
  domain: "image-edit",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.mutation,
  async execute(args) {
    const imageUrl = String(args.imageUrl);
    const text = String(args.text);
    const x = Number(args.x) ?? 10;
    const y = Number(args.y) ?? 10;
    const fontSize = Number(args.fontSize) ?? 24;
    const fontFamily = String(args.fontFamily ?? "Arial");
    const color = String(args.color ?? "#ffffff");
    const strokeColor = String(args.strokeColor ?? "#000000");
    const strokeWidth = Number(args.strokeWidth) ?? 2;
    const opacity = Math.min(Math.max(Number(args.opacity) ?? 1, 0), 1);
    const rotation = Number(args.rotation) ?? 0;
    try {
      const img = await loadImage(imageUrl);
      const { canvas, ctx } = createCanvas(img.naturalWidth, img.naturalHeight);
      ctx.drawImage(img, 0, 0);
      ctx.globalAlpha = opacity;
      ctx.font = `${fontSize}px ${fontFamily}`;
      ctx.fillStyle = color;
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = strokeWidth;
      if (rotation !== 0) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate((rotation * Math.PI) / 180);
        if (strokeWidth > 0) ctx.strokeText(text, 0, fontSize);
        ctx.fillText(text, 0, fontSize);
        ctx.restore();
      } else {
        if (strokeWidth > 0) ctx.strokeText(text, x, y + fontSize);
        ctx.fillText(text, x, y + fontSize);
      }
      ctx.globalAlpha = 1;
      const outputUrl = await saveCanvasAsImage(canvas, "text_overlay.png");
      return { success: true, data: { outputUrl } };
    } catch (e) {
      return {
        success: false,
        error: `添加文字水印失败：${e instanceof Error ? e.message : String(e)}`,
      };
    }
  },
};

/** 10. 调整图片尺寸 */
export const resizeImageTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "resize_image",
      description:
        "调整图片尺寸。可指定目标宽高，或通过 maxWidth/maxHeight 按比例缩小（不放大）。支持保持宽高比。结果保存为 PNG。",
      parameters: {
        type: "object",
        properties: {
          imageUrl: { type: "string", maxLength: 2048, description: "输入图片 URL" },
          width: { type: "number", minimum: 1, maximum: 10000, description: "目标宽度（像素），可选" },
          height: { type: "number", minimum: 1, maximum: 10000, description: "目标高度（像素），可选" },
          maintainAspect: { type: "boolean", description: "是否保持宽高比，默认 true", default: true },
          maxWidth: { type: "number", minimum: 1, maximum: 10000, description: "最大宽度（仅缩小不放大），可选" },
          maxHeight: { type: "number", minimum: 1, maximum: 10000, description: "最大高度（仅缩小不放大），可选" },
        },
        required: ["imageUrl"],
      },
    },
  },
  domain: "image-edit",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.mutation,
  async execute(args) {
    const imageUrl = String(args.imageUrl);
    const maintainAspect = args.maintainAspect !== false;
    const maxWidth = args.maxWidth ? Number(args.maxWidth) : undefined;
    const maxHeight = args.maxHeight ? Number(args.maxHeight) : undefined;
    try {
      const img = await loadImage(imageUrl);
      const origW = img.naturalWidth;
      const origH = img.naturalHeight;
      let targetW = args.width ? Number(args.width) : undefined;
      let targetH = args.height ? Number(args.height) : undefined;
      if (targetW === undefined && targetH === undefined && (maxWidth || maxHeight)) {
        // 按最大尺寸约束缩小（不放大）
        let scaleW = 1;
        let scaleH = 1;
        if (maxWidth && origW > maxWidth) scaleW = maxWidth / origW;
        if (maxHeight && origH > maxHeight) scaleH = maxHeight / origH;
        const scale = Math.min(scaleW, scaleH);
        targetW = Math.round(origW * scale);
        targetH = Math.round(origH * scale);
      } else if (maintainAspect) {
        if (targetW !== undefined && targetH === undefined) {
          targetH = Math.round((targetW / origW) * origH);
        } else if (targetH !== undefined && targetW === undefined) {
          targetW = Math.round((targetH / origH) * origW);
        }
      }
      if (targetW === undefined || targetH === undefined) {
        return { success: false, error: "必须指定 width/height/maxWidth/maxHeight 中的至少一项" };
      }
      if (targetW <= 0 || targetH <= 0) {
        return { success: false, error: "目标尺寸必须大于 0" };
      }
      const canvas = applyOperation(await imageToCanvas(img), {
        type: "resize",
        params: { width: targetW, height: targetH },
      });
      const outputUrl = await saveCanvasAsImage(canvas, "resized.png");
      return {
        success: true,
        data: {
          outputUrl,
          originalSize: { width: origW, height: origH },
          newSize: { width: targetW, height: targetH },
        },
      };
    } catch (e) {
      return {
        success: false,
        error: `调整尺寸失败：${e instanceof Error ? e.message : String(e)}`,
      };
    }
  },
};

/** 导出所有图片编辑工具 */
export const imageEditTools: ToolImpl[] = [
  editImageTool,
  cropImageTool,
  mergeImagesTool,
  compositeImageTool,
  removeBackgroundTool,
  applyFilterTool,
  adjustColorsTool,
  inpaintTool,
  addTextOverlayTool,
  resizeImageTool,
];
