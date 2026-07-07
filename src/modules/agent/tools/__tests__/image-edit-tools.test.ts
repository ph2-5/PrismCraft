/**
 * Image Edit Tools 单元测试
 *
 * 测试 10 个图片编辑工具：
 * - edit_image / crop_image / merge_images / composite_image
 * - remove_background（AI 优雅降级）
 * - apply_filter / adjust_colors
 * - inpaint（AI 优雅降级）
 * - add_text_overlay / resize_image
 *
 * Mock 策略：
 * - @/shared/file-http（saveImageBlob 动态导入 writeFile/getCacheDirectory）
 * - @/infrastructure/di（removeBackground 动态导入 container.imageProvider.analyzeImage）
 * - ../../services/tool-executor（TOOL_TIMEOUTS）
 * - 全局 Image 构造器（loadImage 使用 new Image()）
 * - document.createElement("canvas")（createCanvas 使用 Canvas API）
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

// vi.hoisted：mock 变量在 vi.mock 工厂执行前就已定义
const mocks = vi.hoisted(() => ({
  writeFile: vi.fn(),
  readFile: vi.fn(),
  fileExists: vi.fn(),
  getCacheDirectory: vi.fn(),
  deleteFile: vi.fn(),
  getDiskSpace: vi.fn(),
  getFileInfo: vi.fn(),
  analyzeImage: vi.fn(),
}));

vi.mock("@/shared/file-http", () => ({
  writeFile: mocks.writeFile,
  readFile: mocks.readFile,
  fileExists: mocks.fileExists,
  getCacheDirectory: mocks.getCacheDirectory,
  deleteFile: mocks.deleteFile,
  getDiskSpace: mocks.getDiskSpace,
  getFileInfo: mocks.getFileInfo,
}));

vi.mock("@/infrastructure/di", () => ({
  container: {
    imageProvider: { analyzeImage: mocks.analyzeImage },
  },
}));

vi.mock("../../services/tool-executor", () => ({
  TOOL_TIMEOUTS: {
    query: 30_000,
    mutation: 60_000,
    generation: 300_000,
    videoTask: 1_800_000,
    download: 600_000,
  },
}));

import {
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
  imageEditTools,
} from "../image-edit-tools";
import type { ToolContext } from "../../domain/types";

function makeCtx(): ToolContext {
  return { sessionId: "test-session", onProgress: vi.fn() };
}

// ============= Canvas / Image 全局 Mock =============

/** 创建 fake canvas + 2D context */
function makeFakeCanvas() {
  const ctx = {
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    getImageData: vi.fn((_x: number, _y: number, w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4),
      width: w,
      height: h,
    })),
    putImageData: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    strokeText: vi.fn(),
    fillText: vi.fn(),
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    font: "",
    globalAlpha: 1,
    filter: "none",
  };
  const canvas = {
    width: 100,
    height: 100,
    getContext: vi.fn(() => ctx),
    toBlob: vi.fn((cb: (blob: Blob) => void) => {
      cb(new Blob([], { type: "image/png" }));
    }),
  };
  return { canvas, ctx };
}

/** 安装 Image 全局 mock：url 含 "fail" 或 "error" 时触发 onerror */
function setupImageMock() {
  vi.stubGlobal(
    "Image",
    function ImageConstructor() {
      const img: Record<string, unknown> = {
        naturalWidth: 100,
        naturalHeight: 100,
        width: 100,
        height: 100,
        crossOrigin: "",
        onload: null as (() => void) | null,
        onerror: null as (() => void) | null,
      };
      let _src = "";
      Object.defineProperty(img, "src", {
        get() {
          return _src;
        },
        set(v: string) {
          _src = v;
          const shouldFail = v.includes("fail") || v.includes("error");
          const cb = shouldFail ? img.onerror : img.onload;
          if (cb) queueMicrotask(() => (cb as () => void).call(img));
        },
        configurable: true,
      });
      return img;
    },
  );
}

