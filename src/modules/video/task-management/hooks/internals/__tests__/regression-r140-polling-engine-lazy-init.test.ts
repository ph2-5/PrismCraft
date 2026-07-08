/**
 * R140: polling-engine 必须惰性初始化
 * 回归防护: 确保 polling-engine.ts 不在模块级执行副作用（如 window 全局变量赋值），
 *           必须通过 initPollingEngine() 惰性初始化。
 *
 * 攻击场景：若 polling-engine 在模块加载时立即设置 window.__VIDEO_TASK_POLLING_STATE__，
 * 则在 SSR 环境（无 window）或测试环境中会抛出异常。更重要的是，模块级副作用
 * 会导致多个 polling-engine 实例冲突，定时器和事件监听器泄漏。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// 提升 mock
const {
  mockEmitToast,
  mockErrorLogger,
  mockT,
  mockHandleTimedOutTasks,
  mockPollActiveTasks,
  mockCacheCompletedVideos,
} = vi.hoisted(() => ({
  mockEmitToast: vi.fn(),
  mockErrorLogger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
  },
  mockT: vi.fn((key: string) => key),
  mockHandleTimedOutTasks: vi.fn().mockResolvedValue(undefined),
  mockPollActiveTasks: vi.fn().mockResolvedValue({
    taskUpdates: new Map(),
    cacheTasks: [],
    hasError: false,
    hasSuccess: true,
  }),
  mockCacheCompletedVideos: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/shared/utils/toast-bridge", () => ({
  emitToast: mockEmitToast,
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: mockErrorLogger,
}));

vi.mock("@/shared/constants", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/constants")>();
  return { ...actual, t: mockT };
});

vi.mock("../polling-task-handler", () => ({
  handleTimedOutTasks: mockHandleTimedOutTasks,
  pollActiveTasks: mockPollActiveTasks,
  cacheCompletedVideos: mockCacheCompletedVideos,
}));

vi.mock("../polling-constants", () => ({
  MAX_POLL_COUNT: 100,
  MAX_POLL_DURATION: 300000,
  MAX_POLL_FAILURES: 10,
}));

vi.mock("../sync-engine", () => ({
  scheduleSync: vi.fn(),
  registerSyncStore: vi.fn(),
}));

describe("R140: polling-engine 惰性初始化", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    // 清理 window 全局变量
    delete (window as unknown as Record<string, unknown>).__VIDEO_TASK_POLLING_STATE__;
  });

  afterEach(() => {
    // 清理 window 全局变量
    delete (window as unknown as Record<string, unknown>).__VIDEO_TASK_POLLING_STATE__;
  });

  it("模块导入后不应设置 window.__VIDEO_TASK_POLLING_STATE__", async () => {
    // 导入模块（不应触发副作用）
    await import("../polling-engine");

    // window 全局变量不应被设置
    expect(
      (window as unknown as Record<string, unknown>).__VIDEO_TASK_POLLING_STATE__,
    ).toBeUndefined();
  });

  it("调用 initPollingEngine() 后应设置 window.__VIDEO_TASK_POLLING_STATE__", async () => {
    const { initPollingEngine, pollingState } = await import("../polling-engine");

    // 调用前未设置
    expect(
      (window as unknown as Record<string, unknown>).__VIDEO_TASK_POLLING_STATE__,
    ).toBeUndefined();

    initPollingEngine();

    // 调用后应设置
    expect(
      (window as unknown as Record<string, unknown>).__VIDEO_TASK_POLLING_STATE__,
    ).toBeDefined();
    expect(
      (window as unknown as Record<string, unknown>).__VIDEO_TASK_POLLING_STATE__,
    ).toBe(pollingState);
  });

  it("initPollingEngine() 重复调用应是幂等的", async () => {
    const { initPollingEngine, pollingState } = await import("../polling-engine");

    initPollingEngine();
    const firstState = (window as unknown as Record<string, unknown>).__VIDEO_TASK_POLLING_STATE__;

    // 再次调用不应改变状态
    initPollingEngine();
    const secondState = (window as unknown as Record<string, unknown>).__VIDEO_TASK_POLLING_STATE__;

    expect(secondState).toBe(firstState);
    expect(secondState).toBe(pollingState);
  });

  it("initPollingEngine 应已导出", async () => {
    const mod = await import("../polling-engine");
    expect(mod.initPollingEngine).toBeDefined();
    expect(typeof mod.initPollingEngine).toBe("function");
  });

  it("pollingState 应已导出且包含所有必要字段", async () => {
    const { pollingState } = await import("../polling-engine");
    expect(pollingState).toBeDefined();
    expect(pollingState).toHaveProperty("pollingTimeoutId");
    expect(pollingState).toHaveProperty("syncTimeoutId");
    expect(pollingState).toHaveProperty("pollCount");
    expect(pollingState).toHaveProperty("isPollingScheduled");
    expect(pollingState).toHaveProperty("pollingInProgress");
  });

  it("模块导入不应触发定时器创建", async () => {
    const setTimeoutSpy = vi.spyOn(global, "setTimeout");

    await import("../polling-engine");

    // 模块导入不应创建任何定时器
    expect(setTimeoutSpy).not.toHaveBeenCalled();

    setTimeoutSpy.mockRestore();
  });

  it("模块导入不应注册事件监听器", async () => {
    const addEventListenerSpy = vi.spyOn(window, "addEventListener");
    const docAddEventListenerSpy = vi.spyOn(document, "addEventListener");

    await import("../polling-engine");

    // 模块导入不应注册任何事件监听器
    expect(addEventListenerSpy).not.toHaveBeenCalled();
    expect(docAddEventListenerSpy).not.toHaveBeenCalled();

    addEventListenerSpy.mockRestore();
    docAddEventListenerSpy.mockRestore();
  });
});
