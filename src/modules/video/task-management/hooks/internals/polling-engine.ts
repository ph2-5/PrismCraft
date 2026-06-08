import type { VideoTask } from "@/domain/schemas";
import { errorLogger } from "@/shared/error-logger";
import {
  handleTimedOutTasks,
  pollActiveTasks,
  cacheCompletedVideos,
} from "./polling-task-handler";
import {
  MAX_POLL_COUNT,
  MAX_POLL_DURATION,
  MAX_POLL_FAILURES,
} from "./polling-constants";

export { MAX_POLL_COUNT, MAX_POLL_DURATION, MAX_POLL_FAILURES };

const DEFAULT_POLL_INTERVAL = 15000;
const IDLE_POLL_INTERVAL = 5000;
const MAX_POLL_INTERVAL_MS = 60000;
const POLL_BACKOFF_ERROR_FACTOR = 1.5;
const POLL_BACKOFF_MIXED_FACTOR = 1.2;
const YOUNG_TASK_THRESHOLD_MS = 30_000;
const YOUNG_TASK_INTERVAL = 5000;
const MATURE_TASK_INTERVAL = 15000;

interface StoreAccessor {
  getState: () => { allTasks: VideoTask[]; setAllTasks: (updater: VideoTask[] | ((prev: VideoTask[]) => VideoTask[])) => void };
}

let _store: StoreAccessor | null = null;

export function registerStore(store: StoreAccessor) {
  _store = store;
}

export function getStore(): StoreAccessor {
  if (!_store) throw new Error("VideoTaskStore not registered");
  return _store;
}

export interface PollingState {
  pollingTimeoutId: ReturnType<typeof setTimeout> | null;
  syncTimeoutId: ReturnType<typeof setTimeout> | null;
  recoveryIntervalId: ReturnType<typeof setInterval> | null;
  cacheCleanupIntervalId: ReturnType<typeof setInterval> | null;
  beforeUnloadHandler: ((e: BeforeUnloadEvent) => void) | null;
  recoveredEventHandler: ((e: Event) => void) | null;
  pollCount: number;
  pollInterval: number;
  isSyncing: boolean;
  isPollingScheduled: boolean;
  isInitializing: boolean;
  pollingInProgress: boolean;
  abortController: AbortController | null;
}

export const pollingState: PollingState = {
  pollingTimeoutId: null,
  syncTimeoutId: null,
  recoveryIntervalId: null,
  cacheCleanupIntervalId: null,
  beforeUnloadHandler: null,
  recoveredEventHandler: null,
  pollCount: 0,
  pollInterval: DEFAULT_POLL_INTERVAL,
  isSyncing: false,
  isPollingScheduled: false,
  isInitializing: false,
  pollingInProgress: false,
  abortController: null,
};

if (typeof window !== "undefined") {
  if (window.__VIDEO_TASK_POLLING_STATE__) {
    const prev = window.__VIDEO_TASK_POLLING_STATE__ as PollingState;
    if (prev.pollingTimeoutId) clearTimeout(prev.pollingTimeoutId);
    if (prev.syncTimeoutId) clearTimeout(prev.syncTimeoutId);
    if (prev.recoveryIntervalId) clearInterval(prev.recoveryIntervalId);
    if (prev.cacheCleanupIntervalId) clearInterval(prev.cacheCleanupIntervalId);
    if (prev.abortController) prev.abortController.abort();
    if (prev.beforeUnloadHandler) window.removeEventListener("beforeunload", prev.beforeUnloadHandler);
    if (prev.recoveredEventHandler) window.removeEventListener("video-task-recovered", prev.recoveredEventHandler);
  }
  window.__VIDEO_TASK_POLLING_STATE__ = pollingState;
}

export function stopPolling() {
  if (pollingState.pollingTimeoutId) {
    clearTimeout(pollingState.pollingTimeoutId);
    pollingState.pollingTimeoutId = null;
  }
  if (pollingState.abortController) {
    pollingState.abortController.abort();
    pollingState.abortController = null;
  }
  pollingState.isPollingScheduled = false;
}

