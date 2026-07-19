/**
 * Task 2A.22: 局部重绘 Mask 数据结构
 *
 * 表示用户在视频画面上标记的"重绘区域"。
 * 三种 Shape 类型覆盖不同的标记精度需求：
 * - rectangle：快速框选（粗略标记大面积区域）
 * - polygon：精确多边形（围绕物体轮廓描边）
 * - brush：自由画笔（不规则形状 / 小面积修补）
 *
 * MaskConfig 是 provider-agnostic 数据结构 — 既用于 Seedance 2.5 局部重绘，
 * 也用于 face-swap fallback（Task 2A.23 一致性 QC 闭环触发）。
 *
 * mask-encoder.ts 负责把 MaskConfig 渲染为 base64 PNG（API 要求的格式）。
 *
 * 纯类型 + 工厂函数 + 校验函数 — 无外部依赖，可单元测试。
 */

/** 矩形 — 通过左上角 + 宽高定义 */
export interface RectangleShape {
  type: "rectangle";
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 多边形 — 通过顶点列表定义（至少 3 个点） */
export interface PolygonShape {
  type: "polygon";
  points: Array<{ x: number; y: number }>;
}

/** 画笔路径 — 通过多段描边定义，每段是一组带 size 的点 */
export interface BrushShape {
  type: "brush";
  paths: Array<Array<{ x: number; y: number; size: number }>>;
}

/** 三种 mask 形状的联合类型 */
export type MaskShape = RectangleShape | PolygonShape | BrushShape;

/** 完整的 mask 配置 */
export interface MaskConfig {
  /** 所有标记形状（可叠加多种类型） */
  shapes: MaskShape[];
  /** 在视频哪一帧（秒）标记的 */
  videoTimestamp: number;
  /** true=重绘 mask 外（保留 mask 内），false=重绘 mask 内（保留 mask 外，默认） */
  inverse?: boolean;
}

/** Mask 边界框（用于 VideoTask.maskBounds 快速查询） */
export interface MaskBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 创建默认 MaskConfig（空 shapes） */
export function createEmptyMaskConfig(videoTimestamp: number = 0): MaskConfig {
  return {
    shapes: [],
    videoTimestamp,
    inverse: false,
  };
}

/** 校验单个 MaskShape 是否合法 */
export function isValidMaskShape(shape: MaskShape): boolean {
  if (!shape || typeof shape.type !== "string") return false;
  switch (shape.type) {
    case "rectangle":
      return (
        typeof shape.x === "number" &&
        typeof shape.y === "number" &&
        typeof shape.width === "number" && shape.width > 0 &&
        typeof shape.height === "number" && shape.height > 0
      );
    case "polygon":
      return (
        Array.isArray(shape.points) &&
        shape.points.length >= 3 &&
        shape.points.every(
          (p) => typeof p?.x === "number" && typeof p?.y === "number",
        )
      );
    case "brush":
      return (
        Array.isArray(shape.paths) &&
        shape.paths.length >= 1 &&
        shape.paths.every(
          (path) =>
            Array.isArray(path) &&
            path.length >= 1 &&
            path.every(
              (p) =>
                typeof p?.x === "number" &&
                typeof p?.y === "number" &&
                typeof p?.size === "number" &&
                p.size > 0,
            ),
        )
      );
    default:
      return false;
  }
}

/** 校验 MaskConfig 是否有效（至少 1 个合法 shape） */
export function isValidMaskConfig(mask: MaskConfig): boolean {
  if (!mask || !Array.isArray(mask.shapes) || mask.shapes.length === 0) {
    return false;
  }
  return mask.shapes.every(isValidMaskShape);
}

/** 计算 mask 的 bounding box（用于 VideoTask.maskBounds 持久化） */
export function computeMaskBounds(mask: MaskConfig): MaskBounds | null {
  if (!mask.shapes.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const shape of mask.shapes) {
    switch (shape.type) {
      case "rectangle":
        minX = Math.min(minX, shape.x);
        minY = Math.min(minY, shape.y);
        maxX = Math.max(maxX, shape.x + shape.width);
        maxY = Math.max(maxY, shape.y + shape.height);
        break;
      case "polygon":
        for (const p of shape.points) {
          minX = Math.min(minX, p.x);
          minY = Math.min(minY, p.y);
          maxX = Math.max(maxX, p.x);
          maxY = Math.max(maxY, p.y);
        }
        break;
      case "brush":
        for (const path of shape.paths) {
          for (const p of path) {
            minX = Math.min(minX, p.x - p.size);
            minY = Math.min(minY, p.y - p.size);
            maxX = Math.max(maxX, p.x + p.size);
            maxY = Math.max(maxY, p.y + p.size);
          }
        }
        break;
    }
  }

  if (!isFinite(minX)) return null;
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/** 创建矩形 shape */
export function createRectangle(x: number, y: number, width: number, height: number): RectangleShape {
  return { type: "rectangle", x, y, width, height };
}

/** 创建多边形 shape */
export function createPolygon(points: Array<{ x: number; y: number }>): PolygonShape {
  return { type: "polygon", points: [...points] };
}

/** 创建画笔 shape */
export function createBrush(paths: Array<Array<{ x: number; y: number; size: number }>>): BrushShape {
  return { type: "brush", paths: paths.map((p) => [...p]) };
}

/** 向 MaskConfig 添加 shape（不可变更新） */
export function addShape(mask: MaskConfig, shape: MaskShape): MaskConfig {
  return {
    ...mask,
    shapes: [...mask.shapes, shape],
  };
}

/** 移除最后一个 shape（撤销操作） */
export function popShape(mask: MaskConfig): MaskConfig {
  if (mask.shapes.length === 0) return mask;
  return {
    ...mask,
    shapes: mask.shapes.slice(0, -1),
  };
}

/** 清空所有 shape */
export function clearShapes(mask: MaskConfig): MaskConfig {
  return { ...mask, shapes: [] };
}

/** 切换 inverse 模式 */
export function toggleInverse(mask: MaskConfig): MaskConfig {
  return { ...mask, inverse: !mask.inverse };
}
