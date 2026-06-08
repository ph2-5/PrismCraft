import { describe, it, expect, vi, beforeEach } from "vitest";
import type { VideoTask, VideoTaskStatus } from "@/domain/schemas";

const {
  mockVideoTaskStorage,
  mockVideoProvider,
  mockContainer,
  mockPollingState,
  mockSaveVideoTask,
  mockStartBackgroundRecovery,
  mockCleanExpiredTasks,
  mockRecoverVideoByTaskId,
  mockRegisterCacheVideoBlobFn,
  mockCleanExpiredVideoCache,
  mockRegisterRecoveryFn,
  mockRemoveCachedVideo,
  mockCacheVideoBlob,
  mockErrorLogger,
  mockExtractErrorMessage,
  mockEmitToast,
  mockWithTransitionGuard,
  mockRegisterPollingStore,
  mockStopPolling,
  mockCleanupAllPollingResources,
  mockSchedulePolling,
  mockCheckAndStartOrStopPolling,
  mockScheduleSync,
  mockRegisterSyncStore,
} = vi.hoisted(() => {
  const mockVideoTaskStorage = {
    getVideoTasks: vi.fn<() => Promise<VideoTask[]>>().mockResolvedValue([]),
    deleteVideoTask: vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined),
    updateVideoTask: vi.fn<(id: string, updates: Record<string, unknown>) => Promise<void>>().mockResolvedValue(undefined),
    clearVideoTasks: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    deleteVideoTasksByStatus: vi.fn<(statuses: string[]) => Promise<void>>().mockResolvedValue(undefined),
    bulkPutVideoTasks: vi.fn<(tasks: Record<string, unknown>[]) => Promise<void>>().mockResolvedValue(undefined),
    batchDeleteVideoTasks: vi.fn<(ids: string[]) => Promise<void>>().mockResolvedValue(undefined),
    batchUpdateVideoTasks: vi.fn<(updates: Array<{ taskId: string; updates: Partial<VideoTask> }>) => Promise<void>>().mockResolvedValue(undefined),
    deleteVideoTasksByBeatId: vi.fn<(beatId: string) => Promise<void>>().mockResolvedValue(undefined),
    deleteVideoTasksByStoryId: vi.fn<(storyId: string) => Promise<void>>().mockResolvedValue(undefined),
  };

  const mockVideoProvider = {
    generateVideo: vi.fn().mockResolvedValue({ success: true, data: { taskId: "new-task-id" } }),
    generateVideoWithFrames: vi.fn().mockResolvedValue({ success: true, data: { taskId: "new-task-id" } }),
    queryVideoStatus: vi.fn().mockResolvedValue({ success: true, data: { status: "completed", videoUrl: "https://example.com/video.mp4", progress: 100 } }),
  };

  const mockContainer = {
    videoTaskStorage: mockVideoTaskStorage,
    videoProvider: mockVideoProvider,
  };

  const mockPollingState = {
    pollingTimeoutId: null as ReturnType<typeof setTimeout> | null,
    syncTimeoutId: null as ReturnType<typeof setTimeout> | null,
    recoveryIntervalId: null as ReturnType<typeof setInterval> | null,
    cacheCleanupIntervalId: null as ReturnType<typeof setInterval> | null,
    beforeUnloadHandler: null as ((e: BeforeUnloadEvent) => void) | null,
    recoveredEventHandler: null as ((e: Event) => void) | null,
    pollCount: 0,
    pollInterval: 15000,
    isSyncing: false,
    isPollingScheduled: false,
    isInitializing: false,
    pollingInProgress: false,
    abortController: null as AbortController | null,
  };

  const mockSaveVideoTask = vi.fn().mockResolvedValue({ ok: true, value: undefined });
  const mockStartBackgroundRecovery = vi.fn().mockResolvedValue(undefined);
  const mockCleanExpiredTasks = vi.fn().mockResolvedValue({ ok: true, value: 0 });
  const mockRecoverVideoByTaskId = vi.fn().mockResolvedValue({ ok: true, value: undefined });
  const mockRegisterCacheVideoBlobFn = vi.fn();

  const mockCleanExpiredVideoCache = vi.fn().mockResolvedValue({ ok: true, value: 0 });
  const mockRegisterRecoveryFn = vi.fn();
  const mockRemoveCachedVideo = vi.fn().mockResolvedValue(undefined);
  const mockCacheVideoBlob = vi.fn().mockResolvedValue(undefined);

  const mockErrorLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  const mockExtractErrorMessage = vi.fn((e: unknown) =>
    e instanceof Error ? e.message : String(e),
  );

  const mockEmitToast = vi.fn();

  const mockWithTransitionGuard = vi.fn(
    (_task: VideoTask, targetStatus: VideoTaskStatus, updates: Partial<VideoTask>) => ({
      ...updates,
      status: targetStatus,
    }),
  );
  const mockRegisterPollingStore = vi.fn();
  const mockStopPolling = vi.fn();
  const mockCleanupAllPollingResources = vi.fn();
  const mockSchedulePolling = vi.fn();
  const mockCheckAndStartOrStopPolling = vi.fn();
  const mockScheduleSync = vi.fn();
  const mockRegisterSyncStore = vi.fn();

  return {
    mockVideoTaskStorage,
    mockVideoProvider,
    mockContainer,
    mockPollingState,
    mockSaveVideoTask,
    mockStartBackgroundRecovery,
    mockCleanExpiredTasks,
    mockRecoverVideoByTaskId,
    mockRegisterCacheVideoBlobFn,
    mockCleanExpiredVideoCache,
    mockRegisterRecoveryFn,
    mockRemoveCachedVideo,
    mockCacheVideoBlob,
    mockErrorLogger,
    mockExtractErrorMessage,
    mockEmitToast,
    mockWithTransitionGuard,
    mockRegisterPollingStore,
    mockStopPolling,
    mockCleanupAllPollingResources,
    mockSchedulePolling,
    mockCheckAndStartOrStopPolling,
    mockScheduleSync,
    mockRegisterSyncStore,
  };
});

vi.mock("@/infrastructure/di", () => ({
  container: mockContainer,
}));

vi.mock("@/modules/video/recovery", () => ({
  saveVideoTask: mockSaveVideoTask,
  startBackgroundRecovery: mockStartBackgroundRecovery,
  cleanExpiredTasks: mockCleanExpiredTasks,
  recoverVideoByTaskId: mockRecoverVideoByTaskId,
  registerCacheVideoBlobFn: mockRegisterCacheVideoBlobFn,
}));

vi.mock("@/modules/video/cache", () => ({
  cleanExpiredVideoCache: mockCleanExpiredVideoCache,
  registerRecoveryFn: mockRegisterRecoveryFn,
  removeCachedVideo: mockRemoveCachedVideo,
  cacheVideoBlob: mockCacheVideoBlob,
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: mockErrorLogger,
  extractErrorMessage: mockExtractErrorMessage,
}));

vi.mock("@/shared/utils/user-facing-error", () => ({
  mapUserFacingError: vi.fn((e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    if (/timeout/i.test(msg)) return "操作超时，请稍后重试";
    if (/rate/i.test(msg)) return "操作过于频繁，请稍后重试";
    return "操作失败，请稍后重试";
  }),
}));

