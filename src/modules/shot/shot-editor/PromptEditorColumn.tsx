import { memo, type ReactNode } from "react";
import { t } from "@/shared/constants";

interface PromptEditorColumnProps {
  /** 列内容（通常是 BeatPromptPanel） */
  children: ReactNode;
  /** 可选的列标题覆盖；默认使用 i18n */
  title?: string;
  /** 可选的右上角徽章内容（如绑定数量） */
  badge?: ReactNode;
}

/**
 * 左栏：提示词编辑列。
 * 纯布局包装组件，不包含业务逻辑。
 * 内部内容（关键帧/首帧/尾帧 Tab、提示词文本区、分镜属性、生成按钮）
 * 由父组件通过 children 传入。
 */
export const PromptEditorColumn = memo(function PromptEditorColumn({
  children,
  title,
  badge,
}: PromptEditorColumnProps) {
  return (
    <div className="flex flex-col gap-2 h-full">
      <div className="flex items-center justify-between">
        <div className="section-label" style={{ marginBottom: 0 }}>
          <span className="dot ok"></span> {title ?? t("beat.columnPromptEditor")}
        </div>
        {badge}
      </div>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
});
