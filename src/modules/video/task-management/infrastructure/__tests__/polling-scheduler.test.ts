import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PollingScheduler } from "../polling-scheduler";

describe("PollingScheduler", () => {
  let scheduler: PollingScheduler;
  let onPoll: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    onPoll = vi.fn().mockResolvedValue(undefined);
    scheduler = new PollingScheduler(onPoll as any);
  });

  afterEach(() => {
    scheduler.stopAll();
    vi.useRealTimers();
  });

  describe("start", () => {
    it("should schedule a poll after the base interval", () => {
      scheduler.start("task-1");

      expect(onPoll).not.toHaveBeenCalled();

      vi.advanceTimersByTime(5000);
      expect(onPoll).toHaveBeenCalledWith("task-1");
    });

    it("should not duplicate entries for the same task", () => {
      scheduler.start("task-1");
      scheduler.start("task-1");

      vi.advanceTimersByTime(5000);
      expect(onPoll).toHaveBeenCalledTimes(1);
    });

    it("should track multiple tasks independently", () => {
      scheduler.start("task-1");
      scheduler.start("task-2");

      vi.advanceTimersByTime(5000);
      expect(onPoll).toHaveBeenCalledWith("task-1");
      expect(onPoll).toHaveBeenCalledWith("task-2");
    });
  });

  describe("stop", () => {
    it("should cancel the scheduled poll", () => {
      scheduler.start("task-1");
      scheduler.stop("task-1");

      vi.advanceTimersByTime(5000);
      expect(onPoll).not.toHaveBeenCalled();
    });

    it("should not throw when stopping a non-existent task", () => {
      expect(() => scheduler.stop("non-existent")).not.toThrow();
    });
  });

  describe("stopAll", () => {
    it("should cancel all scheduled polls", () => {
      scheduler.start("task-1");
      scheduler.start("task-2");
      scheduler.stopAll();

      vi.advanceTimersByTime(5000);
      expect(onPoll).not.toHaveBeenCalled();
    });
  });

  describe("isActive", () => {
    it("should return true for an active task", () => {
      scheduler.start("task-1");
      expect(scheduler.isActive("task-1")).toBe(true);
    });

    it("should return false for a stopped task", () => {
      scheduler.start("task-1");
      scheduler.stop("task-1");
      expect(scheduler.isActive("task-1")).toBe(false);
    });

    it("should return false for a never-started task", () => {
      expect(scheduler.isActive("task-1")).toBe(false);
    });
  });

  describe("getActiveCount", () => {
    it("should return 0 when no tasks are active", () => {
      expect(scheduler.getActiveCount()).toBe(0);
    });

    it("should return the correct count of active tasks", () => {
      scheduler.start("task-1");
      scheduler.start("task-2");
      scheduler.start("task-3");

      expect(scheduler.getActiveCount()).toBe(3);
    });

    it("should decrease when tasks are stopped", () => {
      scheduler.start("task-1");
      scheduler.start("task-2");
      scheduler.stop("task-1");

      expect(scheduler.getActiveCount()).toBe(1);
    });
  });

  describe("reportSuccess", () => {
    it("should reset fail count and interval", () => {
      scheduler.start("task-1");
      scheduler.reportFailure("task-1");
      scheduler.reportFailure("task-1");
      scheduler.reportSuccess("task-1");

      vi.advanceTimersByTime(5000);
      expect(onPoll).toHaveBeenCalled();
    });
  });

  describe("reportFailure", () => {
    it("should increase the currentInterval with backoff", () => {
      scheduler.start("task-1");

      const beforeEntry = (scheduler as unknown as { entries: Map<string, { currentInterval: number }> }).entries.get("task-1");
      const beforeInterval = beforeEntry!.currentInterval;

      scheduler.reportFailure("task-1");

      const afterEntry = (scheduler as unknown as { entries: Map<string, { currentInterval: number }> }).entries.get("task-1");
      expect(afterEntry!.currentInterval).toBeGreaterThan(beforeInterval);
      expect(afterEntry!.currentInterval).toBe(Math.min(beforeInterval * 1.5, 60000));
    });

    it("should increment failCount", () => {
      scheduler.start("task-1");

      scheduler.reportFailure("task-1");
      scheduler.reportFailure("task-1");

      const entry = (scheduler as unknown as { entries: Map<string, { failCount: number }> }).entries.get("task-1");
      expect(entry!.failCount).toBe(2);
    });

    it("should cap the interval at MAX_INTERVAL_MS", () => {
      scheduler.start("task-1");

      for (let i = 0; i < 20; i++) {
        scheduler.reportFailure("task-1");
      }

      const entry = (scheduler as unknown as { entries: Map<string, { currentInterval: number }> }).entries.get("task-1");
      expect(entry!.currentInterval).toBeLessThanOrEqual(60000);
    });
  });

  describe("poll execution error handling", () => {
    it("should report failure when onPoll throws", async () => {
      onPoll.mockRejectedValueOnce(new Error("poll failed"));
      scheduler.start("task-1");

      vi.advanceTimersByTime(5000);

      await vi.runAllTimersAsync();

      expect(onPoll).toHaveBeenCalledTimes(1);
    });
  });
});