export function cleanupAllPollingResources() {
  stopPolling();
  if (pollingState.syncTimeoutId) {
    clearTimeout(pollingState.syncTimeoutId);
    pollingState.syncTimeoutId = null;
  }
  if (pollingState.recoveryIntervalId) {
    clearInterval(pollingState.recoveryIntervalId);
    pollingState.recoveryIntervalId = null;
  }
  if (pollingState.cacheCleanupIntervalId) {
    clearInterval(pollingState.cacheCleanupIntervalId);
    pollingState.cacheCleanupIntervalId = null;
  }
  if (pollingState.beforeUnloadHandler) {
    window.removeEventListener("beforeunload", pollingState.beforeUnloadHandler);
    pollingState.beforeUnloadHandler = null;
  }
  if (pollingState.recoveredEventHandler) {
    window.removeEventListener("video-task-recovered", pollingState.recoveredEventHandler);
    pollingState.recoveredEventHandler = null;
  }
  pollingState.pollCount = 0;
  pollingState.pollInterval = DEFAULT_POLL_INTERVAL;
  pollingState.isSyncing = false;
  pollingState.isInitializing = false;
  pollingState.pollingInProgress = false;
  pollingState.abortController = null;
}

function applyTaskUpdates(updates: Map<string, Partial<VideoTask>>): void {
  if (updates.size === 0) return;
  const state = getStore().getState();
  state.setAllTasks((prev) =>
    prev.map((task) => {
      const update = updates.get(task.taskId);
      return update ? { ...task, ...update } : task;
    }),
  );
}

function adjustPollInterval(hasSuccess: boolean, hasError: boolean): void {
  const state = getStore().getState();
  const activeTasks = state.allTasks.filter(
    (t) => t.status === "pending" || t.status === "generating",
  );

  if (activeTasks.length === 0) {
    pollingState.pollInterval = IDLE_POLL_INTERVAL;
    return;
  }

  const now = Date.now();
  const hasYoungTask = activeTasks.some(
    (t) => now - new Date(t.createdAt).getTime() < YOUNG_TASK_THRESHOLD_MS,
  );

  if (hasYoungTask) {
    pollingState.pollInterval = YOUNG_TASK_INTERVAL;
    return;
  }

  if (hasSuccess && !hasError) {
    pollingState.pollInterval = MATURE_TASK_INTERVAL;
  } else if (hasError && !hasSuccess) {
    pollingState.pollInterval = Math.min(pollingState.pollInterval * POLL_BACKOFF_ERROR_FACTOR, MAX_POLL_INTERVAL_MS);
  } else if (hasError && hasSuccess) {
    pollingState.pollInterval = Math.min(pollingState.pollInterval * POLL_BACKOFF_MIXED_FACTOR, MAX_POLL_INTERVAL_MS);
  }
}

export function schedulePolling() {
  if (pollingState.isPollingScheduled || pollingState.pollingInProgress) return;
  pollingState.isPollingScheduled = true;

  if (pollingState.abortController) {
    pollingState.abortController.abort();
  }
  pollingState.abortController = new AbortController();
  const abortSignal = pollingState.abortController.signal;

  const pollTasks = async () => {
    pollingState.pollingInProgress = true;
    let shouldReschedule = false;
    try {
      if (abortSignal.aborted) return;

      const state = getStore().getState();
      const currentTasks = state.allTasks;

      if (currentTasks.length === 0) return;

      const hasActivePolling = currentTasks.some(
        (t) => t.status === "pending" || t.status === "generating",
      );
      if (!hasActivePolling) {
        pollingState.pollInterval = IDLE_POLL_INTERVAL;
        pollingState.pollCount = 0;
        return;
      }

      pollingState.pollCount += 1;
      if (pollingState.pollCount > MAX_POLL_COUNT) {
        stopPolling();
        return;
      }

      await handleTimedOutTasks(currentTasks, abortSignal, getStore());
      if (abortSignal.aborted) return;

      const pollResult = await pollActiveTasks(currentTasks, abortSignal);
      if (abortSignal.aborted) return;

      applyTaskUpdates(pollResult.taskUpdates);
      await cacheCompletedVideos(pollResult.cacheTasks, abortSignal, getStore());
      adjustPollInterval(pollResult.hasSuccess, pollResult.hasError);

      shouldReschedule = true;
    } catch (e) {
      errorLogger.warn("[PollingEngine] Unexpected error in poll cycle", e);
    } finally {
      pollingState.pollingInProgress = false;
      pollingState.isPollingScheduled = false;
    }

    if (shouldReschedule && !abortSignal.aborted) {
      schedulePolling();
    }
  };

  pollingState.pollingTimeoutId = setTimeout(pollTasks, pollingState.pollInterval);
}

export function checkAndStartOrStopPolling() {
  const state = getStore().getState();
  const activeTasks = state.allTasks.filter(
    (t) => t.status === "pending" || t.status === "generating",
  );
  if (activeTasks.length > 0) {
    schedulePolling();
  } else {
    stopPolling();
  }
}
