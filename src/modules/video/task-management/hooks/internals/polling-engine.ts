import type { VideoTask } from "@/domain/schemas";
import { TaskMachine, mapApiStatus } from "../../domain";
import { container } from "@/infrastructure/di";
import { cacheVideoBlob } from "@/modules/video/cache";
import { saveVideoTask } from "@/modules/video/recovery";
import { errorLogger } from "@/shared/error-logger";
import { emitToast } from "@/shared/utils/toast-bridge";
import { t } from "@/shared/constants";
import { withTransitionGuard } from "./transition-guard";

const MAX_POLL_COUNT = 1000;
const MAX_POLL_DURATION = 120 * 60 * 1000;
const MAX_POLL_FAILURES = 30;
const CONCURRENT_LIMIT = 3;
const CACHE_RETRY_DELAYS = [1000, 2000, 4000];
const DEFAULT_POLL_INTERVAL = 15000;
const IDLE_POLL_INTERVAL = 5000;
const MAX_POLL_INTERVAL_MS = 60000;
const POLL_BACKOFF_ERROR_FACTOR = 1.5;
const POLL_BACKOFF_MIXED_FACTOR = 1.2;

export { MAX_POLL_COUNT, MAX_POLL_DURATION, MAX_POLL_FAILURES };

interface StoreAccessor {
  getState: () => { allTasks: VideoTask[]; setAllTasks: (updater: VideoTask[] | ((prev: VideoTask[]) => VideoTask[])) => void };
}

let _store: StoreAccessor | null = null;

export function registerStore(store: StoreAccessor) {
  _store = store;
}