vi.mock("@/shared/utils/toast-bridge", () => ({
  emitToast: mockEmitToast,
}));

vi.mock("@/shared/utils/platform", () => ({
  isElectron: () => true,
}));

vi.mock("../internals", () => ({
  withTransitionGuard: mockWithTransitionGuard,
  pollingState: mockPollingState,
  registerPollingStore: mockRegisterPollingStore,
  stopPolling: mockStopPolling,
  cleanupAllPollingResources: mockCleanupAllPollingResources,
  schedulePolling: mockSchedulePolling,
  checkAndStartOrStopPolling: mockCheckAndStartOrStopPolling,
  MAX_POLL_FAILURES: 30,
  scheduleSync: mockScheduleSync,
  registerSyncStore: mockRegisterSyncStore,
}));

vi.mock("../internals/polling-engine", () => ({
  pollingState: mockPollingState,
  registerStore: mockRegisterPollingStore,
  stopPolling: mockStopPolling,
  cleanupAllPollingResources: mockCleanupAllPollingResources,
  schedulePolling: mockSchedulePolling,
  checkAndStartOrStopPolling: mockCheckAndStartOrStopPolling,
  MAX_POLL_COUNT: 100,
  MAX_POLL_DURATION: 300000,
  MAX_POLL_FAILURES: 30,
}));

import { useVideoTaskStore } from "../use-video-task-manager";

