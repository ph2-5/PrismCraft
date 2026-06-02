import { useMemo } from "react";
import { create } from "zustand";
import { container } from "@/infrastructure/di";
import {
  saveVideoTask,
  startBackgroundRecovery,
  cleanExpiredTasks,
  recoverVideoByTaskId,
  registerCacheVideoBlobFn,
} from "@/modules/video/recovery";
import { cleanExpiredVideoCache, registerRecoveryFn, removeCachedVideo, cacheVideoBlob } from "@/modules/video/cache";
import { errorLogger, extractErrorMessage } from "@/shared/error-logger";
import { mapUserFacingError } from "@/shared/utils/user-facing-error";
import { emitToast } from "@/shared/utils/toast-bridge";
import { t } from "@/shared/constants";
import { AppError } from "@/domain/types/result";
import { isElectron } from "@/shared/utils/platform";

import type { VideoTask, VideoTaskStatus } from "@/domain/schemas";
import { TaskMachine, mapApiStatus } from "../domain";

import {
  withTransitionGuard,
  pollingState,
  registerPollingStore,
  stopPolling as _stopPolling,
  cleanupAllPollingResources,
  schedulePolling,
  checkAndStartOrStopPolling,
  MAX_POLL_FAILURES,
  scheduleSync,
  registerSyncStore,
} from "./internals";

export type { VideoTask, VideoTaskStatus };

interface VideoTaskManagerState {
  allTasks: VideoTask[];
  isBackgroundProcessing: boolean;
  isInitialized: boolean;
  isCreating: boolean;
  initError: string | null;

  initialize: () => void;
  setAllTasks: (
    tasks: VideoTask[] | ((prev: VideoTask[]) => VideoTask[]),
  ) => void;
  addTask: (
    task: Omit<VideoTask, "progress" | "createdAt">,
  ) => Promise<VideoTask>;
  removeTask: (taskId: string) => Promise<void>;
  removeTasks: (taskIds: string[]) => Promise<void>;
  removeTasksByBeatId: (beatId: string) => Promise<void>;
  removeTasksByStoryId: (storyId: string) => Promise<void>;
  clearActiveTasks: () => Promise<void>;
  clearAllTasks: () => Promise<void>;
  clearCompletedTasks: () => Promise<void>;
  clearFailedTasks: () => Promise<void>;
  createTask: (
    prompt: string,
    _deprecated?: undefined,
    extraOptions?: {
      fixedImageUrl?: string;
      fixedImageLockType?: "character" | "scene";
      referenceVideo?: string | null;
      duration?: number;
      storyId?: string;
      storyTitle?: string;
      beatId?: string;
      beatTitle?: string;
      firstFrameUrl?: string;
      lastFrameUrl?: string;
      providerId?: string;
      modelId?: string;
      format?: string;
      characterRef?: string;
      sceneRef?: string;
    },
  ) => Promise<(VideoTask & { promptWasTruncated?: boolean }) | null>;
  pollTask: (taskId: string) => Promise<void>;
  cancelTask: (taskId: string) => Promise<void>;
  recoverTask: (taskId: string, status: string, videoUrl?: string) => void;
  startBackgroundProcessing: () => void;
  cleanup: () => void;
}

