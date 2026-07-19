/**
 * Task 2A.22: MaskToolbar — 画笔/橡皮/矩形/多边形工具栏
 *
 * 用户在 VideoMaskCanvas 上标记区域时使用此工具栏切换工具。
 * 支持撤销/重做/清空/反选。
 *
 * 不直接操作 mask — 通过 onToolChange / onUndo / onRedo / onClear / onInverseToggle
 * 回调把控制权交给父组件（VideoMaskCanvas 或 PartialEditPanel）。
 */

import { Brush, Square, PenTool, Eraser, Undo2, Redo2, Trash2, FlipHorizontal } from "lucide-react";
import { t } from "@/shared/constants";

export type MaskTool = "brush" | "rectangle" | "polygon" | "eraser";

export interface MaskToolbarProps {
  /** 当前激活的工具 */
  activeTool: MaskTool;
  /** 切换工具 */
  onToolChange: (tool: MaskTool) => void;
  /** 当前画笔大小（仅 brush/eraser 工具时显示） */
  brushSize: number;
  /** 修改画笔大小 */
  onBrushSizeChange: (size: number) => void;
  /** 是否可撤销 */
  canUndo: boolean;
  /** 是否可重做 */
  canRedo: boolean;
  /** 撤销 */
  onUndo: () => void;
  /** 重做 */
  onRedo: () => void;
  /** 清空所有标记 */
  onClear: () => void;
  /** 是否反选（重绘 mask 外） */
  inverse: boolean;
  /** 切换反选 */
  onInverseToggle: () => void;
  /** 是否禁用（生成中） */
  disabled?: boolean;
}

interface ToolButton {
  tool: MaskTool;
  icon: typeof Brush;
  labelKey: string;
}

const TOOLS: ToolButton[] = [
  { tool: "brush", icon: Brush, labelKey: "video.partialEditToolBrush" },
  { tool: "rectangle", icon: Square, labelKey: "video.partialEditToolRectangle" },
  { tool: "polygon", icon: PenTool, labelKey: "video.partialEditToolPolygon" },
  { tool: "eraser", icon: Eraser, labelKey: "video.partialEditToolEraser" },
];

export function MaskToolbar({
  activeTool,
  onToolChange,
  brushSize,
  onBrushSizeChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onClear,
  inverse,
  onInverseToggle,
  disabled = false,
}: MaskToolbarProps) {
  const showBrushSize = activeTool === "brush" || activeTool === "eraser";

  return (
    <div
      className="flex items-center gap-2 p-2 rounded-lg"
      style={{ background: "var(--muted)", flexWrap: "wrap" }}
      role="toolbar"
      aria-label={t("video.partialEditTitle")}
    >
      {/* 工具切换 */}
      <div className="flex items-center gap-1" role="group">
        {TOOLS.map(({ tool, icon: Icon, labelKey }) => {
          const isActive = activeTool === tool;
          return (
            <button
              key={tool}
              type="button"
              className={`btn btn-sm gap-1 ${isActive ? "btn-primary" : "btn-ghost"}`}
              onClick={() => onToolChange(tool)}
              disabled={disabled}
              aria-pressed={isActive}
              aria-label={t(labelKey)}
              title={t(labelKey)}
            >
              <Icon className="w-4 h-4" />
              <span className="text-xs">{t(labelKey)}</span>
            </button>
          );
        })}
      </div>

      {/* 画笔大小（仅 brush/eraser 显示） */}
      {showBrushSize && (
        <div className="flex items-center gap-2 px-2">
          <label className="text-xs" style={{ color: "var(--muted-fg)" }}>
            {t("video.partialEditBrushSize")}
          </label>
          <input
            type="range"
            min={2}
            max={50}
            value={brushSize}
            onChange={(e) => onBrushSizeChange(Number(e.target.value))}
            disabled={disabled}
            aria-label={t("video.partialEditBrushSize")}
          />
          <span className="text-xs font-mono" style={{ color: "var(--muted-fg)" }}>
            {brushSize}px
          </span>
        </div>
      )}

      {/* 分隔符 */}
      <div style={{ width: 1, height: 24, background: "var(--border)" }} />

      {/* 撤销/重做/清空 */}
      <div className="flex items-center gap-1" role="group">
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={onUndo}
          disabled={disabled || !canUndo}
          aria-label={t("video.partialEditToolUndo")}
          title={t("video.partialEditToolUndo")}
        >
          <Undo2 className="w-4 h-4" />
        </button>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={onRedo}
          disabled={disabled || !canRedo}
          aria-label={t("video.partialEditToolRedo")}
          title={t("video.partialEditToolRedo")}
        >
          <Redo2 className="w-4 h-4" />
        </button>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={onClear}
          disabled={disabled}
          aria-label={t("video.partialEditToolClear")}
          title={t("video.partialEditToolClear")}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* 分隔符 */}
      <div style={{ width: 1, height: 24, background: "var(--border)" }} />

      {/* 反选切换 */}
      <button
        type="button"
        className={`btn btn-sm gap-1 ${inverse ? "btn-primary" : "btn-ghost"}`}
        onClick={onInverseToggle}
        disabled={disabled}
        aria-pressed={inverse}
        title={t("video.partialEditToolInverse")}
      >
        <FlipHorizontal className="w-4 h-4" />
        <span className="text-xs">{t("video.partialEditToolInverse")}</span>
      </button>
    </div>
  );
}
