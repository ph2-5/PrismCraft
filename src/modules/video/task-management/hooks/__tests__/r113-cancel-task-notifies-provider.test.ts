/**
 * R113: cancelTask 通知 provider 测试
 *
 * 回归规则目的：
 *   cancelTask 在取消任务时，应 best-effort 通知服务端（provider.cancelTask）。
 *   - provider.cancelTask 可用时调用它
 *   - provider.cancelTask 为 undefined 时不抛错
 *   - provider.cancelTask 抛错时继续本地取消（best-effort）
 *   - provider.cancelTask 应在本地状态更新前调用
 *
 * 被测代码：
 *   src/modules/video/task-management/hooks/use-video-task-manager.ts 中的 cancelTask
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

  // videoProvider.cancelTask 是可选方法，初始不定义；测试中按需赋值
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

describe("R113: cancelTask 通知 provider", () => {
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
    mockSaveVideoTask.mockResolvedValue({ ok: true, value: undefined });
    mockScheduleSync.mockClear();
    mockCheckAndStartOrStopPolling.mockClear();
    mockErrorLogger.warn.mockClear();
    mockErrorLogger.error.mockClear();
    mockEmitToast.mockClear();

    // 每个测试前重置 provider.cancelTask 为 undefined
    delete (mockVideoProvider as { cancelTask?: unknown }).cancelTask;
  });

  it("cancelTask 应在 provider.cancelTask 可用时调用它", async () => {
    const providerCancel = vi.fn<(taskId: string) => Promise<void>>().mockResolvedValue(undefined);
    (mockVideoProvider as { cancelTask?: unknown }).cancelTask = providerCancel;

    const task = makeTask({ taskId: "t-r113-1", status: "pending" });
    useVideoTaskStore.setState({ allTasks: [task] });

    await useVideoTaskStore.getState().cancelTask("t-r113-1");

    expect(providerCancel).toHaveBeenCalledTimes(1);
    expect(providerCancel).toHaveBeenCalledWith("t-r113-1");
  });

  it("provider.cancelTask 为 undefined 时不应抛错", async () => {
    // 不设置 cancelTask，确保其为 undefined
    expect((mockVideoProvider as { cancelTask?: unknown }).cancelTask).toBeUndefined();

    const task = makeTask({ taskId: "t-r113-2", status: "pending" });
    useVideoTaskStore.setState({ allTasks: [task] });

    await expect(
      useVideoTaskStore.getState().cancelTask("t-r113-2"),
    ).resolves.toBeUndefined();

    // 本地取消仍然生效
    expect(useVideoTaskStore.getState().allTasks[0]!.status).toBe("cancelled");
    // 不应记录服务端取消失败的 warn
    expect(mockErrorLogger.warn).not.toHaveBeenCalledWith(
      "Failed to cancel task on server side",
      expect.anything(),
    );
  });

  it("provider.cancelTask 抛错时应继续本地取消（best-effort）", async () => {
    const providerCancel = vi.fn<(taskId: string) => Promise<void>>().mockRejectedValue(new Error("server unavailable"));
    (mockVideoProvider as { cancelTask?: unknown }).cancelTask = providerCancel;

    const task = makeTask({ taskId: "t-r113-3", status: "generating" });
    useVideoTaskStore.setState({ allTasks: [task] });

    await useVideoTaskStore.getState().cancelTask("t-r113-3");

    // 应记录服务端取消失败的 warn
    expect(mockErrorLogger.warn).toHaveBeenCalledWith(
      "Failed to cancel task on server side",
      expect.any(Error),
    );
    // 本地取消仍然生效
    expect(useVideoTaskStore.getState().allTasks[0]!.status).toBe("cancelled");
    // 持久化仍然执行
    expect(mockVideoTaskStorage.updateVideoTask).toHaveBeenCalledWith(
      "t-r113-3",
      expect.objectContaining({ status: "cancelled" }),
    );
    // 轮询检查仍然执行
    expect(mockCheckAndStartOrStopPolling).toHaveBeenCalled();
  });

  it("provider.cancelTask 应在本地状态更新前调用", async () => {
    const callOrder: string[] = [];
    const providerCancel = vi.fn<(taskId: string) => Promise<void>>().mockImplementation(async (taskId) => {
      callOrder.push("provider-cancel");
      // 在 provider.cancelTask 执行时，本地状态应尚未更新为 cancelled
      const currentTask = useVideoTaskStore.getState().allTasks.find((t) => t.taskId === taskId);
      expect(currentTask?.status).toBe("pending");
    });
    (mockVideoProvider as { cancelTask?: unknown }).cancelTask = providerCancel;

    const task = makeTask({ taskId: "t-r113-4", status: "pending" });
    useVideoTaskStore.setState({ allTasks: [task] });

    // 包装 setAllTasks 以记录调用顺序
    const originalSetAllTasks = useVideoTaskStore.getState().setAllTasks;
    useVideoTaskStore.setState({
      setAllTasks: ((updater: Parameters<typeof originalSetAllTasks>[0]) => {
        callOrder.push("set-all-tasks");
        return originalSetAllTasks(updater);
      }) as typeof originalSetAllTasks,
    });

    await useVideoTaskStore.getState().cancelTask("t-r113-4");

    // provider.cancelTask 应在 setAllTasks 之前被调用
    expect(callOrder.indexOf("provider-cancel")).toBeLessThan(callOrder.indexOf("set-all-tasks"));
    // 最终状态应为 cancelled
    expect(useVideoTaskStore.getState().allTasks[0]!.status).toBe("cancelled");
  });
});
