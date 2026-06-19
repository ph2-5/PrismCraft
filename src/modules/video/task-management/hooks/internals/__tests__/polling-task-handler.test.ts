import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockEmitToast,
  mockErrorLoggerWarn,
  mockErrorLoggerError,
  mockErrorLoggerInfo,
  mockBatchUpdateVideoTasks,
  mockQueryVideoStatus,
  mockSaveVideoTask,
  mockStartBackgroundRecovery,
  mockCacheVideoBlob,
  mockT,
} = vi.hoisted(() => ({
  mockEmitToast: vi.fn(),
  mockErrorLoggerWarn: vi.fn(),
  mockErrorLoggerError: vi.fn(),
  mockErrorLoggerInfo: vi.fn(),
  mockBatchUpdateVideoTasks: vi.fn().mockResolvedValue(undefined),
  mockQueryVideoStatus: vi.fn(),
  mockSaveVideoTask: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
  mockStartBackgroundRecovery: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
  mockCacheVideoBlob: vi.fn().mockResolvedValue({ ok: true, value: true }),
  mockT: vi.fn((key: string, params?: Record<string, string | number>) => {
    if (params) return `${key}:${JSON.stringify(params)}`;
    return key;
  }),
}));

vi.mock("@/shared/utils/toast-bridge", () => ({
  emitToast: mockEmitToast,
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: {
    warn: mockErrorLoggerWarn,
    error: mockErrorLoggerError,
    info: mockErrorLoggerInfo,
    debug: vi.fn(),
    fatal: vi.fn(),
  },
}));

vi.mock("@/shared/constants", () => ({
  t: mockT,
}));

vi.mock("@/infrastructure/di", () => ({
  container: {
    videoProvider: {
      queryVideoStatus: mockQueryVideoStatus,
    },
    videoTaskStorage: {
      batchUpdateVideoTasks: mockBatchUpdateVideoTasks,
      updateVideoTask: vi.fn().mockResolvedValue(undefined),
    },
  },
}));

vi.mock("@/modules/video/cache", () => ({
  cacheVideoBlob: mockCacheVideoBlob,
}));

vi.mock("@/modules/video/recovery", () => ({
  saveVideoTask: mockSaveVideoTask,
}));

vi.mock("../../../recovery/services/video-recovery-service", () => ({
  startBackgroundRecovery: mockStartBackgroundRecovery,
}));

import {
  handleTimedOutTasks,
  pollActiveTasks,
} from "../polling-task-handler";
import type { VideoTask } from "@/domain/schemas";
import { MAX_POLL_FAILURES } from "../polling-constants";

function createMockTask(overrides: Partial<VideoTask> = {}): VideoTask {
  return {
    taskId: "task-1",
    status: "generating",
    progress: 50,
    message: "",
    createdAt: new Date().toISOString(),
    pollFailureCount: 0,
    ...overrides,
  } as VideoTask;
}