function getStore(): StoreAccessor {
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

interface PollResult {
  taskUpdates: Map<string, Partial<VideoTask>>;
  cacheTasks: Array<{ taskId: string; videoUrl: string }>;
  hasError: boolean;
  hasSuccess: boolean;
}

async function handleTimedOutTasks(
  tasks: VideoTask[],
  signal: AbortSignal,
): Promise<void> {
  const timedOutTasks = tasks.filter(
    (task) =>
      (task.status === "pending" || task.status === "generating") &&
      Date.now() - new Date(task.createdAt).getTime() > MAX_POLL_DURATION,
  );
  if (timedOutTasks.length === 0) return;

  emitToast("warning", t("error.videoGenerateTimeout"), t("task.timeoutRecoverHint", { count: timedOutTasks.length }));
  const timedOutIds = new Set(timedOutTasks.map((task) => task.taskId));
  const state = getStore().getState();
  state.setAllTasks((prev) =>
    prev.map((task) => {
      if (timedOutIds.has(task.taskId)) {
        return {
          ...task,
          ...withTransitionGuard(task, "failed", {
            message: t("task.timeoutManualRecover"),
            pollFailureCount: 0,
          }),
        };
      }
      return task;
    }),
  );

  const batchUpdates: Array<{ taskId: string; updates: Partial<VideoTask> }> = [];
  for (const task of timedOutTasks) {
    if (signal.aborted) return;
    if (!TaskMachine.canTransition(task.status, "failed")) {
      errorLogger.warn(
        { code: "INVALID_TRANSITION", message: `taskId=${task.taskId}, from=${task.status}, to=failed` },
        "VideoTaskManager",
      );
      continue;
    }
    batchUpdates.push({
      taskId: task.taskId,
      updates: {
        status: "failed",
        message: t("task.timeoutManualRecover"),
        pollFailureCount: 0,
      },
    });
  }
  if (batchUpdates.length > 0) {
    try {
      await container.videoTaskStorage.batchUpdateVideoTasks(batchUpdates);
    } catch (e) {
      errorLogger.warn("[VideoTaskManager] Failed to persist timeout tasks (batch)", e);
    }
  }
}

async function handlePollException(
  task: VideoTask,
  error: unknown,
  result: PollResult,
): Promise<void> {
  const failCount = (task.pollFailureCount || 0) + 1;
  if (failCount >= MAX_POLL_FAILURES) {
    result.hasError = true;
    result.taskUpdates.set(task.taskId, withTransitionGuard(task, "failed", {
      message: t("task.consecutiveFailRecover", { count: MAX_POLL_FAILURES }),
      pollFailureCount: 0,
    }));
    const taskLabel = task.beatTitle || task.storyTitle || task.taskId.slice(0, 8);
    emitToast("error", t("error.videoGenerateFailed"), t("task.queryException", { label: taskLabel }));
  } else {
    result.taskUpdates.set(task.taskId, {
      pollFailureCount: failCount,
      message: t("task.queryExceptionProgress", { current: failCount, max: MAX_POLL_FAILURES }),
    });
  }
  try {
    const pollSaveResult = await saveVideoTask({
      taskId: task.taskId,
      status: failCount >= MAX_POLL_FAILURES ? "failed" : task.status,
      progress: task.progress,
      videoUrl: task.videoUrl,
      message: failCount >= MAX_POLL_FAILURES
        ? t("task.consecutiveFailRecover", { count: MAX_POLL_FAILURES })
        : task.message,
      createdAt: task.createdAt,
      model: task.model,
      prompt: task.prompt,
      parameters: task.parameters,
      apiUrl: task.apiUrl,
      apiEndpoint: task.apiEndpoint,
      providerId: task.providerId,
      providerModelId: task.providerModelId,
      providerFormat: task.providerFormat,
      fixedImageUrl: task.fixedImageUrl,
      fixedImageLockType: task.fixedImageLockType,
      storyId: task.storyId,
      storyTitle: task.storyTitle,
      beatId: task.beatId,
      beatTitle: task.beatTitle,
      pollFailureCount: failCount >= MAX_POLL_FAILURES ? 0 : failCount,
    });
    if (!pollSaveResult.ok) {
      errorLogger.error("[VideoTaskManager] Failed to save poll failure", pollSaveResult.error);
    }
  } catch (saveError) {
    errorLogger.error("[VideoTaskManager] Failed to save poll failure", saveError);
  }
  errorLogger.warn(
    `[VideoTaskManager] Poll failed for ${task.taskId} (attempt ${failCount}/${MAX_POLL_FAILURES})`,
    error,
  );
}

async function pollSingleTask(
  task: VideoTask,
  signal: AbortSignal,
  result: PollResult,
): Promise<void> {
  if (signal.aborted) return;
  try {
    const pollOptions: Parameters<typeof container.videoProvider.queryVideoStatus>[1] = {};
    if (task.providerId && task.providerModelId) {
      pollOptions.providerId = task.providerId;
      pollOptions.modelId = task.providerModelId;
      if (task.providerFormat) {
        pollOptions.format = task.providerFormat;
      }
    }
    const pollResp = await container.videoProvider.queryVideoStatus(task.taskId, pollOptions);
    if (signal.aborted) return;

    if (pollResp.success && pollResp.data) {
      result.hasSuccess = true;
      const justCompleted = pollResp.data.status === "completed" && !!pollResp.data.videoUrl;
      if (justCompleted && pollResp.data.videoUrl) {
        result.cacheTasks.push({ taskId: task.taskId, videoUrl: pollResp.data.videoUrl });
      }
      const mappedStatus = mapApiStatus(pollResp.data.status || "failed", pollResp.data.videoUrl);
      result.taskUpdates.set(task.taskId, withTransitionGuard(task, mappedStatus, {
        progress: pollResp.data.progress || task.progress,
        videoUrl: pollResp.data.videoUrl,
        message: pollResp.data.message || task.message,
        pollFailureCount: 0,
      }));
    } else {
      const apiErrorMsg = pollResp.error || t("task.apiReturnFailed");
      const isRetryable =
        (pollResp as { retryable?: boolean }).retryable === true ||
        (pollResp as { data?: { retryable?: boolean } }).data?.retryable === true;
      if (isRetryable) {
        result.taskUpdates.set(task.taskId, {
          message: `查询暂时失败(可重试): ${apiErrorMsg}`,
        });
      } else {
        result.hasError = true;
        const failCount = (task.pollFailureCount || 0) + 1;
        result.taskUpdates.set(task.taskId, {
          message: `查询失败: ${apiErrorMsg}`,
          pollFailureCount: failCount,
        });
        if (failCount >= MAX_POLL_FAILURES) {
          result.taskUpdates.set(task.taskId, withTransitionGuard(task, "failed", {
            message: `连续${MAX_POLL_FAILURES}次查询失败，请点击「手动恢复」重试`,
            pollFailureCount: 0,
          }));
          const taskLabel = task.beatTitle || task.storyTitle || task.taskId.slice(0, 8);
          emitToast("error", t("error.videoGenerateFailed"), `「${taskLabel}」连续查询失败`);
        }
      }
    }
  } catch (error) {
    await handlePollException(task, error, result);
  }
}

async function pollActiveTasks(
  tasks: VideoTask[],
  signal: AbortSignal,
): Promise<PollResult> {
  const result: PollResult = {
    taskUpdates: new Map(),
    cacheTasks: [],
    hasError: false,
    hasSuccess: false,
  };

  const activeTaskList = tasks.filter(
    (t) => t.status !== "completed" && t.status !== "failed",
  );

  for (let i = 0; i < activeTaskList.length; i += CONCURRENT_LIMIT) {
    if (signal.aborted) return result;
    const batch = activeTaskList.slice(i, i + CONCURRENT_LIMIT);
    await Promise.allSettled(
      batch.map((task) => pollSingleTask(task, signal, result)),
    );
  }

  return result;
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

async function cacheSingleVideo(
  taskId: string,
  videoUrl: string,
  signal: AbortSignal,
): Promise<boolean> {
  try {
    await cacheVideoBlob(taskId, videoUrl);
    return true;
  } catch (firstError) {
    errorLogger.warn("[VideoTaskManager] Failed to cache video blob (initial)", firstError);
    for (let retry = 0; retry < CACHE_RETRY_DELAYS.length; retry++) {
      if (signal.aborted) return false;
      await new Promise((r) => setTimeout(r, CACHE_RETRY_DELAYS[retry]));
      if (signal.aborted) return false;
      try {
        await cacheVideoBlob(taskId, videoUrl);
        errorLogger.info(`[VideoTaskManager] Cache retry succeeded (attempt ${retry + 1}) for ${taskId}`);
        return true;
      } catch (retryError) {
        errorLogger.warn(`[VideoTaskManager] Cache retry failed (attempt ${retry + 1}) for ${taskId}`, retryError);
      }
    }
    return false;
  }
}

async function cacheCompletedVideos(
  cacheTasks: Array<{ taskId: string; videoUrl: string }>,
  signal: AbortSignal,
): Promise<void> {
  const batchUpdates: Map<string, boolean> = new Map();
  for (const { taskId, videoUrl } of cacheTasks) {
    if (signal.aborted) break;
    const cached = await cacheSingleVideo(taskId, videoUrl, signal);
    if (signal.aborted) break;
    batchUpdates.set(taskId, cached);
    if (!cached) {
      const state = getStore().getState();
      const task = state.allTasks.find((t) => t.taskId === taskId);
      const taskLabel = task?.beatTitle || task?.storyTitle || taskId.slice(0, 8);
      emitToast("warning", "视频缓存失败", `「${taskLabel}」本地缓存失败，仍可通过远程URL播放`);
    }
  }
  if (batchUpdates.size > 0) {
    const state = getStore().getState();
    state.setAllTasks((prev) =>
      prev.map((t) => {
        const cached = batchUpdates.get(t.taskId);
        if (cached === undefined) return t;
        return { ...t, cacheFailed: !cached };
      }),
    );
  }
}

function adjustPollInterval(hasSuccess: boolean, hasError: boolean): void {
  if (hasSuccess && !hasError) {
    pollingState.pollInterval = DEFAULT_POLL_INTERVAL;
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

      await handleTimedOutTasks(currentTasks, abortSignal);
      if (abortSignal.aborted) return;

      const pollResult = await pollActiveTasks(currentTasks, abortSignal);
      if (abortSignal.aborted) return;

      applyTaskUpdates(pollResult.taskUpdates);
      await cacheCompletedVideos(pollResult.cacheTasks, abortSignal);
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
