import { container } from "@/infrastructure/di";
import {
  recoverVideoByTaskId,
  registerCacheVideoBlobFn,
} from "@/modules/video/recovery";
import { persistVideoTask } from "./persist-task";
import { cacheVideoBlob, registerRecoveryFn, removeCachedVideo } from "@/modules/video/cache";
import { errorLogger } from "@/shared/error-logger";
import { mapUserFacingError } from "@/shared/utils/user-facing-error";
import { emitToast } from "@/shared/utils/toast-bridge";
import { t } from "@/shared/constants";
import { AppError } from "@/domain/types/result";
import type { VideoTask } from "@/domain/schemas";
import { mapApiStatus } from "../../domain";
import {
  withTransitionGuard,
  pollingState,
  initPollingEngine,
  cleanupAllPollingResources,
  MAX_POLL_FAILURES,
  scheduleSync,
  checkAndStartOrStopPolling,
} from "../internals";
import {
  loadTasksFromStorage,
  setupRecoveredEventListener,
  setupBackgroundRecoveryInterval,
  setupCacheCleanupInterval,
  setupBeforeUnloadHandler,
  type StoreAccessor,
} from "../internals/task-initializer";

/**
 * Store accessor for shared polling logic.
 *
 * Extends the minimal StoreAccessor from task-initializer.ts with the
 * additional state slices that pollTask and initialize need
 * (setAllTasks, isInitialized). Both useVideoTaskManager (via zustand
 * create's get/set) and useVideoTaskPolling (via useVideoTaskStore
 * .getState/.setState) satisfy this interface at runtime.
 */
export interface PollingStoreAccessor extends StoreAccessor {
  getState: () => StoreAccessor["getState"] extends () => infer S
    ? S & {
        setAllTasks: (
          updater: VideoTask[] | ((prev: VideoTask[]) => VideoTask[]),
        ) => void;
        isInitialized: boolean;
      }
    : never;
}

let _recoveryRegistered = false;
export function ensureRecoveryRegistered() {
  if (_recoveryRegistered) return;
  _recoveryRegistered = true;
  registerRecoveryFn(async (taskId) => {
    return recoverVideoByTaskId(taskId);
  });
  registerCacheVideoBlobFn(async (taskId: string, videoUrl: string) => {
    return cacheVideoBlob(taskId, videoUrl);
  });
}

/**
 * Shared initialization logic for video task polling.
 *
 * Used by both useVideoTaskManager (store method) and useVideoTaskPolling
 * to avoid duplicating the setup sequence (load tasks, register listeners,
 * start background intervals).
 */
export function initializePolling(store: PollingStoreAccessor) {
  const state = store.getState();
  if (state.isInitialized || pollingState.isInitializing) return;
  pollingState.isInitializing = true;

  // Initialize polling engine (registers global state, cleans up stale timers).
  // Previously ran as a module-level side effect; now explicit to avoid side
  // effects at import time.
  initPollingEngine();
  ensureRecoveryRegistered();
  cleanupAllPollingResources();

  const loadTasks = loadTasksFromStorage(store);
  loadTasks().catch((err) => {
    errorLogger.warn("[VideoTaskManager] 任务加载失败", err);
  });

  setupRecoveredEventListener(store);
  setupBackgroundRecoveryInterval();
  setupCacheCleanupInterval();
  setupBeforeUnloadHandler(store);
}

/**
 * Shared pollTask logic for video task status polling.
 *
 * Used by both useVideoTaskManager (store method) and useVideoTaskPolling
 * to avoid duplicating the ~100 line poll implementation (query provider,
 * apply transition guard, persist, handle failures).
 */
export async function pollTaskShared(
  store: PollingStoreAccessor,
  taskId: string,
): Promise<void> {
  const task = store.getState().allTasks.find((t) => t.taskId === taskId);
  if (!task) return;

  try {
    const pollOptions: Parameters<typeof container.videoProvider.queryVideoStatus>[1] = {};
    if (task.providerId && task.providerModelId) {
      pollOptions.providerId = task.providerId;
      pollOptions.modelId = task.providerModelId;
      if (task.providerFormat) {
        pollOptions.format = task.providerFormat;
      }
    }
    const result = await container.videoProvider.queryVideoStatus(taskId, pollOptions);
    if (result.success && result.data) {
      const justCompleted =
        result.data.status === "completed" && !!result.data.videoUrl;
      if (justCompleted && result.data.videoUrl) {
        cacheVideoBlob(task.taskId, result.data.videoUrl).catch((e: unknown) =>
          errorLogger.warn(
            new AppError("CACHE_VIDEO_ERROR", "Failed to cache video blob", e),
            "VideoTaskManager",
          ),
        );
      }
      const mappedStatus = mapApiStatus(result.data.status || "failed", result.data.videoUrl);
      const guardUpdates = withTransitionGuard(task, mappedStatus, {
        progress: result.data.progress || task.progress,
        videoUrl: result.data.videoUrl,
        message: result.data.message || task.message,
      });

      await persistVideoTask(
        { ...task, ...guardUpdates, lastPolledAt: new Date().toISOString() },
        { logLabel: "轮询结果持久化失败", catchExceptions: false },
      );

      store.getState().setAllTasks((prev) =>
        prev.map((t) =>
          t.taskId === taskId ? { ...t, ...guardUpdates } : t,
        ),
      );
      scheduleSync();
      checkAndStartOrStopPolling();
    } else {
      store.getState().setAllTasks((prev) =>
        prev.map((task) =>
          task.taskId === taskId
            ? { ...task, message: t("video.queryNoResponse") }
            : task,
        ),
      );
      scheduleSync();
    }
  } catch (error) {
    errorLogger.error("Error polling task", error);
    const failCount = (task.pollFailureCount || 0) + 1;
    let updatedTask: VideoTask = {
      ...task,
      pollFailureCount: failCount,
      message: t("video.queryFailedReason", { reason: mapUserFacingError(error) }),
    };
    if (failCount >= MAX_POLL_FAILURES) {
      const guarded = withTransitionGuard(task, "failed", {
        message: t("video.consecutivePollFailed", { count: MAX_POLL_FAILURES }),
        pollFailureCount: 0,
      });
      updatedTask = { ...updatedTask, ...guarded };
      const taskLabel = task.beatTitle || task.storyTitle || taskId.slice(0, 8);
      emitToast("error", t("video.generateFailed"), t("video.pollingFailedDetail", { taskLabel }));
      removeCachedVideo(taskId).catch((e) => { errorLogger.warn("[VideoTaskManager] removeCachedVideo failed", e); });
    }
    try {
      await persistVideoTask(updatedTask, {
        logLevel: "error",
        logLabel: "Failed to save poll failure",
      });
    } catch (saveError) {
      errorLogger.error(
        "[VideoTaskManager] Failed to save poll failure",
        saveError,
      );
    }
    store.getState().setAllTasks((prev) =>
      prev.map((t) => (t.taskId === taskId ? updatedTask : t)),
    );
    scheduleSync();
    checkAndStartOrStopPolling();
  }
}
