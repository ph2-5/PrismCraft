import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/shared/error-logger", () => ({
  errorLogger: {
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    fatal: vi.fn(),
  },
  extractErrorMessage: vi.fn((e: unknown) => (e instanceof Error ? e.message : String(e))),
}));

import type { errorLogger } from "@/shared/error-logger";

describe("infrastructure/monitoring/performance-monitor", () => {
  let performanceMonitor: typeof import("../performance-monitor").performanceMonitor;
  let mockErrorLogger: typeof errorLogger;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    const mod = await import("../performance-monitor");
    performanceMonitor = mod.performanceMonitor;
    mockErrorLogger = (await import("@/shared/error-logger")).errorLogger;
  });

  afterEach(() => {
    performanceMonitor.clear();
  });

  describe("measure (同步)", () => {
    it("同步函数执行成功后记录指标并返回值", () => {
      const result = performanceMonitor.measure("db_query", "select-all", () => 42);

      expect(result).toBe(42);
      const metrics = performanceMonitor.getMetrics();
      expect(metrics).toHaveLength(1);
      expect(metrics[0]!.type).toBe("db_query");
      expect(metrics[0]!.name).toBe("select-all");
      expect(metrics[0]!.durationMs).toBeTypeOf("number");
    });

    it("同步函数抛出错误时记录指标并重新抛出", () => {
      const error = new Error("sync failure");

      expect(() =>
        performanceMonitor.measure("db_query", "failing", () => {
          throw error;
        }),
      ).toThrow("sync failure");

      const metrics = performanceMonitor.getMetrics();
      expect(metrics).toHaveLength(1);
      expect(metrics[0]!.metadata?.error).toContain("sync failure");
    });

    it("同步函数记录 metadata", () => {
      performanceMonitor.measure("cache_operation", "lookup", () => "ok", {
        key: "user:1",
      });

      const metrics = performanceMonitor.getMetrics();
      expect(metrics[0]!.metadata).toEqual({ key: "user:1" });
    });
  });

  describe("measure (异步)", () => {
    it("异步函数执行成功后记录指标并返回值", async () => {
      const result = await performanceMonitor.measure("api_call", "fetch-user", async () => "user-data");

      expect(result).toBe("user-data");
      const metrics = performanceMonitor.getMetrics();
      expect(metrics).toHaveLength(1);
      expect(metrics[0]!.type).toBe("api_call");
    });

    it("异步函数 reject 时记录指标并重新抛出", async () => {
      await expect(
        performanceMonitor.measure("api_call", "failing", async () => {
          throw new Error("async failure");
        }),
      ).rejects.toThrow("async failure");

      const metrics = performanceMonitor.getMetrics();
      expect(metrics).toHaveLength(1);
      expect(metrics[0]!.metadata?.error).toContain("async failure");
    });

    it("异步函数记录 metadata", async () => {
      await performanceMonitor.measure("sync", "bg-sync", async () => 1, {
        items: 100,
      });

      const metrics = performanceMonitor.getMetrics();
      expect(metrics[0]!.metadata).toEqual({ items: 100 });
    });
  });

  describe("告警阈值", () => {
    it("达到 warning 阈值时调用 errorLogger.warn 并通知监听器", () => {
      const listener = vi.fn();
      performanceMonitor.onAlert(listener);

      // db_query warning 阈值 = 500ms
      vi.spyOn(performance, "now")
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(600);

      performanceMonitor.measure("db_query", "slow-query", () => "ok");

      expect(mockErrorLogger.warn).toHaveBeenCalled();
      expect(listener).toHaveBeenCalled();
      const [metric, level] = listener.mock.calls[0]!;
      expect(level).toBe("warning");
      expect(metric.durationMs).toBe(600);
    });

    it("达到 critical 阈值时调用 errorLogger.error 并通知监听器", () => {
      const listener = vi.fn();
      performanceMonitor.onAlert(listener);

      // db_query critical 阈值 = 2000ms
      vi.spyOn(performance, "now")
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(2500);

      performanceMonitor.measure("db_query", "critical-query", () => "ok");

      expect(mockErrorLogger.error).toHaveBeenCalled();
      expect(listener).toHaveBeenCalled();
      const [, level] = listener.mock.calls[0]!;
      expect(level).toBe("critical");
    });

    it("未达到 warning 阈值时不触发告警", () => {
      const listener = vi.fn();
      performanceMonitor.onAlert(listener);

      vi.spyOn(performance, "now")
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(100);

      performanceMonitor.measure("db_query", "fast-query", () => "ok");

      expect(listener).not.toHaveBeenCalled();
      expect(mockErrorLogger.warn).not.toHaveBeenCalled();
      expect(mockErrorLogger.error).not.toHaveBeenCalled();
    });

    it("onAlert 返回取消订阅函数，取消后不再接收告警", () => {
      const listener = vi.fn();
      const unsubscribe = performanceMonitor.onAlert(listener);
      expect(typeof unsubscribe).toBe("function");

      unsubscribe();

      vi.spyOn(performance, "now")
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(600);

      performanceMonitor.measure("db_query", "after-unsub", () => "ok");

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("getMetrics", () => {
    it("无指标时返回空数组", () => {
      expect(performanceMonitor.getMetrics()).toEqual([]);
    });

    it("按 type 过滤指标", () => {
      performanceMonitor.measure("db_query", "q1", () => 1);
      performanceMonitor.measure("api_call", "a1", () => 2);
      performanceMonitor.measure("db_query", "q2", () => 3);

      const dbMetrics = performanceMonitor.getMetrics("db_query");
      expect(dbMetrics).toHaveLength(2);
      expect(dbMetrics.every((m) => m.type === "db_query")).toBe(true);
    });

    it("按 limit 截取最近的指标", () => {
      for (let i = 0; i < 10; i++) {
        performanceMonitor.measure("db_query", `q${i}`, () => i);
      }

      const limited = performanceMonitor.getMetrics(undefined, 3);
      expect(limited).toHaveLength(3);
      // 应返回最后 3 个
      expect(limited[0]!.name).toBe("q7");
      expect(limited[2]!.name).toBe("q9");
    });

    it("同时按 type 和 limit 过滤", () => {
      for (let i = 0; i < 5; i++) {
        performanceMonitor.measure("db_query", `q${i}`, () => i);
        performanceMonitor.measure("api_call", `a${i}`, () => i);
      }

      const result = performanceMonitor.getMetrics("api_call", 2);
      expect(result).toHaveLength(2);
      expect(result.every((m) => m.type === "api_call")).toBe(true);
      expect(result[0]!.name).toBe("a3");
    });
  });

  describe("getStats", () => {
    it("无指标时返回全零统计", () => {
      const stats = performanceMonitor.getStats();

      expect(stats).toEqual({
        count: 0,
        avgMs: 0,
        p50Ms: 0,
        p95Ms: 0,
        p99Ms: 0,
        maxMs: 0,
      });
    });

    it("按 type 过滤时无匹配指标也返回全零", () => {
      performanceMonitor.measure("db_query", "q1", () => 1);

      const stats = performanceMonitor.getStats("api_call");
      expect(stats.count).toBe(0);
    });

    it("返回正确的统计数据", () => {
      // 用 mock 控制 durationMs
      const durations = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
      for (const [i, d] of durations.entries()) {
        vi.spyOn(performance, "now")
          .mockReturnValueOnce(0)
          .mockReturnValueOnce(d);
        performanceMonitor.measure("db_query", `q${i}`, () => 1);
      }

      const stats = performanceMonitor.getStats("db_query");
      expect(stats.count).toBe(10);
      expect(stats.avgMs).toBeCloseTo(550, 0);
      expect(stats.maxMs).toBe(1000);
      expect(stats.p50Ms).toBeTypeOf("number");
      expect(stats.p95Ms).toBeTypeOf("number");
      expect(stats.p99Ms).toBeTypeOf("number");
    });
  });

  describe("clear", () => {
    it("清空所有指标", () => {
      performanceMonitor.measure("db_query", "q1", () => 1);
      performanceMonitor.measure("api_call", "a1", () => 2);
      expect(performanceMonitor.getMetrics()).toHaveLength(2);

      performanceMonitor.clear();

      expect(performanceMonitor.getMetrics()).toEqual([]);
      expect(performanceMonitor.getStats().count).toBe(0);
    });
  });

  describe("指标容量限制", () => {
    it("超过 maxMetrics (1000) 时裁剪旧指标", () => {
      for (let i = 0; i < 1010; i++) {
        performanceMonitor.measure("db_query", `q${i}`, () => 1);
      }

      const metrics = performanceMonitor.getMetrics();
      // 裁剪到 80% = 800
      expect(metrics.length).toBeLessThanOrEqual(1000);
      expect(metrics.length).toBeGreaterThan(700);
    });
  });
});
