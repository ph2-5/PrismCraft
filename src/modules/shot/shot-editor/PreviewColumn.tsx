import { memo, type ReactNode } from "react";
import { t } from "@/shared/constants";

interface PreviewColumnProps {
  /** 列内容（通常是 BeatGenerationPanel） */
  children: ReactNode;
  /** 可选的列标题覆盖；默认使用 i18n */
  title?: string;
}

/**
 * 右栏：预览列。
 * 纯布局包装组件，宽度固定 220px。
 * 内部内容（关键帧预览、首尾帧、视频生成预览、生成/刷新/导出按钮）
 * 由父组件通过 children 传入。
 */
export const PreviewColumn = memo(function PreviewColumn({
  children,
  title,
}: PreviewColumnProps) {
  return (
    <div className="flex flex-col gap-2 h-full">
      <div className="section-label" style={{ marginBottom: 0 }}>
        <span className="dot ok"></span> {title ?? t("beat.columnPreview")}
      </div>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
});
