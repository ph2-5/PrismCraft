/**
 * R115: useVideoTaskCommands 必须委托给 store action 测试
 *
 * 回归规则目的：
 *   useVideoTaskCommands 返回的所有写操作必须委托给 store.getState().xxx()，
 *   而非直接操作 store state。这确保 scheduleSync 和 checkAndStartOrStopPolling
 *   被正确调用。绕过 store action 会导致：
 *     1) 同步不触发（多设备数据不一致）
 *     2) 轮询不启停（活跃任务无人轮询）
 *
 * 被测代码：
 *   src/modules/video/task-management/hooks/use-video-task-commands.ts
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { VideoTask, VideoTaskStatus } from "@/domain/schemas";

const {
  mockVideoTaskStorage,
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

  // videoProvider.cancelTask 是可选方法，初始不定义
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
// 注意：useVideoTaskCommands 是 React hook，但内部仅委托 store.getState().xxx()，
// 这里直接调用 hook 函数即可（不需要 React 渲染环境，因为它不使用任何 React hook）
import { useVideoTaskCommands } from "../use-video-task-commands";

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

describe("R115: useVideoTaskCommands 必须委托给 store action", () => {
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
  });

  it("addTask 应委托给 store.getState().addTask", async () => {
    // 用 spy 替换 store.getState().addTask，验证 commands.addTask 调用了它
    const addTaskSpy = vi.fn().mockResolvedValue(makeTask({ taskId: "t-r115-1" }));
    useVideoTaskStore.setState({ addTask: addTaskSpy as never });

    const commands = useVideoTaskCommands();
    const taskInput = { taskId: "t-r115-1", status: "pending" as VideoTaskStatus, message: "" };
    await commands.addTask(taskInput);

    expect(addTaskSpy).toHaveBeenCalledTimes(1);
    expect(addTaskSpy).toHaveBeenCalledWith(taskInput);
  });

  it("removeTask 应委托给 store.getState().removeTask", async () => {
    const removeTaskSpy = vi.fn().mockResolvedValue(undefined);
    useVideoTaskStore.setState({ removeTask: removeTaskSpy as never });

    const commands = useVideoTaskCommands();
    await commands.removeTask("t-r115-2");

    expect(removeTaskSpy).toHaveBeenCalledTimes(1);
    expect(removeTaskSpy).toHaveBeenCalledWith("t-r115-2");
  });

  it("createTask 应委托给 store.getState().createTask", async () => {
    const createTaskSpy = vi.fn().mockResolvedValue(makeTask({ taskId: "t-r115-3" }));
    useVideoTaskStore.setState({ createTask: createTaskSpy as never });

    const commands = useVideoTaskCommands();
    const extraOptions = { storyId: "story-1", beatId: "beat-1" };
    await commands.createTask("a prompt", extraOptions);

    expect(createTaskSpy).toHaveBeenCalledTimes(1);
    expect(createTaskSpy).toHaveBeenCalledWith("a prompt", extraOptions);
  });

  it("cancelTask 应委托给 store.getState().cancelTask", async () => {
    const cancelTaskSpy = vi.fn().mockResolvedValue(undefined);
    useVideoTaskStore.setState({ cancelTask: cancelTaskSpy as never });

    const commands = useVideoTaskCommands();
    await commands.cancelTask("t-r115-4");

    expect(cancelTaskSpy).toHaveBeenCalledTimes(1);
    expect(cancelTaskSpy).toHaveBeenCalledWith("t-r115-4");
  });

  it("clearActiveTasks 应委托给 store.getState().clearActiveTasks", async () => {
    const clearActiveTasksSpy = vi.fn().mockResolvedValue(undefined);
    useVideoTaskStore.setState({ clearActiveTasks: clearActiveTasksSpy as never });

    const commands = useVideoTaskCommands();
    await commands.clearActiveTasks();

    expect(clearActiveTasksSpy).toHaveBeenCalledTimes(1);
    expect(clearActiveTasksSpy).toHaveBeenCalledWith();
  });

  it("recoverTask 应委托给 store.getState().recoverTask", () => {
    const recoverTaskSpy = vi.fn();
    useVideoTaskStore.setState({ recoverTask: recoverTaskSpy as never });

    const commands = useVideoTaskCommands();
    commands.recoverTask("t-r115-6", "completed", "https://example.com/v.mp4");

    expect(recoverTaskSpy).toHaveBeenCalledTimes(1);
    expect(recoverTaskSpy).toHaveBeenCalledWith("t-r115-6", "completed", "https://example.com/v.mp4");
  });
});
