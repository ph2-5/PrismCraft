/**
 * 图片编辑器 Canvas 画布子组件
 *
 * 负责渲染 Canvas 元素、图片加载状态指示器和文字输入弹框。
 * 鼠标事件和文字输入通过回调上抛给 image-editor-panel 主组件处理。
 * 从 image-editor-panel 拆分而来（Task 4.5）。
 */

import { type MouseEvent, type RefObject } from "react";
import { PageLoader } from "@/shared/presentation/PageLoader";
import { t } from "@/shared/constants";
import { type Tool } from "./image-editor-panel";

export interface TextInputState {
  visible: boolean;
  x: number;
  y: number;
  value: string;
}

export interface ImageEditorCanvasProps {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  cssFilter: string;
  tool: Tool;
  imageLoaded: boolean;
  textInput: TextInputState;
  onCanvasMouseDown: (e: MouseEvent<HTMLCanvasElement>) => void;
  onCanvasMouseMove: (e: MouseEvent<HTMLCanvasElement>) => void;
  onCanvasMouseUp: () => void;
  onTextInputChange: (value: string) => void;
  onCommitText: () => void;
  onCancelText: () => void;
}

export function ImageEditorCanvas({
  canvasRef,
  cssFilter,
  tool,
  imageLoaded,
  textInput,
  onCanvasMouseDown,
  onCanvasMouseMove,
  onCanvasMouseUp,
  onTextInputChange,
  onCommitText,
  onCancelText,
}: ImageEditorCanvasProps) {
  return (
    <>
      {/* 文字输入弹框 */}
      {textInput.visible && (
        <div className="absolute z-50 bg-card border border-border rounded-md p-2 shadow-lg" style={{ left: 100, top: 100 }}>
          <input
            type="text"
            autoFocus
            placeholder={t("asset.editor.annotatePlaceholder")}
            value={textInput.value}
            onChange={(e) => onTextInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onCommitText();
              if (e.key === "Escape") onCancelText();
            }}
            className="input input-xs w-[200px]"
          />
          <div className="flex gap-1 mt-1">
            <button className="btn btn-primary btn-xs flex-1" onClick={onCommitText}>{t("asset.editor.confirm")}</button>
            <button className="btn btn-ghost btn-xs" onClick={onCancelText}>{t("asset.editor.cancel")}</button>
          </div>
        </div>
      )}

      {/* Canvas 编辑区 */}
      <div className="flex-1 min-h-0 border border-border rounded-md bg-card flex items-center justify-center overflow-auto p-3 relative">
        {!imageLoaded ? (
          <PageLoader label={t("asset.editor.loading")} />
        ) : (
          <canvas
            ref={canvasRef}
            className="max-w-full max-h-full"
            style={{ filter: cssFilter, cursor: tool === "none" ? "default" : "crosshair" }}
            onMouseDown={onCanvasMouseDown}
            onMouseMove={onCanvasMouseMove}
            onMouseUp={onCanvasMouseUp}
            onMouseLeave={onCanvasMouseUp}
          />
        )}
      </div>
    </>
  );
}
