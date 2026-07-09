/**
 * R111: 视频恢复单次通知测试
 *
 * 回归规则: src/modules/video/recovery/services/video-recovery-service.ts 中的
 * recoverVideoByTaskId 在恢复成功时应恰好 dispatch 一次 "video-task-recovered" 事件。
 *
 * 不应直接调用 recoverTask（避免双重通知），恢复成功后应通过 updateVideoTask 更新 storage。
 *
 * 测试场景:
 * 1. 恢复成功时应恰好 dispatch 一次 "video-task-recovered" 事件
 * 2. 不应直接调用 recoverTask（避免双重通知）
 * 3. 恢复成功后应更新 storage
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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
    // recoverTask 不应被调用（避免双重通知）
    recoverTask: vi.fn<(taskId: string) => Promise<unknown>>(),
  },
  mockVideoProvider: {
    queryVideoStatus: vi.fn<(taskId: string, options?: Record<string, unknown>) => Promise<unknown>>(),
  },
  mockTaskMachine: {
    canTransition: vi.fn<() => boolean>(),
    transition: vi.fn<(task: Record<string, unknown>, targetStatus: string, context?: Record<string, unknown>) => unknown>(),
    isTerminal: vi.fn<() => boolean>(),
  },
  mockCacheVideoBlob: vi
    .fn<(taskId: string, videoUrl: string) => Promise<unknown>>()
    .mockResolvedValue({ ok: true, value: true }),
  mockIsValidTransition: vi.fn<() => boolean>(),
  mockIsStuck: vi.fn<() => boolean>(),
}));

vi.mock("@/infrastructure/di", () => ({
  container: {
    videoTaskStorage: mockVideoTaskStorage,
    videoProvider: mockVideoProvider,
  },
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
  extractErrorMessage: vi.fn((e: unknown) => (e instanceof Error ? e.message : String(e))),
}));

vi.mock("@/modules/video/task-management", () => ({
  TaskMachine: mockTaskMachine,
  isValidTransition: mockIsValidTransition,
  isStuck: mockIsStuck,
  STUCK_TASK_THRESHOLD_MS: 30 * 60 * 1000,
}));

// P1-2 修复：mock verifyVideoUrl 避免真实 fetch 调用
vi.mock("../video-verification-service", () => ({
  verifyVideoUrl: vi.fn().mockResolvedValue({
    ok: true,
    value: { isValid: true, reason: "mock valid", details: {}, confidence: "high" },
  }),
}));

import { recoverVideoByTaskId, registerCacheVideoBlobFn } from "../video-recovery-service";
import type { Result } from "@/domain/types/result";

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

describe("R111: 视频恢复单次通知", () => {
  let dispatchEventSpy: ReturnType<typeof vi.spyOn>;

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
      }),
    );
    mockIsValidTransition.mockReturnValue(true);
    mockIsStuck.mockReturnValue(false);
    mockCacheVideoBlob.mockResolvedValue({ ok: true, value: true });
    registerCacheVideoBlobFn(
      mockCacheVideoBlob as unknown as (taskId: string, videoUrl: string) => Promise<Result<boolean>>,
    );

    dispatchEventSpy = vi.spyOn(window, "dispatchEvent");
  });

  afterEach(() => {
    dispatchEventSpy.mockRestore();
  });

  it("恢复成功时应恰好 dispatch 一次 video-task-recovered 事件", async () => {
    mockVideoTaskStorage.getVideoTaskById.mockResolvedValue(
      createMockTask({ status: "failed" }),
    );
    mockVideoProvider.queryVideoStatus.mockResolvedValue({
      success: true,
      data: { status: "done", videoUrl: "https://example.com/recovered.mp4" },
    });

    await recoverVideoByTaskId("task-1");

    expect(dispatchEventSpy).toHaveBeenCalledTimes(1);
    const event = dispatchEventSpy.mock.calls[0]![0] as CustomEvent;
    expect(event.type).toBe("video-task-recovered");
    expect(event.detail).toEqual({
      taskId: "task-1",
      status: "completed",
      videoUrl: "https://example.com/recovered.mp4",
    });
  });

  it("不应直接调用 recoverTask（避免双重通知）", async () => {
    mockVideoTaskStorage.getVideoTaskById.mockResolvedValue(
      createMockTask({ status: "failed" }),
    );
    mockVideoProvider.queryVideoStatus.mockResolvedValue({
      success: true,
      data: { status: "done", videoUrl: "https://example.com/recovered.mp4" },
    });

    await recoverVideoByTaskId("task-1");

    // recoverTask 不应被调用
    expect(mockVideoTaskStorage.recoverTask).not.toHaveBeenCalled();
    // 应通过 updateVideoTask 更新 storage
    expect(mockVideoTaskStorage.updateVideoTask).toHaveBeenCalledTimes(1);
  });

  it("恢复成功后应更新 storage", async () => {
    mockVideoTaskStorage.getVideoTaskById.mockResolvedValue(
      createMockTask({ status: "failed" }),
    );
    mockVideoProvider.queryVideoStatus.mockResolvedValue({
      success: true,
      data: { status: "done", videoUrl: "https://example.com/recovered.mp4" },
    });

    const result = await recoverVideoByTaskId("task-1");

    expect(result.ok).toBe(true);
    expect(mockVideoTaskStorage.updateVideoTask).toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({
        status: "completed",
        videoUrl: "https://example.com/recovered.mp4",
      }),
    );
  });

  it("任务已完成时不应 dispatch 事件", async () => {
    mockVideoTaskStorage.getVideoTaskById.mockResolvedValue(
      createMockTask({ status: "completed", videoUrl: "https://example.com/existing.mp4" }),
    );

    await recoverVideoByTaskId("task-1");

    // 已完成的任务直接返回，不触发恢复流程
    expect(dispatchEventSpy).not.toHaveBeenCalled();
    expect(mockVideoProvider.queryVideoStatus).not.toHaveBeenCalled();
  });

  it("恢复失败时不应 dispatch 事件", async () => {
    mockVideoTaskStorage.getVideoTaskById.mockResolvedValue(
      createMockTask({ status: "failed" }),
    );
    mockVideoProvider.queryVideoStatus.mockResolvedValue({
      success: true,
      data: { status: "failed" },
    });

    const result = await recoverVideoByTaskId("task-1");

    expect(result.ok).toBe(false);
    expect(dispatchEventSpy).not.toHaveBeenCalled();
  });
});
