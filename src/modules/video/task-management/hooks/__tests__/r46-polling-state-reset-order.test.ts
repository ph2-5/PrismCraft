import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/infrastructure/di", () => ({
  container: {
    videoProvider: { queryVideoStatus: vi.fn() },
    videoTaskStorage: { batchUpdateVideoTasks: vi.fn() },
    elementStorage: { getAllElements: vi.fn() },
  },
}));

vi.mock("@/modules/video/cache", () => ({
  cacheVideoBlob: vi.fn(),
}));

vi.mock("@/modules/video/recovery", () => ({
  saveVideoTask: vi.fn(),
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/shared/utils/toast-bridge", () => ({
  emitToast: vi.fn(),
}));

import {
  pollingState,
  schedulePolling,
  stopPolling,
  cleanupAllPollingResources,
} from "../internals/polling-engine";

describe("R46: Polling Engine State Flag Reset Order", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cleanupAllPollingResources();
  });

  afterEach(() => {
    cleanupAllPollingResources();
  });

  it("polling must have a top-level catch to prevent unhandled exceptions", () => {
    const source = schedulePolling.toString();
    expect(source).toContain("catch");
  });

  it("pollingInProgress must be reset BEFORE isPollingScheduled in source code", () => {
    const source = schedulePolling.toString();
    const pollingInProgressPos = source.lastIndexOf("pollingInProgress = false");
    const isPollingScheduledPos = source.lastIndexOf("isPollingScheduled = false");

    expect(pollingInProgressPos).toBeGreaterThan(0);
    expect(isPollingScheduledPos).toBeGreaterThan(0);
    expect(pollingInProgressPos).toBeLessThan(isPollingScheduledPos);
  });

  it("schedulePolling must guard against both isPollingScheduled and pollingInProgress", () => {
    const source = schedulePolling.toString();
    expect(source).toContain("isPollingScheduled");
    expect(source).toContain("pollingInProgress");
  });

  it("cleanupAllPollingResources must reset all state flags", () => {
    pollingState.pollingInProgress = true;
    pollingState.isPollingScheduled = true;
    pollingState.isSyncing = true;
    pollingState.pollCount = 50;

    cleanupAllPollingResources();

    expect(pollingState.pollingInProgress).toBe(false);
    expect(pollingState.isPollingScheduled).toBe(false);
    expect(pollingState.isSyncing).toBe(false);
    expect(pollingState.pollCount).toBe(0);
  });
});
