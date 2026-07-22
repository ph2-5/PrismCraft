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

describe("infrastructure/monitoring/memory-leak-detector", () => {
  let memoryLeakDetector: typeof import("../memory-leak-detector").memoryLeakDetector;
  let mockErrorLogger: typeof errorLogger;

  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.clearAllMocks();
    const mod = await import("../memory-leak-detector");
    memoryLeakDetector = mod.memoryLeakDetector;
    mockErrorLogger = (await import("@/shared/error-logger")).errorLogger;
  });

  afterEach(() => {
    memoryLeakDetector.stop();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe("start / stop / isRunning", () => {
    it("初始状态 isRunning 返回 false", () => {
      expect(memoryLeakDetector.isRunning()).toBe(false);
    });

    it("start 后 isRunning 返回 true 并拍摄初始快照", () => {
      memoryLeakDetector.start();

      expect(memoryLeakDetector.isRunning()).toBe(true);
      expect(memoryLeakDetector.getLatestSnapshot()).not.toBeNull();
      expect(memoryLeakDetector.getSnapshots()).toHaveLength(1);
    });

    it("重复调用 start 是幂等的，不会创建多个 interval", () => {
      memoryLeakDetector.start();
      const firstSnapshots = memoryLeakDetector.getSnapshots();

      memoryLeakDetector.start();

      expect(memoryLeakDetector.getSnapshots()).toEqual(firstSnapshots);
    });

    it("stop 后 isRunning 返回 false", () => {
      memoryLeakDetector.start();
      expect(memoryLeakDetector.isRunning()).toBe(true);

      memoryLeakDetector.stop();

      expect(memoryLeakDetector.isRunning()).toBe(false);
    });

    it("未启动时调用 stop 不会抛错", () => {
      expect(() => memoryLeakDetector.stop()).not.toThrow();
    });

    it("start 后 interval 会按周期拍摄新快照", () => {
      memoryLeakDetector.start();
      expect(memoryLeakDetector.getSnapshots()).toHaveLength(1);

      vi.advanceTimersByTime(30000);
      expect(memoryLeakDetector.getSnapshots()).toHaveLength(2);

      vi.advanceTimersByTime(30000);
      expect(memoryLeakDetector.getSnapshots()).toHaveLength(3);
    });

    it("stop 后 interval 不再拍摄新快照", () => {
      memoryLeakDetector.start();
      vi.advanceTimersByTime(30000);
      const countAfterStop = memoryLeakDetector.getSnapshots().length;

      memoryLeakDetector.stop();
      vi.advanceTimersByTime(60000);

      expect(memoryLeakDetector.getSnapshots()).toHaveLength(countAfterStop);
    });
  });

  describe("快照查询", () => {
    it("getSnapshots 返回的是副本，修改不影响内部状态", () => {
      memoryLeakDetector.start();
      const snapshots = memoryLeakDetector.getSnapshots();

      snapshots.pop();
      snapshots.push({} as never);

      expect(memoryLeakDetector.getSnapshots()).toHaveLength(1);
    });

    it("getLatestSnapshot 在无快照时返回 null", () => {
      expect(memoryLeakDetector.getLatestSnapshot()).toBeNull();
    });

    it("getLatestSnapshot 返回最新快照", () => {
      memoryLeakDetector.start();
      const first = memoryLeakDetector.getLatestSnapshot();

      vi.advanceTimersByTime(30000);
      const second = memoryLeakDetector.getLatestSnapshot();

      expect(second).not.toBeNull();
      expect(second).not.toBe(first);
      expect(second!.timestamp).toBeGreaterThan(first!.timestamp);
    });
  });

  describe("registerTimer / unregisterTimer", () => {
    it("registerTimer 增加快照中的 timer 计数", () => {
      memoryLeakDetector.start();
      const initialTimers = memoryLeakDetector.getLatestSnapshot()!.timers;

      const id = setTimeout(() => {}, 1000);
      memoryLeakDetector.registerTimer(id, "timeout");
      vi.advanceTimersByTime(30000);

      const latest = memoryLeakDetector.getLatestSnapshot()!;
      expect(latest.timers).toBe(initialTimers + 1);
    });

    it("unregisterTimer 减少快照中的 timer 计数", () => {
      memoryLeakDetector.start();
      const id = setTimeout(() => {}, 1000);
      memoryLeakDetector.registerTimer(id, "timeout");
      vi.advanceTimersByTime(30000);
      const registeredTimers = memoryLeakDetector.getLatestSnapshot()!.timers;

      memoryLeakDetector.unregisterTimer(id);
      vi.advanceTimersByTime(30000);

      const latest = memoryLeakDetector.getLatestSnapshot()!;
      expect(latest.timers).toBe(registeredTimers - 1);
    });
  });

  describe("onAlert 订阅", () => {
    it("onAlert 返回取消订阅函数", () => {
      const unsubscribe = memoryLeakDetector.onAlert(() => {});

      expect(typeof unsubscribe).toBe("function");
      unsubscribe();
    });

    it("取消订阅后不再接收告警", () => {
      const listener = vi.fn();
      const unsubscribe = memoryLeakDetector.onAlert(listener);
      unsubscribe();

      memoryLeakDetector.start();
      // 触发 DOM 增长告警
      vi.stubGlobal("document", {
        querySelectorAll: vi.fn(() => ({
          length: 200,
          [Symbol.iterator]: function* () {
            for (let i = 0; i < 200; i++) yield {} as Element;
          },
        })),
      });
      vi.advanceTimersByTime(60000);

      expect(listener).not.toHaveBeenCalled();
    });

    it("DOM 节点增长超过阈值时触发 dom_growth 告警", () => {
      const listener = vi.fn();
      memoryLeakDetector.onAlert(listener);

      memoryLeakDetector.start();

      // 基线快照 domNodes=0，现在让 querySelectorAll 返回 200 个节点
      const fakeElements = {
        length: 200,
        [Symbol.iterator]: function* () {
          for (let i = 0; i < 200; i++) yield {} as Element;
        },
        item: () => ({} as Element),
        namedItem: () => null,
      };
      vi.stubGlobal("document", {
        querySelectorAll: vi.fn(() => fakeElements),
      });

      // 需要 3 个快照才会触发 detectLeaks
      vi.advanceTimersByTime(30000);
      vi.advanceTimersByTime(30000);

      expect(listener).toHaveBeenCalled();
      const alert = listener.mock.calls[0]![0]!;
      expect(alert.type).toBe("dom_growth");
      expect(alert.details.growth).toBeGreaterThan(100);
      expect(alert.timestamp).toBeTypeOf("number");
    });

    it("JS 堆内存增长超过阈值时触发 heap_growth 告警", () => {
      const listener = vi.fn();
      memoryLeakDetector.onAlert(listener);

      // 基线堆内存 0，后续快照堆内存 60MB（超过 50MB 阈值）
      let heapUsed = 0;
      const originalMemory = Object.getOwnPropertyDescriptor(performance, "memory");
      Object.defineProperty(performance, "memory", {
        configurable: true,
        get: () => ({
          usedJSHeapSize: heapUsed * 1024 * 1024,
          totalJSHeapSize: heapUsed * 1024 * 1024,
          jsHeapSizeLimit: 1024 * 1024 * 1024,
        }),
      });

      memoryLeakDetector.start();
      heapUsed = 60;

      vi.advanceTimersByTime(30000);
      vi.advanceTimersByTime(30000);

      expect(listener).toHaveBeenCalled();
      const heapAlert = listener.mock.calls.find(
        (c) => c[0]!.type === "heap_growth",
      );
      expect(heapAlert).toBeDefined();
      expect(heapAlert![0]!.details.growthMB).toBeGreaterThan(50);

      // 恢复
      if (originalMemory) {
        Object.defineProperty(performance, "memory", originalMemory);
      } else {
        delete (performance as { memory?: unknown }).memory;
      }
    });

    it("快照数量不足 3 时不触发告警", () => {
      const listener = vi.fn();
      memoryLeakDetector.onAlert(listener);

      memoryLeakDetector.start();
      // 仅 1 个快照
      expect(listener).not.toHaveBeenCalled();

      vi.advanceTimersByTime(30000);
      // 2 个快照，仍不够
      expect(listener).not.toHaveBeenCalled();
    });

    it("无监听器时告警通过 errorLogger.warn 输出", () => {
      memoryLeakDetector.start();

      const fakeElements = {
        length: 200,
        [Symbol.iterator]: function* () {
          for (let i = 0; i < 200; i++) yield {} as Element;
        },
        item: () => ({} as Element),
        namedItem: () => null,
      };
      vi.stubGlobal("document", {
        querySelectorAll: vi.fn(() => fakeElements),
      });

      vi.advanceTimersByTime(30000);
      vi.advanceTimersByTime(30000);

      expect(mockErrorLogger.warn).toHaveBeenCalled();
    });
  });

  describe("快照容量限制", () => {
    it("超过 maxSnapshots (60) 时会裁剪旧快照", () => {
      memoryLeakDetector.start();
      // 推进 70 个周期 (每个 30s)，共 71 个快照
      for (let i = 0; i < 70; i++) {
        vi.advanceTimersByTime(30000);
      }

      // 裁剪后保留 80% = 48 个 + 初始 = 不超过 60 太多
      const snapshots = memoryLeakDetector.getSnapshots();
      expect(snapshots.length).toBeLessThanOrEqual(60);
      expect(snapshots.length).toBeGreaterThan(40);
    });
  });
});
