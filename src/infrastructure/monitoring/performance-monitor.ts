import { errorLogger } from "@/shared/error-logger";

type MetricType = "db_query" | "db_transaction" | "api_call" | "video_generation" | "cache_operation" | "sync";

interface PerformanceMetric {
  type: MetricType;
  name: string;
  durationMs: number;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

interface PerformanceThreshold {
  warningMs: number;
  criticalMs: number;
}

const DEFAULT_THRESHOLDS: Record<MetricType, PerformanceThreshold> = {
  db_query: { warningMs: 500, criticalMs: 2000 },
  db_transaction: { warningMs: 1000, criticalMs: 5000 },
  api_call: { warningMs: 5000, criticalMs: 30000 },
  video_generation: { warningMs: 120000, criticalMs: 600000 },
  cache_operation: { warningMs: 200, criticalMs: 1000 },
  sync: { warningMs: 3000, criticalMs: 10000 },
};

class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private maxMetrics = 1000;
  private thresholds: Record<MetricType, PerformanceThreshold>;
  private listeners: Array<(metric: PerformanceMetric, level: "ok" | "warning" | "critical") => void> = [];

  constructor(thresholds?: Partial<Record<MetricType, PerformanceThreshold>>) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
  }

  measure<T>(type: MetricType, name: string, fn: () => Promise<T>, metadata?: Record<string, unknown>): Promise<T>;

  measure<T>(type: MetricType, name: string, fn: () => T, metadata?: Record<string, unknown>): T;

  measure<T>(type: MetricType, name: string, fn: () => T | Promise<T>, metadata?: Record<string, unknown>): T | Promise<T> {
    const start = performance.now();
    const record = (result: T) => {
      const durationMs = performance.now() - start;
      const metric: PerformanceMetric = { type, name, durationMs, timestamp: Date.now(), metadata };
      this.recordMetric(metric);
      return result;
    };
    try {
      const result = fn();
      if (result instanceof Promise) {
        return result.then(record).catch((err) => {
          const durationMs = performance.now() - start;
          this.recordMetric({ type, name, durationMs, timestamp: Date.now(), metadata: { ...metadata, error: String(err) } });
          throw err;
        });
      }
      return record(result);
    } catch (err) {
      const durationMs = performance.now() - start;
      this.recordMetric({ type, name, durationMs, timestamp: Date.now(), metadata: { ...metadata, error: String(err) } });
      throw err;
    }
  }

  private recordMetric(metric: PerformanceMetric): void {
    this.metrics.push(metric);
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-Math.floor(this.maxMetrics * 0.8));
    }
    const threshold = this.thresholds[metric.type];
    let level: "ok" | "warning" | "critical" = "ok";
    if (metric.durationMs >= threshold.criticalMs) {
      level = "critical";
      errorLogger.error(`[PerfMonitor] CRITICAL: ${metric.type}/${metric.name} took ${metric.durationMs.toFixed(0)}ms`);
    } else if (metric.durationMs >= threshold.warningMs) {
      level = "warning";
      errorLogger.warn(`[PerfMonitor] WARNING: ${metric.type}/${metric.name} took ${metric.durationMs.toFixed(0)}ms`);
    }
    if (level !== "ok") {
      this.listeners.forEach((fn) => fn(metric, level));
    }
  }

  onAlert(listener: (metric: PerformanceMetric, level: "ok" | "warning" | "critical") => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((fn) => fn !== listener);
    };
  }

  getMetrics(type?: MetricType, limit?: number): PerformanceMetric[] {
    let filtered = type ? this.metrics.filter((m) => m.type === type) : this.metrics;
    if (limit) filtered = filtered.slice(-limit);
    return filtered;
  }

  getStats(type?: MetricType): { count: number; avgMs: number; p50Ms: number; p95Ms: number; p99Ms: number; maxMs: number } {
    const filtered = type ? this.metrics.filter((m) => m.type === type) : this.metrics;
    if (filtered.length === 0) return { count: 0, avgMs: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 };
    const durations = filtered.map((m) => m.durationMs).sort((a, b) => a - b);
    const percentile = (p: number) => durations[Math.floor(durations.length * p)]!;
    return {
      count: filtered.length,
      avgMs: durations.reduce((a, b) => a + b, 0) / durations.length,
      p50Ms: percentile(0.5),
      p95Ms: percentile(0.95),
      p99Ms: percentile(0.99),
      maxMs: durations[durations.length - 1]!,
    };
  }

  clear(): void {
    this.metrics = [];
  }
}

export const performanceMonitor = new PerformanceMonitor();
export type { PerformanceMetric, MetricType, PerformanceThreshold };
