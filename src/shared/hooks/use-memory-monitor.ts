import { useEffect, useState, useCallback, useRef } from "react";
import { logger } from "@/config/constants";
import { errorLogger } from "@/shared/error-logger";
import { MINUTE_MS } from "@/shared/constants";

declare global {
  interface Window {
    __trackedBlobUrls?: Set<string>;
    gc?: () => void;
  }
  interface Performance {
    memory?: {
      usedJSHeapSize: number;
      totalJSHeapSize: number;
      jsHeapSizeLimit: number;
    };
  }
}

interface MemoryInfo {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

interface MemoryState {
  memory: MemoryInfo | null;
  warningLevel: "none" | "low" | "medium" | "high";
  lastCleanup: number;
}

// 内存警告阈值（MB）
const MEMORY_THRESHOLDS = {
  low: 512,    // 512MB
  medium: 1024, // 1GB
  high: 1536   // 1.5GB
};

export function useMemoryMonitor(options?: { clearErrorLogs?: () => Promise<void> }) {
  const [state, setState] = useState<MemoryState>({
    memory: null,
    warningLevel: "none",
    lastCleanup: 0
  });

  const checkIntervalRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastCleanupRef = useRef<number>(0);
  const pendingTimeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  // 同步 ref 和 state
  useEffect(() => {
    lastCleanupRef.current = state.lastCleanup;
  }, [state.lastCleanup]);

  // 获取内存信息
  const getMemoryInfo = useCallback((): MemoryInfo | null => {
    if (typeof window === "undefined") return null;
    
    const memory = performance.memory;
    if (!memory) return null;

    return {
      usedJSHeapSize: Math.round(memory.usedJSHeapSize / 1048576), // MB
      totalJSHeapSize: Math.round(memory.totalJSHeapSize / 1048576),
      jsHeapSizeLimit: Math.round(memory.jsHeapSizeLimit / 1048576)
    };
  }, []);

  // 自动清理
  const autoCleanup = useCallback(async () => {
    const now = Date.now();

    if (now - lastCleanupRef.current < 5 * MINUTE_MS) {
      return;
    }

    logger.warn("[MemoryMonitor] 内存使用过高，开始自动清理");

    let cleanedCount = 0;
    try {
      const activeUrls = new Set<string>();
      document.querySelectorAll('[src^="blob:"]').forEach(el => {
        const src = el.getAttribute('src');
        if (src && el.isConnected) activeUrls.add(src);
      });
      document.querySelectorAll('[href^="blob:"]').forEach(el => {
        const href = el.getAttribute('href');
        if (href && el.isConnected) activeUrls.add(href);
      });

      const tracked = window.__trackedBlobUrls;
      if (tracked) {
        for (const url of tracked) {
          if (!activeUrls.has(url)) {
            URL.revokeObjectURL(url);
            tracked.delete(url);
            cleanedCount++;
          }
        }
      }
    } catch (e) {
      errorLogger.warn('[MemoryMonitor] blob清理异常', e);
    }

    if (cleanedCount > 0) {
      logger.info(`[MemoryMonitor] 清理了 ${cleanedCount} 个未使用的 blob URL`);
    }

    try {
      if (optionsRef.current?.clearErrorLogs) {
        await optionsRef.current.clearErrorLogs();
      }
    } catch (e) {
      errorLogger.warn('[MemoryMonitor] 清理错误日志失败:', e);
    }

    if (typeof window !== "undefined") {
      if (window.gc) {
        window.gc();
      }
    }

    lastCleanupRef.current = now;
    setState(prev => ({
      ...prev,
      lastCleanup: now
    }));

    logger.info("[MemoryMonitor] 自动清理完成");
  }, []);

  // 检查内存状态
  const autoCleanupRef = useRef(autoCleanup);
  useEffect(() => { autoCleanupRef.current = autoCleanup; }, [autoCleanup]);

  const checkMemory = useCallback(() => {
    const memory = getMemoryInfo();
    if (!memory) return;

    let warningLevel: "none" | "low" | "medium" | "high" = "none";

    if (memory.usedJSHeapSize > MEMORY_THRESHOLDS.high) {
      warningLevel = "high";
    } else if (memory.usedJSHeapSize > MEMORY_THRESHOLDS.medium) {
      warningLevel = "medium";
    } else if (memory.usedJSHeapSize > MEMORY_THRESHOLDS.low) {
      warningLevel = "low";
    }

    setState(prev => ({
      ...prev,
      memory,
      warningLevel
    }));

    if (warningLevel === "high") {
      autoCleanupRef.current();
    }
  }, [getMemoryInfo]);

  // 手动清理
  const manualCleanup = useCallback(() => {
    logger.info("[MemoryMonitor] 用户触发手动清理");

    let cleanedCount = 0;
    try {
      const activeBlobUrls = new Set<string>();
      document.querySelectorAll('[src^="blob:"]').forEach(el => {
        const src = el.getAttribute('src');
        if (src && el.isConnected) activeBlobUrls.add(src);
      });

      if (activeBlobUrls.size > 0) {
        const tracked = window.__trackedBlobUrls;
        if (tracked) {
          for (const url of tracked) {
            if (!activeBlobUrls.has(url)) {
              URL.revokeObjectURL(url);
              tracked.delete(url);
              cleanedCount++;
            }
          }
        }
      }
    } catch (e) {
      errorLogger.warn('[MemoryMonitor] blob清理异常', e);
    }

    // 清理 sessionStorage 中的临时数据，保留重要数据。
    // 注意：此操作会移除所有不在 keysToKeep 中的 sessionStorage 条目，
    // 仅在内存紧张时触发（manualCleanup），正常流程不应依赖此行为。
    const keysToKeep = ['ai-animation-last-session'];
    Object.keys(sessionStorage).forEach(key => {
      if (!keysToKeep.includes(key)) {
        sessionStorage.removeItem(key);
      }
    });

    // 清理临时缓存
    try {
      // 检测是否在 Electron 环境
      const isElectronEnv = typeof window !== 'undefined' && window.electronAPI;
      if (isElectronEnv && window.electronAPI) {
        try {
          (window.electronAPI as Window["electronAPI"] & { clearCache?: () => void }).clearCache?.();
        } catch (e) {
          errorLogger.warn('[MemoryMonitor] 清理 Electron 缓存失败', e);
        }
      }
    } catch (e) {
      errorLogger.warn('[MemoryMonitor] 清理缓存失败', e);
    }

    setState(prev => ({
      ...prev,
      lastCleanup: Date.now()
    }));

    // 重新检查内存
    const timeoutId = setTimeout(checkMemory, 1000);
    pendingTimeoutsRef.current.add(timeoutId);
    setTimeout(() => { pendingTimeoutsRef.current.delete(timeoutId); }, 1100);

    return cleanedCount;
  }, [checkMemory]);

  // 定期监控内存
  useEffect(() => {
    const initialCheckId = setTimeout(checkMemory, 0);
    const currentInterval = setInterval(checkMemory, 30000);
    checkIntervalRef.current = currentInterval;
    const currentTimeouts = pendingTimeoutsRef.current;

    return () => {
      clearTimeout(initialCheckId);
      clearInterval(currentInterval);
      for (const t of currentTimeouts) {
        clearTimeout(t);
      }
      currentTimeouts.clear();
    };
  }, [checkMemory]);

  return {
    ...state,
    manualCleanup,
    thresholds: MEMORY_THRESHOLDS
  };
}
