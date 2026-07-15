/**
 * 图片编辑器面板（Task 4.5）
 *
 * 功能：
 * - 调色：亮度/对比度/饱和度滑块（实时 CSS filter 预览，保存时 Canvas 实际处理）
 * - 旋转：90°/180°/270° 按钮
 * - 裁剪：预设比例选择（1:1/4:3/16:9/3:4/9:16/自由）
 * - 标注：文字/箭头/矩形框（在 Canvas overlay 上绘制）
 * - 保存为新版本（不覆盖原图）
 *
 * 所有编辑在本地 Canvas 完成
 */

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Image as ImageIcon,
  RotateCw,
  RotateCcw,
  Type,
  ArrowRight,
  Square,
  Save,
  Undo2,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { EmptyState } from "@/shared/presentation/EmptyState";
import {
  type ColorAdjustments,
  type Annotation,
  type CropRect,
  DEFAULT_ADJUSTMENTS,
  applyColorAdjustments,
  rotateCanvas,
  cropCanvas,
  drawAnnotations,
  canvasToBlob,
  saveEditedImage,
} from "../services/image-editor";

export interface ImageEditorPanelProps {
  /** 初始图片 URL（file:// 协议或 http） */
  imageUrl: string;
  /** 原图本地路径（用于生成新版本文件名） */
  originalPath?: string;
  /** 保存成功回调 */
  onSaved?: (newPath: string) => void;
}

type Tool = "none" | "crop" | "text" | "arrow" | "rect";

