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
 *
 * 本组件负责状态管理与业务逻辑编排，UI 拆分为子组件：
 * - ImageEditorToolbar：工具栏（调色/旋转/标注/重置/保存）
 * - ImageEditorCanvas：Canvas 画布与文字输入弹框
 * - ImageEditorSaveResult：保存结果提示
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { t } from "@/shared/constants";
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
import { ImageEditorToolbar } from "./ImageEditorToolbar";
import { ImageEditorCanvas, type TextInputState } from "./ImageEditorCanvas";
import { ImageEditorSaveResult } from "./ImageEditorSaveResult";

export interface ImageEditorPanelProps {
  /** 初始图片 URL（file:// 协议或 http） */
  imageUrl: string;
  /** 原图本地路径（用于生成新版本文件名） */
  originalPath?: string;
  /** 保存成功回调 */
  onSaved?: (newPath: string) => void;
}

export type Tool = "none" | "crop" | "text" | "arrow" | "rect";

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
  const [textInput, setTextInput] = useState<TextInputState>({ visible: false, x: 0, y: 0, value: "" });
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
        setSaveResult({ success: false, error: t("asset.editor.noImageData") });
        return;
      }
      const path = originalPath ?? `${imageUrl.split("/").pop() ?? "image"}`;
      const result = await saveEditedImage(blob, path);
      setSaveResult(result);
      if (result.success && result.path && onSaved) {
        onSaved(result.path);
      }
    } catch (e) {
      setSaveResult({ success: false, error: t("asset.editor.saveFailed", { error: e instanceof Error ? e.message : String(e) }) });
    } finally {
      setIsSaving(false);
    }
  };

  // 工具栏回调
  const handleAdjustmentChange = (key: keyof ColorAdjustments, value: number) => {
    setAdjustments((a) => ({ ...a, [key]: value }));
  };

  const handleToolToggle = (nextTool: Tool) => {
    setTool(tool === nextTool ? "none" : nextTool);
  };

  const handleUndoAnnotation = () => {
    setAnnotations((prev) => prev.slice(0, -1));
  };

  const handleTextInputChange = (value: string) => {
    setTextInput((prev) => ({ ...prev, value }));
  };

  const handleCancelText = () => {
    setTextInput({ visible: false, x: 0, y: 0, value: "" });
  };

  // CSS filter 用于实时调色预览（Canvas 显示层）
  const cssFilter = `brightness(${1 + adjustments.brightness / 100}) contrast(${1 + adjustments.contrast / 100}) saturate(${1 + adjustments.saturation / 100})`;

  return (
    <div className="flex flex-col h-full gap-2">
      {/* 工具栏 */}
      <ImageEditorToolbar
        adjustments={adjustments}
        tool={tool}
        annotationColor={annotationColor}
        annotationCount={annotations.length}
        isSaving={isSaving}
        imageLoaded={imageLoaded}
        onAdjustmentChange={handleAdjustmentChange}
        onRotate={handleRotate}
        onAnnotationColorChange={setAnnotationColor}
        onToolToggle={handleToolToggle}
        onUndoAnnotation={handleUndoAnnotation}
        onReset={handleReset}
        onSave={handleSave}
      />

      {/* 保存结果提示 */}
      <ImageEditorSaveResult saveResult={saveResult} />

      {/* Canvas 编辑区 + 文字输入弹框 */}
      <ImageEditorCanvas
        canvasRef={canvasRef}
        cssFilter={cssFilter}
        tool={tool}
        imageLoaded={imageLoaded}
        textInput={textInput}
        onCanvasMouseDown={handleCanvasMouseDown}
        onCanvasMouseMove={handleCanvasMouseMove}
        onCanvasMouseUp={handleCanvasMouseUp}
        onTextInputChange={handleTextInputChange}
        onCommitText={commitTextAnnotation}
        onCancelText={handleCancelText}
      />

      {/* 底部状态栏 */}
      <div className="flex items-center justify-between px-2 py-1 text-[10px] text-muted-foreground">
        <span>
          {t("asset.editor.statusTool", { tool: tool === "none" ? t("asset.editor.toolBrowse") : tool === "crop" ? t("asset.editor.toolCrop") : tool === "text" ? t("asset.editor.toolText") : tool === "arrow" ? t("asset.editor.toolArrow") : t("asset.editor.toolRect") })} ·
          {t("asset.editor.statusAnnotCount", { count: annotations.length })} ·
          {t("asset.editor.statusRotation", { degree: rotation })}
        </span>
        <span>{t("asset.editor.statusHint")}</span>
      </div>
    </div>
  );
}
