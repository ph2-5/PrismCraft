import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";

export function useVirtualList<T>({
  items,
  estimateSize,
  overscan = 5,
}: {
  items: T[];
  estimateSize: number;
  overscan?: number;
}) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan,
  });

  return {
    parentRef,
    virtualizer,
    items,
    totalSize: virtualizer.getTotalSize(),
    virtualItems: virtualizer.getVirtualItems(),
  };
}
