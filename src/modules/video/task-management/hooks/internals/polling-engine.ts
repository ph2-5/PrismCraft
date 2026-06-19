import type { VideoTask } from "@/domain/schemas";
import { errorLogger } from "@/shared/error-logger";
import { emitToast } from "@/shared/utils/toast-bridge";
import { t } from "@/shared/constants";
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
const MAX_POLL_INTERVAL_MS = 60000;
const POLL_BACKOFF_ERROR_FACTOR = 1.5;
const POLL_BACKOFF_MIXED_FACTOR = 1.2;
const YOUNG_TASK_THRESHOLD_MS = 30_000;
const YOUNG_TASK_INTERVAL = 5000;
const MATURE_TASK_INTERVAL = 15000;
const MAX_CONSECUTIVE_ERRORS = 5;

function applyJitter(interval: number): number {
  return interval * (0.8 + Math.random() * 0.4);
}

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
  visibilityHandler: ((e: Event) => void) | null;
  pollCount: number;
  pollInterval: number;
  isSyncing: boolean;
  isPollingScheduled: boolean;
  isInitializing: boolean;
  pollingInProgress: boolean;
  abortController: AbortController | null;
  consecutiveErrors: number;
}

export const pollingState: PollingState = {
  pollingTimeoutId: null,
  syncTimeoutId: null,
  recoveryIntervalId: null,
  cacheCleanupIntervalId: null,
  beforeUnloadHandler: null,
  recoveredEventHandler: null,
  visibilityHandler: null,
  pollCount: 0,
  pollInterval: DEFAULT_POLL_INTERVAL,
  isSyncing: false,
  isPollingScheduled: false,
  isInitializing: false,
  pollingInProgress: false,
  abortController: null,
  consecutiveErrors: 0,
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
    if (prev.visibilityHandler) document.removeEventListener("visibilitychange", prev.visibilityHandler);
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
  pollingState.consecutiveErrors = 0;
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
  if (pollingState.visibilityHandler) {
    document.removeEventListener("visibilitychange", pollingState.visibilityHandler);
    pollingState.visibilityHandler = null;
  }
  pollingState.pollCount = 0;
  pollingState.pollInterval = DEFAULT_POLL_INTERVAL;
  pollingState.isSyncing = false;
  pollingState.isInitializing = false;
  pollingState.pollingInProgress = false;
  pollingState.abortController = null;
  pollingState.consecutiveErrors = 0;
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
    pollingState.pollInterval = DEFAULT_POLL_INTERVAL;
    return;
  }

  const now = Date.now();
  const hasYoungTask = activeTasks.some(
    (t) => now - new Date(t.createdAt).getTime() < YOUNG_TASK_THRESHOLD_MS,
  );

  if (hasYoungTask) {
    pollingState.pollInterval = applyJitter(YOUNG_TASK_INTERVAL);
    return;
  }

  if (hasSuccess && !hasError) {
    pollingState.pollInterval = applyJitter(MATURE_TASK_INTERVAL);
  } else if (hasError && !hasSuccess) {
    pollingState.pollInterval = applyJitter(
      Math.min(pollingState.pollInterval * POLL_BACKOFF_ERROR_FACTOR, MAX_POLL_INTERVAL_MS),
    );
  } else if (hasError && hasSuccess) {
    pollingState.pollInterval = applyJitter(
      Math.min(pollingState.pollInterval * POLL_BACKOFF_MIXED_FACTOR, MAX_POLL_INTERVAL_MS),
    );
  }
}

function setupVisibilityHandler() {
  if (pollingState.visibilityHandler) return;

  const handler = () => {
    if (document.visibilityState === "hidden") {
      if (pollingState.pollingTimeoutId) {
        clearTimeout(pollingState.pollingTimeoutId);
        pollingState.pollingTimeoutId = null;
      }
      pollingState.isPollingScheduled = false;
      if (pollingState.abortController) {
        pollingState.abortController.abort();
        pollingState.abortController = null;
      }
    } else {
      const state = getStore().getState();
      const hasActiveTasks = state.allTasks.some(
        (t) => t.status === "pending" || t.status === "generating",
      );
      if (hasActiveTasks) {
        schedulePolling();
      }
    }
  };

  pollingState.visibilityHandler = handler;
  document.addEventListener("visibilitychange", handler);
}

