import { container } from "@/infrastructure/di";
import {
  recoverVideoByTaskId,
  registerCacheVideoBlobFn,
} from "@/modules/video/recovery";
import { persistVideoTask } from "./persist-task";
import { cacheVideoBlob, registerRecoveryFn } from "@/modules/video/cache";
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
import { NETWORK_ERROR_PATTERNS } from "./polling-task-handler";
import {
  loadTasksFromStorage,
  setupRecoveredEventListener,
  setupBackgroundRecoveryInterval,
  setupCacheCleanupInterval,
  setupBeforeUnloadHandler,
  setupCrossWindowSync,
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
  // P1-6 修复：启动跨窗口任务变更监听
  setupCrossWindowSync(store);
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
      const mappedStatus = mapApiStatus(result.data.status || "generating", result.data.videoUrl);
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

    // Align with polling-task-handler.ts handlePollException: network errors
    // must NOT count as poll failures (cloud video may still be generating).
    const isNetworkError = (() => {
      if (error instanceof TypeError && error.message.includes("fetch")) return true;
      if (error instanceof Error) {
        return NETWORK_ERROR_PATTERNS.some((p) => p.test(error.message));
      }
      return false;
    })();

    if (isNetworkError) {
      const updatedTask: VideoTask = {
        ...task,
        message: t("task.networkErrorRetry"),
      };
      try {
        await persistVideoTask(updatedTask, {
          logLevel: "warn",
          logLabel: "Network error polling task (not counted as failure)",
        });
      } catch (saveError) {
        errorLogger.error("[VideoTaskManager] Failed to save network-error status", saveError);
      }
      store.getState().setAllTasks((prev) =>
        prev.map((t) => (t.taskId === taskId ? updatedTask : t)),
      );
      scheduleSync();
      checkAndStartOrStopPolling();
      return;
    }

    // Non-network error: count toward MAX_POLL_FAILURES; on reach, transition
    // to "timeout" (recoverable) instead of "failed" (terminal). Do NOT delete
    // cached video — the cloud video may still complete successfully.
    const failCount = (task.pollFailureCount || 0) + 1;
    const reachedMax = failCount >= MAX_POLL_FAILURES;
    const targetStatus: VideoTask["status"] = reachedMax ? "timeout" : task.status;
    const guardedUpdates = reachedMax
      ? withTransitionGuard(task, "timeout", {
          message: t("task.queryFailRecoverable", { count: MAX_POLL_FAILURES }),
          pollFailureCount: 0,
        })
      : {};
    const updatedTask: VideoTask = {
      ...task,
      ...guardedUpdates,
      status: targetStatus,
      pollFailureCount: reachedMax ? 0 : failCount,
      message: reachedMax
        ? t("task.queryFailRecoverable", { count: MAX_POLL_FAILURES })
        : t("video.queryFailedReason", { reason: mapUserFacingError(error) }),
    };
    if (reachedMax) {
      const taskLabel = task.beatTitle || task.storyTitle || taskId.slice(0, 8);
      emitToast(
        "warning",
        t("task.queryFailRecoverableLabel", { label: taskLabel }),
        t("task.queryFailRecoverable", { count: MAX_POLL_FAILURES }),
      );
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