export const useVideoTaskStore = create<VideoTaskManagerState>((set, get) => ({
  allTasks: [],
  isBackgroundProcessing: false,
  isInitialized: false,
  isCreating: false,
  initError: null,

  initialize: () => {
    const state = get();
    if (state.isInitialized || pollingState.isInitializing) return;
    pollingState.isInitializing = true;

    ensureRecoveryRegistered();
    cleanupAllPollingResources();

    const loadTasks = async () => {
      try {
        const tasks = await container.videoTaskStorage.getVideoTasks();
        set((state) => {
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
          set({ isInitialized: true, initError: null });
        } else {
          errorLogger.error("Failed to load video tasks", error);
          const msg = extractErrorMessage(error);
          set({ isInitialized: true, initError: msg });
          emitToast("error", t("video.taskLoadFailed"), msg);
        }
      } finally {
        pollingState.isInitializing = false;
      }
    };

    if (typeof window !== "undefined") {
      const handleRecovered = (e: Event) => {
        const detail = (e as CustomEvent).detail;
        if (detail?.taskId) {
          get().recoverTask(detail.taskId, detail.status, detail.videoUrl);
        }
      };
      pollingState.recoveredEventHandler = handleRecovered;
      window.addEventListener("video-task-recovered", handleRecovered);
    }

    loadTasks().catch((err) => {
      errorLogger.warn("[VideoTaskManager] 任务加载失败", err);
    });

    if (typeof window !== "undefined") {
      pollingState.recoveryIntervalId = setInterval(() => {
        startBackgroundRecovery().catch((err) => {
          errorLogger.warn("[VideoTaskManager] 后台恢复失败", err);
        });
      }, 60000);

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

      pollingState.beforeUnloadHandler = (e: BeforeUnloadEvent) => {
        const allTasks = get().allTasks;
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
              xhr.open("POST", `http://localhost:30100/video-tasks/bulk-save`, false);
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
  },

  setAllTasks: (updater) => {
    set((state) => ({
      allTasks:
        typeof updater === "function" ? updater(state.allTasks) : updater,
    }));
    scheduleSync();
    checkAndStartOrStopPolling();
  },

  addTask: async (task) => {
    const newTask: VideoTask = {
      ...task,
      progress: 0,
      createdAt: new Date().toISOString(),
    };

    const saveResult = await saveVideoTask({
      taskId: newTask.taskId,
      status: newTask.status,
      progress: 0,
      videoUrl: newTask.videoUrl,
      message: newTask.message,
      createdAt: newTask.createdAt,
      model: newTask.model,
      prompt: newTask.prompt,
      parameters: newTask.parameters,
      apiUrl: newTask.apiUrl,
      apiEndpoint: newTask.apiEndpoint,
      providerId: newTask.providerId,
      providerModelId: newTask.providerModelId,
      providerFormat: newTask.providerFormat,
      fixedImageUrl: newTask.fixedImageUrl,
      fixedImageLockType: newTask.fixedImageLockType,
      storyId: newTask.storyId,
      storyTitle: newTask.storyTitle,
      beatId: newTask.beatId,
      beatTitle: newTask.beatTitle,
    });
    if (!saveResult.ok) {
      errorLogger.warn(
        "[VideoTaskManager] 持久化任务失败，仅保留在内存中",
        saveResult.error instanceof Error ? saveResult.error.message : saveResult.error,
      );
    }

    get().setAllTasks((prev) => [newTask, ...prev]);
    return newTask;
  },

  removeTask: async (taskId) => {
    try {
      await container.videoTaskStorage.deleteVideoTask(taskId);
      get().setAllTasks((prev) => prev.filter((task) => task.taskId !== taskId));
      try {
        await removeCachedVideo(taskId);
      } catch (e) {
        errorLogger.warn(
          "[VideoTaskManager] 清除视频缓存失败",
          e instanceof Error ? e.message : e,
        );
      }
    } catch (error) {
      errorLogger.error("Failed to remove video task", error);
      emitToast("error", t("video.taskDeleteTitle"), t("video.taskDeleteFailed"));
    }
  },

  removeTasks: async (taskIds) => {
    try {
      await container.videoTaskStorage.batchDeleteVideoTasks(taskIds);
      for (const id of taskIds) {
        try {
          await removeCachedVideo(id);
        } catch (e) {
          errorLogger.warn(
            new AppError("CACHE_CLEANUP_ERROR", "清除视频缓存失败", e),
            "VideoTaskManager",
          );
        }
      }
      get().setAllTasks((prev) =>
        prev.filter((task) => !taskIds.includes(task.taskId)),
      );
    } catch (error) {
      errorLogger.error("Failed to remove video tasks", error);
    }
  },

  removeTasksByBeatId: async (beatId) => {
    const tasks = get().allTasks.filter((t) => t.beatId === beatId);
    for (const task of tasks) {
      if (TaskMachine.isPollable(task.status)) {
        try {
          await get().cancelTask(task.taskId);
        } catch (e) {
          errorLogger.warn("[VideoTaskManager] 取消beat关联任务失败", e);
        }
      }
    }
    try {
      await container.videoTaskStorage.deleteVideoTasksByBeatId(beatId);
    } catch (error) {
      errorLogger.error("Failed to remove video tasks by beatId", error);
      throw error;
    }
    for (const task of tasks) {
      try {
        await removeCachedVideo(task.taskId);
      } catch (e) {
        errorLogger.warn(
          new AppError("CACHE_CLEANUP_ERROR", "清除视频缓存失败", e),
          "VideoTaskManager",
        );
      }
    }
    get().setAllTasks((prev) => prev.filter((t) => t.beatId !== beatId));
    checkAndStartOrStopPolling();
  },

  removeTasksByStoryId: async (storyId) => {
    const tasks = get().allTasks.filter((t) => t.storyId === storyId);
    for (const task of tasks) {
      if (TaskMachine.isPollable(task.status)) {
        try {
          await get().cancelTask(task.taskId);
        } catch (e) {
          errorLogger.warn("[VideoTaskManager] 取消故事关联任务失败", e);
        }
      }
    }
    try {
      await container.videoTaskStorage.deleteVideoTasksByStoryId(storyId);
    } catch (error) {
      errorLogger.error("Failed to remove video tasks by storyId", error);
      throw error;
    }
    for (const task of tasks) {
      try {
        await removeCachedVideo(task.taskId);
      } catch (e) {
        errorLogger.warn(
          new AppError("CACHE_CLEANUP_ERROR", "清除视频缓存失败", e),
          "VideoTaskManager",
        );
      }
    }
    get().setAllTasks((prev) => prev.filter((t) => t.storyId !== storyId));
    checkAndStartOrStopPolling();
  },

  clearActiveTasks: async () => {
    const activeIds = get()
      .allTasks.filter(
        (t) => t.status === "pending" || t.status === "generating",
      )
      .map((t) => t.taskId);
    if (activeIds.length === 0) return;
    try {
      await container.videoTaskStorage.batchDeleteVideoTasks(activeIds);
      for (const id of activeIds) {
        try {
          await removeCachedVideo(id);
        } catch (e) {
          errorLogger.warn(
            new AppError("CACHE_CLEANUP_ERROR", "清除视频缓存失败", e),
            "VideoTaskManager",
          );
        }
      }
      get().setAllTasks((prev) =>
        prev.filter((t) => !activeIds.includes(t.taskId)),
      );
    } catch (error) {
      errorLogger.error("Failed to clear active tasks", error);
    }
  },

  clearAllTasks: async () => {
    try {
      await container.videoTaskStorage.clearVideoTasks();
      get().setAllTasks([]);
    } catch (error) {
      errorLogger.error("Failed to clear all video tasks", error);
    }
  },

  clearCompletedTasks: async () => {
    try {
      await container.videoTaskStorage.deleteVideoTasksByStatus(["completed"]);
      get().setAllTasks((prev) => prev.filter((t) => t.status !== "completed"));
    } catch (error) {
      errorLogger.error("Failed to clear completed tasks", error);
    }
  },

  clearFailedTasks: async () => {
    try {
      await container.videoTaskStorage.deleteVideoTasksByStatus(["failed"]);
      get().setAllTasks((prev) => prev.filter((t) => t.status !== "failed"));
    } catch (error) {
      errorLogger.error("Failed to clear failed tasks", error);
    }
  },

  createTask: async (prompt, _deprecated, extraOptions) => {
    if (get().isCreating) {
      errorLogger.warn("[VideoTaskManager] 已有任务创建中，请稍后重试");
      return null;
    }
    set({ isCreating: true });
    try {
      let result;
      const hasFrameOptions =
        extraOptions?.lastFrameUrl ||
        extraOptions?.firstFrameUrl ||
        extraOptions?.fixedImageUrl;

      const apiOptions: {
        duration?: number;
        referenceVideo?: string | null;
        providerId?: string;
        modelId?: string;
        format?: string;
        characterRef?: string;
        sceneRef?: string;
      } = {
        duration: extraOptions?.duration,
        referenceVideo: extraOptions?.referenceVideo,
        providerId: extraOptions?.providerId,
        modelId: extraOptions?.modelId,
        format: extraOptions?.format,
        characterRef: extraOptions?.characterRef,
        sceneRef: extraOptions?.sceneRef,
      };

      if (hasFrameOptions) {
        result = await container.videoProvider.generateVideoWithFrames({
          prompt,
          firstFrameUrl:
            extraOptions?.firstFrameUrl || extraOptions?.fixedImageUrl,
          lastFrameUrl: extraOptions?.lastFrameUrl,
          ...apiOptions,
        });
      } else {
        result = await container.videoProvider.generateVideo(prompt, {
          ...apiOptions,
          firstFrameUrl: extraOptions?.fixedImageUrl,
        });
      }
      if (result.success && result.data) {
        const newTask: VideoTask = {
          taskId: result.data.taskId as string,
          status: "pending",
          progress: 0,
          message: extraOptions?.beatTitle
            ? t("video.taskSubmittedWithBeat", { beatTitle: extraOptions.beatTitle })
            : t("video.taskSubmitted"),
          createdAt: new Date().toISOString(),
          prompt,
          fixedImageUrl: extraOptions?.fixedImageUrl,
          fixedImageLockType: extraOptions?.fixedImageLockType,
          providerId: result.data.providerId,
          providerModelId: result.data.providerModelId,
          providerFormat: result.data.providerFormat,
          storyId: extraOptions?.storyId,
          storyTitle: extraOptions?.storyTitle,
          beatId: extraOptions?.beatId,
          beatTitle: extraOptions?.beatTitle,
        };

        const createSaveResult = await saveVideoTask({
          taskId: newTask.taskId,
          status: newTask.status,
          progress: 0,
          message: newTask.message,
          createdAt: newTask.createdAt,
          prompt: newTask.prompt,
          fixedImageUrl: newTask.fixedImageUrl,
          fixedImageLockType: newTask.fixedImageLockType,
          apiUrl: newTask.apiUrl,
          model: newTask.model,
          providerId: newTask.providerId,
          providerModelId: newTask.providerModelId,
          providerFormat: newTask.providerFormat,
          storyId: newTask.storyId,
          storyTitle: newTask.storyTitle,
          beatId: newTask.beatId,
          beatTitle: newTask.beatTitle,
        });
        if (!createSaveResult.ok) {
          errorLogger.warn(
            "[VideoTaskManager] 持久化任务失败，仅保留在内存中",
            createSaveResult.error instanceof Error ? createSaveResult.error.message : createSaveResult.error,
          );
          const taskLabel = extraOptions?.beatTitle || extraOptions?.storyTitle || newTask.taskId.slice(0, 8);
          emitToast("warning", t("warning.memoryOnly"), t("warning.memoryOnlyDetail", { taskLabel }));
        }

        get().setAllTasks((prev) => [newTask, ...prev]);

        schedulePolling();

        if (result.data?.promptWasTruncated) {
          errorLogger.warn(
            `[VideoTaskManager] 提示词已被截断，原始长度: ${result.data.originalPromptLength} 字符`,
          );
        }

        return {
          ...newTask,
          promptWasTruncated: result.data?.promptWasTruncated || false,
        } as VideoTask & { promptWasTruncated?: boolean };
      } else {
        throw new Error(result.error || "Failed to create video task");
      }
    } catch (error) {
      errorLogger.error("Error creating video task", error);
      throw error;
    } finally {
      set({ isCreating: false });
    }
  },

  pollTask: async (taskId) => {
    const task = get().allTasks.find((t) => t.taskId === taskId);
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
        const mappedStatus = mapApiStatus(result.data.status || "failed");
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

        get().setAllTasks((prev) =>
          prev.map((t) =>
            t.taskId === taskId ? { ...t, ...guardUpdates } : t,
          ),
        );
      } else {
        get().setAllTasks((prev) =>
          prev.map((task) =>
            task.taskId === taskId
              ? { ...task, message: t("video.queryNoResponse") }
              : task,
          ),
        );
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
        removeCachedVideo(taskId).catch(() => {});
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
      get().setAllTasks((prev) =>
        prev.map((t) => (t.taskId === taskId ? updatedTask : t)),
      );
    }
  },

  cancelTask: async (taskId) => {
    const task = get().allTasks.find((t) => t.taskId === taskId);
    if (!task) return;

    const result = TaskMachine.transition(task, "cancelled");
    if (!result.ok) {
      errorLogger.warn(
        { code: "INVALID_TRANSITION", message: `taskId=${taskId}, from=${task.status}, to=cancelled` },
        "VideoTaskManager",
      );
      emitToast("warning", t("warning.cannotCancel"), t("warning.cannotCancelDetail", { status: task.status }));
      return;
    }

    const updatedTask = result.value;

    try {
      await container.videoTaskStorage.updateVideoTask(taskId, {
        status: "cancelled",
        message: t("video.userCancelled"),
        pollFailureCount: 0,
      });
    } catch (e) {
      errorLogger.warn("[VideoTaskManager] Failed to persist cancelled task", e);
    }

    get().setAllTasks((prev) =>
      prev.map((t) => (t.taskId === taskId ? updatedTask : t)),
    );

    checkAndStartOrStopPolling();
  },

  recoverTask: (taskId, status, videoUrl) => {
    const task = get().allTasks.find((t) => t.taskId === taskId);
    if (!task) return;

    const mappedStatus = mapApiStatus(status);
    const result = TaskMachine.transition(task, mappedStatus, { videoUrl });
    if (!result.ok) {
      errorLogger.warn(
        { code: "INVALID_TRANSITION", message: `taskId=${taskId}, from=${task.status}, to=${mappedStatus}` },
        "VideoTaskManager",
      );
      return;
    }

    const updatedTask = result.value;
    get().setAllTasks((prev) =>
      prev.map((t) =>
        t.taskId === taskId ? updatedTask : t,
      ),
    );
  },

  startBackgroundProcessing: () => {
    set({ isBackgroundProcessing: true });
  },

  cleanup: () => {
    cleanupAllPollingResources();
    set({ isInitialized: false, isBackgroundProcessing: false, initError: null });
  },
}));

registerPollingStore(useVideoTaskStore);
registerSyncStore(useVideoTaskStore);

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

export function useVideoTaskManager() {
  const store = useVideoTaskStore;

  const allTasks = store((s) => s.allTasks);
  const isBackgroundProcessing = store((s) => s.isBackgroundProcessing);

  const activeTasks = useMemo(
    () => allTasks.filter((t) => t.status === "pending" || t.status === "generating"),
    [allTasks],
  );
  const hasActiveTasks = activeTasks.length > 0;

  return {
    tasks: allTasks,
    allTasks,
    isGenerating: hasActiveTasks,
    activeTaskId:
      activeTasks.length > 0
        ? activeTasks[activeTasks.length - 1].taskId
        : null,
    activeTasks,
    hasActiveTasks,
    addTask: store.getState().addTask,
    createTask: store.getState().createTask,
    pollTask: store.getState().pollTask,
    cancelTask: store.getState().cancelTask,
    recoverTask: store.getState().recoverTask,
    removeTask: store.getState().removeTask,
    removeTasks: store.getState().removeTasks,
    removeTasksByBeatId: store.getState().removeTasksByBeatId,
    removeTasksByStoryId: store.getState().removeTasksByStoryId,
    clearTasks: store.getState().clearActiveTasks,
    clearAllTasks: store.getState().clearAllTasks,
    clearCompletedTasks: store.getState().clearCompletedTasks,
    clearFailedTasks: store.getState().clearFailedTasks,
    startBackgroundProcessing: store.getState().startBackgroundProcessing,
    initialize: store.getState().initialize,
    isBackgroundProcessing,
  };
}