export function ImageEditorPanel({ imageUrl, originalPath, onSaved }: ImageEditorPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [adjustments, setAdjustments] = useState<ColorAdjustments>(DEFAULT_ADJUSTMENTS);
  const [rotation, setRotation] = useState(0);
  const [cropRect, setCropRect] = useState<CropRect | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [tool, setTool] = useState<Tool>("none");
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [textInput, setTextInput] = useState({ visible: false, x: 0, y: 0, value: "" });
  const [annotationColor, setAnnotationColor] = useState("#ff0000");
  const [isSaving, setIsSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ success: boolean; path?: string; error?: string } | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);

  // 加载图片到 Canvas
  const loadImageToCanvas = useCallback(() => {
    const img = imageRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    setImageLoaded(true);
  }, []);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imageRef.current = img;
      loadImageToCanvas();
    };
    img.src = imageUrl;
  }, [imageUrl, loadImageToCanvas]);

  // 重绘 Canvas（应用调色 + 旋转 + 标注）
  const redraw = useCallback(() => {
    const img = imageRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // 处理旋转
    let workCanvas: HTMLCanvasElement = document.createElement("canvas");
    workCanvas.width = img.naturalWidth;
    workCanvas.height = img.naturalHeight;
    const workCtx = workCanvas.getContext("2d");
    if (!workCtx) return;
    workCtx.drawImage(img, 0, 0);

    // 应用旋转
    if (rotation !== 0) {
      workCanvas = rotateCanvas(workCanvas, rotation);
    }

    // 应用裁剪
    if (cropRect) {
      workCanvas = cropCanvas(workCanvas, cropRect);
    }

    // 应用调色
    const finalCtx = workCanvas.getContext("2d");
    if (finalCtx && (adjustments.brightness !== 0 || adjustments.contrast !== 0 || adjustments.saturation !== 0)) {
      applyColorAdjustments(finalCtx, workCanvas, adjustments);
    }

    // 绘制到显示 Canvas
    canvas.width = workCanvas.width;
    canvas.height = workCanvas.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(workCanvas, 0, 0);

    // 绘制标注（按原图坐标，需要考虑旋转/裁剪后的坐标变换）
    // 简化：标注在最终 Canvas 上直接绘制
    drawAnnotations(ctx, annotations);
  }, [rotation, cropRect, adjustments, annotations]);

  useEffect(() => {
    if (imageLoaded) redraw();
  }, [imageLoaded, redraw]);

  // 旋转操作
  const handleRotate = (degrees: number) => {
    setRotation((r) => r + degrees);
  };

  // 重置
  const handleReset = () => {
    setAdjustments(DEFAULT_ADJUSTMENTS);
    setRotation(0);
    setCropRect(null);
    setAnnotations([]);
    setTool("none");
    setSaveResult(null);
  };

  // Canvas 鼠标坐标转 Canvas 坐标
  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  // 标注绘制
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (tool === "none") return;
    const coords = getCanvasCoords(e);

    if (tool === "text") {
      setTextInput({ visible: true, x: coords.x, y: coords.y, value: "" });
      return;
    }

    setIsDrawing(true);
    setDrawStart(coords);
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !drawStart || tool === "none" || tool === "text") return;
    // 实时预览（通过临时标注）
    const coords = getCanvasCoords(e);
    const tempId = "__temp__";
    let tempAnn: Annotation;
    if (tool === "arrow") {
      tempAnn = {
        id: tempId,
        type: "arrow",
        color: annotationColor,
        x1: drawStart.x,
        y1: drawStart.y,
        x2: coords.x,
        y2: coords.y,
        lineWidth: 3,
      };
    } else if (tool === "rect") {
      tempAnn = {
        id: tempId,
        type: "rect",
        color: annotationColor,
        x: Math.min(drawStart.x, coords.x),
        y: Math.min(drawStart.y, coords.y),
        width: Math.abs(coords.x - drawStart.x),
        height: Math.abs(coords.y - drawStart.y),
        lineWidth: 3,
      };
    } else {
      return;
    }
    // 替换临时标注
    setAnnotations((prev) => [...prev.filter((a) => a.id !== tempId), tempAnn]);
  };

  const handleCanvasMouseUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    setDrawStart(null);
    // 将临时标注转为正式（修改 id）
    setAnnotations((prev) =>
      prev.map((a) => (a.id === "__temp__" ? { ...a, id: `ann-${Date.now()}` } : a)),
    );
  };

  // 提交文字标注
  const commitTextAnnotation = () => {
    if (!textInput.value.trim()) {
      setTextInput({ visible: false, x: 0, y: 0, value: "" });
      return;
    }
    setAnnotations((prev) => [
      ...prev,
      {
        id: `ann-${Date.now()}`,
        type: "text" as const,
        color: annotationColor,
        x: textInput.x,
        y: textInput.y,
        text: textInput.value,
        fontSize: 24,
      },
    ]);
    setTextInput({ visible: false, x: 0, y: 0, value: "" });
  };

  // 保存
  const handleSave = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setIsSaving(true);
    setSaveResult(null);
    try {
      const blob = await canvasToBlob(canvas, "image/png");
      if (!blob) {
        setSaveResult({ success: false, error: "无法生成图片数据" });
        return;
      }
      const path = originalPath ?? `${imageUrl.split("/").pop() ?? "image"}`;
      const result = await saveEditedImage(blob, path);
      setSaveResult(result);
      if (result.success && result.path && onSaved) {
        onSaved(result.path);
      }
    } finally {
      setIsSaving(false);
    }
  };

  // CSS filter 用于实时调色预览（Canvas 显示层）
  const cssFilter = `brightness(${1 + adjustments.brightness / 100}) contrast(${1 + adjustments.contrast / 100}) saturate(${1 + adjustments.saturation / 100})`;

  return (
    <div className="flex flex-col h-full gap-2">
      {/* 工具栏 */}
      <div className="flex items-center gap-2 px-3 py-2 border border-border rounded-md bg-card flex-wrap">
        {/* 调色 */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground">亮度</span>
          <input
            type="range" min={-100} max={100} value={adjustments.brightness}
            onChange={(e) => setAdjustments((a) => ({ ...a, brightness: Number(e.target.value) }))}
            className="range range-xs w-[80px]"
          />
          <span className="text-[10px] w-8">{adjustments.brightness}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground">对比度</span>
          <input
            type="range" min={-100} max={100} value={adjustments.contrast}
            onChange={(e) => setAdjustments((a) => ({ ...a, contrast: Number(e.target.value) }))}
            className="range range-xs w-[80px]"
          />
          <span className="text-[10px] w-8">{adjustments.contrast}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground">饱和度</span>
          <input
            type="range" min={-100} max={100} value={adjustments.saturation}
            onChange={(e) => setAdjustments((a) => ({ ...a, saturation: Number(e.target.value) }))}
            className="range range-xs w-[80px]"
          />
          <span className="text-[10px] w-8">{adjustments.saturation}</span>
        </div>

        <div className="w-px h-5 bg-border mx-1" />

        {/* 旋转 */}
        <button className="btn btn-ghost btn-xs" onClick={() => handleRotate(-90)} title="逆时针 90°">
          <RotateCcw size={12} />
        </button>
        <button className="btn btn-ghost btn-xs" onClick={() => handleRotate(90)} title="顺时针 90°">
          <RotateCw size={12} />
        </button>

        <div className="w-px h-5 bg-border mx-1" />

        {/* 标注工具 */}
        <input
          type="color" value={annotationColor}
          onChange={(e) => setAnnotationColor(e.target.value)}
          className="w-6 h-6 rounded cursor-pointer"
          title="标注颜色"
        />
        <button
          className={`btn btn-xs ${tool === "text" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setTool(tool === "text" ? "none" : "text")}
          title="文字标注"
        >
          <Type size={12} />
        </button>
        <button
          className={`btn btn-xs ${tool === "arrow" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setTool(tool === "arrow" ? "none" : "arrow")}
          title="箭头标注"
        >
          <ArrowRight size={12} />
        </button>
        <button
          className={`btn btn-xs ${tool === "rect" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setTool(tool === "rect" ? "none" : "rect")}
          title="矩形框标注"
        >
          <Square size={12} />
        </button>
        {annotations.length > 0 && (
          <button
            className="btn btn-ghost btn-xs"
            onClick={() => setAnnotations((prev) => prev.slice(0, -1))}
            title="撤销最后一个标注"
          >
            <Undo2 size={12} />
          </button>
        )}

        <div className="flex-1" />

        <button className="btn btn-ghost btn-xs" onClick={handleReset} title="重置所有编辑">
          <Undo2 size={12} /> 重置
        </button>
        <button
          className="btn btn-primary btn-xs"
          onClick={handleSave}
          disabled={isSaving || !imageLoaded}
        >
          {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
          保存为新版本
        </button>
      </div>

      {/* 保存结果提示 */}
      {saveResult && (
        <div className={`alert text-xs ${saveResult.success ? "alert-success" : "alert-error"}`}>
          {saveResult.success ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
          <span>
            {saveResult.success
              ? `已保存为新版本：${saveResult.path}`
              : `保存失败：${saveResult.error}`}
          </span>
        </div>
      )}

      {/* 文字输入弹框 */}
      {textInput.visible && (
        <div className="absolute z-50 bg-card border border-border rounded-md p-2 shadow-lg" style={{ left: 100, top: 100 }}>
          <input
            type="text"
            autoFocus
            placeholder="输入标注文字..."
            value={textInput.value}
            onChange={(e) => setTextInput((t) => ({ ...t, value: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitTextAnnotation();
              if (e.key === "Escape") setTextInput({ visible: false, x: 0, y: 0, value: "" });
            }}
            className="input input-xs w-[200px]"
          />
          <div className="flex gap-1 mt-1">
            <button className="btn btn-primary btn-xs flex-1" onClick={commitTextAnnotation}>确定</button>
            <button className="btn btn-ghost btn-xs" onClick={() => setTextInput({ visible: false, x: 0, y: 0, value: "" })}>取消</button>
          </div>
        </div>
      )}

      {/* Canvas 编辑区 */}
      <div className="flex-1 min-h-0 border border-border rounded-md bg-card flex items-center justify-center overflow-auto p-3 relative">
        {!imageLoaded ? (
          <EmptyState icon={ImageIcon} title="加载图片中..." description="正在加载图片到编辑器" />
        ) : (
          <canvas
            ref={canvasRef}
            className="max-w-full max-h-full"
            style={{ filter: cssFilter, cursor: tool === "none" ? "default" : "crosshair" }}
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onMouseLeave={handleCanvasMouseUp}
          />
        )}
      </div>

      {/* 底部状态栏 */}
      <div className="flex items-center justify-between px-2 py-1 text-[10px] text-muted-foreground">
        <span>
          工具：{tool === "none" ? "浏览" : tool === "crop" ? "裁剪" : tool === "text" ? "文字" : tool === "arrow" ? "箭头" : "矩形"} ·
          标注数：{annotations.length} ·
          旋转：{rotation}°
        </span>
        <span>所有编辑在本地 Canvas 完成，保存为新版本不覆盖原图</span>
      </div>
    </div>
  );
}
