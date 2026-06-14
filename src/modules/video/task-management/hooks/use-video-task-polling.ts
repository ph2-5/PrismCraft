import { container } from "@/infrastructure/di";
import {
  saveVideoTask,
  recoverVideoByTaskId,
  registerCacheVideoBlobFn,
} from "@/modules/video/recovery";
import { cacheVideoBlob, registerRecoveryFn, removeCachedVideo } from "@/modules/video/cache";
import { errorLogger } from "@/shared/error-logger";
import { mapUserFacingError } from "@/shared/utils/user-facing-error";
import { emitToast } from "@/shared/utils/toast-bridge";
import { t } from "@/shared/constants";
import { AppError } from "@/domain/types/result";
import type { VideoTask } from "@/domain/schemas";
import { mapApiStatus } from "../domain";
import {
  withTransitionGuard,
  pollingState,
  cleanupAllPollingResources,
  MAX_POLL_FAILURES,
  scheduleSync,
  checkAndStartOrStopPolling,
} from "./internals";
import {
  loadTasksFromStorage,
  setupRecoveredEventListener,
  setupBackgroundRecoveryInterval,
  setupCacheCleanupInterval,
  setupBeforeUnloadHandler,
} from "./internals/task-initializer";
import { useVideoTaskStore } from "./use-video-task-manager";

export interface VideoTaskPolling {
  initialize: () => void;
  pollTask: (taskId: string) => Promise<void>;
  cleanup: () => void;
}

let _recoveryRegistered = false;
function ensureRecoveryRegistered() {
  if (_recoveryRegistered) return;
  _recoveryRegistered = true;
  registerRecoveryFn(async (taskId) => {
    return recoverVideoByTaskId(taskId);
  });
  registerCacheVideoBlobFn(async (taskId: string, videoUrl: string) => {
    return cacheVideoBlob(taskId, videoUrl);
  });
}

function getStore() {
  return useVideoTaskStore.getState();
}

export function useVideoTaskPolling(): VideoTaskPolling {
  return {
    initialize: () => {
      const state = getStore();
      if (state.isInitialized || pollingState.isInitializing) return;
      pollingState.isInitializing = true;

      ensureRecoveryRegistered();
      cleanupAllPollingResources();

      const storeAccessor = { getState: getStore, set: useVideoTaskStore.setState.bind(useVideoTaskStore) };

      const loadTasks = loadTasksFromStorage(storeAccessor);
      loadTasks().catch((err) => {
        errorLogger.warn("[VideoTaskManager] 任务加载失败", err);
      });

      setupRecoveredEventListener(storeAccessor);
      setupBackgroundRecoveryInterval();
      setupCacheCleanupInterval();
      setupBeforeUnloadHandler(storeAccessor);
    },

    pollTask: async (taskId) => {
      const task = getStore().allTasks.find((t) => t.taskId === taskId);
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

          const pollSaveResult = await saveVideoTask({
            ...task,
            ...guardUpdates,
            lastPolledAt: new Date().toISOString(),
          });
          if (!pollSaveResult.ok) {
            errorLogger.warn(
              "[VideoTaskManager] 轮询结果持久化失败",
              pollSaveResult.error instanceof Error ? pollSaveResult.error.message : pollSaveResult.error,
            );
          }

          getStore().setAllTasks((prev) =>
            prev.map((t) =>
              t.taskId === taskId ? { ...t, ...guardUpdates } : t,
            ),
          );
          scheduleSync();
          checkAndStartOrStopPolling();
        } else {
          getStore().setAllTasks((prev) =>
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
          const failSaveResult = await saveVideoTask(updatedTask);
          if (!failSaveResult.ok) {
            errorLogger.error(
              "[VideoTaskManager] Failed to save poll failure",
              failSaveResult.error,
            );
          }
        } catch (saveError) {
          errorLogger.error(
            "[VideoTaskManager] Failed to save poll failure",
            saveError,
          );
        }
        getStore().setAllTasks((prev) =>
          prev.map((t) => (t.taskId === taskId ? updatedTask : t)),
        );
        scheduleSync();
        checkAndStartOrStopPolling();
      }
    },

    cleanup: () => {
      cleanupAllPollingResources();
      useVideoTaskStore.setState({ isInitialized: false, isBackgroundProcessing: false, initError: null });
    },
  };
}
