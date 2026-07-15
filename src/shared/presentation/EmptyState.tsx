import { cn } from "@/shared/utils/utils";
import { type LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  /**
   * Task 4.9 子项 9：次级提示文本（比 description 更弱化）。
   * 用于 ToolPluginManager 这类"主标题 + 操作提示"双层文案场景。
   */
  hint?: string;
  action?: React.ReactNode;
  className?: string;
  /**
   * Task 4.9 子项 9：紧凑模式 — 用于窄栏、面板内嵌场景。
   * 缩小 padding、图标尺寸、字号，避免在 200-300px 窄栏中显示过大。
   */
  compact?: boolean;
  /**
   * Task 4.9 子项 9：自定义内容 slot。
   * 渲染在 description/hint 之后、action 之前。
   * 用于 AgentPage 的 suggestions 网格等引导态场景。
   */
  children?: React.ReactNode;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  hint,
  action,
  className,
  compact = false,
  children,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "py-6 px-3" : "py-12 px-4",
        className,
      )}
    >
      <div
        className={cn(
          "rounded-2xl bg-muted flex items-center justify-center",
          compact ? "w-10 h-10 mb-3" : "w-16 h-16 mb-4",
        )}
      >
        <Icon
          className={cn(
            "text-muted-foreground",
            compact ? "w-5 h-5" : "w-8 h-8",
          )}
        />
      </div>
      <h3
        className={cn(
          "font-medium text-foreground",
          compact ? "text-sm mb-0.5" : "text-lg mb-1",
        )}
      >
        {title}
      </h3>
      {description && (
        <p
          className={cn(
            "text-muted-foreground max-w-sm",
            compact ? "text-xs mb-2" : "text-sm mb-4",
          )}
        >
          {description}
        </p>
      )}
      {hint && (
        <p
          className={cn(
            "text-muted-foreground/70 max-w-sm",
            compact ? "text-[11px] mb-2" : "text-xs mb-4",
          )}
        >
          {hint}
        </p>
      )}
      {children}
      {action}
    </div>
  );
}
