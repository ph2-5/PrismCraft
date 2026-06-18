/**
 * R114: 恢复任务时间戳 NaN 校验测试
 *
 * 回归规则目的：
 *   startBackgroundRecovery 在过滤可恢复任务时，必须校验 createdAt 和 lastPolledAt
 *   时间戳的有效性，防止 NaN 导致错误判断。
 *   - createdAt 为无效日期时任务应被排除（不进入恢复列表）
 *   - createdAt 为有效日期时正常过滤
 *   - lastPolledAt 为无效日期时应使用 POLL_INTERVAL_MS 作为默认间隔
 *   - NaN createdAt 任务应记录 warn 日志
 *
 * 被测代码：
 *   src/modules/video/recovery/services/video-recovery-service.ts 中的
 *   startBackgroundRecovery 的 eligibleTasks 过滤逻辑
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Result } from "@/domain/types/result";

const {
  mockVideoTaskStorage,
  mockVideoProvider,
  mockTaskMachine,
  mockCacheVideoBlob,
  mockIsValidTransition,
  mockIsStuck,
  mockErrorLogger,
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
  mockErrorLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/infrastructure/storage/video-tasks", () => ({}));

vi.mock("@/infrastructure/di", () => ({
  container: {
    videoTaskStorage: mockVideoTaskStorage,
    videoProvider: mockVideoProvider,
  },
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: mockErrorLogger,
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

import { startBackgroundRecovery, registerCacheVideoBlobFn } from "../video-recovery-service";

function createMockTask(overrides: Record<string, unknown> = {}) {
  return {
    taskId: "task-1",
    status: "failed",
    progress: 0,
    message: "",
    createdAt: new Date().toISOString(),
    pollCount: 0,
    recoveryAttempts: 0,
    lastPolledAt: new Date(Date.now() - 120000).toISOString(),
    providerId: "volcengine",
    providerModelId: "model-1",
    providerFormat: "openai",
    ...overrides,
  };
}

describe("R114: 恢复任务时间戳 NaN 校验", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTaskMachine.canTransition.mockReturnValue(true);
    mockTaskMachine.isTerminal.mockReturnValue(false);
    mockTaskMachine.transition.mockImplementation(
      (task: Record<string, unknown>, targetStatus: string, context?: Record<string, unknown>) => ({
        ok: true,
        value: {
          ...task,
          status: targetStatus,
          updatedAt: new Date().toISOString(),
          videoUrl: context?.videoUrl,
          progress: targetStatus === "completed" ? 100 : task.progress,
          message: "",
        },
      })
    );
    mockIsValidTransition.mockReturnValue(true);
    mockIsStuck.mockReturnValue(false);
    registerCacheVideoBlobFn(mockCacheVideoBlob as unknown as (taskId: string, videoUrl: string) => Promise<Result<boolean>>);

    // 默认返回空数组，避免 stuck 任务检测干扰
    mockVideoTaskStorage.getVideoTasks.mockResolvedValue([]);
    // 默认 queryVideoStatus 返回 generating，使 recoverVideoByTaskId 不抛错
    mockVideoProvider.queryVideoStatus.mockResolvedValue({
      success: true,
      data: { status: "generating" },
    });
  });

  it("createdAt 为无效日期时任务应被排除（不进入恢复列表）", async () => {
    const nanTask = createMockTask({
      taskId: "nan-created-task",
      createdAt: "not-a-valid-date",
      lastPolledAt: new Date(Date.now() - 120000).toISOString(),
    });
    mockVideoTaskStorage.getVideoTasksByStatus
      .mockResolvedValueOnce([nanTask])
      .mockResolvedValueOnce([]);

    await startBackgroundRecovery();

    // queryVideoStatus 不应被调用，说明 NaN createdAt 任务被排除
    expect(mockVideoProvider.queryVideoStatus).not.toHaveBeenCalled();
  });

  it("createdAt 为有效日期时正常过滤", async () => {
    const validTask = createMockTask({
      taskId: "valid-created-task",
      createdAt: new Date().toISOString(),
      lastPolledAt: new Date(Date.now() - 120000).toISOString(),
      recoveryAttempts: 0,
    });
    mockVideoTaskStorage.getVideoTasksByStatus
      .mockResolvedValueOnce([validTask])
      .mockResolvedValueOnce([]);
    mockVideoTaskStorage.getVideoTaskById.mockResolvedValue(validTask);

    await startBackgroundRecovery();

    // queryVideoStatus 应被调用，说明有效 createdAt 任务进入恢复列表
    expect(mockVideoProvider.queryVideoStatus).toHaveBeenCalledWith(
      "valid-created-task",
      expect.any(Object),
    );
  });

  it("lastPolledAt 为无效日期时应使用 POLL_INTERVAL_MS 作为默认间隔", async () => {
    // lastPolledAt 为无效日期时，timeSinceLastPoll 应使用 POLL_INTERVAL_MS (60000ms)
    // 由于 timeSinceLastPoll < POLL_INTERVAL_MS 为 false (60000 < 60000 = false)，
    // 任务应通过此过滤条件，进入恢复列表
    const nanLastPolledTask = createMockTask({
      taskId: "nan-last-polled-task",
      createdAt: new Date().toISOString(),
      lastPolledAt: "invalid-date-string",
      recoveryAttempts: 0,
    });
    mockVideoTaskStorage.getVideoTasksByStatus
      .mockResolvedValueOnce([nanLastPolledTask])
      .mockResolvedValueOnce([]);
    mockVideoTaskStorage.getVideoTaskById.mockResolvedValue(nanLastPolledTask);

    await startBackgroundRecovery();

    // queryVideoStatus 应被调用，说明 NaN lastPolledAt 任务未被排除
    // （使用了 POLL_INTERVAL_MS 作为默认间隔，通过了时间间隔检查）
    expect(mockVideoProvider.queryVideoStatus).toHaveBeenCalledWith(
      "nan-last-polled-task",
      expect.any(Object),
    );
  });

  it("NaN createdAt 任务应记录 warn 日志", async () => {
    const nanTask = createMockTask({
      taskId: "nan-warn-task",
      createdAt: "not-a-valid-date",
      lastPolledAt: new Date(Date.now() - 120000).toISOString(),
    });
    mockVideoTaskStorage.getVideoTasksByStatus
      .mockResolvedValueOnce([nanTask])
      .mockResolvedValueOnce([]);

    await startBackgroundRecovery();

    // 应记录 warn 日志，包含 NaN 时间戳信息
    expect(mockErrorLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining("NaN 时间戳任务"),
    );
    expect(mockErrorLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining("nan-warn-task"),
    );
  });
});
