import { describe, it, expect, vi, beforeEach } from "vitest";
import type { VideoTask } from "@/domain/schemas";

const {
  mockVideoTaskStorage,
  mockVideoProvider: _mockVideoProvider,  
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
    (_task: VideoTask, targetStatus: string, updates: Partial<VideoTask>) => ({
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

vi.mock("@/shared/utils/toast-bridge", () => ({
  emitToast: mockEmitToast,
}));

vi.mock("../internals", () => ({
  withTransitionGuard: mockWithTransitionGuard,
  pollingState: mockPollingState,
  initPollingEngine: vi.fn(),
  getPollingStats: vi.fn(() => ({ activeCount: 0, registeredCount: 0 })),
  registerPollingStore: mockRegisterPollingStore,
  stopPolling: mockStopPolling,
  cleanupAllPollingResources: mockCleanupAllPollingResources,
  schedulePolling: mockSchedulePolling,
  checkAndStartOrStopPolling: mockCheckAndStartOrStopPolling,
  MAX_POLL_FAILURES: 30,
  MAX_POLL_COUNT: 100,
  MAX_POLL_DURATION: 300000,
  scheduleSync: mockScheduleSync,
  registerSyncStore: mockRegisterSyncStore,
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

describe("R34: Zustand functional updates", () => {
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
    mockCleanExpiredVideoCache.mockResolvedValue({ ok: true, value: 0 });
    mockCleanExpiredTasks.mockResolvedValue({ ok: true, value: 0 });
    mockStartBackgroundRecovery.mockResolvedValue(undefined);
    mockSaveVideoTask.mockResolvedValue({ ok: true, value: undefined });
    mockRemoveCachedVideo.mockResolvedValue(undefined);
    mockCacheVideoBlob.mockResolvedValue(undefined);
    vi.clearAllMocks();
  });

  it("should use functional set() in initialize to preserve concurrent additions", async () => {
    const concurrentTask = makeTask({ taskId: "concurrent_1" });

    mockVideoTaskStorage.getVideoTasks.mockImplementation(async () => {
      useVideoTaskStore.getState().setAllTasks((prev) => [...prev, concurrentTask]);
      return [];
    });

    useVideoTaskStore.getState().initialize();

    await vi.waitFor(() => {
      expect(useVideoTaskStore.getState().isInitialized).toBe(true);
    });

    const tasks = useVideoTaskStore.getState().allTasks;
    expect(tasks.some((t) => t.taskId === "concurrent_1")).toBe(true);
  });

  it("should not overwrite concurrent updates during initialize", async () => {
    const dbTask = makeTask({ taskId: "db_task_1" });
    const concurrentTask = makeTask({ taskId: "concurrent_2" });

    useVideoTaskStore.getState().setAllTasks((prev) => [...prev, concurrentTask]);

    mockVideoTaskStorage.getVideoTasks.mockResolvedValue([dbTask]);

    useVideoTaskStore.getState().initialize();

    await vi.waitFor(() => {
      expect(useVideoTaskStore.getState().isInitialized).toBe(true);
    });

    const tasks = useVideoTaskStore.getState().allTasks;
    const taskIds = tasks.map((t) => t.taskId);
    expect(taskIds).toContain("db_task_1");
    expect(taskIds).toContain("concurrent_2");
  });
});
