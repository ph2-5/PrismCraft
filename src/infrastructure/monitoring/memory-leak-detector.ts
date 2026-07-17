import { errorLogger } from "@/shared/error-logger";

declare global {
  interface Performance {
    memory?: {
      usedJSHeapSize: number;
      totalJSHeapSize: number;
      jsHeapSizeLimit: number;
    };
  }
}

interface LeakSnapshot {
  timestamp: number;
  domNodes: number;
  eventListeners: number;
  jsHeapUsedMB: number;
  jsHeapTotalMB: number;
  timers: number;
}

interface LeakAlert {
  type: "dom_growth" | "heap_growth" | "timer_leak" | "listener_leak";
  message: string;
  details: Record<string, unknown>;
  timestamp: number;
}

class MemoryLeakDetector {
  private snapshots: LeakSnapshot[] = [];
  private maxSnapshots = 60;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private alertListeners: Array<(alert: LeakAlert) => void> = [];
  private baselineSnapshot: LeakSnapshot | null = null;
  private readonly SNAPSHOT_INTERVAL_MS = 30000;
  private readonly DOM_GROWTH_THRESHOLD = 100;
  private readonly HEAP_GROWTH_THRESHOLD_MB = 50;

  start(): void {
    if (this.intervalId) return;
    this.takeSnapshot();
    this.baselineSnapshot = this.snapshots[0] ?? null;
    this.intervalId = setInterval(() => this.takeSnapshot(), this.SNAPSHOT_INTERVAL_MS);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private takeSnapshot(): void {
    const snapshot = this.captureSnapshot();
    this.snapshots.push(snapshot);
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots = this.snapshots.slice(-Math.floor(this.maxSnapshots * 0.8));
    }
    this.detectLeaks(snapshot);
  }

  private captureSnapshot(): LeakSnapshot {
    const memory = performance.memory;
    return {
      timestamp: Date.now(),
      domNodes: typeof document !== "undefined" ? document.querySelectorAll("*").length : 0,
      eventListeners: this.estimateEventListenerCount(),
      jsHeapUsedMB: (memory?.usedJSHeapSize || 0) / (1024 * 1024),
      jsHeapTotalMB: (memory?.totalJSHeapSize || 0) / (1024 * 1024),
      timers: this.estimateTimerCount(),
    };
  }

  private estimateEventListenerCount(): number {
    if (typeof document === "undefined") return 0;
    try {
      const allElements = document.querySelectorAll("*");
      let count = 0;
      for (let i = 0; i < Math.min(allElements.length, 100); i++) {
        const el = allElements[i] as Element & { _reactEvents?: Record<string, unknown> };
        if (el._reactEvents) count += Object.keys(el._reactEvents).length;
      }
      return count;
    } catch (e) {
      errorLogger.warn("[MemoryLeakDetector] Failed to estimate event listener count", e as Error);
      return 0;
    }
  }

  private estimateTimerCount(): number {
    return this.activeTimers.size;
  }

  private activeTimers = new Set<ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>>();

  registerTimer(id: ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>, _type: "timeout" | "interval"): void {
    this.activeTimers.add(id);
  }

  unregisterTimer(id: ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>): void {
    this.activeTimers.delete(id);
  }

  private detectLeaks(current: LeakSnapshot): void {
    if (!this.baselineSnapshot) return;
    if (this.snapshots.length < 3) return;

    const domGrowth = current.domNodes - this.baselineSnapshot.domNodes;
    if (domGrowth > this.DOM_GROWTH_THRESHOLD) {
      this.emitAlert({
        type: "dom_growth",
        message: `DOM节点数增长 ${domGrowth} 个 (基线: ${this.baselineSnapshot.domNodes}, 当前: ${current.domNodes})`,
        details: { baseline: this.baselineSnapshot.domNodes, current: current.domNodes, growth: domGrowth },
        timestamp: Date.now(),
      });
    }

    const heapGrowth = current.jsHeapUsedMB - this.baselineSnapshot.jsHeapUsedMB;
    if (heapGrowth > this.HEAP_GROWTH_THRESHOLD_MB) {
      this.emitAlert({
        type: "heap_growth",
        message: `JS堆内存增长 ${heapGrowth.toFixed(1)}MB (基线: ${this.baselineSnapshot.jsHeapUsedMB.toFixed(1)}MB, 当前: ${current.jsHeapUsedMB.toFixed(1)}MB)`,
        details: { baselineMB: this.baselineSnapshot.jsHeapUsedMB, currentMB: current.jsHeapUsedMB, growthMB: heapGrowth },
        timestamp: Date.now(),
      });
    }
  }

  private emitAlert(alert: LeakAlert): void {
    if (this.alertListeners.length > 0) {
      this.alertListeners.forEach((fn) => fn(alert));
    } else {
      errorLogger.warn(
        { code: "MEMORY_LEAK_DETECTED", message: `${alert.type}: ${alert.message}` },
        "MemoryLeakDetector",
      );
    }
  }

  onAlert(listener: (alert: LeakAlert) => void): () => void {
    this.alertListeners.push(listener);
    return () => {
      this.alertListeners = this.alertListeners.filter((fn) => fn !== listener);
    };
  }

  getSnapshots(): LeakSnapshot[] {
    return [...this.snapshots];
  }

  getLatestSnapshot(): LeakSnapshot | null {
    return this.snapshots[this.snapshots.length - 1] || null;
  }

  isRunning(): boolean {
    return this.intervalId !== null;
  }
}

export const memoryLeakDetector = new MemoryLeakDetector();
export type { LeakSnapshot, LeakAlert };

// HMR 安全：模块卸载时停止 interval，防止开发环境热更新时旧 singleton 的 timer 泄漏
// 生产环境（无 import.meta.hot）此代码会被 tree-shake 移除
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    memoryLeakDetector.stop();
  });
}
