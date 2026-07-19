/**
 * Task 2A.22: mask-encoder 单元测试
 *
 * 覆盖：
 * - 空 mask / 无效 shape 错误分支
 * - rectangle / polygon / brush 三种 shape 编码
 * - inverse 反转模式
 * - 同步 vs 异步路径
 * - 体积估算与校验工具函数
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { MaskConfig } from "../../domain/mask-types";
import {
  encodeMask,
  encodeMaskSync,
  estimateBase64Size,
  isMaskSizeValid,
} from "../mask-encoder";

// 构造一个简单的 mock canvas，capture fill/stroke 调用以便断言
function createMockCanvas() {
  const calls: string[] = [];
  const ctx = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    lineCap: "",
    lineJoin: "",
    fillRect: vi.fn((x: number, y: number, w: number, h: number) => {
      calls.push(`fillRect:${x},${y},${w},${h}`);
    }),
    beginPath: vi.fn(() => calls.push("beginPath")),
    moveTo: vi.fn((x: number, y: number) => calls.push(`moveTo:${x},${y}`)),
    lineTo: vi.fn((x: number, y: number) => calls.push(`lineTo:${x},${y}`)),
    closePath: vi.fn(() => calls.push("closePath")),
    fill: vi.fn(() => calls.push("fill")),
    stroke: vi.fn(() => calls.push("stroke")),
    arc: vi.fn((x: number, y: number, r: number) => calls.push(`arc:${x},${y},${r}`)),
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ctx),
    toDataURL: vi.fn(() => "data:image/png;base64,SGVsbG8="),
    convertToBlob: vi.fn(async () => new Blob([new Uint8Array([1, 2, 3])])),
  };
  return { canvas, ctx, calls };
}

describe("mask-encoder", () => {
  let mockCanvas: ReturnType<typeof createMockCanvas>;

  beforeEach(() => {
    mockCanvas = createMockCanvas();
    // 让 mask-encoder 优先走 HTMLCanvasElement 路径（同步、可断言）
    vi.stubGlobal("OffscreenCanvas", undefined);
    vi.stubGlobal("document", {
      createElement: vi.fn(() => mockCanvas.canvas),
    });
    // FileReader 用于 convertToBlob 路径（部分用例）
    vi.stubGlobal("FileReader", class {
      result: string | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      readAsDataURL(_blob: Blob) {
        this.result = "data:image/png;base64,SGVsbG8=";
        setTimeout(() => this.onload?.(), 0);
      }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 用例 1: 空 mask 应返回 empty_mask 错误
  // ─────────────────────────────────────────────────────────────────────────
  it("空 shapes 应返回 empty_mask 错误", async () => {
    const emptyMask: MaskConfig = { shapes: [], videoTimestamp: 0 };
    const result = await encodeMask(emptyMask);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("empty_mask");
      expect(result.error.message).toContain("shapes");
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 用例 2: rectangle shape 编码成功并调用 fillRect
  // ─────────────────────────────────────────────────────────────────────────
  it("rectangle shape 应正确编码并调用 fillRect", async () => {
    const mask: MaskConfig = {
      shapes: [{ type: "rectangle", x: 10, y: 20, width: 100, height: 50 }],
      videoTimestamp: 1.5,
    };
    const result = await encodeMask(mask, { width: 640, height: 360 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.base64).toBe("SGVsbG8=");
      expect(result.value.width).toBe(640);
      expect(result.value.height).toBe(360);
      expect(result.value.dataUrl).toContain("data:image/png;base64,");
    }
    // 验证背景填充 + shape 绘制
    expect(mockCanvas.calls).toContain("fillRect:0,0,640,360");
    expect(mockCanvas.calls).toContain("fillRect:10,20,100,50");
    // 黑色背景（inverse=false）
    expect(mockCanvas.ctx.fillStyle).toBe("#FFFFFF");
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 用例 3: polygon shape 调用 beginPath/moveTo/lineTo/closePath/fill
  // ─────────────────────────────────────────────────────────────────────────
  it("polygon shape 应使用路径绘制", async () => {
    const mask: MaskConfig = {
      shapes: [{
        type: "polygon",
        points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 100 }],
      }],
      videoTimestamp: 0,
    };
    const result = await encodeMask(mask);
    expect(result.ok).toBe(true);
    expect(mockCanvas.calls).toContain("beginPath");
    expect(mockCanvas.calls).toContain("moveTo:0,0");
    expect(mockCanvas.calls).toContain("lineTo:100,0");
    expect(mockCanvas.calls).toContain("lineTo:50,100");
    expect(mockCanvas.calls).toContain("closePath");
    expect(mockCanvas.calls).toContain("fill");
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 用例 4: brush shape 单点路径应画圆点（arc + fill）
  // ─────────────────────────────────────────────────────────────────────────
  it("brush 单点路径应画圆点", async () => {
    const mask: MaskConfig = {
      shapes: [{
        type: "brush",
        paths: [[{ x: 50, y: 50, size: 10 }]],
      }],
      videoTimestamp: 0,
    };
    const result = await encodeMask(mask);
    expect(result.ok).toBe(true);
    // 单点路径触发 arc + fill
    expect(mockCanvas.calls).toContain("arc:50,50,10");
    expect(mockCanvas.calls).toContain("fill");
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 用例 5: inverse=true 反转颜色
  // ─────────────────────────────────────────────────────────────────────────
  it("inverse=true 应反转背景与 shape 颜色", async () => {
    const mask: MaskConfig = {
      shapes: [{ type: "rectangle", x: 0, y: 0, width: 10, height: 10 }],
      videoTimestamp: 0,
      inverse: true,
    };
    const result = await encodeMask(mask);
    expect(result.ok).toBe(true);
    // inverse=true → 背景 #FFFFFF，shape #000000
    expect(mockCanvas.ctx.fillStyle).toBe("#000000");
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 用例 6: encodeMaskSync 同步路径
  // ─────────────────────────────────────────────────────────────────────────
  it("encodeMaskSync 应同步返回结果", () => {
    const mask: MaskConfig = {
      shapes: [{ type: "rectangle", x: 0, y: 0, width: 10, height: 10 }],
      videoTimestamp: 0,
    };
    const result = encodeMaskSync(mask, { includeDataUrl: false });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.base64).toBe("SGVsbG8=");
      expect(result.value.dataUrl).toBe(""); // includeDataUrl=false
      expect(result.value.width).toBe(1280);
      expect(result.value.height).toBe(720);
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 用例 7: includeDataUrl=false 时 dataUrl 为空字符串
  // ─────────────────────────────────────────────────────────────────────────
  it("includeDataUrl=false 时 dataUrl 应为空字符串", async () => {
    const mask: MaskConfig = {
      shapes: [{ type: "rectangle", x: 0, y: 0, width: 10, height: 10 }],
      videoTimestamp: 0,
    };
    const result = await encodeMask(mask, { includeDataUrl: false });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.dataUrl).toBe("");
      expect(result.value.base64).not.toBe("");
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 用例 8: estimateBase64Size 计算正确
  // ─────────────────────────────────────────────────────────────────────────
  it("estimateBase64Size 应按 3/4 比例估算字节数", () => {
    // "SGVsbG8=" 长度 8 → 8 * 3 / 4 = 6
    expect(estimateBase64Size("SGVsbG8=")).toBe(6);
    expect(estimateBase64Size("")).toBe(0);
    // 4 字符 → 3 字节
    expect(estimateBase64Size("abcd")).toBe(3);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 用例 9: isMaskSizeValid 默认 1MB 限制
  // ─────────────────────────────────────────────────────────────────────────
  it("isMaskSizeValid 默认 1MB 限制", () => {
    // 1MB = 1048576 bytes, base64 字符数 ≈ 1048576 * 4 / 3 ≈ 1398101
    const justUnder = "a".repeat(1398101);
    const justOver = "a".repeat(1398102);
    expect(isMaskSizeValid(justUnder)).toBe(true);
    expect(isMaskSizeValid(justOver)).toBe(false);
    expect(isMaskSizeValid("")).toBe(true);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 用例 10: 无效 polygon（<3 点）应跳过绘制不报错
  // ─────────────────────────────────────────────────────────────────────────
  it("polygon 少于 3 个点应跳过绘制", async () => {
    const mask: MaskConfig = {
      shapes: [{
        type: "polygon",
        points: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
      }],
      videoTimestamp: 0,
    };
    const result = await encodeMask(mask);
    expect(result.ok).toBe(true);
    // polygon 因点数不足，不应触发 fill
    expect(mockCanvas.calls).not.toContain("fill");
  });
});