function makeTask(overrides: Partial<VideoTask> = {}): VideoTask {
  return {
    taskId: `task-${Math.random().toString(36).slice(2, 8)}`,
    status: "pending",
    progress: 0,
    message: "",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function resetPollingState() {
  mockPollingState.pollingTimeoutId = null;
  mockPollingState.syncTimeoutId = null;
  mockPollingState.recoveryIntervalId = null;
  mockPollingState.cacheCleanupIntervalId = null;
  mockPollingState.beforeUnloadHandler = null;
  mockPollingState.recoveredEventHandler = null;
  mockPollingState.pollCount = 0;
  mockPollingState.pollInterval = 15000;
  mockPollingState.isSyncing = false;
  mockPollingState.isPollingScheduled = false;
  mockPollingState.isInitializing = false;
  mockPollingState.pollingInProgress = false;
  mockPollingState.abortController = null;
}

describe("useVideoTaskStore", () => {
  beforeEach(() => {
    useVideoTaskStore.setState({
      allTasks: [],
      isBackgroundProcessing: false,
      isInitialized: false,
      isCreating: false,
      initError: null,
    });

    resetPollingState();

    mockVideoTaskStorage.getVideoTasks.mockResolvedValue([]);
    mockVideoTaskStorage.deleteVideoTask.mockResolvedValue(undefined);
    mockVideoTaskStorage.updateVideoTask.mockResolvedValue(undefined);
    mockVideoTaskStorage.clearVideoTasks.mockResolvedValue(undefined);
    mockVideoTaskStorage.deleteVideoTasksByStatus.mockResolvedValue(undefined);
    mockVideoTaskStorage.bulkPutVideoTasks.mockResolvedValue(undefined);

    mockVideoProvider.generateVideo.mockResolvedValue({
      success: true,
      data: { taskId: "new-task-id", providerId: "p1", providerModelId: "m1", providerFormat: "mp4" },
    });
    mockVideoProvider.generateVideoWithFrames.mockResolvedValue({
      success: true,
      data: { taskId: "new-task-id", providerId: "p1", providerModelId: "m1", providerFormat: "mp4" },
    });
    mockVideoProvider.queryVideoStatus.mockResolvedValue({
      success: true,
      data: { status: "completed", videoUrl: "https://example.com/video.mp4", progress: 100 },
    });

    mockSaveVideoTask.mockResolvedValue({ ok: true, value: undefined });
    mockCleanExpiredTasks.mockResolvedValue({ ok: true, value: 0 });
    mockCleanExpiredVideoCache.mockResolvedValue({ ok: true, value: 0 });
    mockRemoveCachedVideo.mockResolvedValue(undefined);
    mockCacheVideoBlob.mockResolvedValue(undefined);
    mockStartBackgroundRecovery.mockResolvedValue(undefined);
    mockRecoverVideoByTaskId.mockResolvedValue({ ok: true, value: undefined });

    mockWithTransitionGuard.mockImplementation(
      (_task: VideoTask, targetStatus: VideoTaskStatus, updates: Partial<VideoTask>) => ({
        ...updates,
        status: targetStatus,
      }),
    );

    mockExtractErrorMessage.mockImplementation((e: unknown) =>
      e instanceof Error ? e.message : String(e),
    );
  });

  describe("initial state", () => {
    it("should have empty allTasks", () => {
      expect(useVideoTaskStore.getState().allTasks).toEqual([]);
    });

    it("should have isInitialized false", () => {
      expect(useVideoTaskStore.getState().isInitialized).toBe(false);
    });

    it("should have isCreating false", () => {
      expect(useVideoTaskStore.getState().isCreating).toBe(false);
    });

    it("should have isBackgroundProcessing false", () => {
      expect(useVideoTaskStore.getState().isBackgroundProcessing).toBe(false);
    });

    it("should have initError null", () => {
      expect(useVideoTaskStore.getState().initError).toBe(null);
    });
  });

  describe("addTask", () => {
    it("should add a task to allTasks with progress 0 and createdAt", async () => {
      const taskInput = {
        taskId: "task-add-1",
        status: "pending" as VideoTaskStatus,
        message: "test",
        prompt: "a cat",
      };

      const result = await useVideoTaskStore.getState().addTask(taskInput);

      expect(result.taskId).toBe("task-add-1");
      expect(result.progress).toBe(0);
      expect(result.createdAt).toBeDefined();
      expect(result.status).toBe("pending");
      expect(useVideoTaskStore.getState().allTasks).toHaveLength(1);
      expect(useVideoTaskStore.getState().allTasks[0]!.taskId).toBe("task-add-1");
    });

    it("should persist task via saveVideoTask", async () => {
      const taskInput = {
        taskId: "task-add-2",
        status: "pending" as VideoTaskStatus,
        message: "",
        prompt: "a dog",
      };

      await useVideoTaskStore.getState().addTask(taskInput);

      expect(mockSaveVideoTask).toHaveBeenCalledTimes(1);
      expect(mockSaveVideoTask).toHaveBeenCalledWith(
        expect.objectContaining({ taskId: "task-add-2", status: "pending", progress: 0 }),
      );
    });

    it("should warn when saveVideoTask fails but still add to memory", async () => {
      mockSaveVideoTask.mockResolvedValueOnce({ ok: false, error: new Error("disk full") });

      const taskInput = {
        taskId: "task-add-3",
        status: "pending" as VideoTaskStatus,
        message: "",
        prompt: "a bird",
      };

      const result = await useVideoTaskStore.getState().addTask(taskInput);

      expect(mockErrorLogger.warn).toHaveBeenCalled();
      expect(useVideoTaskStore.getState().allTasks).toHaveLength(1);
      expect(result.taskId).toBe("task-add-3");
    });

    it("should prepend new task to the beginning of allTasks", async () => {
      const existing = makeTask({ taskId: "existing-1" });
      useVideoTaskStore.setState({ allTasks: [existing] });

      const taskInput = {
        taskId: "task-add-4",
        status: "pending" as VideoTaskStatus,
        message: "",
        prompt: "a fish",
      };

      await useVideoTaskStore.getState().addTask(taskInput);

      expect(useVideoTaskStore.getState().allTasks).toHaveLength(2);
      expect(useVideoTaskStore.getState().allTasks[0]!.taskId).toBe("task-add-4");
      expect(useVideoTaskStore.getState().allTasks[1]!.taskId).toBe("existing-1");
    });

    it("should trigger scheduleSync and checkAndStartOrStopPolling via setAllTasks", async () => {
      const taskInput = {
        taskId: "task-add-5",
        status: "pending" as VideoTaskStatus,
        message: "",
        prompt: "a horse",
      };

      await useVideoTaskStore.getState().addTask(taskInput);

      expect(mockScheduleSync).toHaveBeenCalled();
      expect(mockCheckAndStartOrStopPolling).toHaveBeenCalled();
    });
  });

  describe("removeTask", () => {
    it("should remove a task from allTasks", async () => {
      const task = makeTask({ taskId: "task-remove-1" });
      useVideoTaskStore.setState({ allTasks: [task] });

      await useVideoTaskStore.getState().removeTask("task-remove-1");

      expect(useVideoTaskStore.getState().allTasks).toHaveLength(0);
    });

    it("should remove cached video", async () => {
      const task = makeTask({ taskId: "task-remove-2" });
      useVideoTaskStore.setState({ allTasks: [task] });

      await useVideoTaskStore.getState().removeTask("task-remove-2");

      expect(mockRemoveCachedVideo).toHaveBeenCalledWith("task-remove-2");
    });

    it("should delete task from storage", async () => {
      const task = makeTask({ taskId: "task-remove-3" });
      useVideoTaskStore.setState({ allTasks: [task] });

      await useVideoTaskStore.getState().removeTask("task-remove-3");

      expect(mockVideoTaskStorage.deleteVideoTask).toHaveBeenCalledWith("task-remove-3");
    });

    it("should warn when removeCachedVideo fails but still delete from storage", async () => {
      mockRemoveCachedVideo.mockRejectedValueOnce(new Error("cache error"));
      const task = makeTask({ taskId: "task-remove-4" });
      useVideoTaskStore.setState({ allTasks: [task] });

      await useVideoTaskStore.getState().removeTask("task-remove-4");

      expect(mockErrorLogger.warn).toHaveBeenCalled();
      expect(mockVideoTaskStorage.deleteVideoTask).toHaveBeenCalledWith("task-remove-4");
    });

    it("should log error when storage delete fails", async () => {
      mockVideoTaskStorage.deleteVideoTask.mockRejectedValueOnce(new Error("db error"));
      const task = makeTask({ taskId: "task-remove-5" });
      useVideoTaskStore.setState({ allTasks: [task] });

      await useVideoTaskStore.getState().removeTask("task-remove-5");

      expect(mockErrorLogger.error).toHaveBeenCalled();
    });

    it("should not affect other tasks", async () => {
      const task1 = makeTask({ taskId: "task-keep" });
      const task2 = makeTask({ taskId: "task-remove-6" });
      useVideoTaskStore.setState({ allTasks: [task1, task2] });

      await useVideoTaskStore.getState().removeTask("task-remove-6");

      expect(useVideoTaskStore.getState().allTasks).toHaveLength(1);
      expect(useVideoTaskStore.getState().allTasks[0]!.taskId).toBe("task-keep");
    });
  });

  describe("removeTasks", () => {
    it("should remove multiple tasks from allTasks", async () => {
      const task1 = makeTask({ taskId: "task-batch-1" });
      const task2 = makeTask({ taskId: "task-batch-2" });
      const task3 = makeTask({ taskId: "task-batch-3" });
      useVideoTaskStore.setState({ allTasks: [task1, task2, task3] });

      await useVideoTaskStore.getState().removeTasks(["task-batch-1", "task-batch-3"]);

      expect(useVideoTaskStore.getState().allTasks).toHaveLength(1);
      expect(useVideoTaskStore.getState().allTasks[0]!.taskId).toBe("task-batch-2");
    });

    it("should remove cached video for each task", async () => {
      const task1 = makeTask({ taskId: "task-batch-4" });
      const task2 = makeTask({ taskId: "task-batch-5" });
      useVideoTaskStore.setState({ allTasks: [task1, task2] });

      await useVideoTaskStore.getState().removeTasks(["task-batch-4", "task-batch-5"]);

      expect(mockRemoveCachedVideo).toHaveBeenCalledWith("task-batch-4");
      expect(mockRemoveCachedVideo).toHaveBeenCalledWith("task-batch-5");
    });

    it("should delete each task from storage via batch", async () => {
      const task1 = makeTask({ taskId: "task-batch-6" });
      const task2 = makeTask({ taskId: "task-batch-7" });
      useVideoTaskStore.setState({ allTasks: [task1, task2] });

      await useVideoTaskStore.getState().removeTasks(["task-batch-6", "task-batch-7"]);

      expect(mockVideoTaskStorage.batchDeleteVideoTasks).toHaveBeenCalledWith(["task-batch-6", "task-batch-7"]);
    });

    it("should warn when removeCachedVideo fails for a task", async () => {
      mockRemoveCachedVideo.mockRejectedValueOnce(new Error("cache error"));
      const task1 = makeTask({ taskId: "task-batch-8" });
      useVideoTaskStore.setState({ allTasks: [task1] });

      await useVideoTaskStore.getState().removeTasks(["task-batch-8"]);

      expect(mockErrorLogger.warn).toHaveBeenCalled();
    });

    it("should catch and log error when storage delete fails for a task", async () => {
      mockVideoTaskStorage.batchDeleteVideoTasks.mockRejectedValueOnce(new Error("db error"));
      const task1 = makeTask({ taskId: "task-batch-9" });
      useVideoTaskStore.setState({ allTasks: [task1] });

      await useVideoTaskStore.getState().removeTasks(["task-batch-9"]);

      expect(mockErrorLogger.error).toHaveBeenCalled();
    });
  });

  describe("clearActiveTasks", () => {
    it("should remove pending and generating tasks", async () => {
      const pending = makeTask({ taskId: "t-pending", status: "pending" });
      const generating = makeTask({ taskId: "t-generating", status: "generating" });
      const completed = makeTask({ taskId: "t-completed", status: "completed" });
      useVideoTaskStore.setState({ allTasks: [pending, generating, completed] });

      await useVideoTaskStore.getState().clearActiveTasks();

      expect(useVideoTaskStore.getState().allTasks).toHaveLength(1);
      expect(useVideoTaskStore.getState().allTasks[0]!.taskId).toBe("t-completed");
    });

    it("should remove cached video for each active task", async () => {
      const pending = makeTask({ taskId: "t-pending-2", status: "pending" });
      const generating = makeTask({ taskId: "t-generating-2", status: "generating" });
      useVideoTaskStore.setState({ allTasks: [pending, generating] });

      await useVideoTaskStore.getState().clearActiveTasks();

      expect(mockRemoveCachedVideo).toHaveBeenCalledWith("t-pending-2");
      expect(mockRemoveCachedVideo).toHaveBeenCalledWith("t-generating-2");
    });

    it("should delete active tasks from storage via batch", async () => {
      const pending = makeTask({ taskId: "t-pending-3", status: "pending" });
      useVideoTaskStore.setState({ allTasks: [pending] });

      await useVideoTaskStore.getState().clearActiveTasks();

      expect(mockVideoTaskStorage.batchDeleteVideoTasks).toHaveBeenCalledWith(["t-pending-3"]);
    });

    it("should not remove completed or failed tasks", async () => {
      const completed = makeTask({ taskId: "t-comp", status: "completed" });
      const failed = makeTask({ taskId: "t-fail", status: "failed" });
      const cancelled = makeTask({ taskId: "t-cancel", status: "cancelled" });
      useVideoTaskStore.setState({ allTasks: [completed, failed, cancelled] });

      await useVideoTaskStore.getState().clearActiveTasks();

      expect(useVideoTaskStore.getState().allTasks).toHaveLength(3);
    });

    it("should log error when storage delete fails", async () => {
      mockVideoTaskStorage.batchDeleteVideoTasks.mockRejectedValueOnce(new Error("db error"));
      const pending = makeTask({ taskId: "t-pending-4", status: "pending" });
      useVideoTaskStore.setState({ allTasks: [pending] });

      await useVideoTaskStore.getState().clearActiveTasks();

      expect(mockErrorLogger.error).toHaveBeenCalled();
    });
  });

  describe("clearAllTasks", () => {
    it("should remove all tasks from allTasks", async () => {
      const task1 = makeTask({ taskId: "t-1" });
      const task2 = makeTask({ taskId: "t-2" });
      useVideoTaskStore.setState({ allTasks: [task1, task2] });

      await useVideoTaskStore.getState().clearAllTasks();

      expect(useVideoTaskStore.getState().allTasks).toEqual([]);
    });

    it("should call clearVideoTasks on storage", async () => {
      await useVideoTaskStore.getState().clearAllTasks();

      expect(mockVideoTaskStorage.clearVideoTasks).toHaveBeenCalled();
    });

    it("should log error when storage clear fails", async () => {
      mockVideoTaskStorage.clearVideoTasks.mockRejectedValueOnce(new Error("db error"));

      await useVideoTaskStore.getState().clearAllTasks();

      expect(mockErrorLogger.error).toHaveBeenCalled();
    });
  });

  describe("clearCompletedTasks", () => {
    it("should remove completed tasks from allTasks", async () => {
      const completed = makeTask({ taskId: "t-comp-1", status: "completed" });
      const pending = makeTask({ taskId: "t-pend-1", status: "pending" });
      useVideoTaskStore.setState({ allTasks: [completed, pending] });

      await useVideoTaskStore.getState().clearCompletedTasks();

      expect(useVideoTaskStore.getState().allTasks).toHaveLength(1);
      expect(useVideoTaskStore.getState().allTasks[0]!.taskId).toBe("t-pend-1");
    });

    it("should call deleteVideoTasksByStatus with completed", async () => {
      await useVideoTaskStore.getState().clearCompletedTasks();

      expect(mockVideoTaskStorage.deleteVideoTasksByStatus).toHaveBeenCalledWith(["completed"]);
    });

    it("should persist before updating state (regression: Bug #3)", async () => {
      const completed = makeTask({ taskId: "t-comp-reg", status: "completed" });
      useVideoTaskStore.setState({ allTasks: [completed] });

      const order: string[] = [];
      mockVideoTaskStorage.deleteVideoTasksByStatus.mockImplementationOnce(async () => {
        order.push("db");
      });

      const originalSetAllTasks = useVideoTaskStore.getState().setAllTasks;
      useVideoTaskStore.setState({
        setAllTasks: ((fn: unknown) => {
          order.push("state");
          return originalSetAllTasks(fn as Parameters<typeof originalSetAllTasks>[0]);
        }) as typeof originalSetAllTasks,
      });

      await useVideoTaskStore.getState().clearCompletedTasks();

      expect(order).toEqual(["db", "state"]);
    });

    it("should not update state when storage delete fails (regression: Bug #3)", async () => {
      const completed = makeTask({ taskId: "t-comp-fail", status: "completed" });
      useVideoTaskStore.setState({ allTasks: [completed] });

      mockVideoTaskStorage.deleteVideoTasksByStatus.mockRejectedValueOnce(new Error("db error"));

      await useVideoTaskStore.getState().clearCompletedTasks();

      expect(useVideoTaskStore.getState().allTasks).toHaveLength(1);
      expect(mockErrorLogger.error).toHaveBeenCalled();
    });

    it("should log error when storage delete fails", async () => {
      mockVideoTaskStorage.deleteVideoTasksByStatus.mockRejectedValueOnce(new Error("db error"));

      await useVideoTaskStore.getState().clearCompletedTasks();

      expect(mockErrorLogger.error).toHaveBeenCalled();
    });
  });

  describe("clearFailedTasks", () => {
    it("should remove failed tasks from allTasks", async () => {
      const failed = makeTask({ taskId: "t-fail-1", status: "failed" });
      const pending = makeTask({ taskId: "t-pend-2", status: "pending" });
      useVideoTaskStore.setState({ allTasks: [failed, pending] });

      await useVideoTaskStore.getState().clearFailedTasks();

      expect(useVideoTaskStore.getState().allTasks).toHaveLength(1);
      expect(useVideoTaskStore.getState().allTasks[0]!.taskId).toBe("t-pend-2");
    });

    it("should call deleteVideoTasksByStatus with failed", async () => {
      await useVideoTaskStore.getState().clearFailedTasks();

      expect(mockVideoTaskStorage.deleteVideoTasksByStatus).toHaveBeenCalledWith(["failed"]);
    });

    it("should log error when storage delete fails", async () => {
      mockVideoTaskStorage.deleteVideoTasksByStatus.mockRejectedValueOnce(new Error("db error"));

      await useVideoTaskStore.getState().clearFailedTasks();

      expect(mockErrorLogger.error).toHaveBeenCalled();
    });
  });

  describe("cancelTask", () => {
    it("should transition pending task to cancelled", async () => {
      const task = makeTask({ taskId: "t-cancel-1", status: "pending" });
      useVideoTaskStore.setState({ allTasks: [task] });

      await useVideoTaskStore.getState().cancelTask("t-cancel-1");

      expect(useVideoTaskStore.getState().allTasks[0]!.status).toBe("cancelled");
    });

    it("should transition generating task to cancelled", async () => {
      const task = makeTask({ taskId: "t-cancel-2", status: "generating" });
      useVideoTaskStore.setState({ allTasks: [task] });

      await useVideoTaskStore.getState().cancelTask("t-cancel-2");

      expect(useVideoTaskStore.getState().allTasks[0]!.status).toBe("cancelled");
    });

    it("should transition failed task to cancelled", async () => {
      const task = makeTask({ taskId: "t-cancel-3", status: "failed" });
      useVideoTaskStore.setState({ allTasks: [task] });

      await useVideoTaskStore.getState().cancelTask("t-cancel-3");

      expect(useVideoTaskStore.getState().allTasks[0]!.status).toBe("cancelled");
    });

    it("should not cancel a completed task and emit warning toast", async () => {
      const task = makeTask({ taskId: "t-cancel-4", status: "completed" });
      useVideoTaskStore.setState({ allTasks: [task] });

      await useVideoTaskStore.getState().cancelTask("t-cancel-4");

      expect(useVideoTaskStore.getState().allTasks[0]!.status).toBe("completed");
      expect(mockEmitToast).toHaveBeenCalledWith(
        "warning",
        "无法取消任务",
        expect.stringContaining("completed"),
      );
    });

    it("should not cancel an already cancelled task", async () => {
      const task = makeTask({ taskId: "t-cancel-5", status: "cancelled" });
      useVideoTaskStore.setState({ allTasks: [task] });

      await useVideoTaskStore.getState().cancelTask("t-cancel-5");

      expect(mockErrorLogger.warn).toHaveBeenCalled();
    });

    it("should persist cancelled status to storage", async () => {
      const task = makeTask({ taskId: "t-cancel-6", status: "pending" });
      useVideoTaskStore.setState({ allTasks: [task] });

      await useVideoTaskStore.getState().cancelTask("t-cancel-6");

      expect(mockVideoTaskStorage.updateVideoTask).toHaveBeenCalledWith(
        "t-cancel-6",
        expect.objectContaining({ status: "cancelled", message: "用户手动取消" }),
      );
    });

    it("should warn when storage update fails", async () => {
      mockVideoTaskStorage.updateVideoTask.mockRejectedValueOnce(new Error("db error"));
      const task = makeTask({ taskId: "t-cancel-7", status: "pending" });
      useVideoTaskStore.setState({ allTasks: [task] });

      await useVideoTaskStore.getState().cancelTask("t-cancel-7");

      expect(mockErrorLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("persist cancelled"),
        expect.anything(),
      );
    });

    it("should call checkAndStartOrStopPolling after cancellation", async () => {
      const task = makeTask({ taskId: "t-cancel-8", status: "pending" });
      useVideoTaskStore.setState({ allTasks: [task] });

      await useVideoTaskStore.getState().cancelTask("t-cancel-8");

      expect(mockCheckAndStartOrStopPolling).toHaveBeenCalled();
    });

    it("should do nothing if task not found", async () => {
      await useVideoTaskStore.getState().cancelTask("nonexistent");

      expect(mockVideoTaskStorage.updateVideoTask).not.toHaveBeenCalled();
    });
  });

  describe("removeTasksByBeatId", () => {
    it("should cancel pollable tasks, delete from storage, and remove from memory", async () => {
      const task = makeTask({ taskId: "t-beat-1", beatId: "beat-1", status: "generating" });
      useVideoTaskStore.setState({ allTasks: [task] });

      await useVideoTaskStore.getState().removeTasksByBeatId("beat-1");

      expect(mockVideoTaskStorage.deleteVideoTasksByBeatId).toHaveBeenCalledWith("beat-1");
      expect(mockRemoveCachedVideo).toHaveBeenCalledWith("t-beat-1");
      expect(useVideoTaskStore.getState().allTasks).toHaveLength(0);
      expect(mockCheckAndStartOrStopPolling).toHaveBeenCalled();
    });

    it("should still delete from storage when no in-memory tasks", async () => {
      useVideoTaskStore.setState({ allTasks: [] });

      await useVideoTaskStore.getState().removeTasksByBeatId("beat-empty");

      expect(mockVideoTaskStorage.deleteVideoTasksByBeatId).toHaveBeenCalledWith("beat-empty");
    });
  });

  describe("removeTasksByStoryId", () => {
    it("should cancel pollable tasks, delete from storage, and remove from memory", async () => {
      const task = makeTask({ taskId: "t-story-1", storyId: "story-1", status: "pending" });
      useVideoTaskStore.setState({ allTasks: [task] });

      await useVideoTaskStore.getState().removeTasksByStoryId("story-1");

      expect(mockVideoTaskStorage.deleteVideoTasksByStoryId).toHaveBeenCalledWith("story-1");
      expect(mockRemoveCachedVideo).toHaveBeenCalledWith("t-story-1");
      expect(useVideoTaskStore.getState().allTasks).toHaveLength(0);
      expect(mockCheckAndStartOrStopPolling).toHaveBeenCalled();
    });
  });

  describe("recoverTask", () => {
    it("should recover a pending task to generating status", () => {
      const task = makeTask({ taskId: "t-recover-1", status: "pending" });
      useVideoTaskStore.setState({ allTasks: [task] });

      useVideoTaskStore.getState().recoverTask("t-recover-1", "generating");

      expect(useVideoTaskStore.getState().allTasks[0]!.status).toBe("generating");
    });

    it("should recover a generating task to completed status with videoUrl", () => {
      const task = makeTask({ taskId: "t-recover-2", status: "generating" });
      useVideoTaskStore.setState({ allTasks: [task] });

      useVideoTaskStore.getState().recoverTask("t-recover-2", "completed", "https://example.com/recovered.mp4");

      const updated = useVideoTaskStore.getState().allTasks[0]!;
      expect(updated.status).toBe("completed");
      expect(updated.videoUrl).toBe("https://example.com/recovered.mp4");
    });

    it("should warn when transition is invalid", () => {
      const task = makeTask({ taskId: "t-recover-3", status: "completed" });
      useVideoTaskStore.setState({ allTasks: [task] });

      useVideoTaskStore.getState().recoverTask("t-recover-3", "failed");

      expect(mockErrorLogger.warn).toHaveBeenCalled();
    });

    it("should do nothing if task not found", () => {
      useVideoTaskStore.getState().recoverTask("nonexistent", "generating");

      expect(mockErrorLogger.warn).not.toHaveBeenCalled();
    });

    it("should map API status via mapApiStatus", () => {
      const task = makeTask({ taskId: "t-recover-4", status: "pending" });
      useVideoTaskStore.setState({ allTasks: [task] });

      useVideoTaskStore.getState().recoverTask("t-recover-4", "processing");

      expect(useVideoTaskStore.getState().allTasks[0]!.status).toBe("generating");
    });
  });

  describe("createTask", () => {
    it("should create a task via generateVideo when no frame options", async () => {
      const result = await useVideoTaskStore.getState().createTask("a cat walking");

      expect(result).not.toBeNull();
      expect(result!.prompt).toBe("a cat walking");
      expect(result!.status).toBe("pending");
      expect(result!.progress).toBe(0);
      expect(mockVideoProvider.generateVideo).toHaveBeenCalledWith(
        "a cat walking",
        expect.objectContaining({}),
      );
    });

    it("should create a task via generateVideoWithFrames when frame options present", async () => {
      const result = await useVideoTaskStore.getState().createTask("a cat walking", undefined, {
        firstFrameUrl: "https://example.com/first.jpg",
        lastFrameUrl: "https://example.com/last.jpg",
      });

      expect(result).not.toBeNull();
      expect(mockVideoProvider.generateVideoWithFrames).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: "a cat walking",
          firstFrameUrl: "https://example.com/first.jpg",
          lastFrameUrl: "https://example.com/last.jpg",
        }),
      );
    });

    it("should use generateVideoWithFrames when fixedImageUrl is provided", async () => {
      await useVideoTaskStore.getState().createTask("a dog running", undefined, {
        fixedImageUrl: "https://example.com/fixed.jpg",
      });

      expect(mockVideoProvider.generateVideoWithFrames).toHaveBeenCalled();
      expect(mockVideoProvider.generateVideo).not.toHaveBeenCalled();
    });

    it("should use generateVideo when only duration is provided without frame options", async () => {
      await useVideoTaskStore.getState().createTask("a bird flying", undefined, {
        duration: 5,
      });

      expect(mockVideoProvider.generateVideo).toHaveBeenCalled();
      expect(mockVideoProvider.generateVideoWithFrames).not.toHaveBeenCalled();
    });

    it("should pass extraOptions to generateVideo", async () => {
      await useVideoTaskStore.getState().createTask("test prompt", undefined, {
        duration: 10,
        referenceVideo: "https://example.com/ref.mp4",
        providerId: "provider-1",
        modelId: "model-1",
        format: "mp4",
        characterRef: "char-1",
        sceneRef: "scene-1",
      });

      expect(mockVideoProvider.generateVideo).toHaveBeenCalledWith(
        "test prompt",
        expect.objectContaining({
          duration: 10,
          referenceVideo: "https://example.com/ref.mp4",
          providerId: "provider-1",
          modelId: "model-1",
          format: "mp4",
          characterRef: "char-1",
          sceneRef: "scene-1",
        }),
      );
    });

    it("should add the new task to allTasks", async () => {
      await useVideoTaskStore.getState().createTask("a fish swimming");

      expect(useVideoTaskStore.getState().allTasks).toHaveLength(1);
      expect(useVideoTaskStore.getState().allTasks[0]!.prompt).toBe("a fish swimming");
    });

    it("should persist the new task via saveVideoTask", async () => {
      await useVideoTaskStore.getState().createTask("a horse galloping");

      expect(mockSaveVideoTask).toHaveBeenCalledTimes(1);
    });

    it("should schedule polling after creation", async () => {
      await useVideoTaskStore.getState().createTask("a snake slithering");

      expect(mockSchedulePolling).toHaveBeenCalled();
    });

    it("should set isCreating to true during creation and false after", async () => {
      let creatingDuringCall = false;
      mockVideoProvider.generateVideo.mockImplementationOnce(async () => {
        creatingDuringCall = useVideoTaskStore.getState().isCreating;
        return { success: true, data: { taskId: "async-task" } };
      });

      await useVideoTaskStore.getState().createTask("async test");

      expect(creatingDuringCall).toBe(true);
      expect(useVideoTaskStore.getState().isCreating).toBe(false);
    });

    it("should return null if isCreating is already true", async () => {
      useVideoTaskStore.setState({ isCreating: true });

      const result = await useVideoTaskStore.getState().createTask("blocked");

      expect(result).toBeNull();
      expect(mockErrorLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("已有任务创建中"),
      );
    });

    it("should reset isCreating to false on failure", async () => {
      mockVideoProvider.generateVideo.mockResolvedValueOnce({
        success: false,
        error: "API error",
      });

      await expect(
        useVideoTaskStore.getState().createTask("fail test"),
      ).rejects.toThrow("API error");

      expect(useVideoTaskStore.getState().isCreating).toBe(false);
    });

    it("should throw error when provider fails", async () => {
      mockVideoProvider.generateVideo.mockResolvedValueOnce({
        success: false,
        error: "Rate limited",
      });

      await expect(
        useVideoTaskStore.getState().createTask("rate limited test"),
      ).rejects.toThrow("Rate limited");
    });

    it("should throw error when provider throws", async () => {
      mockVideoProvider.generateVideo.mockRejectedValueOnce(new Error("Network error"));

      await expect(
        useVideoTaskStore.getState().createTask("network error test"),
      ).rejects.toThrow("Network error");
    });

    it("should include beatTitle in message when provided", async () => {
      const result = await useVideoTaskStore.getState().createTask("test", undefined, {
        beatTitle: "Scene 1",
      });

      expect(result!.message).toContain("Scene 1");
    });

    it("should use default message when beatTitle is not provided", async () => {
      const result = await useVideoTaskStore.getState().createTask("test");

      expect(result!.message).toBe("视频生成已提交");
    });

    it("should return promptWasTruncated when provider indicates truncation", async () => {
      mockVideoProvider.generateVideo.mockResolvedValueOnce({
        success: true,
        data: {
          taskId: "truncated-task",
          promptWasTruncated: true,
          originalPromptLength: 5000,
        },
      });

      const result = await useVideoTaskStore.getState().createTask("very long prompt");

      expect(result!.promptWasTruncated).toBe(true);
    });

    it("should warn when saveVideoTask fails but still add task to memory", async () => {
      mockSaveVideoTask.mockResolvedValueOnce({ ok: false, error: new Error("disk full") });

      const result = await useVideoTaskStore.getState().createTask("save fail test");

      expect(result).not.toBeNull();
      expect(mockErrorLogger.warn).toHaveBeenCalled();
      expect(useVideoTaskStore.getState().allTasks).toHaveLength(1);
    });

    it("should pass fixedImageUrl as firstFrameUrl to generateVideoWithFrames", async () => {
      await useVideoTaskStore.getState().createTask("test", undefined, {
        fixedImageUrl: "https://example.com/fixed.jpg",
        fixedImageLockType: "character",
      });

      expect(mockVideoProvider.generateVideoWithFrames).toHaveBeenCalledWith(
        expect.objectContaining({
          firstFrameUrl: "https://example.com/fixed.jpg",
        }),
      );
    });

    it("should prefer firstFrameUrl over fixedImageUrl in generateVideoWithFrames", async () => {
      await useVideoTaskStore.getState().createTask("test", undefined, {
        firstFrameUrl: "https://example.com/first.jpg",
        fixedImageUrl: "https://example.com/fixed.jpg",
        lastFrameUrl: "https://example.com/last.jpg",
      });

      expect(mockVideoProvider.generateVideoWithFrames).toHaveBeenCalledWith(
        expect.objectContaining({
          firstFrameUrl: "https://example.com/first.jpg",
        }),
      );
    });
  });

  describe("pollTask", () => {
    it("should do nothing if task not found", async () => {
      await useVideoTaskStore.getState().pollTask("nonexistent");

      expect(mockVideoProvider.queryVideoStatus).not.toHaveBeenCalled();
    });

    it("should update task on successful poll", async () => {
      const task = makeTask({ taskId: "t-poll-1", status: "generating" });
      useVideoTaskStore.setState({ allTasks: [task] });

      mockVideoProvider.queryVideoStatus.mockResolvedValueOnce({
        success: true,
        data: { status: "generating", progress: 50, message: "processing" },
      });

      await useVideoTaskStore.getState().pollTask("t-poll-1");

      expect(mockVideoProvider.queryVideoStatus).toHaveBeenCalledWith(
        "t-poll-1",
        expect.any(Object),
      );
      expect(useVideoTaskStore.getState().allTasks[0]!.progress).toBe(50);
    });

    it("should cache video blob when task completes with videoUrl", async () => {
      const task = makeTask({ taskId: "t-poll-2", status: "generating" });
      useVideoTaskStore.setState({ allTasks: [task] });

      mockVideoProvider.queryVideoStatus.mockResolvedValueOnce({
        success: true,
        data: {
          status: "completed",
          videoUrl: "https://example.com/video.mp4",
          progress: 100,
        },
      });

      await useVideoTaskStore.getState().pollTask("t-poll-2");

      expect(mockCacheVideoBlob).toHaveBeenCalledWith(
        "t-poll-2",
        "https://example.com/video.mp4",
      );
    });

    it("should save task after successful poll", async () => {
      const task = makeTask({ taskId: "t-poll-3", status: "generating" });
      useVideoTaskStore.setState({ allTasks: [task] });

      mockVideoProvider.queryVideoStatus.mockResolvedValueOnce({
        success: true,
        data: { status: "generating", progress: 30 },
      });

      await useVideoTaskStore.getState().pollTask("t-poll-3");

      expect(mockSaveVideoTask).toHaveBeenCalledWith(
        expect.objectContaining({ taskId: "t-poll-3" }),
      );
    });

    it("should update message when API returns failure", async () => {
      const task = makeTask({ taskId: "t-poll-4", status: "generating" });
      useVideoTaskStore.setState({ allTasks: [task] });

      mockVideoProvider.queryVideoStatus.mockResolvedValueOnce({
        success: false,
        error: "API returned error",
      });

      await useVideoTaskStore.getState().pollTask("t-poll-4");

      expect(useVideoTaskStore.getState().allTasks[0]!.message).toBe("查询无响应，请稍后重试");
    });

    it("should increment pollFailureCount on poll error", async () => {
      const task = makeTask({ taskId: "t-poll-5", status: "generating", pollFailureCount: 0 });
      useVideoTaskStore.setState({ allTasks: [task] });

      mockVideoProvider.queryVideoStatus.mockRejectedValueOnce(new Error("network error"));

      await useVideoTaskStore.getState().pollTask("t-poll-5");

      expect(useVideoTaskStore.getState().allTasks[0]!.pollFailureCount).toBe(1);
    });

    it("should mark task as failed when pollFailureCount reaches MAX_POLL_FAILURES", async () => {
      const task = makeTask({ taskId: "t-poll-6", status: "generating", pollFailureCount: 29 });
      useVideoTaskStore.setState({ allTasks: [task] });

      mockWithTransitionGuard.mockImplementationOnce(
        (_task: VideoTask, targetStatus: VideoTaskStatus, updates: Partial<VideoTask>) => ({
          ...updates,
          status: targetStatus,
        }),
      );

      mockVideoProvider.queryVideoStatus.mockRejectedValueOnce(new Error("network error"));

      await useVideoTaskStore.getState().pollTask("t-poll-6");

      expect(mockWithTransitionGuard).toHaveBeenCalledWith(
        expect.objectContaining({ taskId: "t-poll-6" }),
        "failed",
        expect.objectContaining({ pollFailureCount: 0 }),
      );
      expect(mockEmitToast).toHaveBeenCalledWith(
        "error",
        "视频生成失败",
        expect.stringContaining("t-poll-6"),
      );
    });

    it("should pass providerId and providerModelId to queryVideoStatus", async () => {
      const task = makeTask({
        taskId: "t-poll-7",
        status: "generating",
        providerId: "p1",
        providerModelId: "m1",
        providerFormat: "mp4",
      });
      useVideoTaskStore.setState({ allTasks: [task] });

      mockVideoProvider.queryVideoStatus.mockResolvedValueOnce({
        success: true,
        data: { status: "generating", progress: 40 },
      });

      await useVideoTaskStore.getState().pollTask("t-poll-7");

      expect(mockVideoProvider.queryVideoStatus).toHaveBeenCalledWith(
        "t-poll-7",
        expect.objectContaining({
          providerId: "p1",
          modelId: "m1",
          format: "mp4",
        }),
      );
    });

    it("should warn when saveVideoTask fails after poll error", async () => {
      const task = makeTask({ taskId: "t-poll-8", status: "generating" });
      useVideoTaskStore.setState({ allTasks: [task] });

      mockVideoProvider.queryVideoStatus.mockRejectedValueOnce(new Error("network error"));
      mockSaveVideoTask.mockResolvedValueOnce({ ok: false, error: new Error("disk full") });

      await useVideoTaskStore.getState().pollTask("t-poll-8");

      expect(mockErrorLogger.error).toHaveBeenCalled();
    });

    it("should handle saveVideoTask throw during poll error", async () => {
      const task = makeTask({ taskId: "t-poll-9", status: "generating" });
      useVideoTaskStore.setState({ allTasks: [task] });

      mockVideoProvider.queryVideoStatus.mockRejectedValueOnce(new Error("network error"));
      mockSaveVideoTask.mockRejectedValueOnce(new Error("db error"));

      await useVideoTaskStore.getState().pollTask("t-poll-9");

      expect(mockErrorLogger.error).toHaveBeenCalled();
    });

    it("should use mapUserFacingError for poll error message", async () => {
      const task = makeTask({ taskId: "t-poll-10", status: "generating" });
      useVideoTaskStore.setState({ allTasks: [task] });

      mockVideoProvider.queryVideoStatus.mockRejectedValueOnce(new Error("timeout"));

      await useVideoTaskStore.getState().pollTask("t-poll-10");

      expect(useVideoTaskStore.getState().allTasks[0]!.message).toContain("操作超时");
    });

    it("should merge poll result into current task state, not replace (regression: R14)", async () => {
      const task = makeTask({
        taskId: "t-poll-r14",
        status: "generating",
        storyId: "story-1",
        storyTitle: "我的故事",
        beatId: "beat-1",
        beatTitle: "第一幕",
        prompt: "原始提示词",
        fixedImageUrl: "https://img.example.com/ref.png",
        progress: 20,
        message: "处理中",
      });
      useVideoTaskStore.setState({ allTasks: [task] });

      mockVideoProvider.queryVideoStatus.mockResolvedValueOnce({
        success: true,
        data: { status: "generating", progress: 60, message: "正在渲染" },
      });

      await useVideoTaskStore.getState().pollTask("t-poll-r14");

      const updated = useVideoTaskStore.getState().allTasks[0]!;
      expect(updated.progress).toBe(60);
      expect(updated.message).toBe("正在渲染");
      expect(updated.storyId).toBe("story-1");
      expect(updated.storyTitle).toBe("我的故事");
      expect(updated.beatId).toBe("beat-1");
      expect(updated.beatTitle).toBe("第一幕");
      expect(updated.prompt).toBe("原始提示词");
      expect(updated.fixedImageUrl).toBe("https://img.example.com/ref.png");
    });

    it("should preserve user edits made during async poll (regression: R14)", async () => {
      const task = makeTask({
        taskId: "t-poll-r14b",
        status: "generating",
        storyTitle: "旧标题",
        prompt: "旧提示词",
      });
      useVideoTaskStore.setState({ allTasks: [task] });

      let resolvePoll: (value: unknown) => void;
      const pollPromise = new Promise((resolve) => { resolvePoll = resolve; });
      mockVideoProvider.queryVideoStatus.mockReturnValueOnce(pollPromise as Promise<never>);

      const pollTaskPromise = useVideoTaskStore.getState().pollTask("t-poll-r14b");

      useVideoTaskStore.setState({
        allTasks: [{
          ...useVideoTaskStore.getState().allTasks[0]!,
          storyTitle: "用户修改的标题",
        }],
      });

      resolvePoll!({
        success: true,
        data: { status: "generating", progress: 80, message: "即将完成" },
      });

      await pollTaskPromise;

      const updated = useVideoTaskStore.getState().allTasks[0]!;
      expect(updated.progress).toBe(80);
      expect(updated.message).toBe("即将完成");
      expect(updated.storyTitle).toBe("用户修改的标题");
      expect(updated.prompt).toBe("旧提示词");
    });
  });

  describe("setAllTasks", () => {
    it("should set allTasks with a direct value", () => {
      const tasks = [makeTask({ taskId: "t-1" }), makeTask({ taskId: "t-2" })];

      useVideoTaskStore.getState().setAllTasks(tasks);

      expect(useVideoTaskStore.getState().allTasks).toEqual(tasks);
    });

    it("should set allTasks with a function updater", () => {
      const existing = [makeTask({ taskId: "t-1" })];
      useVideoTaskStore.setState({ allTasks: existing });

      useVideoTaskStore.getState().setAllTasks((prev) => [
        ...prev,
        makeTask({ taskId: "t-2" }),
      ]);

      expect(useVideoTaskStore.getState().allTasks).toHaveLength(2);
    });

    it("should call scheduleSync", () => {
      useVideoTaskStore.getState().setAllTasks([]);

      expect(mockScheduleSync).toHaveBeenCalled();
    });

    it("should call checkAndStartOrStopPolling", () => {
      useVideoTaskStore.getState().setAllTasks([]);

      expect(mockCheckAndStartOrStopPolling).toHaveBeenCalled();
    });
  });

  describe("startBackgroundProcessing", () => {
    it("should set isBackgroundProcessing to true", () => {
      expect(useVideoTaskStore.getState().isBackgroundProcessing).toBe(false);

      useVideoTaskStore.getState().startBackgroundProcessing();

      expect(useVideoTaskStore.getState().isBackgroundProcessing).toBe(true);
    });
  });

  describe("cleanup", () => {
    it("should call cleanupAllPollingResources", () => {
      useVideoTaskStore.getState().cleanup();

      expect(mockCleanupAllPollingResources).toHaveBeenCalled();
    });

    it("should reset isInitialized to false", () => {
      useVideoTaskStore.setState({ isInitialized: true });

      useVideoTaskStore.getState().cleanup();

      expect(useVideoTaskStore.getState().isInitialized).toBe(false);
    });

    it("should reset isBackgroundProcessing to false", () => {
      useVideoTaskStore.setState({ isBackgroundProcessing: true });

      useVideoTaskStore.getState().cleanup();

      expect(useVideoTaskStore.getState().isBackgroundProcessing).toBe(false);
    });

    it("should reset initError to null", () => {
      useVideoTaskStore.setState({ initError: "some error" });

      useVideoTaskStore.getState().cleanup();

      expect(useVideoTaskStore.getState().initError).toBeNull();
    });
  });

  describe("initialize", () => {
    it("should not re-initialize if already initialized", async () => {
      useVideoTaskStore.setState({ isInitialized: true });

      useVideoTaskStore.getState().initialize();

      expect(mockVideoTaskStorage.getVideoTasks).not.toHaveBeenCalled();
    });

    it("should not re-initialize if currently initializing", () => {
      mockPollingState.isInitializing = true;

      useVideoTaskStore.getState().initialize();

      expect(mockVideoTaskStorage.getVideoTasks).not.toHaveBeenCalled();
    });

    it("should call cleanupAllPollingResources", () => {
      useVideoTaskStore.getState().initialize();

      expect(mockCleanupAllPollingResources).toHaveBeenCalled();
    });

    it("should load tasks from storage and set isInitialized", async () => {
      const tasks = [makeTask({ taskId: "t-init-1" }), makeTask({ taskId: "t-init-2" })];
      mockVideoTaskStorage.getVideoTasks.mockResolvedValueOnce(tasks);

      useVideoTaskStore.getState().initialize();

      await vi.waitFor(() => {
        expect(useVideoTaskStore.getState().isInitialized).toBe(true);
      });

      expect(useVideoTaskStore.getState().allTasks).toEqual(tasks);
      expect(useVideoTaskStore.getState().initError).toBeNull();
    });

    it("should clean expired video cache on init", async () => {
      mockCleanExpiredVideoCache.mockResolvedValueOnce({ ok: true, value: 5 });

      useVideoTaskStore.getState().initialize();

      await vi.waitFor(() => {
        expect(useVideoTaskStore.getState().isInitialized).toBe(true);
      });

      expect(mockCleanExpiredVideoCache).toHaveBeenCalled();
      expect(mockErrorLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("5"),
      );
    });

    it("should clean expired tasks on init", async () => {
      mockCleanExpiredTasks.mockResolvedValueOnce({ ok: true, value: 3 });

      useVideoTaskStore.getState().initialize();

      await vi.waitFor(() => {
        expect(useVideoTaskStore.getState().isInitialized).toBe(true);
      });

      expect(mockCleanExpiredTasks).toHaveBeenCalled();
      expect(mockErrorLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("3"),
      );
    });

    it("should warn when expired cache cleanup fails", async () => {
      mockCleanExpiredVideoCache.mockRejectedValueOnce(new Error("cache cleanup error"));

      useVideoTaskStore.getState().initialize();

      await vi.waitFor(() => {
        expect(useVideoTaskStore.getState().isInitialized).toBe(true);
      });

      expect(mockErrorLogger.warn).toHaveBeenCalled();
    });

    it("should set initError when task loading fails", async () => {
      mockVideoTaskStorage.getVideoTasks.mockRejectedValueOnce(new Error("db connection failed"));
      mockExtractErrorMessage.mockReturnValueOnce("db connection failed");

      useVideoTaskStore.getState().initialize();

      await vi.waitFor(() => {
        expect(useVideoTaskStore.getState().isInitialized).toBe(true);
      });

      expect(useVideoTaskStore.getState().initError).toBe("db connection failed");
      expect(mockEmitToast).toHaveBeenCalledWith(
        "error",
        "任务加载失败",
        "db connection failed",
      );
    });

    it("should reset pollingState.isInitializing in finally block", async () => {
      mockVideoTaskStorage.getVideoTasks.mockResolvedValueOnce([]);

      useVideoTaskStore.getState().initialize();

      await vi.waitFor(() => {
        expect(useVideoTaskStore.getState().isInitialized).toBe(true);
      });

      expect(mockPollingState.isInitializing).toBe(false);
    });

    it("should reset pollingState.isInitializing even on error", async () => {
      mockVideoTaskStorage.getVideoTasks.mockRejectedValueOnce(new Error("fail"));

      useVideoTaskStore.getState().initialize();

      await vi.waitFor(() => {
        expect(useVideoTaskStore.getState().isInitialized).toBe(true);
      });

      expect(mockPollingState.isInitializing).toBe(false);
    });

    it("should call checkAndStartOrStopPolling after loading tasks", async () => {
      mockVideoTaskStorage.getVideoTasks.mockResolvedValueOnce([]);

      useVideoTaskStore.getState().initialize();

      await vi.waitFor(() => {
        expect(useVideoTaskStore.getState().isInitialized).toBe(true);
      });

      expect(mockCheckAndStartOrStopPolling).toHaveBeenCalled();
    });
  });
});
