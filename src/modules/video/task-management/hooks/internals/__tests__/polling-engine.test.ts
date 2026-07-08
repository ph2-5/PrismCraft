import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockEmitToast, mockErrorLoggerWarn, mockErrorLoggerError, mockErrorLoggerInfo, mockErrorLoggerDebug, mockErrorLoggerFatal, mockHandleTimedOutTasks, mockPollActiveTasks, mockCacheCompletedVideos, mockT } = vi.hoisted(() => ({
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

vi.mock("@/shared/constants", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/constants")>();
  return { ...actual, t: mockT };
});

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
  getStore,
  stopPolling,
  cleanupAllPollingResources,
  schedulePolling,
  checkAndStartOrStopPolling,
  getPollingStats,
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
      setAllTasks: (updater: VideoTask[] | ((prev: VideoTask[]) => VideoTask[])) => {
        allTasks = typeof updater === "function" ? updater(allTasks) : updater;
      },
    }),
  };
}

async function waitForPollCycle() {
  await vi.advanceTimersByTimeAsync(50);
  await vi.advanceTimersByTimeAsync(50);
}

describe("applyJitter (via adjustPollInterval)", () => {
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

  it("produces pollInterval values within ±20% of expected base", async () => {
    pollingState.pollInterval = 15000;
    const intervals: number[] = [];

    for (let i = 0; i < 20; i++) {
      cleanupAllPollingResources();
      const store = createMockStore([createMockTask()]);
      registerStore(store);
      pollingState.pollInterval = 15000;

      schedulePolling();
      await waitForPollCycle();

      intervals.push(pollingState.pollInterval);
    }

    for (const interval of intervals) {
      expect(interval).toBeGreaterThanOrEqual(15000 * 0.8);
      expect(interval).toBeLessThanOrEqual(15000 * 1.2);
    }
  });

  it("never sets pollInterval to 0 or negative", async () => {
    for (let i = 0; i < 20; i++) {
      cleanupAllPollingResources();
      const store = createMockStore([createMockTask()]);
      registerStore(store);
      pollingState.pollInterval = 5000;

      schedulePolling();
      await waitForPollCycle();

      expect(pollingState.pollInterval).toBeGreaterThan(0);
    }
  });
});

describe("registerStore / getStore", () => {
  it("getStore returns store after registerStore", () => {
    const store = createMockStore();
    registerStore(store);
    expect(getStore()).toBe(store);
  });
});

describe("getPollingStats", () => {
  beforeEach(() => {
    cleanupAllPollingResources();
    const store = createMockStore();
    registerStore(store);
  });

  it("returns correct initial state", () => {
    const stats = getPollingStats();
    expect(stats.pollCount).toBe(0);
    expect(stats.pollInterval).toBe(15000);
    expect(stats.isPollingScheduled).toBe(false);
    expect(stats.pollingInProgress).toBe(false);
    expect(stats.consecutiveErrors).toBe(0);
  });

  it("reflects state changes", () => {
    pollingState.consecutiveErrors = 3;
    pollingState.pollCount = 5;
    const stats = getPollingStats();
    expect(stats.consecutiveErrors).toBe(3);
    expect(stats.pollCount).toBe(5);
  });
});

