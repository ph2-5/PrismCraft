import { cn } from "@/shared/utils/utils";

/**
 * Skeleton — 骨架屏原子组件。
 *
 * 复用 globals.css 中的 `.skeleton-shimmer` 类（shimmer 渐变动画），
 * 用于页面/列表/卡片级加载占位。按钮内 loading 请继续使用 Loader2 spinner。
 */
interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return <div className={cn("skeleton-shimmer rounded", className)} aria-hidden="true" />;
}

/**
 * SkeletonList — 列表骨架组合组件，渲染 count 个相同尺寸的骨架行。
 */
interface SkeletonListProps {
  count: number;
  className?: string;
  itemClassName?: string;
}

export function SkeletonList({ count, className, itemClassName }: SkeletonListProps) {
  return (
    <div className={className}>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className={itemClassName} />
      ))}
    </div>
  );
}
