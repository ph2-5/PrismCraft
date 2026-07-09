import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  saveVideoTask,
  getFailedTasks,
  getTaskById,
  recoverVideoByTaskId,
  startBackgroundRecovery,
  cleanExpiredTasks,
  getAllTaskHistory,
  registerCacheVideoBlobFn,
} from "@/modules/video";
import type { VideoTask } from "@/domain/schemas/api";
import type { Result } from "@/domain/types/result";

const {
  mockVideoTaskStorage,
  mockVideoProvider,
  mockTaskMachine,
  mockCacheVideoBlob,
  mockIsValidTransition,
  mockIsStuck,
} = vi.hoisted(() => ({
  mockVideoTaskStorage: {
    createVideoTask: vi.fn<(task: Record<string, unknown>) => Promise<void>>(),
    getVideoTasksByStatus: vi.fn<(status: string) => Promise<unknown[]>>(),
    getVideoTaskById: vi.fn<(taskId: string) => Promise<unknown>>(),
    updateVideoTask: vi.fn<(taskId: string, updates: Record<string, unknown>) => Promise<void>>(),
    deleteExpiredVideoTasks: vi.fn<() => Promise<number>>(),
    getVideoTasks: vi.fn<() => Promise<unknown[]>>(),
  },
  mockVideoProvider: {
    queryVideoStatus: vi.fn<(taskId: string, options?: Record<string, unknown>) => Promise<unknown>>(),
  },
  mockTaskMachine: {
    canTransition: vi.fn<() => boolean>(),
    transition: vi.fn<(task: Record<string, unknown>, targetStatus: string, context?: Record<string, unknown>) => unknown>(),
    isTerminal: vi.fn<() => boolean>(),
  },
  mockCacheVideoBlob: vi.fn<(taskId: string, videoUrl: string) => Promise<unknown>>().mockResolvedValue({ ok: true, value: true }),
  mockIsValidTransition: vi.fn<() => boolean>(),
  mockIsStuck: vi.fn<() => boolean>(),
}));

vi.mock("@/infrastructure/storage/video-tasks", () => ({}));

vi.mock("@/infrastructure/di", () => ({
  container: {
    videoTaskStorage: mockVideoTaskStorage,
    videoProvider: mockVideoProvider,
  },
}));

vi.mock("@/modules/video/cache", () => ({
  cacheVideoBlob: mockCacheVideoBlob,
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  extractErrorMessage: vi.fn((e: unknown) =>
    e instanceof Error ? e.message : String(e)
  ),
}));

vi.mock("@/modules/video/task-management", () => ({
  TaskMachine: mockTaskMachine,
  isValidTransition: mockIsValidTransition,
  isStuck: mockIsStuck,
  STUCK_TASK_THRESHOLD_MS: 30 * 60 * 1000,
}));

vi.mock("@/shared/utils/platform", () => ({
  isElectron: vi.fn(() => false),
}));

// P1-2 修复：mock verifyVideoUrl 避免真实 fetch 调用
vi.mock("../video-verification-service", () => ({
  verifyVideoUrl: vi.fn().mockResolvedValue({
    ok: true,
    value: { isValid: true, reason: "mock valid", details: {}, confidence: "high" },
  }),
}));

import { container } from "@/infrastructure/di";

function createMockTask(overrides: Record<string, unknown> = {}) {
  return {
    taskId: "task-1",
    status: "failed",
    progress: 0,
    message: "",
    createdAt: new Date().toISOString(),
    pollCount: 0,
    recoveryAttempts: 0,
    lastPolledAt: new Date().toISOString(),
    providerId: "volcengine",
    providerModelId: "model-1",
    providerFormat: "openai",
    ...overrides,
  };
}