describe("consecutive error tracking", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    cleanupAllPollingResources();
    const store = createMockStore([createMockTask()]);
    registerStore(store);
    mockEmitToast.mockClear();
    mockErrorLoggerWarn.mockClear();
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

  it("errors increment consecutiveErrors", async () => {
    mockPollActiveTasks.mockResolvedValue({
      taskUpdates: new Map(),
      cacheTasks: [],
      hasError: true,
      hasSuccess: false,
    });

    pollingState.pollInterval = 10;
    schedulePolling();
    await waitForPollCycle();

    expect(pollingState.consecutiveErrors).toBeGreaterThanOrEqual(1);
  });

  it("success resets consecutiveErrors to 0", async () => {
    pollingState.consecutiveErrors = 3;

    mockPollActiveTasks.mockResolvedValue({
      taskUpdates: new Map(),
      cacheTasks: [],
      hasError: false,
      hasSuccess: true,
    });

    pollingState.pollInterval = 10;
    schedulePolling();
    await waitForPollCycle();

    expect(pollingState.consecutiveErrors).toBe(0);
  });

  it("pauses polling after MAX_CONSECUTIVE_ERRORS (5)", async () => {
    mockPollActiveTasks.mockResolvedValue({
      taskUpdates: new Map(),
      cacheTasks: [],
      hasError: true,
      hasSuccess: false,
    });

    pollingState.pollInterval = 10;
    pollingState.consecutiveErrors = 4;

    schedulePolling();
    await waitForPollCycle();

    expect(pollingState.consecutiveErrors).toBe(5);
    expect(pollingState.isPollingScheduled).toBe(false);
  });

  it("calls emitToast when polling pauses due to consecutive errors", async () => {
    mockPollActiveTasks.mockResolvedValue({
      taskUpdates: new Map(),
      cacheTasks: [],
      hasError: true,
      hasSuccess: false,
    });

    pollingState.pollInterval = 10;
    pollingState.consecutiveErrors = 4;

    schedulePolling();
    await waitForPollCycle();

    expect(mockEmitToast).toHaveBeenCalledWith(
      "warning",
      expect.any(String),
      expect.any(String),
    );
  });

  it("catch block also increments consecutiveErrors and pauses", async () => {
    mockPollActiveTasks.mockRejectedValue(new Error("unexpected"));

    pollingState.pollInterval = 10;
    pollingState.consecutiveErrors = 4;

    schedulePolling();
    await waitForPollCycle();

    expect(pollingState.consecutiveErrors).toBe(5);
    expect(mockEmitToast).toHaveBeenCalledWith(
      "warning",
      expect.any(String),
      expect.any(String),
    );
  });
});

describe("visibility change handling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    cleanupAllPollingResources();
    const store = createMockStore([createMockTask()]);
    registerStore(store);
    mockEmitToast.mockClear();
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

  it("page hidden stops polling", () => {
    pollingState.pollInterval = 10;
    schedulePolling();

    const handler = pollingState.visibilityHandler;
    expect(handler).not.toBeNull();

    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      configurable: true,
    });
    handler!(new Event("visibilitychange"));

    expect(pollingState.isPollingScheduled).toBe(false);
    expect(pollingState.pollingTimeoutId).toBeNull();
  });

  it("page visible with active tasks resumes polling", () => {
    pollingState.pollInterval = 10;
    schedulePolling();

    const handler = pollingState.visibilityHandler;

    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      configurable: true,
    });
    handler!(new Event("visibilitychange"));

    expect(pollingState.isPollingScheduled).toBe(false);

    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });
    handler!(new Event("visibilitychange"));

    expect(pollingState.isPollingScheduled).toBe(true);
  });

  it("page visible without active tasks does not start polling", () => {
    pollingState.pollInterval = 10;
    schedulePolling();

    const handler = pollingState.visibilityHandler;

    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      configurable: true,
    });
    handler!(new Event("visibilitychange"));

    expect(pollingState.isPollingScheduled).toBe(false);

    const emptyStore = createMockStore([]);
    registerStore(emptyStore);

    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });
    handler!(new Event("visibilitychange"));

    expect(pollingState.isPollingScheduled).toBe(false);
  });
});

