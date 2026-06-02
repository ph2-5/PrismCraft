import { describe, it, expect } from "vitest";
import { TaskMachine } from "../task-machine";
import type { VideoTask, VideoTaskStatus } from "@/domain/schemas";

function makeTask(overrides: Partial<VideoTask> = {}): VideoTask {
  return {
    taskId: "task-1",
    status: "pending",
    progress: 0,
    message: "",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("TaskMachine", () => {
  describe("canTransition", () => {
    it.each([
      ["pending", "generating", true],
      ["pending", "failed", true],
      ["pending", "completed", false],
      ["pending", "cancelled", true],
      ["pending", "retrying", false],
      ["generating", "completed", true],
      ["generating", "failed", true],
      ["generating", "pending", false],
      ["generating", "retrying", false],
      ["completed", "pending", true],
      ["completed", "generating", false],
      ["completed", "failed", false],
      ["completed", "cancelled", false],
      ["failed", "retrying", true],
      ["failed", "pending", false],
      ["failed", "generating", false],
      ["failed", "completed", false],
      ["cancelled", "pending", false],
      ["cancelled", "generating", false],
      ["cancelled", "failed", false],
      ["retrying", "generating", true],
      ["retrying", "completed", true],
      ["retrying", "failed", true],
      ["retrying", "pending", false],
    ] as [VideoTaskStatus, VideoTaskStatus, boolean][])(
      "canTransition(%s, %s) => %s",
      (from, to, expected) => {
        expect(TaskMachine.canTransition(from, to)).toBe(expected);
      },
    );
  });

  describe("transition", () => {
    it("should return ok with updated task for valid transition", () => {
      const task = makeTask({ status: "pending" });
      const result = TaskMachine.transition(task, "generating");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe("generating");
        expect(result.value.taskId).toBe("task-1");
        expect(result.value.updatedAt).toBeDefined();
      }
    });

    it("should return err for invalid transition", () => {
      const task = makeTask({ status: "pending" });
      const result = TaskMachine.transition(task, "completed");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain("不允许从");
        expect(result.error.message).toContain("pending");
        expect(result.error.message).toContain("completed");
      }
    });

    it("should not mutate the original task", () => {
      const task = makeTask({ status: "pending" });
      const originalStatus = task.status;
      TaskMachine.transition(task, "generating");

      expect(task.status).toBe(originalStatus);
    });

    it("should apply side effects for generating status", () => {
      const task = makeTask({ status: "pending", pollFailureCount: 5 });
      const result = TaskMachine.transition(task, "generating");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.pollFailureCount).toBe(0);
        expect(result.value.lastPolledAt).toBeDefined();
      }
    });

    it("should apply side effects for completed status", () => {
      const task = makeTask({ status: "generating", progress: 50 });
      const result = TaskMachine.transition(task, "completed", {
        videoUrl: "https://example.com/video.mp4",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.progress).toBe(100);
        expect(result.value.videoUrl).toBe("https://example.com/video.mp4");
      }
    });

    it("should apply side effects for failed status without error context", () => {
      const task = makeTask({ status: "generating" });
      const result = TaskMachine.transition(task, "failed");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.message).toBe("任务失败");
      }
    });

    it("should apply side effects for cancelled status with error context", () => {
      const task = makeTask({ status: "pending" });
      const result = TaskMachine.transition(task, "cancelled", {
        error: "User cancelled",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.message).toBe("User cancelled");
      }
    });

    it("should apply side effects for cancelled status without error context", () => {
      const task = makeTask({ status: "pending" });
      const result = TaskMachine.transition(task, "cancelled");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.message).toBe("任务已取消");
      }
    });

    it("should apply side effects for pending status (re-queue)", () => {
      const task = makeTask({ status: "completed", progress: 80, videoUrl: "https://example.com/video.mp4", message: "done", pollFailureCount: 3 });
      const result = TaskMachine.transition(task, "pending");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.progress).toBe(0);
        expect(result.value.videoUrl).toBeUndefined();
        expect(result.value.message).toBe("");
        expect(result.value.pollFailureCount).toBe(0);
      }
    });

    it("should apply side effects for retrying status without prior recoveryAttempts", () => {
      const task = makeTask({ status: "failed" });
      const result = TaskMachine.transition(task, "retrying");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.recoveryAttempts).toBe(1);
        expect(result.value.pollFailureCount).toBe(0);
      }
    });

    it("should apply side effects for completed status without videoUrl", () => {
      const task = makeTask({ status: "generating", progress: 50 });
      const result = TaskMachine.transition(task, "completed");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.progress).toBe(100);
        expect(result.value.videoUrl).toBeUndefined();
        expect(result.value.message).toBe("");
      }
    });

    it("should return empty side effects for unknown target status", () => {
      const task = makeTask({ status: "pending" });
      const result = TaskMachine.applySideEffects(task, "paused" as VideoTaskStatus);

      expect(result).toEqual({});
    });

    it("should apply side effects for retrying status", () => {
      const task = makeTask({ status: "failed", recoveryAttempts: 2, pollFailureCount: 5 });
      const result = TaskMachine.transition(task, "retrying");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.recoveryAttempts).toBe(3);
        expect(result.value.pollFailureCount).toBe(0);
      }
    });

    it("should set updatedAt on transition", () => {
      const before = Date.now();
      const task = makeTask({ status: "pending" });
      const result = TaskMachine.transition(task, "generating");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(new Date(result.value.updatedAt!).getTime()).toBeGreaterThanOrEqual(before);
      }
    });
  });

  describe("isPollable", () => {
    it.each([
      ["pending", true],
      ["generating", true],
      ["retrying", true],
      ["completed", false],
      ["failed", false],
      ["cancelled", false],
    ] as [VideoTaskStatus, boolean][])(
      "isPollable(%s) => %s",
      (status, expected) => {
        expect(TaskMachine.isPollable(status)).toBe(expected);
      },
    );
  });

  describe("isTerminal", () => {
    it.each([
      ["completed", true],
      ["cancelled", true],
      ["pending", false],
      ["generating", false],
      ["failed", true],
      ["retrying", false],
    ] as [VideoTaskStatus, boolean][])(
      "isTerminal(%s) => %s",
      (status, expected) => {
        expect(TaskMachine.isTerminal(status)).toBe(expected);
      },
    );
  });
});
