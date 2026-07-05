/**
 * R117: setup 函数必须幂等测试
 *
 * 回归规则目的：
 *   task-initializer.ts 中的4个 setup 函数必须幂等：
 *     - setupRecoveredEventListener
 *     - setupBackgroundRecoveryInterval
 *     - setupCacheCleanupInterval
 *     - setupBeforeUnloadHandler
 *   重复调用时必须先清理旧资源（removeEventListener/clearInterval），
 *   避免重复注册导致：
 *     1) 同一事件被处理多次（recoverTask 重复触发）
 *     2) 多个 interval 并行运行（重复执行后台恢复/清理）
 *     3) beforeunload 触发多次（重复保存）
 *
 * 被测代码：
 *   src/modules/video/task-management/hooks/internals/task-initializer.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  mockStartBackgroundRecovery,
  mockCleanExpiredTasks,
  mockCleanExpiredVideoCache,
  mockErrorLogger,
  mockExtractErrorMessage,
  mockEmitToast,
  mockT,
  mockIsElectron,
  mockContainer,
  mockCheckAndStartOrStopPolling,
} = vi.hoisted(() => ({
  mockStartBackgroundRecovery: vi.fn().mockResolvedValue(undefined),
  mockCleanExpiredTasks: vi.fn().mockResolvedValue({ ok: true, value: 0 }),
  mockCleanExpiredVideoCache: vi.fn().mockResolvedValue({ ok: true, value: 0 }),
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
  mockT: vi.fn((key: string, params?: Record<string, string | number>) => {
    if (params) return `${key}:${JSON.stringify(params)}`;
    return key;
  }),
  mockIsElectron: vi.fn(() => true),
  mockContainer: {
    videoTaskStorage: {
      getVideoTasks: vi.fn().mockResolvedValue([]),
    },
  },
  mockCheckAndStartOrStopPolling: vi.fn(),
}));

vi.mock("@/infrastructure/di", () => ({
  container: mockContainer,
}));

vi.mock("@/modules/video/recovery", () => ({
  startBackgroundRecovery: mockStartBackgroundRecovery,
  cleanExpiredTasks: mockCleanExpiredTasks,
}));

vi.mock("@/modules/video/cache", () => ({
  cleanExpiredVideoCache: mockCleanExpiredVideoCache,
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: mockErrorLogger,
  extractErrorMessage: mockExtractErrorMessage,
}));

vi.mock("@/shared/utils/toast-bridge", () => ({
  emitToast: mockEmitToast,
}));

vi.mock("@/shared/constants", () => ({
  t: mockT,
}));

vi.mock("@/shared/utils/platform", () => ({
  isElectron: mockIsElectron,
}));

vi.mock("@/config/ports", () => ({
  API_SERVER_PORT: 19700,
}));

vi.mock("@/domain/types/result", () => ({
  AppError: class AppError extends Error {
    code: string;
    constructor(code: string, message: string, _cause?: unknown) {
      super(message);
      this.code = code;
    }
  },
}));

vi.mock("../polling-engine", () => ({
  pollingState: {
    pollingTimeoutId: null as ReturnType<typeof setTimeout> | null,
    syncTimeoutId: null as ReturnType<typeof setTimeout> | null,
    recoveryIntervalId: null as ReturnType<typeof setInterval> | null,
    cacheCleanupIntervalId: null as ReturnType<typeof setInterval> | null,
    beforeUnloadHandler: null as ((e: BeforeUnloadEvent) => void) | null,
    recoveredEventHandler: null as ((e: Event) => void) | null,
    visibilityHandler: null as ((e: Event) => void) | null,
    pollCount: 0,
    pollInterval: 15000,
    isSyncing: false,
    isPollingScheduled: false,
    isInitializing: false,
    pollingInProgress: false,
    abortController: null as AbortController | null,
    consecutiveErrors: 0,
  },
  checkAndStartOrStopPolling: mockCheckAndStartOrStopPolling,
}));

import {
  setupRecoveredEventListener,
  setupBackgroundRecoveryInterval,
  setupCacheCleanupInterval,
  setupBeforeUnloadHandler,
  type StoreAccessor,
} from "../task-initializer";

// 由于 pollingState 是从 mock 中导出的字面量对象，我们需要直接引用它
// 通过再次 import 获取同一引用
import { pollingState } from "../polling-engine";

function createMockStore(): StoreAccessor {
  return {
    getState: () => ({
      allTasks: [],
      recoverTask: vi.fn(),
    }),
    set: vi.fn(),
  } as unknown as StoreAccessor;
}

describe("R117: setup 函数必须幂等", () => {
  let addEventListenerSpy: ReturnType<typeof vi.spyOn>;
  let removeEventListenerSpy: ReturnType<typeof vi.spyOn>;
  let setIntervalSpy: ReturnType<typeof vi.spyOn>;
  let clearIntervalSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();

    // 重置 pollingState
    pollingState.recoveryIntervalId = null;
    pollingState.cacheCleanupIntervalId = null;
    pollingState.beforeUnloadHandler = null;
    pollingState.recoveredEventHandler = null;

    // spy window 事件监听器
    addEventListenerSpy = vi.spyOn(window, "addEventListener");
    removeEventListenerSpy = vi.spyOn(window, "removeEventListener");
    setIntervalSpy = vi.spyOn(global, "setInterval");
    clearIntervalSpy = vi.spyOn(global, "clearInterval");

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    addEventListenerSpy.mockRestore();
    removeEventListenerSpy.mockRestore();
    setIntervalSpy.mockRestore();
    clearIntervalSpy.mockRestore();

    // 清理 pollingState
    pollingState.recoveryIntervalId = null;
    pollingState.cacheCleanupIntervalId = null;
    pollingState.beforeUnloadHandler = null;
    pollingState.recoveredEventHandler = null;
  });

  describe("setupRecoveredEventListener 幂等性", () => {
    it("重复调用时，应先移除旧监听器再添加新的", () => {
      const store = createMockStore();

      // 第一次调用：注册监听器
      setupRecoveredEventListener(store);

      expect(addEventListenerSpy).toHaveBeenCalledTimes(1);
      expect(addEventListenerSpy).toHaveBeenCalledWith(
        "video-task-recovered",
        expect.any(Function),
      );
      const firstHandler = pollingState.recoveredEventHandler;
      expect(firstHandler).not.toBeNull();

      // 第二次调用：应先移除旧监听器
      setupRecoveredEventListener(store);

      // removeEventListener 应被调用一次（移除第一次的 handler）
      expect(removeEventListenerSpy).toHaveBeenCalledTimes(1);
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        "video-task-recovered",
        firstHandler,
      );
      // addEventListener 应被调用两次（第一次 + 第二次）
      expect(addEventListenerSpy).toHaveBeenCalledTimes(2);
      // handler 应被替换为新的
      const secondHandler = pollingState.recoveredEventHandler;
      expect(secondHandler).not.toBeNull();
      expect(secondHandler).not.toBe(firstHandler);
    });

    it("三次重复调用后，window 上只有一个活跃监听器（前两个被移除）", () => {
      const store = createMockStore();

      setupRecoveredEventListener(store);
      const handler1 = pollingState.recoveredEventHandler;

      setupRecoveredEventListener(store);
      const handler2 = pollingState.recoveredEventHandler;

      setupRecoveredEventListener(store);
      const handler3 = pollingState.recoveredEventHandler;

      // 三个 handler 应互不相同
      expect(handler1).not.toBe(handler2);
      expect(handler2).not.toBe(handler3);
      expect(handler1).not.toBe(handler3);

      // addEventListener 应被调用 3 次
      expect(addEventListenerSpy).toHaveBeenCalledTimes(3);
      // removeEventListener 应被调用 2 次（第二次移除 handler1，第三次移除 handler2）
      expect(removeEventListenerSpy).toHaveBeenCalledTimes(2);
      // 验证移除的是前两个 handler
      expect(removeEventListenerSpy).toHaveBeenCalledWith("video-task-recovered", handler1);
      expect(removeEventListenerSpy).toHaveBeenCalledWith("video-task-recovered", handler2);
      // 当前活跃的应是 handler3
      expect(pollingState.recoveredEventHandler).toBe(handler3);
    });
  });

  describe("setupBackgroundRecoveryInterval 幂等性", () => {
    it("重复调用时，应先清除旧 interval 再设置新的", () => {
      // 第一次调用：设置 interval
      setupBackgroundRecoveryInterval();

      expect(setIntervalSpy).toHaveBeenCalledTimes(1);
      const firstIntervalId = pollingState.recoveryIntervalId;
      expect(firstIntervalId).not.toBeNull();

      // 第二次调用：应先清除旧 interval
      setupBackgroundRecoveryInterval();

      // clearInterval 应被调用一次（清除第一次的 interval）
      expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
      expect(clearIntervalSpy).toHaveBeenCalledWith(firstIntervalId);
      // setInterval 应被调用两次
      expect(setIntervalSpy).toHaveBeenCalledTimes(2);
      // intervalId 应被替换为新的
      const secondIntervalId = pollingState.recoveryIntervalId;
      expect(secondIntervalId).not.toBeNull();
      expect(secondIntervalId).not.toBe(firstIntervalId);
    });

    it("三次重复调用后，只有一个活跃 interval（前两个被清除）", () => {
      setupBackgroundRecoveryInterval();
      const id1 = pollingState.recoveryIntervalId;

      setupBackgroundRecoveryInterval();
      const id2 = pollingState.recoveryIntervalId;

      setupBackgroundRecoveryInterval();
      const id3 = pollingState.recoveryIntervalId;

      // 三个 ID 应互不相同
      expect(id1).not.toBe(id2);
      expect(id2).not.toBe(id3);
      expect(id1).not.toBe(id3);

      // setInterval 应被调用 3 次
      expect(setIntervalSpy).toHaveBeenCalledTimes(3);
      // clearInterval 应被调用 2 次
      expect(clearIntervalSpy).toHaveBeenCalledTimes(2);
      expect(clearIntervalSpy).toHaveBeenCalledWith(id1);
      expect(clearIntervalSpy).toHaveBeenCalledWith(id2);
      // 当前活跃的应是 id3
      expect(pollingState.recoveryIntervalId).toBe(id3);
    });
  });

  describe("setupCacheCleanupInterval 幂等性", () => {
    it("重复调用时，应先清除旧 interval 再设置新的", () => {
      // 第一次调用：设置 interval
      setupCacheCleanupInterval();

      expect(setIntervalSpy).toHaveBeenCalledTimes(1);
      const firstIntervalId = pollingState.cacheCleanupIntervalId;
      expect(firstIntervalId).not.toBeNull();

      // 第二次调用：应先清除旧 interval
      setupCacheCleanupInterval();

      // clearInterval 应被调用一次
      expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
      expect(clearIntervalSpy).toHaveBeenCalledWith(firstIntervalId);
      // setInterval 应被调用两次
      expect(setIntervalSpy).toHaveBeenCalledTimes(2);
      // intervalId 应被替换为新的
      const secondIntervalId = pollingState.cacheCleanupIntervalId;
      expect(secondIntervalId).not.toBeNull();
      expect(secondIntervalId).not.toBe(firstIntervalId);
    });

    it("三次重复调用后，只有一个活跃 interval（前两个被清除）", () => {
      setupCacheCleanupInterval();
      const id1 = pollingState.cacheCleanupIntervalId;

      setupCacheCleanupInterval();
      const id2 = pollingState.cacheCleanupIntervalId;

      setupCacheCleanupInterval();
      const id3 = pollingState.cacheCleanupIntervalId;

      expect(id1).not.toBe(id2);
      expect(id2).not.toBe(id3);
      expect(id1).not.toBe(id3);

      expect(setIntervalSpy).toHaveBeenCalledTimes(3);
      expect(clearIntervalSpy).toHaveBeenCalledTimes(2);
      expect(clearIntervalSpy).toHaveBeenCalledWith(id1);
      expect(clearIntervalSpy).toHaveBeenCalledWith(id2);
      expect(pollingState.cacheCleanupIntervalId).toBe(id3);
    });
  });

  describe("setupBeforeUnloadHandler 幂等性", () => {
    it("重复调用时，应先移除旧监听器再添加新的", () => {
      const store = createMockStore();

      // 第一次调用：注册监听器
      setupBeforeUnloadHandler(store);

      expect(addEventListenerSpy).toHaveBeenCalledTimes(1);
      expect(addEventListenerSpy).toHaveBeenCalledWith(
        "beforeunload",
        expect.any(Function),
      );
      const firstHandler = pollingState.beforeUnloadHandler;
      expect(firstHandler).not.toBeNull();

      // 第二次调用：应先移除旧监听器
      setupBeforeUnloadHandler(store);

      // removeEventListener 应被调用一次
      expect(removeEventListenerSpy).toHaveBeenCalledTimes(1);
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        "beforeunload",
        firstHandler,
      );
      // addEventListener 应被调用两次
      expect(addEventListenerSpy).toHaveBeenCalledTimes(2);
      // handler 应被替换为新的
      const secondHandler = pollingState.beforeUnloadHandler;
      expect(secondHandler).not.toBeNull();
      expect(secondHandler).not.toBe(firstHandler);
    });

    it("三次重复调用后，window 上只有一个活跃监听器（前两个被移除）", () => {
      const store = createMockStore();

      setupBeforeUnloadHandler(store);
      const handler1 = pollingState.beforeUnloadHandler;

      setupBeforeUnloadHandler(store);
      const handler2 = pollingState.beforeUnloadHandler;

      setupBeforeUnloadHandler(store);
      const handler3 = pollingState.beforeUnloadHandler;

      expect(handler1).not.toBe(handler2);
      expect(handler2).not.toBe(handler3);
      expect(handler1).not.toBe(handler3);

      expect(addEventListenerSpy).toHaveBeenCalledTimes(3);
      expect(removeEventListenerSpy).toHaveBeenCalledTimes(2);
      expect(removeEventListenerSpy).toHaveBeenCalledWith("beforeunload", handler1);
      expect(removeEventListenerSpy).toHaveBeenCalledWith("beforeunload", handler2);
      expect(pollingState.beforeUnloadHandler).toBe(handler3);
    });
  });

  describe("重复调用后 window 上只有一个监听器（综合验证）", () => {
    it("setupRecoveredEventListener 重复调用 5 次后，removeEventListener 被调用 4 次", () => {
      const store = createMockStore();

      for (let i = 0; i < 5; i++) {
        setupRecoveredEventListener(store);
      }

      // 5 次 add，4 次 remove（最后一次注册的仍保留）
      expect(addEventListenerSpy).toHaveBeenCalledTimes(5);
      expect(removeEventListenerSpy).toHaveBeenCalledTimes(4);
      // 当前 handler 不为 null
      expect(pollingState.recoveredEventHandler).not.toBeNull();
    });

    it("setupBeforeUnloadHandler 重复调用 5 次后，removeEventListener 被调用 4 次", () => {
      const store = createMockStore();

      for (let i = 0; i < 5; i++) {
        setupBeforeUnloadHandler(store);
      }

      expect(addEventListenerSpy).toHaveBeenCalledTimes(5);
      expect(removeEventListenerSpy).toHaveBeenCalledTimes(4);
      expect(pollingState.beforeUnloadHandler).not.toBeNull();
    });
  });
});
