/**
 * R122: 批量清除必须通知服务端取消测试
 *
 * 回归规则目的：
 *   clearActiveTasks 和 clearAllTasks 在删除任务前，必须先逐个调用 cancelTask
 *   通知服务端取消（best-effort），避免服务端继续生成造成 token 浪费。
 *
 *   - clearActiveTasks 应对每个 active 任务调用 cancelTask
 *   - clearActiveTasks 只对 pending/generating 状态的任务调用 cancelTask
 *     （注：clearActiveTasks 内部先 filterTasksByStatus(["pending","generating"])，
 *      再对 isPollable 的任务调用 cancelTask）
 *   - clearAllTasks 应对每个 active 任务调用 cancelTask
 *     （注：clearAllTasks 遍历所有任务，对 isPollable 的任务调用 cancelTask，
 *      即 pending/generating/retrying 状态）
 *   - cancelTask 失败时不应阻止后续任务的取消
 *   - 所有任务取消后才执行批量删除
 *
 * 被测代码：
 *   src/modules/video/task-management/hooks/use-video-task-manager.ts
 *   中的 clearActiveTasks 和 clearAllTasks
 */
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

  // videoProvider.cancelTask 是可选方法，测试中按需赋值
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

  // withTransitionGuard 模拟 TaskMachine.transition 的行为：
  // 返回包含 targetStatus 的 updates
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
    return msg || "操作失败";
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

