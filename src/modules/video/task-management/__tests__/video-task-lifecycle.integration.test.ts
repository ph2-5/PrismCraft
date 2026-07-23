/**
 * 视频任务生命周期集成测试
 *
 * 覆盖链路:
 * useVideoTaskCommands.createTask → container.videoProvider.generateVideo
 * → schedulePolling → pollTaskShared → queryVideoStatus → mapApiStatus
 * → withTransitionGuard → cacheVideoBlob → persistVideoTask → scheduleSync
 *
 * 策略:
 * - 真实使用 polling-engine / sync-engine / transition-guard / shared-polling-logic
 *   (不 mock ../internals，验证真实轮询链路)
 * - mock 边界依赖: DI container (videoProvider), cache (cacheVideoBlob),
 *   recovery (saveVideoTask), error-logger, toast-bridge
 * - 使用 vi.useFakeTimers() 控制轮询/同步定时器，避免真实定时器干扰
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { VideoTask } from "@/domain/schemas";

// ============ Mock 定义（hoisted，确保在 import 之前执行）============
const {
  mockVideoProvider,
  mockVideoTaskStorage,
  mockContainer,
  mockCacheVideoBlob,
  mockRegisterRecoveryFn,
  mockCleanExpiredVideoCache,
  mockRemoveCachedVideo,
  mockSaveVideoTask,
  mockStartBackgroundRecovery,
  mockCleanExpiredTasks,
  mockRecoverVideoByTaskId,
  mockRegisterCacheVideoBlobFn,
  mockErrorLogger,
  mockExtractErrorMessage,
  mockEmitToast,
  mockMapUserFacingError,
  mockT,
} = vi.hoisted(() => {
  const mockVideoProvider = {
    generateVideo: vi.fn(),
    generateVideoWithFrames: vi.fn(),
    queryVideoStatus: vi.fn(),
  };

  const mockVideoTaskStorage = {
    getVideoTasks: vi.fn<() => Promise<VideoTask[]>>().mockResolvedValue([]),
    createVideoTask: vi.fn().mockResolvedValue(undefined),
    updateVideoTask: vi.fn().mockResolvedValue(undefined),
    deleteVideoTask: vi.fn().mockResolvedValue(undefined),
    clearVideoTasks: vi.fn().mockResolvedValue(undefined),
    deleteVideoTasksByStatus: vi.fn().mockResolvedValue(undefined),
    bulkPutVideoTasks: vi.fn().mockResolvedValue(undefined),
    batchDeleteVideoTasks: vi.fn().mockResolvedValue(undefined),
    batchUpdateVideoTasks: vi.fn().mockResolvedValue(undefined),
    deleteVideoTasksByBeatId: vi.fn().mockResolvedValue(undefined),
    deleteVideoTasksByStoryId: vi.fn().mockResolvedValue(undefined),
  };

  const mockContainer = {
    videoTaskStorage: mockVideoTaskStorage,
    videoProvider: mockVideoProvider,
    eventBus: { emit: vi.fn(), on: vi.fn(), off: vi.fn() },
  };

  return {
    mockVideoProvider,
    mockVideoTaskStorage,
    mockContainer,
    mockCacheVideoBlob: vi.fn().mockResolvedValue({ ok: true, value: true }),
    mockRegisterRecoveryFn: vi.fn(),
    mockCleanExpiredVideoCache: vi.fn().mockResolvedValue({ ok: true, value: 0 }),
    mockRemoveCachedVideo: vi.fn().mockResolvedValue(undefined),
    mockSaveVideoTask: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
    mockStartBackgroundRecovery: vi.fn().mockResolvedValue(undefined),
    mockCleanExpiredTasks: vi.fn().mockResolvedValue({ ok: true, value: 0 }),
    mockRecoverVideoByTaskId: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
    mockRegisterCacheVideoBlobFn: vi.fn(),
    mockErrorLogger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    mockExtractErrorMessage: vi.fn((e: unknown) =>
      e instanceof Error ? e.message : String(e),
    ),
    mockEmitToast: vi.fn(),
    mockMapUserFacingError: vi.fn((e: unknown) =>
      e instanceof Error ? e.message : String(e),
    ),
    mockT: vi.fn((key: string, params?: Record<string, string | number>) => {
      if (params) return `${key}:${JSON.stringify(params)}`;
      return key;
    }),
  };
});

// ============ Mock 应用 ============
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
  cacheVideoBlob: mockCacheVideoBlob,
  registerRecoveryFn: mockRegisterRecoveryFn,
  cleanExpiredVideoCache: mockCleanExpiredVideoCache,
  removeCachedVideo: mockRemoveCachedVideo,
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: mockErrorLogger,
  extractErrorMessage: mockExtractErrorMessage,
}));

vi.mock("@/shared/utils/toast-bridge", () => ({
  emitToast: mockEmitToast,
}));

vi.mock("@/shared/utils/user-facing-error", () => ({
  mapUserFacingError: mockMapUserFacingError,
}));

vi.mock("@/shared/utils/platform", () => ({
  isElectron: () => true,
}));

vi.mock("@/shared/constants", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/constants")>();
  return { ...actual, t: mockT };
});

// ============ 导入被测代码（真实，不 mock internals）============
import { useVideoTaskStore } from "../hooks/use-video-task-manager";
import { useVideoTaskCommands } from "../hooks/use-video-task-commands";
import {
  pollingState,
  cleanupAllPollingResources,
  registerStore as registerPollingStore,
} from "../hooks/internals/polling-engine";
import { registerSyncStore } from "../hooks/internals/sync-engine";
import { MAX_POLL_FAILURES } from "../hooks/internals/polling-constants";

// ============ 辅助函数 ============
function makeTask(overrides: Partial<VideoTask> = {}): VideoTask {
  return {
    taskId: `task-${Math.random().toString(36).slice(2, 10)}`,
    status: "pending",
    progress: 0,
    message: "",
    createdAt: new Date().toISOString(),
    ...overrides,
  } as VideoTask;
}

// ============ 测试 ============
describe("视频任务生命周期集成测试", () => {
  beforeEach(() => {
    vi.useFakeTimers();

    // 重置 store 状态
    useVideoTaskStore.setState({
      allTasks: [],
      isBackgroundProcessing: false,
      isInitialized: false,
      isCreating: false,
      initError: null,
    });

    // 重置 polling 状态并注册 store（不调用 initialize，避免设置后台 interval）
    cleanupAllPollingResources();
    registerPollingStore(useVideoTaskStore);
    registerSyncStore(useVideoTaskStore);

    // 清除 mock 调用记录并重置默认返回值
    vi.clearAllMocks();
    mockSaveVideoTask.mockResolvedValue({ ok: true, value: undefined });
    mockCacheVideoBlob.mockResolvedValue({ ok: true, value: true });
    mockCleanExpiredTasks.mockResolvedValue({ ok: true, value: 0 });
    mockCleanExpiredVideoCache.mockResolvedValue({ ok: true, value: 0 });
    mockStartBackgroundRecovery.mockResolvedValue(undefined);
    mockRecoverVideoByTaskId.mockResolvedValue({ ok: true, value: undefined });
    mockVideoTaskStorage.getVideoTasks.mockResolvedValue([]);
    mockVideoTaskStorage.bulkPutVideoTasks.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanupAllPollingResources();
    vi.useRealTimers();
  });

  // ====================================================================
  // 测试用例 1: 创建任务
  // ====================================================================
  describe("创建任务", () => {
    it("createTask → generateVideo 被调用 → 任务进入 pending → schedulePolling 启动 → persistVideoTask 调用", async () => {
      mockVideoProvider.generateVideo.mockResolvedValue({
        success: true,
        data: {
          taskId: "task-create-1",
          providerId: "prov-1",
          providerModelId: "model-1",
        },
      });

      const commands = useVideoTaskCommands();
      const result = await commands.createTask("test prompt", {
        storyId: "story-1",
        beatId: "beat-1",
        beatTitle: "Beat 1",
      });

      expect(result).not.toBeNull();
      expect(result!.taskId).toBe("task-create-1");

      // generateVideo 被调用
      expect(mockVideoProvider.generateVideo).toHaveBeenCalledTimes(1);
      expect(mockVideoProvider.generateVideo).toHaveBeenCalledWith(
        "test prompt",
        expect.objectContaining({ firstFrameUrl: undefined }),
      );

      // 任务进入 pending 状态
      const tasks = useVideoTaskStore.getState().allTasks;
      expect(tasks).toHaveLength(1);
      expect(tasks[0]!.status).toBe("pending");
      expect(tasks[0]!.taskId).toBe("task-create-1");
      expect(tasks[0]!.providerId).toBe("prov-1");
      expect(tasks[0]!.providerModelId).toBe("model-1");

      // schedulePolling 启动（有 pending 任务时 isPollingScheduled = true）
      expect(pollingState.isPollingScheduled).toBe(true);
      expect(pollingState.pollingTimeoutId).not.toBeNull();

      // persistVideoTask 被调用（通过 saveVideoTask mock 验证）
      expect(mockSaveVideoTask).toHaveBeenCalledTimes(1);
      expect(mockSaveVideoTask).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: "task-create-1",
          status: "pending",
          providerId: "prov-1",
        }),
      );
    });

    it("createTask 失败时不创建任务", async () => {
      mockVideoProvider.generateVideo.mockResolvedValue({
        success: false,
        error: "provider unavailable",
      });

      const commands = useVideoTaskCommands();
      await expect(
        commands.createTask("test prompt"),
      ).rejects.toThrow("provider unavailable");

      expect(useVideoTaskStore.getState().allTasks).toHaveLength(0);
      expect(pollingState.isPollingScheduled).toBe(false);
    });
  });

  // ====================================================================
  // 测试用例 2: 轮询完成
  // ====================================================================
  describe("轮询完成", () => {
    it("pollTask → queryVideoStatus 返回 completed → mapApiStatus → withTransitionGuard → cacheVideoBlob → persistVideoTask → scheduleSync", async () => {
      const task = makeTask({
        taskId: "task-complete-1",
        status: "generating",
        progress: 50,
        providerId: "prov-1",
        providerModelId: "model-1",
      });
      useVideoTaskStore.setState({ allTasks: [task] });

      mockVideoProvider.queryVideoStatus.mockResolvedValue({
        success: true,
        data: {
          status: "completed",
          videoUrl: "https://example.com/video.mp4",
          progress: 100,
        },
      });

      await useVideoTaskStore.getState().pollTask("task-complete-1");

      // queryVideoStatus 被调用（携带 provider 选项）
      expect(mockVideoProvider.queryVideoStatus).toHaveBeenCalledTimes(1);
      expect(mockVideoProvider.queryVideoStatus).toHaveBeenCalledWith(
        "task-complete-1",
        expect.objectContaining({
          providerId: "prov-1",
          modelId: "model-1",
        }),
      );

      // cacheVideoBlob 被调用（因为 justCompleted: status=completed 且 videoUrl 存在）
      expect(mockCacheVideoBlob).toHaveBeenCalledWith(
        "task-complete-1",
        "https://example.com/video.mp4",
      );

      // persistVideoTask 被调用（通过 saveVideoTask mock 验证）
      expect(mockSaveVideoTask).toHaveBeenCalledTimes(1);
      const persistedTask = mockSaveVideoTask.mock.calls[0]![0] as VideoTask;
      expect(persistedTask.status).toBe("completed");
      expect(persistedTask.videoUrl).toBe("https://example.com/video.mp4");

      // 状态更新为 completed（mapApiStatus + withTransitionGuard 生效）
      const updatedTask = useVideoTaskStore.getState().allTasks.find(
        (t) => t.taskId === "task-complete-1",
      );
      expect(updatedTask).toBeDefined();
      expect(updatedTask!.status).toBe("completed");
      expect(updatedTask!.videoUrl).toBe("https://example.com/video.mp4");
      expect(updatedTask!.progress).toBe(100);

      // scheduleSync 被调用（syncTimeoutId 被设置）
      expect(pollingState.syncTimeoutId).not.toBeNull();

      // 任务完成后无活跃任务，轮询停止
      expect(pollingState.isPollingScheduled).toBe(false);
    });

    it("mapApiStatus 将 provider 状态 processing 映射为 generating", async () => {
      // 初始状态设为 pending，使 pending → generating 为合法转换，
      // 从而通过状态变化验证 mapApiStatus("processing") → "generating"。
      // （若初始为 generating，generating → generating 为自转换，
      //  withTransitionGuard 会丢弃整个更新，progress 不会被刷新。）
      const task = makeTask({
        taskId: "task-mapping-1",
        status: "pending",
        progress: 0,
      });
      useVideoTaskStore.setState({ allTasks: [task] });

      mockVideoProvider.queryVideoStatus.mockResolvedValue({
        success: true,
        data: {
          status: "processing",
          progress: 60,
        },
      });

      await useVideoTaskStore.getState().pollTask("task-mapping-1");

      // mapApiStatus("processing") → "generating"，状态从 pending 转为 generating
      const updatedTask = useVideoTaskStore.getState().allTasks.find(
        (t) => t.taskId === "task-mapping-1",
      );
      expect(updatedTask!.status).toBe("generating");
      expect(updatedTask!.progress).toBe(60);

      // 未完成，cacheVideoBlob 不应被调用
      expect(mockCacheVideoBlob).not.toHaveBeenCalled();
    });

    it("queryVideoStatus 返回无 data 时设置 message 并调用 scheduleSync", async () => {
      const task = makeTask({
        taskId: "task-no-data-1",
        status: "generating",
        progress: 30,
      });
      useVideoTaskStore.setState({ allTasks: [task] });

      mockVideoProvider.queryVideoStatus.mockResolvedValue({
        success: false,
        error: "no response",
      });

      await useVideoTaskStore.getState().pollTask("task-no-data-1");

      // 状态保持 generating
      const updatedTask = useVideoTaskStore.getState().allTasks.find(
        (t) => t.taskId === "task-no-data-1",
      );
      expect(updatedTask!.status).toBe("generating");

      // scheduleSync 被调用
      expect(pollingState.syncTimeoutId).not.toBeNull();
    });
  });

  // ====================================================================
  // 测试用例 3: 轮询失败 - 网络错误
  // ====================================================================
  describe("轮询失败 - 网络错误", () => {
    it("queryVideoStatus 抛 TypeError(Failed to fetch) → 不计入 MAX_POLL_FAILURES → 状态保持 → scheduleSync 调用", async () => {
      const task = makeTask({
        taskId: "task-net-err-1",
        status: "generating",
        progress: 30,
        pollFailureCount: 0,
      });
      useVideoTaskStore.setState({ allTasks: [task] });

      const networkError = new TypeError("Failed to fetch");
      mockVideoProvider.queryVideoStatus.mockRejectedValue(networkError);

      await useVideoTaskStore.getState().pollTask("task-net-err-1");

      // queryVideoStatus 被调用
      expect(mockVideoProvider.queryVideoStatus).toHaveBeenCalledTimes(1);

      // 状态保持 generating（网络错误不计入失败）
      const updatedTask = useVideoTaskStore.getState().allTasks.find(
        (t) => t.taskId === "task-net-err-1",
      );
      expect(updatedTask).toBeDefined();
      expect(updatedTask!.status).toBe("generating");

      // pollFailureCount 未增加
      expect(updatedTask!.pollFailureCount).toBe(0);

      // persistVideoTask 被调用（保存网络错误消息）
      expect(mockSaveVideoTask).toHaveBeenCalledTimes(1);

      // scheduleSync 被调用
      expect(pollingState.syncTimeoutId).not.toBeNull();

      // 任务仍活跃，轮询继续
      expect(pollingState.isPollingScheduled).toBe(true);

      // cacheVideoBlob 不应被调用（未完成）
      expect(mockCacheVideoBlob).not.toHaveBeenCalled();
    });

    it("queryVideoStatus 抛 ERR_NETWORK 错误 → 同样不计入失败", async () => {
      const task = makeTask({
        taskId: "task-net-err-2",
        status: "generating",
        progress: 30,
        pollFailureCount: 5,
      });
      useVideoTaskStore.setState({ allTasks: [task] });

      // ERR_NETWORK 匹配 NETWORK_ERROR_PATTERNS
      const networkError = new Error("ERR_NETWORK");
      mockVideoProvider.queryVideoStatus.mockRejectedValue(networkError);

      await useVideoTaskStore.getState().pollTask("task-net-err-2");

      const updatedTask = useVideoTaskStore.getState().allTasks.find(
        (t) => t.taskId === "task-net-err-2",
      );
      expect(updatedTask!.status).toBe("generating");
      // pollFailureCount 保持不变（网络错误不计入）
      expect(updatedTask!.pollFailureCount).toBe(5);
    });
  });

  // ====================================================================
  // 测试用例 4: 轮询失败 - 非网络错误
  // ====================================================================
  describe("轮询失败 - 非网络错误", () => {
    it("queryVideoStatus 抛非网络错误 → failCount++ → 未达 MAX_POLL_FAILURES 时状态保持", async () => {
      const task = makeTask({
        taskId: "task-non-net-err-1",
        status: "generating",
        progress: 30,
        pollFailureCount: 0,
      });
      useVideoTaskStore.setState({ allTasks: [task] });

      const nonNetworkError = new Error("Internal server error");
      mockVideoProvider.queryVideoStatus.mockRejectedValue(nonNetworkError);

      await useVideoTaskStore.getState().pollTask("task-non-net-err-1");

      // 状态保持 generating
      const updatedTask = useVideoTaskStore.getState().allTasks.find(
        (t) => t.taskId === "task-non-net-err-1",
      );
      expect(updatedTask).toBeDefined();
      expect(updatedTask!.status).toBe("generating");

      // pollFailureCount 递增到 1
      expect(updatedTask!.pollFailureCount).toBe(1);

      // persistVideoTask 被调用
      expect(mockSaveVideoTask).toHaveBeenCalledTimes(1);

      // scheduleSync 被调用
      expect(pollingState.syncTimeoutId).not.toBeNull();
    });

    it(`queryVideoStatus 抛非网络错误 → 达到 MAX_POLL_FAILURES(${MAX_POLL_FAILURES}) → 转为 timeout`, async () => {
      const task = makeTask({
        taskId: "task-timeout-1",
        status: "generating",
        progress: 30,
        pollFailureCount: MAX_POLL_FAILURES - 1, // 29，再失败一次达到 30
      });
      useVideoTaskStore.setState({ allTasks: [task] });

      const nonNetworkError = new Error("Internal server error");
      mockVideoProvider.queryVideoStatus.mockRejectedValue(nonNetworkError);

      await useVideoTaskStore.getState().pollTask("task-timeout-1");

      // 状态转为 timeout（可恢复，非终态 failed）
      const updatedTask = useVideoTaskStore.getState().allTasks.find(
        (t) => t.taskId === "task-timeout-1",
      );
      expect(updatedTask).toBeDefined();
      expect(updatedTask!.status).toBe("timeout");

      // pollFailureCount 重置为 0
      expect(updatedTask!.pollFailureCount).toBe(0);

      // persistVideoTask 被调用
      expect(mockSaveVideoTask).toHaveBeenCalledTimes(1);

      // scheduleSync 被调用
      expect(pollingState.syncTimeoutId).not.toBeNull();

      // 任务不再是 pending/generating，轮询停止
      expect(pollingState.isPollingScheduled).toBe(false);

      // emitToast 发出 warning（达到 MAX_POLL_FAILURES 时通知用户）
      expect(mockEmitToast).toHaveBeenCalledWith(
        "warning",
        expect.any(String),
        expect.any(String),
      );
    });

    it("多次非网络错误逐步递增 pollFailureCount 直到达到上限", async () => {
      const task = makeTask({
        taskId: "task-incremental-1",
        status: "generating",
        progress: 30,
        pollFailureCount: MAX_POLL_FAILURES - 3, // 27
      });
      useVideoTaskStore.setState({ allTasks: [task] });

      const nonNetworkError = new Error("Server error");
      mockVideoProvider.queryVideoStatus.mockRejectedValue(nonNetworkError);

      // 第一次失败: 27 → 28
      await useVideoTaskStore.getState().pollTask("task-incremental-1");
      let updatedTask = useVideoTaskStore.getState().allTasks.find(
        (t) => t.taskId === "task-incremental-1",
      );
      expect(updatedTask!.status).toBe("generating");
      expect(updatedTask!.pollFailureCount).toBe(MAX_POLL_FAILURES - 2);

      // 第二次失败: 28 → 29
      await useVideoTaskStore.getState().pollTask("task-incremental-1");
      updatedTask = useVideoTaskStore.getState().allTasks.find(
        (t) => t.taskId === "task-incremental-1",
      );
      expect(updatedTask!.status).toBe("generating");
      expect(updatedTask!.pollFailureCount).toBe(MAX_POLL_FAILURES - 1);

      // 第三次失败: 29 → 30，达到上限，转为 timeout
      await useVideoTaskStore.getState().pollTask("task-incremental-1");
      updatedTask = useVideoTaskStore.getState().allTasks.find(
        (t) => t.taskId === "task-incremental-1",
      );
      expect(updatedTask!.status).toBe("timeout");
      expect(updatedTask!.pollFailureCount).toBe(0);
    });
  });

  // ====================================================================
  // 测试用例 5: 状态转换合法性
  // ====================================================================
  describe("状态转换合法性", () => {
    it("合法转换: generating → completed 通过 withTransitionGuard", async () => {
      const task = makeTask({
        taskId: "task-valid-trans-1",
        status: "generating",
        progress: 50,
      });
      useVideoTaskStore.setState({ allTasks: [task] });

      mockVideoProvider.queryVideoStatus.mockResolvedValue({
        success: true,
        data: {
          status: "completed",
          videoUrl: "https://example.com/valid.mp4",
          progress: 100,
        },
      });

      await useVideoTaskStore.getState().pollTask("task-valid-trans-1");

      const updatedTask = useVideoTaskStore.getState().allTasks.find(
        (t) => t.taskId === "task-valid-trans-1",
      );
      // 合法转换成功：generating → completed
      expect(updatedTask!.status).toBe("completed");
      expect(updatedTask!.videoUrl).toBe("https://example.com/valid.mp4");
    });

    it("合法转换: pending → completed（同步生成场景）", async () => {
      const task = makeTask({
        taskId: "task-pending-complete-1",
        status: "pending",
        progress: 0,
      });
      useVideoTaskStore.setState({ allTasks: [task] });

      mockVideoProvider.queryVideoStatus.mockResolvedValue({
        success: true,
        data: {
          status: "completed",
          videoUrl: "https://example.com/sync.mp4",
          progress: 100,
        },
      });

      await useVideoTaskStore.getState().pollTask("task-pending-complete-1");

      const updatedTask = useVideoTaskStore.getState().allTasks.find(
        (t) => t.taskId === "task-pending-complete-1",
      );
      // pending → completed 是合法转换（同步生成场景，服务端立即返回完成）
      expect(updatedTask!.status).toBe("completed");
    });

    it("非法转换: cancelled → completed 被 withTransitionGuard 拦截，状态保持 cancelled", async () => {
      const task = makeTask({
        taskId: "task-invalid-trans-1",
        status: "cancelled",
        progress: 0,
      });
      useVideoTaskStore.setState({ allTasks: [task] });

      mockVideoProvider.queryVideoStatus.mockResolvedValue({
        success: true,
        data: {
          status: "completed",
          videoUrl: "https://example.com/late.mp4",
          progress: 100,
        },
      });

      await useVideoTaskStore.getState().pollTask("task-invalid-trans-1");

      const updatedTask = useVideoTaskStore.getState().allTasks.find(
        (t) => t.taskId === "task-invalid-trans-1",
      );
      // 非法转换被拦截：cancelled → completed 不允许（VALID_TRANSITIONS.cancelled = []）
      expect(updatedTask!.status).toBe("cancelled");

      // withTransitionGuard 在生产环境（NODE_ENV !== "development"）返回空对象 {},
      // 不抛出异常，而是丢弃整个更新

      // cacheVideoBlob 仍在 justCompleted 检查中被调用（在 guard 之前）
      expect(mockCacheVideoBlob).toHaveBeenCalledWith(
        "task-invalid-trans-1",
        "https://example.com/late.mp4",
      );

      // persistVideoTask 仍被调用（保存原状态 + lastPolledAt）
      expect(mockSaveVideoTask).toHaveBeenCalledTimes(1);
      const persistedTask = mockSaveVideoTask.mock.calls[0]![0] as VideoTask;
      expect(persistedTask.status).toBe("cancelled");
    });

    it("非法转换: completed → generating 被拦截，状态保持 completed", async () => {
      const task = makeTask({
        taskId: "task-invalid-trans-2",
        status: "completed",
        progress: 100,
        videoUrl: "https://example.com/done.mp4",
      });
      useVideoTaskStore.setState({ allTasks: [task] });

      // 轮询返回 processing（映射为 generating），但 completed → generating 非法
      mockVideoProvider.queryVideoStatus.mockResolvedValue({
        success: true,
        data: {
          status: "processing",
          progress: 80,
        },
      });

      await useVideoTaskStore.getState().pollTask("task-invalid-trans-2");

      const updatedTask = useVideoTaskStore.getState().allTasks.find(
        (t) => t.taskId === "task-invalid-trans-2",
      );
      // completed → generating 非法，状态保持 completed
      expect(updatedTask!.status).toBe("completed");
    });
  });
});
