/**
 * Task 2A.22: VideoMaskCanvas — 视频上叠加 mask 画布（受控组件）
 *
 * 在视频播放器上方叠加一个 Canvas，用户可在上面用画笔/矩形/多边形标记重绘区域。
 *
 * 交互逻辑：
 * - brush：按下拖动绘制连续路径，松开结束
 * - rectangle：按下拖动定义矩形，松开确认
 * - polygon：单击添加顶点，双击或按 Enter 闭合
 * - eraser：与 brush 相同路径逻辑，但提交后由父组件决定如何处理（例如减去 mask）
 *
 * 视频暂停时才能标记（避免画布与视频不同步）。
 * videoTimestamp 在视频 seek 时通过 onTimeUpdate 回调更新到父组件。
 *
 * 受控属性：
 * - activeTool / brushSize 由父组件（usePartialEdit hook）控制
 * - mask 由父组件控制，本组件只负责把用户绘制动作转换为 newMask 通过 onMaskChange 上报
 * - 撤销/重做/清空 由父组件控制（本组件不维护历史栈，避免双源真相）
 *
 * Canvas 尺寸与视频实际像素尺寸一致（避免缩放导致的坐标偏差）。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "@/shared/constants";
import type { MaskConfig, MaskShape } from "../domain/mask-types";
import {
  createRectangle,
  createPolygon,
  createBrush,
  addShape,
} from "../domain/mask-types";
import type { MaskTool } from "./MaskToolbar";

export interface VideoMaskCanvasProps {
  /** 视频地址（URL 或 dataURL） */
  videoUrl: string;
  /** 当前 mask 配置（受控） */
  mask: MaskConfig;
  /** mask 变更回调（用户提交新 shape 时触发） */
  onMaskChange: (mask: MaskConfig) => void;
  /** 当前激活的工具（受控） */
  activeTool: MaskTool;
  /** 当前画笔大小（受控，仅 brush/eraser 工具时使用） */
  brushSize: number;
  /** 视频宽度（默认 1280） */
  width?: number;
  /** 视频高度（默认 720） */
  height?: number;
  /** 是否禁用标记（生成中） */
  disabled?: boolean;
  /** 视频时间更新回调（用于父组件记录 videoTimestamp） */
  onTimeUpdate?: (currentTime: number) => void;
  /** 视频加载完成回调（用于父组件读取视频时长等信息） */
  onVideoLoaded?: (duration: number) => void;
}

interface Point { x: number; y: number; }