export function schedulePolling() {
  if (pollingState.isPollingScheduled || pollingState.pollingInProgress) return;

  const state = getStore().getState();
  const hasActiveTasks = state.allTasks.some(
    (t) => t.status === "pending" || t.status === "generating",
  );
  if (!hasActiveTasks) return;

  if (pollingState.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) return;

  setupVisibilityHandler();

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

      const currentState = getStore().getState();
      const currentTasks = currentState.allTasks;

      if (currentTasks.length === 0) return;

      const hasActivePolling = currentTasks.some(
        (t) => t.status === "pending" || t.status === "generating",
      );
      if (!hasActivePolling) {
        pollingState.pollCount = 0;
        return;
      }

      pollingState.pollCount += 1;
      if (pollingState.pollCount > MAX_POLL_COUNT) {
        // 不再静默停止，通知用户并触发后台恢复
        errorLogger.warn(`[PollingEngine] 轮询次数达到上限 ${MAX_POLL_COUNT}，停止主动轮询，转由恢复服务接管`);
        emitToast(
          "warning",
          t("task.pollCountExceeded"),
          t("task.pollCountExceededHint"),
        );
        stopPolling();
        // 触发一次后台恢复，尝试通过恢复服务查询云端状态
        import("../../../recovery/services/video-recovery-service")
          .then(({ startBackgroundRecovery }) => startBackgroundRecovery())
          .catch((e) => errorLogger.warn("[PollingEngine] 触发后台恢复失败", e));
        return;
      }

      await handleTimedOutTasks(currentTasks, abortSignal, getStore());
      if (abortSignal.aborted) return;

      const pollResult = await pollActiveTasks(currentTasks, abortSignal);
      if (abortSignal.aborted) return;

      applyTaskUpdates(pollResult.taskUpdates);
      await cacheCompletedVideos(pollResult.cacheTasks, abortSignal, getStore());
      adjustPollInterval(pollResult.hasSuccess, pollResult.hasError);

      // Trigger sync and polling check once after all batch updates
      // Use dynamic import to avoid circular dependency with sync-engine
      const { scheduleSync } = await import("./sync-engine");
      scheduleSync();
      checkAndStartOrStopPolling();

      if (pollResult.hasError && !pollResult.hasSuccess) {
        pollingState.consecutiveErrors += 1;
        if (pollingState.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          emitToast("warning", t("task.pollingPausedDueToErrors"), t("task.pollingPausedDueToErrorsDetail", { count: MAX_CONSECUTIVE_ERRORS }));
          return;
        }
      } else {
        pollingState.consecutiveErrors = 0;
      }

      shouldReschedule = true;
    } catch (e) {
      pollingState.consecutiveErrors += 1;
      if (pollingState.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        emitToast("warning", t("task.pollingPausedDueToErrors"), t("task.pollingPausedDueToErrorsDetail", { count: MAX_CONSECUTIVE_ERRORS }));
        return;
      }
      errorLogger.warn("[PollingEngine] Unexpected error in poll cycle", e);
    } finally {
      pollingState.pollingInProgress = false;
      pollingState.isPollingScheduled = false;
    }

    if (shouldReschedule && !abortSignal.aborted) {
      schedulePolling();
    }
  };

  // 清理旧定时器，防止覆盖导致泄漏
  if (pollingState.pollingTimeoutId) {
    clearTimeout(pollingState.pollingTimeoutId);
  }
  pollingState.pollingTimeoutId = setTimeout(pollTasks, pollingState.pollInterval);
}

export function checkAndStartOrStopPolling() {
  const state = getStore().getState();
  const activeTasks = state.allTasks.filter(
    (t) => t.status === "pending" || t.status === "generating",
  );
  if (activeTasks.length > 0) {
    if (pollingState.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
      pollingState.consecutiveErrors = 0;
    }
    schedulePolling();
  } else {
    stopPolling();
  }
}

export function getPollingStats() {
  return {
    pollCount: pollingState.pollCount,
    pollInterval: pollingState.pollInterval,
    isPollingScheduled: pollingState.isPollingScheduled,
    pollingInProgress: pollingState.pollingInProgress,
    consecutiveErrors: pollingState.consecutiveErrors,
  };
}