describe("video-recovery-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTaskMachine.canTransition.mockReturnValue(true);
    mockTaskMachine.isTerminal.mockReturnValue(false);
    mockTaskMachine.transition.mockImplementation(
      (task: Record<string, unknown>, targetStatus: string, context?: Record<string, unknown>) => ({
        ok: true,
        value: { ...task, status: targetStatus, updatedAt: new Date().toISOString(), videoUrl: context?.videoUrl, progress: targetStatus === "completed" ? 100 : task.progress, message: "" },
      })
    );
    mockIsValidTransition.mockReturnValue(true);
    mockIsStuck.mockReturnValue(false);
    registerCacheVideoBlobFn(mockCacheVideoBlob as unknown as (taskId: string, videoUrl: string) => Promise<Result<boolean>>);
  });

  describe("saveVideoTask", () => {
    it("should save task with default expiresAt and pollCount", async () => {
      const task = createMockTask();
      await saveVideoTask(task as unknown as VideoTask);
      expect(container.videoTaskStorage.createVideoTask).toHaveBeenCalled();
      const savedRecord = mockVideoTaskStorage.createVideoTask.mock.calls[0]![0] as Record<string, unknown>;
      expect(savedRecord.pollCount).toBe(0);
      expect(savedRecord.recoveryAttempts).toBe(0);
      expect(savedRecord.expiresAt).toBeDefined();
      expect(savedRecord.lastPolledAt).toBeDefined();
    });

    it("should use provided expiresAt", async () => {
      const customExpiry = new Date(Date.now() + 86400000).toISOString();
      const task = createMockTask({ expiresAt: customExpiry });
      await saveVideoTask(task as unknown as VideoTask);
      const savedRecord = mockVideoTaskStorage.createVideoTask.mock.calls[0]![0] as Record<string, unknown>;
      expect(savedRecord.expiresAt).toBe(customExpiry);
    });

    it("should preserve existing pollCount and recoveryAttempts", async () => {
      const task = createMockTask({ pollCount: 5, recoveryAttempts: 3 });
      await saveVideoTask(task as unknown as VideoTask);
      const savedRecord = mockVideoTaskStorage.createVideoTask.mock.calls[0]![0] as Record<string, unknown>;
      expect(savedRecord.pollCount).toBe(5);
      expect(savedRecord.recoveryAttempts).toBe(3);
    });
  });

  describe("getFailedTasks", () => {
    it("should return non-expired failed and timeout tasks", async () => {
      const futureExpiry = new Date(Date.now() + 86400000).toISOString();
      mockVideoTaskStorage.getVideoTasksByStatus
        .mockResolvedValueOnce([
          createMockTask({ taskId: "task-1", expiresAt: futureExpiry }),
          createMockTask({ taskId: "task-2", expiresAt: futureExpiry }),
        ])
        .mockResolvedValueOnce([
          createMockTask({ taskId: "task-3", expiresAt: futureExpiry }),
        ]);

      const result = await getFailedTasks();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(3);
      }
    });

    it("should filter out expired tasks", async () => {
      const pastExpiry = new Date(Date.now() - 86400000).toISOString();
      const futureExpiry = new Date(Date.now() + 86400000).toISOString();
      mockVideoTaskStorage.getVideoTasksByStatus
        .mockResolvedValueOnce([
          createMockTask({ taskId: "task-1", expiresAt: pastExpiry }),
          createMockTask({ taskId: "task-2", expiresAt: futureExpiry }),
        ])
        .mockResolvedValueOnce([]);

      const result = await getFailedTasks();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0]!.taskId).toBe("task-2");
      }
    });

    it("should include tasks without expiresAt", async () => {
      mockVideoTaskStorage.getVideoTasksByStatus
        .mockResolvedValueOnce([
          createMockTask({ taskId: "task-1", expiresAt: undefined }),
        ])
        .mockResolvedValueOnce([]);

      const result = await getFailedTasks();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
      }
    });
  });

  describe("getTaskById", () => {
    it("should return task when found", async () => {
      const task = createMockTask();
      mockVideoTaskStorage.getVideoTaskById.mockResolvedValue(task);

      const result = await getTaskById("task-1");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeDefined();
        expect(result.value?.taskId).toBe("task-1");
      }
    });

    it("should return undefined when not found", async () => {
      mockVideoTaskStorage.getVideoTaskById.mockResolvedValue(null);

      const result = await getTaskById("nonexistent");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeUndefined();
      }
    });
  });

  describe("recoverVideoByTaskId", () => {
    it("should return failure when task not found", async () => {
      mockVideoTaskStorage.getVideoTaskById.mockResolvedValue(null);

      const result = await recoverVideoByTaskId("nonexistent");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain("not found");
      }
    });

    it("should return existing video when task is completed", async () => {
      mockVideoTaskStorage.getVideoTaskById.mockResolvedValue(
        createMockTask({ status: "completed", videoUrl: "https://example.com/video.mp4" })
      );

      const result = await recoverVideoByTaskId("task-1");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.videoUrl).toBe("https://example.com/video.mp4");
        expect(result.value.message).toContain("视频已存在");
      }
    });

    it("should recover video when status is done", async () => {
      mockVideoTaskStorage.getVideoTaskById.mockResolvedValue(
        createMockTask({ status: "failed" })
      );
      mockVideoProvider.queryVideoStatus.mockResolvedValue({
        success: true,
        data: { status: "done", videoUrl: "https://example.com/recovered.mp4" },
      });
      mockTaskMachine.canTransition.mockReturnValue(true);
      mockCacheVideoBlob.mockResolvedValue({ ok: true, value: true });

      const result = await recoverVideoByTaskId("task-1");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.videoUrl).toBe("https://example.com/recovered.mp4");
      }
    });

    it("should recover video when status is completed", async () => {
      mockVideoTaskStorage.getVideoTaskById.mockResolvedValue(
        createMockTask({ status: "failed" })
      );
      mockVideoProvider.queryVideoStatus.mockResolvedValue({
        success: true,
        data: { status: "completed", videoUrl: "https://example.com/recovered2.mp4" },
      });
      mockTaskMachine.canTransition.mockReturnValue(true);
      mockCacheVideoBlob.mockResolvedValue({ ok: true, value: true });

      const result = await recoverVideoByTaskId("task-1");
      expect(result.ok).toBe(true);
    });

    it("should recover video when status is succeeded", async () => {
      mockVideoTaskStorage.getVideoTaskById.mockResolvedValue(
        createMockTask({ status: "failed" })
      );
      mockVideoProvider.queryVideoStatus.mockResolvedValue({
        success: true,
        data: { status: "succeeded", videoUrl: "https://example.com/recovered3.mp4" },
      });
      mockTaskMachine.canTransition.mockReturnValue(true);
      mockCacheVideoBlob.mockResolvedValue({ ok: true, value: true });

      const result = await recoverVideoByTaskId("task-1");
      expect(result.ok).toBe(true);
    });

    it("should return failure when status is failed", async () => {
      mockVideoTaskStorage.getVideoTaskById.mockResolvedValue(
        createMockTask({ status: "failed" })
      );
      mockVideoProvider.queryVideoStatus.mockResolvedValue({
        success: true,
        data: { status: "failed" },
      });

      const result = await recoverVideoByTaskId("task-1");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain("云端任务已确认失败");
      }
    });

    it("should return pending message when status is generating", async () => {
      mockVideoTaskStorage.getVideoTaskById.mockResolvedValue(
        createMockTask({ status: "failed" })
      );
      mockVideoProvider.queryVideoStatus.mockResolvedValue({
        success: true,
        data: { status: "generating" },
      });

      const result = await recoverVideoByTaskId("task-1");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain("视频仍在生成中");
      }
    });

    it("should return unknown status message for unrecognized status", async () => {
      mockVideoTaskStorage.getVideoTaskById.mockResolvedValue(
        createMockTask({ status: "failed" })
      );
      mockVideoProvider.queryVideoStatus.mockResolvedValue({
        success: true,
        data: { status: "weird_status" },
      });

      const result = await recoverVideoByTaskId("task-1");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain("未知状态");
      }
    });

    it("should return failure when query fails", async () => {
      mockVideoTaskStorage.getVideoTaskById.mockResolvedValue(
        createMockTask({ status: "failed" })
      );
      mockVideoProvider.queryVideoStatus.mockResolvedValue({
        success: false,
      });

      const result = await recoverVideoByTaskId("task-1");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain("查询失败");
      }
    });

    it("should return failure when transition is invalid", async () => {
      mockVideoTaskStorage.getVideoTaskById.mockResolvedValue(
        createMockTask({ status: "completed" })
      );
      mockVideoProvider.queryVideoStatus.mockResolvedValue({
        success: true,
        data: { status: "done", videoUrl: "https://example.com/video.mp4" },
      });
      mockTaskMachine.isTerminal.mockReturnValue(true);
      mockTaskMachine.canTransition.mockReturnValue(false);
      mockTaskMachine.transition.mockReturnValue({
        ok: false,
        error: { message: "不允许从 completed 转换到 completed", code: "INVALID_TRANSITION" },
      });

      const result = await recoverVideoByTaskId("task-1");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain("终态");
      }
    });

    it("should handle exceptions gracefully", async () => {
      mockVideoTaskStorage.getVideoTaskById.mockResolvedValue(
        createMockTask({ status: "failed" })
      );
      mockVideoProvider.queryVideoStatus.mockRejectedValue(
        new Error("Network failure")
      );

      const result = await recoverVideoByTaskId("task-1");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain("Network failure");
      }
    });

    it("should cache video blob after successful recovery", async () => {
      mockVideoTaskStorage.getVideoTaskById.mockResolvedValue(
        createMockTask({ status: "failed" })
      );
      mockVideoProvider.queryVideoStatus.mockResolvedValue({
        success: true,
        data: { status: "done", videoUrl: "https://example.com/recovered.mp4" },
      });
      mockTaskMachine.canTransition.mockReturnValue(true);

      await recoverVideoByTaskId("task-1");
      expect(mockCacheVideoBlob).toHaveBeenCalledWith("task-1", "https://example.com/recovered.mp4");
    });
  });

  describe("startBackgroundRecovery", () => {
    it("should process eligible failed tasks", async () => {
      const recentTask = createMockTask({
        taskId: "recent-task",
        createdAt: new Date().toISOString(),
        lastPolledAt: new Date(Date.now() - 120000).toISOString(),
        recoveryAttempts: 0,
      });
      mockVideoTaskStorage.getVideoTasksByStatus.mockResolvedValue([recentTask]);
      mockVideoTaskStorage.getVideoTaskById.mockResolvedValue(recentTask);
      mockVideoProvider.queryVideoStatus.mockResolvedValue({
        success: true,
        data: { status: "generating" },
      });

      await startBackgroundRecovery();
      expect(mockVideoTaskStorage.getVideoTasksByStatus).toHaveBeenCalledWith("failed");
    });

    it("should skip tasks that exceeded max poll duration", async () => {
      const oldTask = createMockTask({
        taskId: "old-task",
        createdAt: new Date(Date.now() - 200 * 60 * 1000).toISOString(),
      });
      mockVideoTaskStorage.getVideoTasksByStatus.mockResolvedValue([oldTask]);

      await startBackgroundRecovery();
      expect(mockVideoProvider.queryVideoStatus).not.toHaveBeenCalled();
    });

    it("should skip tasks that exceeded max recovery attempts", async () => {
      const maxAttemptTask = createMockTask({
        taskId: "max-attempt-task",
        createdAt: new Date().toISOString(),
        recoveryAttempts: 60,
      });
      mockVideoTaskStorage.getVideoTasksByStatus.mockResolvedValue([maxAttemptTask]);

      await startBackgroundRecovery();
      expect(mockVideoProvider.queryVideoStatus).not.toHaveBeenCalled();
    });

    it("should skip tasks polled too recently", async () => {
      const recentPollTask = createMockTask({
        taskId: "recent-poll-task",
        createdAt: new Date().toISOString(),
        lastPolledAt: new Date().toISOString(),
      });
      mockVideoTaskStorage.getVideoTasksByStatus.mockResolvedValue([recentPollTask]);

      await startBackgroundRecovery();
      expect(mockVideoProvider.queryVideoStatus).not.toHaveBeenCalled();
    });

    it("should not run concurrently", async () => {
      mockVideoTaskStorage.getVideoTasksByStatus.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve([]), 100))
      );

      const p1 = startBackgroundRecovery();
      const p2 = startBackgroundRecovery();
      await Promise.all([p1, p2]);

      expect(mockVideoTaskStorage.getVideoTasksByStatus).toHaveBeenCalledTimes(2);
    });
  });

  describe("cleanExpiredTasks", () => {
    it("should delegate to storage", async () => {
      mockVideoTaskStorage.deleteExpiredVideoTasks.mockResolvedValue(5);

      const result = await cleanExpiredTasks();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(5);
      }
      expect(mockVideoTaskStorage.deleteExpiredVideoTasks).toHaveBeenCalled();
    });
  });

  describe("getAllTaskHistory", () => {
    it("should return all tasks from storage", async () => {
      const tasks = [createMockTask({ taskId: "t1" }), createMockTask({ taskId: "t2" })];
      mockVideoTaskStorage.getVideoTasks.mockResolvedValue(tasks);

      const result = await getAllTaskHistory();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(2);
      }
    });
  });
});
