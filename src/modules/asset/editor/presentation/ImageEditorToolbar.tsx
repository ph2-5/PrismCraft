/**
 * 图片编辑器工具栏子组件
 *
 * 负责渲染调色滑块、旋转按钮、标注工具、颜色选择器、重置和保存按钮。
 * 仅负责渲染，所有状态和业务逻辑由 image-editor-panel 主组件管理。
 * 从 image-editor-panel 拆分而来（Task 4.5）。
 */

import {
  RotateCw,
  RotateCcw,
  Type,
  ArrowRight,
  Square,
  Save,
  Undo2,
  Loader2,
} from "lucide-react";
import { t } from "@/shared/constants";
import { type ColorAdjustments } from "../services/image-editor";
import { type Tool } from "./image-editor-panel";

export interface ImageEditorToolbarProps {
  adjustments: ColorAdjustments;
  tool: Tool;
  annotationColor: string;
  annotationCount: number;
  isSaving: boolean;
  imageLoaded: boolean;
  onAdjustmentChange: (key: keyof ColorAdjustments, value: number) => void;
  onRotate: (degrees: number) => void;
  onAnnotationColorChange: (color: string) => void;
  onToolToggle: (tool: Tool) => void;
  onUndoAnnotation: () => void;
  onReset: () => void;
  onSave: () => void;
}

export function ImageEditorToolbar({
  adjustments,
  tool,
  annotationColor,
  annotationCount,
  isSaving,
  imageLoaded,
  onAdjustmentChange,
  onRotate,
  onAnnotationColorChange,
  onToolToggle,
  onUndoAnnotation,
  onReset,
  onSave,
}: ImageEditorToolbarProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 border border-border rounded-md bg-card flex-wrap">
      {/* 调色 */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-muted-foreground">{t("asset.editor.brightness")}</span>
        <input
          type="range" min={-100} max={100} value={adjustments.brightness}
          onChange={(e) => onAdjustmentChange("brightness", Number(e.target.value))}
          className="range range-xs w-[80px]"
        />
        <span className="text-[10px] w-8">{adjustments.brightness}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-muted-foreground">{t("asset.editor.contrast")}</span>
        <input
          type="range" min={-100} max={100} value={adjustments.contrast}
          onChange={(e) => onAdjustmentChange("contrast", Number(e.target.value))}
          className="range range-xs w-[80px]"
        />
        <span className="text-[10px] w-8">{adjustments.contrast}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-muted-foreground">{t("asset.editor.saturation")}</span>
        <input
          type="range" min={-100} max={100} value={adjustments.saturation}
          onChange={(e) => onAdjustmentChange("saturation", Number(e.target.value))}
          className="range range-xs w-[80px]"
        />
        <span className="text-[10px] w-8">{adjustments.saturation}</span>
      </div>

      <div className="w-px h-5 bg-border mx-1" />

      {/* 旋转 */}
      <button className="btn btn-ghost btn-xs" onClick={() => onRotate(-90)} title={t("asset.editor.rotateCCW")}>
        <RotateCcw size={12} />
      </button>
      <button className="btn btn-ghost btn-xs" onClick={() => onRotate(90)} title={t("asset.editor.rotateCW")}>
        <RotateCw size={12} />
      </button>

      <div className="w-px h-5 bg-border mx-1" />

      {/* 标注工具 */}
      <input
        type="color" value={annotationColor}
        onChange={(e) => onAnnotationColorChange(e.target.value)}
        className="w-6 h-6 rounded cursor-pointer"
        title={t("asset.editor.annotateColor")}
      />
      <button
        className={`btn btn-xs ${tool === "text" ? "btn-primary" : "btn-ghost"}`}
        onClick={() => onToolToggle("text")}
        title={t("asset.editor.textAnnotate")}
      >
        <Type size={12} />
      </button>
      <button
        className={`btn btn-xs ${tool === "arrow" ? "btn-primary" : "btn-ghost"}`}
        onClick={() => onToolToggle("arrow")}
        title={t("asset.editor.arrowAnnotate")}
      >
        <ArrowRight size={12} />
      </button>
      <button
        className={`btn btn-xs ${tool === "rect" ? "btn-primary" : "btn-ghost"}`}
        onClick={() => onToolToggle("rect")}
        title={t("asset.editor.rectAnnotate")}
      >
        <Square size={12} />
      </button>
      {annotationCount > 0 && (
        <button
          className="btn btn-ghost btn-xs"
          onClick={onUndoAnnotation}
          title={t("asset.editor.undoAnnotate")}
        >
          <Undo2 size={12} />
        </button>
      )}

      <div className="flex-1" />

      <button className="btn btn-ghost btn-xs" onClick={onReset} title={t("asset.editor.reset")}>
        <Undo2 size={12} /> {t("asset.editor.reset")}
      </button>
      <button
        className="btn btn-primary btn-xs"
        onClick={onSave}
        disabled={isSaving || !imageLoaded}
      >
        {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
        {t("asset.editor.saveAsNew")}
      </button>
    </div>
  );
}
