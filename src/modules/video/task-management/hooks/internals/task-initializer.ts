import { container } from "@/infrastructure/di";
import { startBackgroundRecovery, cleanExpiredTasks } from "@/modules/video/recovery";
import { cleanExpiredVideoCache } from "@/modules/video/cache";
import { errorLogger, extractErrorMessage } from "@/shared/error-logger";
import { emitToast } from "@/shared/utils/toast-bridge";
import { t } from "@/shared/constants";
import { isElectron } from "@/shared/utils/platform";
import { API_SERVER_PORT } from "@/config/ports";
import { AppError } from "@/domain/types/result";
import type { VideoTask } from "@/domain/schemas";
import { pollingState, checkAndStartOrStopPolling } from "./polling-engine";

interface InitStateSlice {
  allTasks: VideoTask[];
  isInitialized: boolean;
  initError: string | null;
}

interface StoreAccessor {
  getState: () => {
    allTasks: VideoTask[];
    recoverTask: (taskId: string, status: string, videoUrl?: string) => void;
  };
  set: (
    partial:
      | Partial<InitStateSlice>
      | ((state: InitStateSlice) => Partial<InitStateSlice>),
  ) => void;
}

export function loadTasksFromStorage(store: StoreAccessor): () => Promise<void> {
  return async () => {
    try {
      const tasks = await container.videoTaskStorage.getVideoTasks();
      store.set((state) => {
        const loadedIds = new Set(tasks.map((t) => t.taskId));
        const concurrentAdditions = state.allTasks.filter((t) => !loadedIds.has(t.taskId));
        return { allTasks: [...tasks, ...concurrentAdditions], isInitialized: true, initError: null };
      });

      try {
        const cleanedCountResult = await cleanExpiredVideoCache();
        if (cleanedCountResult.ok && cleanedCountResult.value > 0) {
          errorLogger.info(
            `[VideoTaskManager] 已清理 ${cleanedCountResult.value} 个过期视频缓存`,
          );
        }
      } catch (cleanError) {
        errorLogger.warn("[VideoTaskManager] 清理过期缓存失败", cleanError);
      }

      try {
        const expiredTaskCountResult = await cleanExpiredTasks();
        if (expiredTaskCountResult.ok && expiredTaskCountResult.value > 0) {
          errorLogger.info(
            `[VideoTaskManager] 已清理 ${expiredTaskCountResult.value} 个过期任务记录`,
          );
        }
      } catch (cleanError) {
        errorLogger.warn(
          new AppError("CLEANUP_ERROR", "清理过期任务失败", cleanError),
          "VideoTaskManager",
        );
      }

      checkAndStartOrStopPolling();
    } catch (error) {
      if (!isElectron()) {
        errorLogger.debug("Failed to load video tasks (browser mode)", error);
        store.set((state) => ({ ...state, isInitialized: true, initError: null }));
      } else {
        errorLogger.error("Failed to load video tasks", error);
        const msg = extractErrorMessage(error);
        store.set((state) => ({ ...state, isInitialized: true, initError: msg }));
        emitToast("error", t("video.taskLoadFailed"), msg);
      }
    } finally {
      pollingState.isInitializing = false;
    }
  };
}

export function setupRecoveredEventListener(store: StoreAccessor): void {
  if (typeof window === "undefined") return;
  const handleRecovered = (e: Event) => {
    const detail = (e as CustomEvent).detail;
    if (detail?.taskId) {
      store.getState().recoverTask(detail.taskId, detail.status, detail.videoUrl);
    }
  };
  pollingState.recoveredEventHandler = handleRecovered;
  window.addEventListener("video-task-recovered", handleRecovered);
}

export function setupBackgroundRecoveryInterval(): void {
  if (typeof window === "undefined") return;
  pollingState.recoveryIntervalId = setInterval(() => {
    startBackgroundRecovery().catch((err) => {
      errorLogger.warn("[VideoTaskManager] 后台恢复失败", err);
    });
  }, 60000);
}

export function setupCacheCleanupInterval(): void {
  if (typeof window === "undefined") return;
  pollingState.cacheCleanupIntervalId = setInterval(async () => {
    try {
      const cleanedCache = await cleanExpiredVideoCache();
      if (cleanedCache.ok && cleanedCache.value > 0) {
        errorLogger.info(`[VideoTaskManager] 定期清理: ${cleanedCache.value} 个过期视频缓存`);
      }
      const cleanedTasksResult = await cleanExpiredTasks();
      if (cleanedTasksResult.ok && cleanedTasksResult.value > 0) {
        errorLogger.info(`[VideoTaskManager] 定期清理: ${cleanedTasksResult.value} 个过期任务记录`);
      }
    } catch (err) {
      errorLogger.warn("[VideoTaskManager] 定期清理失败", err);
    }
  }, 30 * 60 * 1000);
}

export function setupBeforeUnloadHandler(store: StoreAccessor): void {
  if (typeof window === "undefined") return;
  pollingState.beforeUnloadHandler = (e: BeforeUnloadEvent) => {
    const allTasks = store.getState().allTasks;
    const hasActive = allTasks.some(
      (t) => t.status === "pending" || t.status === "generating",
    );

    if (typeof window !== "undefined" && !!window.electronAPI) {
      if (allTasks.length > 0) {
        try {
          const bulkData = allTasks.map((task) => ({
            taskId: task.taskId,
            status: task.status,
            progress: task.progress,
            videoUrl: task.videoUrl,
            message: task.message,
            storyId: task.storyId,
            beatId: task.beatId,
            createdAt: task.createdAt,
          }));
          const xhr = new XMLHttpRequest();
          xhr.open("POST", `http://localhost:${API_SERVER_PORT}/video-tasks/bulk-save`, false);
          xhr.setRequestHeader("Content-Type", "application/json");
          xhr.setRequestHeader("X-Electron-App", "true");
          xhr.send(JSON.stringify({ tasks: bulkData }));
        } catch (err) {
          errorLogger.error("[VideoTaskManager] beforeunload同步保存失败", err instanceof Error ? err : undefined);
        }
      }
      if (pollingState.syncTimeoutId) {
        clearTimeout(pollingState.syncTimeoutId);
        pollingState.syncTimeoutId = null;
      }
      return;
    }

    if (hasActive) {
      e.preventDefault();
      e.returnValue = "";
      return "";
    }
    if (pollingState.syncTimeoutId) {
      clearTimeout(pollingState.syncTimeoutId);
      pollingState.syncTimeoutId = null;
    }
  };
  window.addEventListener("beforeunload", pollingState.beforeUnloadHandler);
}