/** 安装 document.createElement mock：canvas 返回 fake canvas */
function setupCanvasMock() {
  const origCreateElement = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
    if (tag === "canvas") return makeFakeCanvas().canvas as unknown as HTMLElement;
    return origCreateElement(tag as never);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  setupImageMock();
  setupCanvasMock();
  // 默认 file-http 行为
  mocks.getCacheDirectory.mockResolvedValue({ success: true, path: "/cache" });
  mocks.writeFile.mockResolvedValue({ success: true });
  // 默认 analyzeImage 行为（返回文本分析成功）
  mocks.analyzeImage.mockResolvedValue({
    success: true,
    data: { analysis: "这是一张图片的分析结果" },
  });
});

// ============================================================
// 1. edit_image
// ============================================================
describe("edit_image", () => {
  it("1. 操作列表为空时返回错误", async () => {
    const result = await editImageTool.execute(
      { imageUrl: "https://example.com/img.png", operations: [] },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("操作列表不能为空");
  });

  it("2. 正常流程：应用裁剪+旋转操作序列", async () => {
    const result = await editImageTool.execute(
      {
        imageUrl: "https://example.com/img.png",
        operations: [
          { type: "crop", params: { x: 0, y: 0, width: 50, height: 50 } },
          { type: "rotate", params: { angle: 90 } },
        ],
      },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { outputUrl: string; operations: string[] };
    expect(data.outputUrl).toContain("/cache/image-edits/");
    expect(data.operations).toEqual(["crop", "rotate"]);
    expect(mocks.writeFile).toHaveBeenCalledTimes(1);
  });

  it("3. 图片加载失败时返回错误", async () => {
    const result = await editImageTool.execute(
      {
        imageUrl: "fail://broken.png",
        operations: [{ type: "rotate", params: { angle: 180 } }],
      },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("图片编辑失败");
    expect(result.error).toContain("加载图片失败");
  });
});

// ============================================================
// 2. crop_image
// ============================================================
describe("crop_image", () => {
  it("4. 裁剪宽高为 0 时返回错误", async () => {
    const result = await cropImageTool.execute(
      { imageUrl: "https://example.com/img.png", x: 0, y: 0, width: 0, height: 100 },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("裁剪宽高必须大于 0");
  });

  it("5. 正常裁剪流程", async () => {
    const result = await cropImageTool.execute(
      { imageUrl: "https://example.com/img.png", x: 10, y: 10, width: 80, height: 80 },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { outputUrl: string };
    expect(data.outputUrl).toContain("cropped.png");
  });
});

// ============================================================
// 3. merge_images
// ============================================================
describe("merge_images", () => {
  it("6. 图片数量不足 2 张时返回错误", async () => {
    const result = await mergeImagesTool.execute(
      { imageUrls: ["https://example.com/1.png"], layout: "horizontal" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("2-9");
  });

  it("7. 图片数量超过 9 张时返回错误", async () => {
    const urls = Array.from({ length: 10 }, (_, i) => `https://example.com/${i}.png`);
    const result = await mergeImagesTool.execute(
      { imageUrls: urls, layout: "horizontal" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("2-9");
  });

  it("8. 正常水平合并流程", async () => {
    const result = await mergeImagesTool.execute(
      {
        imageUrls: ["https://example.com/1.png", "https://example.com/2.png"],
        layout: "horizontal",
        gap: 5,
      },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { outputUrl: string; layout: string; imageCount: number };
    expect(data.layout).toBe("horizontal");
    expect(data.imageCount).toBe(2);
    expect(data.outputUrl).toContain("merged.png");
  });

  it("9. 网格布局正常流程", async () => {
    const result = await mergeImagesTool.execute(
      {
        imageUrls: [
          "https://example.com/1.png",
          "https://example.com/2.png",
          "https://example.com/3.png",
          "https://example.com/4.png",
        ],
        layout: "grid",
      },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { imageCount: number };
    expect(data.imageCount).toBe(4);
  });
});

// ============================================================
// 4. composite_image
// ============================================================
describe("composite_image", () => {
  it("10. 正常合成流程（含透明度与缩放）", async () => {
    const result = await compositeImageTool.execute(
      {
        backgroundUrl: "https://example.com/bg.png",
        foregroundUrl: "https://example.com/fg.png",
        x: 20,
        y: 30,
        scale: 0.5,
        opacity: 0.8,
      },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { outputUrl: string };
    expect(data.outputUrl).toContain("composite.png");
  });

  it("11. 前景图片加载失败时返回错误", async () => {
    const result = await compositeImageTool.execute(
      {
        backgroundUrl: "https://example.com/bg.png",
        foregroundUrl: "fail://broken-fg.png",
      },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("图片合成失败");
  });
});

// ============================================================
// 5. remove_background（AI 优雅降级）
// ============================================================
describe("remove_background", () => {
  it("12. analyzeImage 失败时返回友好提示与建议", async () => {
    mocks.analyzeImage.mockResolvedValue({
      success: false,
      error: "model not found",
    });

    const result = await removeBackgroundTool.execute(
      { imageUrl: "https://example.com/img.png" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("不支持背景去除");
    const data = result.data as { suggestion: string; originalError: string };
    expect(data.suggestion).toContain("remove.bg");
    expect(data.originalError).toBe("model not found");
  });

  it("13. analyzeImage 成功但返回文本分析（无法生成图片）时优雅降级", async () => {
    mocks.analyzeImage.mockResolvedValue({
      success: true,
      data: { analysis: "图片中有一个人物" },
    });

    const result = await removeBackgroundTool.execute(
      { imageUrl: "https://example.com/img.png" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("文本分析结果");
    const data = result.data as { suggestion: string; analysis: string };
    expect(data.suggestion).toBeDefined();
    expect(data.analysis).toContain("人物");
  });

  it("14. analyzeImage 抛出异常时返回错误", async () => {
    mocks.analyzeImage.mockRejectedValue(new Error("network error"));

    const result = await removeBackgroundTool.execute(
      { imageUrl: "https://example.com/img.png" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("去除背景失败");
    expect(result.error).toContain("network error");
  });
});

// ============================================================
// 6. apply_filter
// ============================================================
describe("apply_filter", () => {
  it("15. CSS 滤镜（grayscale）正常流程", async () => {
    const result = await applyFilterTool.execute(
      { imageUrl: "https://example.com/img.png", filter: "grayscale", intensity: 0.5 },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { outputUrl: string; filter: string; intensity: number };
    expect(data.filter).toBe("grayscale");
    expect(data.intensity).toBe(0.5);
    expect(data.outputUrl).toContain("filtered.png");
  });

  it("16. 像素操作滤镜（sharpen）正常流程", async () => {
    const result = await applyFilterTool.execute(
      { imageUrl: "https://example.com/img.png", filter: "sharpen", intensity: 1 },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { filter: string };
    expect(data.filter).toBe("sharpen");
  });

  it("17. 像素操作滤镜（vintage）正常流程", async () => {
    const result = await applyFilterTool.execute(
      { imageUrl: "https://example.com/img.png", filter: "vintage", intensity: 0.8 },
      makeCtx(),
    );

    expect(result.success).toBe(true);
  });

  it("18. 图片加载失败时返回错误", async () => {
    const result = await applyFilterTool.execute(
      { imageUrl: "fail://broken.png", filter: "sepia" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("应用滤镜失败");
  });
});

// ============================================================
// 7. adjust_colors
// ============================================================
describe("adjust_colors", () => {
  it("19. 正常调整颜色流程", async () => {
    const result = await adjustColorsTool.execute(
      {
        imageUrl: "https://example.com/img.png",
        brightness: 20,
        contrast: -10,
        saturation: 50,
        hue: 90,
      },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      outputUrl: string;
      adjustments: { brightness: number; contrast: number; saturation: number; hue: number };
    };
    expect(data.adjustments.brightness).toBe(20);
    expect(data.adjustments.contrast).toBe(-10);
    expect(data.adjustments.hue).toBe(90);
    expect(data.outputUrl).toContain("adjusted.png");
  });

  it("20. 图片加载失败时返回错误", async () => {
    const result = await adjustColorsTool.execute(
      { imageUrl: "fail://broken.png" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("调整颜色失败");
  });
});

// ============================================================
// 8. inpaint（AI 优雅降级）
// ============================================================
describe("inpaint", () => {
  it("21. 返回优雅降级提示（不支持图像修复）", async () => {
    const result = await inpaintTool.execute(
      { imageUrl: "https://example.com/img.png" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("不支持图像修复");
  });

  it("22. 降级响应包含输入回显与建议", async () => {
    const result = await inpaintTool.execute(
      {
        imageUrl: "https://example.com/img.png",
        maskUrl: "https://example.com/mask.png",
        maskRegions: [{ x: 0, y: 0, width: 10, height: 10 }],
        prompt: "去除瑕疵",
      },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    const data = result.data as {
      suggestion: string;
      input: { imageUrl: string; hasMask: boolean; maskRegionCount: number; hasPrompt: boolean };
    };
    expect(data.suggestion).toContain("Stable Diffusion");
    expect(data.input.imageUrl).toBe("https://example.com/img.png");
    expect(data.input.hasMask).toBe(true);
    expect(data.input.maskRegionCount).toBe(1);
    expect(data.input.hasPrompt).toBe(true);
  });
});

// ============================================================
// 9. add_text_overlay
// ============================================================
describe("add_text_overlay", () => {
  it("23. 正常添加文字水印流程", async () => {
    const result = await addTextOverlayTool.execute(
      {
        imageUrl: "https://example.com/img.png",
        text: "水印文字",
        x: 10,
        y: 10,
        fontSize: 32,
        color: "#ff0000",
        opacity: 0.9,
      },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { outputUrl: string };
    expect(data.outputUrl).toContain("text_overlay.png");
  });

  it("24. 带旋转的文字水印正常流程", async () => {
    const result = await addTextOverlayTool.execute(
      {
        imageUrl: "https://example.com/img.png",
        text: "斜向水印",
        rotation: 45,
        strokeWidth: 3,
      },
      makeCtx(),
    );

    expect(result.success).toBe(true);
  });

  it("25. 图片加载失败时返回错误", async () => {
    const result = await addTextOverlayTool.execute(
      { imageUrl: "fail://broken.png", text: "测试" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("添加文字水印失败");
  });
});

// ============================================================
// 10. resize_image
// ============================================================
describe("resize_image", () => {
  it("26. 未指定任何尺寸参数时返回错误", async () => {
    const result = await resizeImageTool.execute(
      { imageUrl: "https://example.com/img.png" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("必须指定");
  });

  it("27. 目标尺寸为负数时返回错误", async () => {
    const result = await resizeImageTool.execute(
      { imageUrl: "https://example.com/img.png", width: -10, height: 100 },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("大于 0");
  });

  it("28. 指定 width/height 正常调整尺寸", async () => {
    const result = await resizeImageTool.execute(
      { imageUrl: "https://example.com/img.png", width: 200, height: 150 },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      outputUrl: string;
      originalSize: { width: number; height: number };
      newSize: { width: number; height: number };
    };
    expect(data.originalSize).toEqual({ width: 100, height: 100 });
    expect(data.newSize).toEqual({ width: 200, height: 150 });
    expect(data.outputUrl).toContain("resized.png");
  });

  it("29. maxWidth 约束按比例缩小（不放大）", async () => {
    const result = await resizeImageTool.execute(
      { imageUrl: "https://example.com/img.png", maxWidth: 50 },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { newSize: { width: number; height: number } };
    // 100 → 50（缩小一半）
    expect(data.newSize.width).toBe(50);
    expect(data.newSize.height).toBe(50);
  });
});

// ============================================================
// 导出数组验证
// ============================================================
describe("imageEditTools 导出", () => {
  it("30. 包含全部 10 个工具", () => {
    expect(imageEditTools).toHaveLength(10);
    const names = imageEditTools.map((t) => t.def.function.name);
    expect(names).toContain("edit_image");
    expect(names).toContain("crop_image");
    expect(names).toContain("merge_images");
    expect(names).toContain("composite_image");
    expect(names).toContain("remove_background");
    expect(names).toContain("apply_filter");
    expect(names).toContain("adjust_colors");
    expect(names).toContain("inpaint");
    expect(names).toContain("add_text_overlay");
    expect(names).toContain("resize_image");
  });

  it("31. 所有工具 domain 为 image-edit", () => {
    for (const tool of imageEditTools) {
      expect(tool.domain).toBe("image-edit");
    }
  });
});
