import { useMemo, useState, useCallback, useEffect } from "react";

export interface UsePaginationOptions {
  /** 每页项数；默认 20 */
  pageSize?: number;
}

export interface UsePaginationResult<T> {
  /** 当前已加载的项（前 pageSize * page 项） */
  visibleItems: T[];
  /** 当前页码（从 1 开始） */
  page: number;
  /** 是否还有更多项可加载 */
  hasMore: boolean;
  /** 加载下一页 */
  loadMore: () => void;
  /** 重置到第一页 */
  reset: () => void;
}

/**
 * 简单的分页 hook：基于完整数组切片，初始显示 pageSize 项，loadMore 追加。
 * 适用于数据量中等（数百项）的场景；大数据量请使用虚拟滚动。
 */
export function usePagination<T>(
  items: T[],
  options: UsePaginationOptions = {},
): UsePaginationResult<T> {
  const { pageSize = 20 } = options;
  const [page, setPage] = useState(1);

  // 数据源变化时重置页码（例如搜索过滤后）
  useEffect(() => {
    setPage(1);
  }, [items]);

  const visibleItems = useMemo(
    () => items.slice(0, page * pageSize),
    [items, page, pageSize],
  );

  const hasMore = visibleItems.length < items.length;

  const loadMore = useCallback(() => {
    setPage((p) => p + 1);
  }, []);

  const reset = useCallback(() => {
    setPage(1);
  }, []);

  return { visibleItems, page, hasMore, loadMore, reset };
}
