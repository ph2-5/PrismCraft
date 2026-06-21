import { useRef } from "react";
import { useVirtualList } from "@/shared/utils/performance";
import { t } from "@/shared/constants";

interface VirtualListProps<T> {
  items: T[];
  itemHeight: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  className?: string;
  overscan?: number;
  emptyMessage?: string;
  maxHeight?: string;
  /**
   * Optional function to derive a stable React key for each item.
   * When omitted, the item index is used as the key. Providing this is
   * recommended for dynamic lists to avoid the unsafe `as { id?: string }`
   * assertion on the generic `T`.
   */
  keyExtractor?: (item: T, index: number) => string;
}

export function VirtualList<T>({
  items,
  itemHeight,
  renderItem,
  className = "",
  overscan = 5,
  emptyMessage = t("common.noData"),
  maxHeight = "60vh",
  keyExtractor,
}: VirtualListProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { visibleItems, visibleRange, totalHeight, offsetY: _offsetY } = useVirtualList(
    items,
    containerRef,
    { itemHeight, overscan },
  );

  if (items.length === 0) {
    return (
      <div
        className={`flex items-center justify-center py-8 text-muted-foreground ${className}`}
      >
        {emptyMessage}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`overflow-auto ${className}`}
      style={{ maxHeight }}
    >
      <div style={{ height: totalHeight, position: "relative" }}>
        {visibleItems.map((item, index) => (
          <div
            key={keyExtractor ? keyExtractor(item, visibleRange.start + index) : index}
            style={{
              position: "absolute",
              top: (visibleRange.start + index) * itemHeight,
              height: itemHeight,
              left: 0,
              right: 0,
            }}
          >
            {renderItem(item, visibleRange.start + index)}
          </div>
        ))}
      </div>
    </div>
  );
}
