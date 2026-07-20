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
 * - 核心实现拆分到 image-edit-utils.ts 以降低单文件复杂度
 */

import type { ToolImpl } from "@/domain/types/agent-tools";
import { TOOL_TIMEOUTS } from "@/shared/constants/tool-timeouts";
import {
  type EditOperation,
  type MergeImagesArgs,
  type ApplyFilterArgs,
  type ResizeImageArgs,
  loadImage,
  imageToCanvas,
  applyOperation,
  saveCanvasAsImage,
  executeMergeImages,
  executeApplyFilter,
  executeResizeImage,
  compositeImageTool,
} from "./image-edit-utils";

/** 错误信息格式化 */
function formatError(prefix: string, e: unknown): string {
  return `${prefix}：${e instanceof Error ? e.message : String(e)}`;
}

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
      return { success: false, error: formatError("图片编辑失败", e) };
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
      return { success: false, error: formatError("裁剪图片失败", e) };
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
      const params: MergeImagesArgs = { imageUrls, layout, gap, background };
      const result = await executeMergeImages(params);
      return { success: true, data: result };
    } catch (e) {
      return { success: false, error: formatError("合并图片失败", e) };
    }
  },
};

/** 4. 图片合成（实现见 image-edit-utils.ts: compositeImageTool） */

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
      return { success: false, error: formatError("去除背景失败", e) };
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
    const filter = String(args.filter) as ApplyFilterArgs["filter"];
    const intensity = Math.min(Math.max(Number(args.intensity) ?? 1, 0), 1);
    try {
      const params: ApplyFilterArgs = { imageUrl, filter, intensity };
      const result = await executeApplyFilter(params);
      return { success: true, data: result };
    } catch (e) {
      return { success: false, error: formatError("应用滤镜失败", e) };
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
      const { createCanvas } = await import("./image-edit-utils");
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
      return { success: false, error: formatError("调整颜色失败", e) };
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
      const { createCanvas } = await import("./image-edit-utils");
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
      return { success: false, error: formatError("添加文字水印失败", e) };
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
    const width = args.width ? Number(args.width) : undefined;
    const height = args.height ? Number(args.height) : undefined;
    try {
      const params: ResizeImageArgs = {
        imageUrl,
        width,
        height,
        maintainAspect,
        maxWidth,
        maxHeight,
      };
      const result = await executeResizeImage(params);
      return { success: true, data: result };
    } catch (e) {
      return { success: false, error: formatError("调整尺寸失败", e) };
    }
  },
};

/** 导出所有图片编辑工具 */
export const imageEditTools: ToolImpl[] = [
  editImageTool,
  cropImageTool,
  mergeImagesTool,
  compositeImageTool, // 从 image-edit-utils 导入
  removeBackgroundTool,
  applyFilterTool,
  adjustColorsTool,
  inpaintTool,
  addTextOverlayTool,
  resizeImageTool,
];

// 重新导出 compositeImageTool 以保持公共 API 不变
export { compositeImageTool };