describe("idle detection", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    cleanupAllPollingResources();
    mockEmitToast.mockClear();
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

  it("no active tasks → no polling scheduled", () => {
    const store = createMockStore([]);
    registerStore(store);

    schedulePolling();

    expect(pollingState.isPollingScheduled).toBe(false);
    expect(pollingState.pollingTimeoutId).toBeNull();
  });

  it("checkAndStartOrStopPolling with active tasks starts polling", () => {
    const store = createMockStore([createMockTask()]);
    registerStore(store);

    checkAndStartOrStopPolling();

    expect(pollingState.isPollingScheduled).toBe(true);
    expect(pollingState.pollingTimeoutId).not.toBeNull();
  });

  it("checkAndStartOrStopPolling without active tasks stops polling", () => {
    const store = createMockStore([createMockTask()]);
    registerStore(store);

    checkAndStartOrStopPolling();
    expect(pollingState.isPollingScheduled).toBe(true);

    const emptyStore = createMockStore([]);
    registerStore(emptyStore);

    checkAndStartOrStopPolling();
    expect(pollingState.isPollingScheduled).toBe(false);
  });

  it("checkAndStartOrStopPolling resets consecutiveErrors when starting", () => {
    const store = createMockStore([createMockTask()]);
    registerStore(store);

    pollingState.consecutiveErrors = 5;
    checkAndStartOrStopPolling();

    expect(pollingState.consecutiveErrors).toBe(0);
  });
});

describe("cleanupAllPollingResources", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    cleanupAllPollingResources();
    mockEmitToast.mockClear();
    mockPollActiveTasks.mockResolvedValue({
      taskUpdates: new Map(),
      cacheTasks: [],
      hasError: false,
      hasSuccess: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("cleans up visibility handler registered by schedulePolling", () => {
    const store = createMockStore([createMockTask()]);
    registerStore(store);

    schedulePolling();

    expect(pollingState.visibilityHandler).not.toBeNull();
    const handler = pollingState.visibilityHandler!;

    const removeSpy = vi.spyOn(document, "removeEventListener");

    cleanupAllPollingResources();

    expect(removeSpy).toHaveBeenCalledWith("visibilitychange", handler);
    expect(pollingState.visibilityHandler).toBeNull();

    removeSpy.mockRestore();
  });

  it("resets all state to defaults", () => {
    const store = createMockStore([createMockTask()]);
    registerStore(store);

    pollingState.pollCount = 10;
    pollingState.consecutiveErrors = 3;
    pollingState.pollInterval = 60000;
    pollingState.isSyncing = true;
    pollingState.pollingInProgress = true;

    cleanupAllPollingResources();

    expect(pollingState.pollCount).toBe(0);
    expect(pollingState.consecutiveErrors).toBe(0);
    expect(pollingState.pollInterval).toBe(15000);
    expect(pollingState.isSyncing).toBe(false);
    expect(pollingState.isPollingScheduled).toBe(false);
    expect(pollingState.pollingInProgress).toBe(false);
    expect(pollingState.pollingTimeoutId).toBeNull();
    expect(pollingState.abortController).toBeNull();
  });

  it("cleans up beforeUnload handler", () => {
    pollingState.beforeUnloadHandler = vi.fn();
    const removeSpy = vi.spyOn(window, "removeEventListener");

    cleanupAllPollingResources();

    expect(removeSpy).toHaveBeenCalledWith("beforeunload", expect.any(Function));
    expect(pollingState.beforeUnloadHandler).toBeNull();

    removeSpy.mockRestore();
  });

  it("cleans up recoveredEventHandler", () => {
    pollingState.recoveredEventHandler = vi.fn();
    const removeSpy = vi.spyOn(window, "removeEventListener");

    cleanupAllPollingResources();

    expect(removeSpy).toHaveBeenCalledWith("video-task-recovered", expect.any(Function));
    expect(pollingState.recoveredEventHandler).toBeNull();

    removeSpy.mockRestore();
  });
});

describe("stopPolling", () => {
  beforeEach(() => {
    cleanupAllPollingResources();
    const store = createMockStore([createMockTask()]);
    registerStore(store);
  });

  it("clears timeout and abort controller", () => {
    pollingState.pollingTimeoutId = setTimeout(() => {}, 99999) as unknown as ReturnType<typeof setTimeout>;
    pollingState.abortController = new AbortController();
    pollingState.isPollingScheduled = true;
    pollingState.consecutiveErrors = 3;

    stopPolling();

    expect(pollingState.pollingTimeoutId).toBeNull();
    expect(pollingState.abortController).toBeNull();
    expect(pollingState.isPollingScheduled).toBe(false);
    expect(pollingState.consecutiveErrors).toBe(0);
  });
});
