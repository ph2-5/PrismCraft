import { memo, type ReactNode } from "react";
import { t } from "@/shared/constants";

interface ElementBindingColumnProps {
  /** 列内容（通常是 ElementBindingPanel + ShotReferenceConfig + 一致性检查） */
  children: ReactNode;
  /** 可选的列标题覆盖；默认使用 i18n */
  title?: string;
  /** 可选的右上角徽章内容（如绑定元素数量） */
  badge?: ReactNode;
}

/**
 * 中栏：元素绑定列。
 * 纯布局包装组件，宽度固定 300px。
 * 内部内容（元素绑定卡片、镜头引用配置、一致性检查）
 * 由父组件通过 children 传入。
 */
export const ElementBindingColumn = memo(function ElementBindingColumn({
  children,
  title,
  badge,
}: ElementBindingColumnProps) {
  return (
    <div className="flex flex-col gap-2 h-full">
      <div className="flex items-center justify-between">
        <div className="section-label" style={{ marginBottom: 0 }}>
          <span className="dot ok"></span> {title ?? t("beat.columnElementBinding")}
        </div>
        {badge}
      </div>
      <div className="flex-1 min-h-0 flex flex-col gap-2">{children}</div>
    </div>
  );
});