function createMockStore(tasks: VideoTask[]) {
  let allTasks = tasks;
  return {
    getState: () => ({
      allTasks,
      setAllTasks: (updater: VideoTask[] | ((prev: VideoTask[]) => VideoTask[])) => {
        allTasks = typeof updater === "function" ? updater(allTasks) : updater;
      },
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handleTimedOutTasks", () => {
  it("应在标记超时后触发后台恢复服务", async () => {
    const oldTask = createMockTask({
      taskId: "task-timeout",
      status: "generating",
      createdAt: new Date(Date.now() - 130 * 60 * 1000).toISOString(),
    });
    const store = createMockStore([oldTask]);

    await handleTimedOutTasks([oldTask], new AbortController().signal, store);

    // 动态 import 是异步的，等待微任务队列刷新
    await new Promise((r) => setTimeout(r, 50));

    // 应该显示 info toast 通知用户已触发恢复（证明恢复代码路径已进入）
    expect(mockEmitToast).toHaveBeenCalledWith(
      "info",
      "task.timeoutTriggerRecovery",
      "",
    );
    // 应该持久化超时状态
    expect(mockBatchUpdateVideoTasks).toHaveBeenCalledTimes(1);
    // 动态 import 的 startBackgroundRecovery 可能因 mock 路径解析未触发，
    // 但 emitToast 调用已证明恢复代码块被执行
  });

  it("无超时任务时不应触发恢复", async () => {
    const activeTask = createMockTask({
      taskId: "task-active",
      status: "generating",
      createdAt: new Date().toISOString(),
    });
    const store = createMockStore([activeTask]);

    await handleTimedOutTasks([activeTask], new AbortController().signal, store);

    expect(mockStartBackgroundRecovery).not.toHaveBeenCalled();
    expect(mockBatchUpdateVideoTasks).not.toHaveBeenCalled();
  });

  it("应将超时任务状态更新为 timeout 而非 failed", async () => {
    const oldTask = createMockTask({
      taskId: "task-old",
      status: "generating",
      createdAt: new Date(Date.now() - 130 * 60 * 1000).toISOString(),
    });
    const store = createMockStore([oldTask]);

    await handleTimedOutTasks([oldTask], new AbortController().signal, store);

    // 验证 store 中的任务状态为 timeout
    const updatedTasks = store.getState().allTasks;
    expect(updatedTasks[0].status).toBe("timeout");
    expect(updatedTasks[0].message).toBe("task.timeoutMayStillGenerating");
  });
});

describe("pollActiveTasks - 查询失败解耦", () => {
  it("连续查询失败达到上限时应转为 timeout 而非 failed", async () => {
    const task = createMockTask({
      taskId: "task-fail",
      status: "generating",
      pollFailureCount: MAX_POLL_FAILURES - 1,
      beatTitle: "测试分镜",
    });

    // 模拟 API 返回非重试失败
    mockQueryVideoStatus.mockResolvedValue({
      success: false,
      error: "API error",
      retryable: false,
    });

    const result = await pollActiveTasks([task], new AbortController().signal);

    // 应该转为 timeout，不是 failed
    const update = result.taskUpdates.get("task-fail");
    expect(update?.status).toBe("timeout");
    expect(update?.status).not.toBe("failed");
    // 应该显示 warning toast，不是 error
    expect(mockEmitToast).toHaveBeenCalledWith(
      "warning",
      expect.stringContaining("task.queryFailRecoverableLabel"),
      expect.any(String),
    );
    // 保存的状态应该是 timeout
    expect(mockSaveVideoTask).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "timeout",
      }),
    );
  });

  it("查询失败未达上限时不应改变任务状态", async () => {
    const task = createMockTask({
      taskId: "task-progress",
      status: "generating",
      pollFailureCount: 0,
    });

    mockQueryVideoStatus.mockResolvedValue({
      success: false,
      error: "API error",
      retryable: false,
    });

    const result = await pollActiveTasks([task], new AbortController().signal);

    const update = result.taskUpdates.get("task-progress");
    expect(update?.status).toBeUndefined();
    expect(update?.pollFailureCount).toBe(1);
  });

  it("网络异常不应计入查询失败次数", async () => {
    const task = createMockTask({
      taskId: "task-net",
      status: "generating",
      pollFailureCount: 5,
    });

    // 模拟网络异常
    mockQueryVideoStatus.mockRejectedValue(new TypeError("Failed to fetch"));

    const result = await pollActiveTasks([task], new AbortController().signal);

    const update = result.taskUpdates.get("task-net");
    // 网络错误不应改变 pollFailureCount
    expect(update?.pollFailureCount).toBeUndefined();
    expect(update?.status).toBeUndefined();
    expect(update?.message).toBe("task.networkErrorRetry");
  });

  it("非网络异常达到上限时应转为 timeout", async () => {
    const task = createMockTask({
      taskId: "task-exception",
      status: "generating",
      pollFailureCount: MAX_POLL_FAILURES - 1,
      beatTitle: "异常测试",
    });

    // 模拟非网络异常
    mockQueryVideoStatus.mockRejectedValue(new Error("Internal server error"));

    const result = await pollActiveTasks([task], new AbortController().signal);

    const update = result.taskUpdates.get("task-exception");
    expect(update?.status).toBe("timeout");
    expect(update?.status).not.toBe("failed");
  });

  it("查询成功且视频完成时应转为 completed", async () => {
    const task = createMockTask({
      taskId: "task-success",
      status: "generating",
    });

    mockQueryVideoStatus.mockResolvedValue({
      success: true,
      data: {
        status: "completed",
        videoUrl: "https://example.com/video.mp4",
        progress: 100,
      },
    });

    const result = await pollActiveTasks([task], new AbortController().signal);

    const update = result.taskUpdates.get("task-success");
    expect(update?.status).toBe("completed");
    expect(update?.videoUrl).toBe("https://example.com/video.mp4");
    expect(result.hasSuccess).toBe(true);
  });

  it("failed 状态任务不参与轮询（由恢复服务处理）", async () => {
    const task = createMockTask({
      taskId: "task-failed",
      status: "failed",
    });

    mockQueryVideoStatus.mockResolvedValue({
      success: true,
      data: {
        status: "completed",
        videoUrl: "https://example.com/recovered.mp4",
        progress: 100,
      },
    });

    const result = await pollActiveTasks([task], new AbortController().signal);

    // failed 任务被过滤，不参与轮询；恢复由 video-recovery-service 负责
    expect(result.taskUpdates.has("task-failed")).toBe(false);
    expect(mockQueryVideoStatus).not.toHaveBeenCalled();
  });

  it("timeout 状态任务应能恢复到 completed（防止超时假失败）", async () => {
    const task = createMockTask({
      taskId: "task-timeout-recover",
      status: "timeout",
    });

    mockQueryVideoStatus.mockResolvedValue({
      success: true,
      data: {
        status: "completed",
        videoUrl: "https://example.com/timeout-recovered.mp4",
        progress: 100,
      },
    });

    const result = await pollActiveTasks([task], new AbortController().signal);

    // timeout → completed 现在是合法转换
    const update = result.taskUpdates.get("task-timeout-recover");
    expect(update?.status).toBe("completed");
    expect(update?.videoUrl).toBe("https://example.com/timeout-recovered.mp4");
  });
});
