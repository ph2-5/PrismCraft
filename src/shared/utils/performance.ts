"use client";

import { useEffect, useCallback, useState, useRef, useMemo } from "react";

interface PerformanceMetrics {
  // 页面加载时间
  pageLoadTime: number;
  // 首次内容绘制
  fcp: number;
  // 最大内容绘制
  lcp: number;
  // 首次输入延迟
  fid: number;
  // 累积布局偏移
  cls: number;
}

// 获取性能指标
export function usePerformanceMonitor(enabled = true) {
  const [metrics, setMetrics] = useState<Partial<PerformanceMetrics>>({});

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    // 等待页面加载完成
    const measurePerformance = () => {
      const navigation = performance.getEntriesByType(
        "navigation",
      )[0] as PerformanceNavigationTiming;

      if (navigation) {
        setMetrics((prev) => ({
          ...prev,
          pageLoadTime: navigation.loadEventEnd - navigation.startTime,
        }));
      }
    };

    // 测量 FCP
    const measureFCP = () => {
      const entries = performance.getEntriesByType("paint");
      const fcpEntry = entries.find(
        (entry) => entry.name === "first-contentful-paint",
      );
      if (fcpEntry) {
        setMetrics((prev) => ({
          ...prev,
          fcp: fcpEntry.startTime,
        }));
      }
    };

    // 测量 LCP
    const measureLCP = () => {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1];
        setMetrics((prev) => ({
          ...prev,
          lcp: lastEntry.startTime,
        }));
      });
      observer.observe({ entryTypes: ["largest-contentful-paint"] });
      return () => observer.disconnect();
    };

    // 测量 CLS
    const measureCLS = () => {
      let clsValue = 0;
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (
            !(entry as PerformanceEntry & { hadRecentInput: boolean })
              .hadRecentInput
          ) {
            clsValue += (entry as PerformanceEntry & { value: number }).value;
          }
        }
        setMetrics((prev) => ({
          ...prev,
          cls: clsValue,
        }));
      });
      observer.observe({ entryTypes: ["layout-shift"] });
      return () => observer.disconnect();
    };

    // 延迟执行测量
    const timeoutId = setTimeout(() => {
      measurePerformance();
      measureFCP();
    }, 0);

    const lcpCleanup = measureLCP();
    const clsCleanup = measureCLS();

    return () => {
      clearTimeout(timeoutId);
      lcpCleanup();
      clsCleanup();
    };
  }, [enabled]);

  return metrics;
}

// 防抖函数
export function useDebounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number,
): (...args: Parameters<T>) => void {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => fnRef.current(...args), delay);
    },
    [delay],
  );
}

// 节流函数
export function useThrottle<T extends (...args: never[]) => unknown>(
  fn: T,
  limit: number,
): (...args: Parameters<T>) => void {
  const inThrottle = useRef(false);
  const fnRef = useRef(fn);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { fnRef.current = fn; });
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  return useCallback(
    (...args: Parameters<T>) => {
      if (!inThrottle.current) {
        fnRef.current(...args);
        inThrottle.current = true;
        timerRef.current = setTimeout(() => {
          inThrottle.current = false;
          timerRef.current = null;
        }, limit);
      }
    },
    [limit],
  );
}

// 虚拟列表钩子（用于长列表优化）
interface UseVirtualListOptions {
  itemHeight: number;
  overscan?: number;
}

export function useVirtualList<T>(
  items: T[],
  containerRef: React.RefObject<HTMLElement | null>,
  options: UseVirtualListOptions,
) {
  const { itemHeight, overscan = 5 } = options;
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 20 });
  const scrollTopRef = useRef(0);
  const containerHeightRef = useRef(0);

  // 节流处理滚动事件
  const throttledScrollHandler = useThrottle((container: HTMLElement) => {
    const scrollTop = container.scrollTop;
    const containerHeight = container.clientHeight;

    // 只有当滚动位置或容器高度变化时才更新
    if (
      scrollTop === scrollTopRef.current &&
      containerHeight === containerHeightRef.current
    ) {
      return;
    }

    scrollTopRef.current = scrollTop;
    containerHeightRef.current = containerHeight;

    const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const end = Math.min(
      items.length,
      Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan,
    );

    setVisibleRange({ start, end });
  }, 16); // 约60fps

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      throttledScrollHandler(container);
    };

    container.addEventListener("scroll", handleScroll);
    handleScroll(); // 初始计算

    return () => container.removeEventListener("scroll", handleScroll);
  }, [
    items.length,
    itemHeight,
    overscan,
    throttledScrollHandler,
    containerRef,
  ]);

  // 使用useMemo缓存计算结果
  const visibleItems = useMemo(() => {
    return items.slice(visibleRange.start, visibleRange.end);
  }, [items, visibleRange.start, visibleRange.end]);

  const totalHeight = useMemo(() => {
    return items.length * itemHeight;
  }, [items.length, itemHeight]);

  const offsetY = useMemo(() => {
    return visibleRange.start * itemHeight;
  }, [visibleRange.start, itemHeight]);

  return {
    visibleItems,
    visibleRange,
    totalHeight,
    offsetY,
  };
}