describe("R122: 批量清除必须通知服务端取消", () => {
  let providerCancelSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    useVideoTaskStore.setState({
      allTasks: [],
      isBackgroundProcessing: false,
      isInitialized: false,
      isCreating: false,
      initError: null,
    });

    resetPollingState();

    mockVideoTaskStorage.updateVideoTask.mockResolvedValue(undefined);
    mockVideoTaskStorage.batchDeleteVideoTasks.mockResolvedValue(undefined);
    mockVideoTaskStorage.clearVideoTasks.mockResolvedValue(undefined);
    mockSaveVideoTask.mockResolvedValue({ ok: true, value: undefined });
    mockRemoveCachedVideo.mockResolvedValue(undefined);

    mockScheduleSync.mockClear();
    mockCheckAndStartOrStopPolling.mockClear();
    mockErrorLogger.warn.mockClear();
    mockErrorLogger.error.mockClear();
    mockEmitToast.mockClear();

    // 为 provider 设置 cancelTask mock
    providerCancelSpy = vi.fn<(taskId: string) => Promise<void>>().mockResolvedValue(undefined);
    (mockVideoProvider as { cancelTask?: unknown }).cancelTask = providerCancelSpy;
  });

  describe("clearActiveTasks", () => {
    it("应对每个 active 任务调用 cancelTask", async () => {
      // 准备：3 个 pending/generating 任务 + 1 个 completed 任务
      const t1 = makeTask({ taskId: "t-r122-1", status: "pending" });
      const t2 = makeTask({ taskId: "t-r122-2", status: "generating" });
      const t3 = makeTask({ taskId: "t-r122-3", status: "pending" });
      const t4 = makeTask({ taskId: "t-r122-4", status: "completed" });
      useVideoTaskStore.setState({ allTasks: [t1, t2, t3, t4] });

      await useVideoTaskStore.getState().clearActiveTasks();

      // 应对 3 个 active 任务调用 cancelTask（completed 不调用）
      expect(providerCancelSpy).toHaveBeenCalledTimes(3);
      expect(providerCancelSpy).toHaveBeenCalledWith("t-r122-1");
      expect(providerCancelSpy).toHaveBeenCalledWith("t-r122-2");
      expect(providerCancelSpy).toHaveBeenCalledWith("t-r122-3");
      expect(providerCancelSpy).not.toHaveBeenCalledWith("t-r122-4");
    });

    it("只对 pending/generating 状态的任务调用 cancelTask（completed/failed/cancelled 不调用）", async () => {
      const tPending = makeTask({ taskId: "t-pending", status: "pending" });
      const tGenerating = makeTask({ taskId: "t-generating", status: "generating" });
      const tCompleted = makeTask({ taskId: "t-completed", status: "completed" });
      const tFailed = makeTask({ taskId: "t-failed", status: "failed" });
      const tCancelled = makeTask({ taskId: "t-cancelled", status: "cancelled" });
      useVideoTaskStore.setState({
        allTasks: [tPending, tGenerating, tCompleted, tFailed, tCancelled],
      });

      await useVideoTaskStore.getState().clearActiveTasks();

      // 只对 pending 和 generating 调用 cancelTask
      expect(providerCancelSpy).toHaveBeenCalledTimes(2);
      expect(providerCancelSpy).toHaveBeenCalledWith("t-pending");
      expect(providerCancelSpy).toHaveBeenCalledWith("t-generating");
    });

    it("cancelTask 失败时不应阻止后续任务的取消", async () => {
      const t1 = makeTask({ taskId: "t-fail", status: "pending" });
      const t2 = makeTask({ taskId: "t-ok", status: "generating" });
      const t3 = makeTask({ taskId: "t-after", status: "pending" });
      useVideoTaskStore.setState({ allTasks: [t1, t2, t3] });

      // 第一个任务的 cancelTask 抛错，后续应继续
      providerCancelSpy
        .mockRejectedValueOnce(new Error("server unavailable"))
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined);

      await useVideoTaskStore.getState().clearActiveTasks();

      // 应该对所有 3 个任务都尝试调用 cancelTask
      expect(providerCancelSpy).toHaveBeenCalledTimes(3);
      expect(providerCancelSpy).toHaveBeenCalledWith("t-fail");
      expect(providerCancelSpy).toHaveBeenCalledWith("t-ok");
      expect(providerCancelSpy).toHaveBeenCalledWith("t-after");
      // cancelTask 内部 best-effort 捕获了 provider.cancelTask 的错误，
      // 记录 "Failed to cancel task on server side" warn，但不向上抛出
      expect(mockErrorLogger.warn).toHaveBeenCalledWith(
        "Failed to cancel task on server side",
        expect.any(Error),
      );
    });

    it("所有任务取消后才执行批量删除", async () => {
      const t1 = makeTask({ taskId: "t-1", status: "pending" });
      const t2 = makeTask({ taskId: "t-2", status: "generating" });
      useVideoTaskStore.setState({ allTasks: [t1, t2] });

      // 记录调用顺序
      const callOrder: string[] = [];
      providerCancelSpy.mockImplementation(async (taskId: string) => {
        callOrder.push(`cancel:${taskId}`);
      });
      mockVideoTaskStorage.batchDeleteVideoTasks.mockImplementation(async (ids: string[]) => {
        callOrder.push(`batchDelete:${ids.join(",")}`);
      });

      await useVideoTaskStore.getState().clearActiveTasks();

      // 验证 cancelTask 在 batchDelete 之前被调用
      const firstCancelIdx = callOrder.findIndex((c) => c.startsWith("cancel:"));
      const batchDeleteIdx = callOrder.findIndex((c) => c.startsWith("batchDelete:"));
      expect(firstCancelIdx).toBeGreaterThanOrEqual(0);
      expect(batchDeleteIdx).toBeGreaterThanOrEqual(0);
      expect(firstCancelIdx).toBeLessThan(batchDeleteIdx);

      // 验证 batchDelete 被调用，传入的是 active 任务的 ID
      expect(mockVideoTaskStorage.batchDeleteVideoTasks).toHaveBeenCalledWith(
        expect.arrayContaining(["t-1", "t-2"]),
      );
    });

    it("无 active 任务时不应调用 cancelTask 或 batchDelete", async () => {
      const t1 = makeTask({ taskId: "t-completed", status: "completed" });
      const t2 = makeTask({ taskId: "t-failed", status: "failed" });
      useVideoTaskStore.setState({ allTasks: [t1, t2] });

      await useVideoTaskStore.getState().clearActiveTasks();

      expect(providerCancelSpy).not.toHaveBeenCalled();
      // activeIds 为空时提前 return
      expect(mockVideoTaskStorage.batchDeleteVideoTasks).not.toHaveBeenCalled();
    });
  });

  describe("clearAllTasks", () => {
    it("应对每个 active 任务调用 cancelTask", async () => {
      // 准备：2 个 active 任务 + 2 个非 active 任务
      const t1 = makeTask({ taskId: "t-all-1", status: "pending" });
      const t2 = makeTask({ taskId: "t-all-2", status: "generating" });
      const t3 = makeTask({ taskId: "t-all-3", status: "completed" });
      const t4 = makeTask({ taskId: "t-all-4", status: "failed" });
      useVideoTaskStore.setState({ allTasks: [t1, t2, t3, t4] });

      await useVideoTaskStore.getState().clearAllTasks();

      // 应对 2 个 active 任务调用 cancelTask（completed/failed 不调用）
      expect(providerCancelSpy).toHaveBeenCalledTimes(2);
      expect(providerCancelSpy).toHaveBeenCalledWith("t-all-1");
      expect(providerCancelSpy).toHaveBeenCalledWith("t-all-2");
      expect(providerCancelSpy).not.toHaveBeenCalledWith("t-all-3");
      expect(providerCancelSpy).not.toHaveBeenCalledWith("t-all-4");
    });

    it("cancelTask 失败时不应阻止后续任务的取消", async () => {
      const t1 = makeTask({ taskId: "t-all-fail", status: "pending" });
      const t2 = makeTask({ taskId: "t-all-ok", status: "generating" });
      useVideoTaskStore.setState({ allTasks: [t1, t2] });

      providerCancelSpy
        .mockRejectedValueOnce(new Error("server unavailable"))
        .mockResolvedValueOnce(undefined);

      await useVideoTaskStore.getState().clearAllTasks();

      // 应该对两个任务都尝试调用 cancelTask
      expect(providerCancelSpy).toHaveBeenCalledTimes(2);
      expect(providerCancelSpy).toHaveBeenCalledWith("t-all-fail");
      expect(providerCancelSpy).toHaveBeenCalledWith("t-all-ok");
      // cancelTask 内部 best-effort 捕获了 provider.cancelTask 的错误，
      // 记录 "Failed to cancel task on server side" warn，但不向上抛出
      expect(mockErrorLogger.warn).toHaveBeenCalledWith(
        "Failed to cancel task on server side",
        expect.any(Error),
      );
    });

    it("所有任务取消后才执行批量删除（clearVideoTasks）", async () => {
      const t1 = makeTask({ taskId: "t-clear-1", status: "pending" });
      const t2 = makeTask({ taskId: "t-clear-2", status: "generating" });
      const t3 = makeTask({ taskId: "t-clear-3", status: "completed" });
      useVideoTaskStore.setState({ allTasks: [t1, t2, t3] });

      const callOrder: string[] = [];
      providerCancelSpy.mockImplementation(async (taskId: string) => {
        callOrder.push(`cancel:${taskId}`);
      });
      mockVideoTaskStorage.clearVideoTasks.mockImplementation(async () => {
        callOrder.push("clearVideoTasks");
      });

      await useVideoTaskStore.getState().clearAllTasks();

      // 验证 cancelTask 在 clearVideoTasks 之前被调用
      const firstCancelIdx = callOrder.findIndex((c) => c.startsWith("cancel:"));
      const clearIdx = callOrder.findIndex((c) => c === "clearVideoTasks");
      expect(firstCancelIdx).toBeGreaterThanOrEqual(0);
      expect(clearIdx).toBeGreaterThanOrEqual(0);
      expect(firstCancelIdx).toBeLessThan(clearIdx);

      // clearVideoTasks 应被调用
      expect(mockVideoTaskStorage.clearVideoTasks).toHaveBeenCalledTimes(1);
    });

    it("无 active 任务时仍应调用 clearVideoTasks 清除所有任务", async () => {
      const t1 = makeTask({ taskId: "t-completed", status: "completed" });
      const t2 = makeTask({ taskId: "t-failed", status: "failed" });
      useVideoTaskStore.setState({ allTasks: [t1, t2] });

      await useVideoTaskStore.getState().clearAllTasks();

      // 无 active 任务，不应调用 cancelTask
      expect(providerCancelSpy).not.toHaveBeenCalled();
      // 但 clearVideoTasks 仍应被调用以清除所有任务
      expect(mockVideoTaskStorage.clearVideoTasks).toHaveBeenCalledTimes(1);
    });
  });
});
