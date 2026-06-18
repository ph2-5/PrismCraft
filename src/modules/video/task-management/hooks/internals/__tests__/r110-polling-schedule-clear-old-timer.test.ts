/**
 * R110: 轮询引擎 schedulePolling 清除旧 timer 测试
 * 回归防护: 确保 schedulePolling 在设置新 timer 前清除旧 pollingTimeoutId，
 *           防止 timer 泄漏导致多个轮询同时运行；
 *           pollingTimeoutId 为 null 时不应抛错。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  mockEmitToast,
  mockErrorLoggerWarn,
  mockErrorLoggerError,
  mockErrorLoggerInfo,
  mockErrorLoggerDebug,
  mockErrorLoggerFatal,
  mockHandleTimedOutTasks,
  mockPollActiveTasks,
  mockCacheCompletedVideos,
  mockT,
} = vi.hoisted(() => ({
  mockEmitToast: vi.fn(),
  mockErrorLoggerWarn: vi.fn(),
  mockErrorLoggerError: vi.fn(),
  mockErrorLoggerInfo: vi.fn(),
  mockErrorLoggerDebug: vi.fn(),
  mockErrorLoggerFatal: vi.fn(),
  mockHandleTimedOutTasks: vi.fn().mockResolvedValue(undefined),
  mockPollActiveTasks: vi.fn().mockResolvedValue({
    taskUpdates: new Map(),
    cacheTasks: [],
    hasError: false,
    hasSuccess: true,
  }),
  mockCacheCompletedVideos: vi.fn().mockResolvedValue(undefined),
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
    debug: mockErrorLoggerDebug,
    fatal: mockErrorLoggerFatal,
  },
}));

vi.mock("@/shared/constants", () => ({
  t: mockT,
}));

vi.mock("../polling-task-handler", () => ({
  handleTimedOutTasks: mockHandleTimedOutTasks,
  pollActiveTasks: mockPollActiveTasks,
  cacheCompletedVideos: mockCacheCompletedVideos,
}));

vi.mock("../sync-engine", () => ({
  scheduleSync: vi.fn(),
  registerSyncStore: vi.fn(),
}));

import {
  pollingState,
  registerStore,
  schedulePolling,
  cleanupAllPollingResources,
} from "../polling-engine";
import type { VideoTask } from "@/domain/schemas";

function createMockTask(overrides: Partial<VideoTask> = {}): VideoTask {
  return {
    taskId: "task-1",
    status: "generating",
    progress: 50,
    message: "",
    createdAt: new Date().toISOString(),
    ...overrides,
  } as VideoTask;
}

function createMockStore(tasks: VideoTask[] = []) {
  let allTasks = tasks;
  return {
    getState: () => ({
      allTasks,
      setAllTasks: (
        updater: VideoTask[] | ((prev: VideoTask[]) => VideoTask[]),
      ) => {
        allTasks = typeof updater === "function" ? updater(allTasks) : updater;
      },
    }),
  };
}

describe("R110: schedulePolling 清除旧 timer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    cleanupAllPollingResources();
    const store = createMockStore([createMockTask()]);
    registerStore(store);
    mockPollActiveTasks.mockResolvedValue({
      taskUpdates: new Map(),
      cacheTasks: [],
      hasError: false,
      hasSuccess: true,
    });
  });

  afterEach(() => {
    cleanupAllPollingResources();
    vi.useRealTimers();
  });

  describe("schedulePolling 设置新 timer 前应 clearTimeout 旧 pollingTimeoutId", () => {
    it("存在旧 timer 时应调用 clearTimeout 清除", () => {
      const clearTimeoutSpy = vi.spyOn(global, "clearTimeout");

      // 设置一个旧的 timer ID
      const oldTimerId = setTimeout(() => {}, 99999);
      pollingState.pollingTimeoutId = oldTimerId;
      pollingState.isPollingScheduled = false;
      pollingState.pollingInProgress = false;

      schedulePolling();

      // 验证旧 timer 被清除
      expect(clearTimeoutSpy).toHaveBeenCalledWith(oldTimerId);
      // 验证 pollingTimeoutId 已更新为新 timer
      expect(pollingState.pollingTimeoutId).not.toBe(oldTimerId);
      expect(pollingState.pollingTimeoutId).not.toBeNull();

      clearTimeoutSpy.mockRestore();
    });

    it("新 timer 设置后 pollingTimeoutId 应指向新的 timeout 引用", () => {
      const clearTimeoutSpy = vi.spyOn(global, "clearTimeout");

      const oldTimerId = setTimeout(() => {}, 99999);
      pollingState.pollingTimeoutId = oldTimerId;
      pollingState.isPollingScheduled = false;
      pollingState.pollingInProgress = false;

      schedulePolling();

      const newTimerId = pollingState.pollingTimeoutId;
      expect(newTimerId).not.toBe(oldTimerId);
      expect(newTimerId).not.toBeNull();

      clearTimeoutSpy.mockRestore();
    });
  });

  describe("快速连续调用 schedulePolling 不应泄漏 timer", () => {
    it("第二次调用应清除第一次设置的 timer，仅保留最后一个", () => {
      const clearTimeoutSpy = vi.spyOn(global, "clearTimeout");

      // 第一次调用
      pollingState.pollingTimeoutId = null;
      pollingState.isPollingScheduled = false;
      pollingState.pollingInProgress = false;

      schedulePolling();
      const firstTimerId = pollingState.pollingTimeoutId;
      expect(firstTimerId).not.toBeNull();

      // 重置标志以允许第二次调用（模拟 poll cycle 结束后的重新调度）
      pollingState.isPollingScheduled = false;
      pollingState.pollingInProgress = false;

      // 第二次调用
      schedulePolling();
      const secondTimerId = pollingState.pollingTimeoutId;

      // 验证第一次的 timer 被清除
      expect(clearTimeoutSpy).toHaveBeenCalledWith(firstTimerId);
      // 验证仅保留最后一个 timer
      expect(secondTimerId).not.toBe(firstTimerId);
      expect(secondTimerId).not.toBeNull();

      clearTimeoutSpy.mockRestore();
    });

    it("三次连续调用后仅保留最后一个 timer", () => {
      const clearTimeoutSpy = vi.spyOn(global, "clearTimeout");

      // 第一次调用
      pollingState.pollingTimeoutId = null;
      pollingState.isPollingScheduled = false;
      pollingState.pollingInProgress = false;
      schedulePolling();
      const firstTimerId = pollingState.pollingTimeoutId;

      // 第二次调用
      pollingState.isPollingScheduled = false;
      pollingState.pollingInProgress = false;
      schedulePolling();
      const secondTimerId = pollingState.pollingTimeoutId;

      // 第三次调用
      pollingState.isPollingScheduled = false;
      pollingState.pollingInProgress = false;
      schedulePolling();
      const thirdTimerId = pollingState.pollingTimeoutId;

      // 验证前两个 timer 都被清除
      expect(clearTimeoutSpy).toHaveBeenCalledWith(firstTimerId);
      expect(clearTimeoutSpy).toHaveBeenCalledWith(secondTimerId);
      // 验证仅保留最后一个 timer
      expect(thirdTimerId).not.toBe(firstTimerId);
      expect(thirdTimerId).not.toBe(secondTimerId);
      expect(thirdTimerId).not.toBeNull();

      clearTimeoutSpy.mockRestore();
    });

    it("连续调用后只有一个 pending timer（不泄漏）", () => {
      const clearTimeoutSpy = vi.spyOn(global, "clearTimeout");

      pollingState.pollingTimeoutId = null;
      pollingState.isPollingScheduled = false;
      pollingState.pollingInProgress = false;

      // 连续调度 5 次
      const timerIds: ReturnType<typeof setTimeout>[] = [];
      for (let i = 0; i < 5; i++) {
        pollingState.isPollingScheduled = false;
        pollingState.pollingInProgress = false;
        schedulePolling();
        timerIds.push(pollingState.pollingTimeoutId!);
      }

      // 验证前 4 个 timer 都被清除
      for (let i = 0; i < 4; i++) {
        expect(clearTimeoutSpy).toHaveBeenCalledWith(timerIds[i]);
      }

      // 验证当前 pollingTimeoutId 是最后一个
      expect(pollingState.pollingTimeoutId).toBe(timerIds[4]);

      // 验证所有 timer ID 不相同（每个都是新的）
      const uniqueIds = new Set(timerIds);
      expect(uniqueIds.size).toBe(5);

      clearTimeoutSpy.mockRestore();
    });
  });

  describe("pollingTimeoutId 为 null 时不应抛错", () => {
    it("pollingTimeoutId 为 null 时调用 schedulePolling 不抛异常", () => {
      const clearTimeoutSpy = vi.spyOn(global, "clearTimeout");

      pollingState.pollingTimeoutId = null;
      pollingState.isPollingScheduled = false;
      pollingState.pollingInProgress = false;

      expect(() => schedulePolling()).not.toThrow();

      // null 时不应该调用 clearTimeout
      expect(clearTimeoutSpy).not.toHaveBeenCalled();
      // 但应该设置了新的 timer
      expect(pollingState.pollingTimeoutId).not.toBeNull();

      clearTimeoutSpy.mockRestore();
    });

    it("pollingTimeoutId 为 null 时应正常设置新 timer", () => {
      pollingState.pollingTimeoutId = null;
      pollingState.isPollingScheduled = false;
      pollingState.pollingInProgress = false;

      schedulePolling();

      expect(pollingState.pollingTimeoutId).not.toBeNull();
      expect(pollingState.isPollingScheduled).toBe(true);
    });
  });
});