export function VideoMaskCanvas({
  videoUrl,
  mask,
  onMaskChange,
  activeTool,
  brushSize,
  width = 1280,
  height = 720,
  disabled = false,
  onTimeUpdate,
  onVideoLoaded,
}: VideoMaskCanvasProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 当前正在绘制的 shape（绘制中状态，未提交到 onMaskChange）
  const drawingShapeRef = useRef<MaskShape | null>(null);
  const isDrawingRef = useRef(false);
  const currentBrushPathRef = useRef<Array<{ x: number; y: number; size: number }>>([]);
  const rectStartRef = useRef<Point | null>(null);
  const polygonPointsRef = useRef<Point[]>([]);

  // 当前视频时间（用于 HUD 显示）
  const [videoTime, setVideoTime] = useState(0);

  // 计算鼠标在 Canvas 上的坐标（考虑缩放）
  const getCanvasPoint = useCallback((e: React.MouseEvent<HTMLCanvasElement> | MouseEvent): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = width / rect.width;
    const scaleY = height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }, [width, height]);

  // 把当前 mask + 正在绘制的 shape 渲染到 Canvas
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // 清空
    ctx.clearRect(0, 0, width, height);

    // 绘制已有 shapes（半透明红色）
    ctx.fillStyle = "rgba(255, 50, 50, 0.5)";
    ctx.strokeStyle = "rgba(255, 50, 50, 0.8)";

    for (const shape of mask.shapes) {
      drawShape(ctx, shape);
    }

    // 绘制正在绘制的 shape（更亮）
    if (drawingShapeRef.current) {
      ctx.fillStyle = "rgba(255, 100, 100, 0.7)";
      ctx.strokeStyle = "rgba(255, 100, 100, 0.9)";
      drawShape(ctx, drawingShapeRef.current);
    }

    // 绘制多边形顶点标记
    if (activeTool === "polygon" && polygonPointsRef.current.length > 0) {
      ctx.fillStyle = "rgba(255, 50, 50, 0.9)";
      for (const p of polygonPointsRef.current) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      // 连接线
      if (polygonPointsRef.current.length >= 2) {
        ctx.strokeStyle = "rgba(255, 50, 50, 0.6)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(polygonPointsRef.current[0]!.x, polygonPointsRef.current[0]!.y);
        for (let i = 1; i < polygonPointsRef.current.length; i++) {
          ctx.lineTo(polygonPointsRef.current[i]!.x, polygonPointsRef.current[i]!.y);
        }
        ctx.stroke();
      }
    }
  }, [mask, width, height, activeTool]);

  // 绘制单个 shape 到 Canvas
  function drawShape(
    ctx: CanvasRenderingContext2D,
    shape: MaskShape,
  ) {
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
          ctx.lineWidth = path[0]!.size * 2;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.beginPath();
          ctx.moveTo(path[0]!.x, path[0]!.y);
          for (let i = 1; i < path.length; i++) {
            ctx.lineTo(path[i]!.x, path[i]!.y);
          }
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

  // 鼠标事件处理
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    const point = getCanvasPoint(e);
    isDrawingRef.current = true;

    switch (activeTool) {
      case "brush":
      case "eraser":
        currentBrushPathRef.current = [{ x: point.x, y: point.y, size: brushSize }];
        drawingShapeRef.current = createBrush([currentBrushPathRef.current]);
        break;
      case "rectangle":
        rectStartRef.current = point;
        drawingShapeRef.current = createRectangle(point.x, point.y, 0, 0);
        break;
      case "polygon":
        // polygon 在 click 时处理，不在 mousedown
        break;
    }
    renderCanvas();
  }, [activeTool, brushSize, disabled, getCanvasPoint, renderCanvas]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (disabled || !isDrawingRef.current) return;
    const point = getCanvasPoint(e);

    switch (activeTool) {
      case "brush":
      case "eraser":
        if (currentBrushPathRef.current.length > 0) {
          currentBrushPathRef.current.push({ x: point.x, y: point.y, size: brushSize });
          drawingShapeRef.current = createBrush([currentBrushPathRef.current]);
        }
        break;
      case "rectangle":
        if (rectStartRef.current) {
          const start = rectStartRef.current;
          const x = Math.min(start.x, point.x);
          const y = Math.min(start.y, point.y);
          const w = Math.abs(point.x - start.x);
          const h = Math.abs(point.y - start.y);
          drawingShapeRef.current = createRectangle(x, y, w, h);
        }
        break;
    }
    renderCanvas();
  }, [activeTool, brushSize, disabled, getCanvasPoint, renderCanvas]);

  const handleMouseUp = useCallback(() => {
    if (disabled || !isDrawingRef.current) return;
    isDrawingRef.current = false;

    if (drawingShapeRef.current) {
      const shape = drawingShapeRef.current;
      drawingShapeRef.current = null;

      // 校验 shape 有效性
      if (isShapeValid(shape)) {
        const newMask = addShape(mask, shape);
        onMaskChange(newMask);
      }
    }

    currentBrushPathRef.current = [];
    rectStartRef.current = null;
    renderCanvas();
  }, [disabled, mask, onMaskChange, renderCanvas]);

  // polygon 的 click 处理（单独）
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (disabled || activeTool !== "polygon") return;
    const point = getCanvasPoint(e);
    polygonPointsRef.current.push(point);
    renderCanvas();
  }, [activeTool, disabled, getCanvasPoint, renderCanvas]);

  // polygon 双击完成
  const handleDoubleClick = useCallback(() => {
    if (disabled || activeTool !== "polygon") return;
    if (polygonPointsRef.current.length < 3) {
      polygonPointsRef.current = [];
      renderCanvas();
      return;
    }
    const shape = createPolygon(polygonPointsRef.current);
    polygonPointsRef.current = [];
    drawingShapeRef.current = null;
    const newMask = addShape(mask, shape);
    onMaskChange(newMask);
    renderCanvas();
  }, [activeTool, disabled, mask, onMaskChange, renderCanvas]);

  // 键盘事件：Enter 完成 polygon，Escape 取消
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === "Enter" && activeTool === "polygon" && polygonPointsRef.current.length >= 3) {
      e.preventDefault();
      const shape = createPolygon(polygonPointsRef.current);
      polygonPointsRef.current = [];
      drawingShapeRef.current = null;
      const newMask = addShape(mask, shape);
      onMaskChange(newMask);
      renderCanvas();
    } else if (e.key === "Escape") {
      e.preventDefault();
      polygonPointsRef.current = [];
      drawingShapeRef.current = null;
      isDrawingRef.current = false;
      renderCanvas();
    }
  }, [activeTool, disabled, mask, onMaskChange, renderCanvas]);

  // 视频时间更新
  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const t = video.currentTime;
    setVideoTime(t);
    onTimeUpdate?.(t);
  }, [onTimeUpdate]);

  // 视频元数据加载完成
  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    onVideoLoaded?.(video.duration);
  }, [onVideoLoaded]);

  // 重渲染 Canvas
  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  // 工具切换时清空 polygon 中间状态
  useEffect(() => {
    polygonPointsRef.current = [];
    drawingShapeRef.current = null;
    isDrawingRef.current = false;
    renderCanvas();
  }, [activeTool, renderCanvas]);

  return (
    <div ref={containerRef} className="relative w-full" style={{ aspectRatio: `${width} / ${height}` }}>
      <video
        ref={videoRef}
        src={videoUrl}
        controls
        muted
        playsInline
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        className="absolute inset-0 w-full h-full object-contain bg-black rounded-lg"
        style={{ pointerEvents: disabled ? "none" : "auto" }}
      />
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        className="absolute inset-0 w-full h-full"
        style={{
          cursor: disabled ? "not-allowed" : "crosshair",
          pointerEvents: disabled ? "none" : "auto",
        }}
        aria-label={t("video.partialEditTitle")}
      />
      {/* 工具状态指示器 */}
      <div
        className="absolute top-2 left-2 px-2 py-1 rounded text-xs font-mono"
        style={{
          background: "rgba(0, 0, 0, 0.6)",
          color: "white",
          pointerEvents: "none",
        }}
      >
        {t("video.partialEditTimestamp", { sec: videoTime.toFixed(1) })}
      </div>
    </div>
  );
}

// 校验 shape 是否有效（避免提交空 shape）
function isShapeValid(shape: MaskShape): boolean {
  switch (shape.type) {
    case "rectangle":
      return shape.width > 2 && shape.height > 2;
    case "polygon":
      return shape.points.length >= 3;
    case "brush":
      return shape.paths.length > 0 && shape.paths.every((p) => p.length >= 1);
    default:
      return false;
  }
}
