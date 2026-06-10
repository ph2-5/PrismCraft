import { useMemo } from "react";
import { create } from "zustand";
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
import {
  loadTasksFromStorage,
  setupRecoveredEventListener,
  setupBackgroundRecoveryInterval,
  setupCacheCleanupInterval,
  setupBeforeUnloadHandler,
} from "./internals/task-initializer";
import {
  removeTaskFromStorageAndCache,
  removeTasksFromStorageAndCache,
  clearCacheForTasks,
  filterTasksByStatus,
  excludeTasksByStatus,
  excludeTasksByIds,
} from "./internals/task-removal";

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

    const store = { getState: get, set };

    const loadTasks = loadTasksFromStorage(store);
    loadTasks().catch((err) => {
      errorLogger.warn("[VideoTaskManager] 任务加载失败", err);
    });

    setupRecoveredEventListener(store);
    setupBackgroundRecoveryInterval();
    setupCacheCleanupInterval();
    setupBeforeUnloadHandler(store);
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
      await removeTaskFromStorageAndCache(taskId);
      get().setAllTasks((prev) => prev.filter((task) => task.taskId !== taskId));
    } catch (error) {
      errorLogger.error("Failed to remove video task", error);
      emitToast("error", t("video.taskDeleteTitle"), t("video.taskDeleteFailed"));
    }
  },

  removeTasks: async (taskIds) => {
    try {
      await removeTasksFromStorageAndCache(taskIds);
      get().setAllTasks((prev) => excludeTasksByIds(prev, taskIds));
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
    await clearCacheForTasks(tasks.map((t) => t.taskId));
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
    await clearCacheForTasks(tasks.map((t) => t.taskId));
    get().setAllTasks((prev) => prev.filter((t) => t.storyId !== storyId));
    checkAndStartOrStopPolling();
  },

  clearActiveTasks: async () => {
    const activeIds = filterTasksByStatus(get().allTasks, ["pending", "generating"]).map((t) => t.taskId);
    if (activeIds.length === 0) return;
    try {
      await container.videoTaskStorage.batchDeleteVideoTasks(activeIds);
      await clearCacheForTasks(activeIds);
      get().setAllTasks((prev) => excludeTasksByIds(prev, activeIds));
    } catch (error) {
      errorLogger.error("Failed to clear active tasks", error);
    }
  },

  clearAllTasks: async () => {
    const taskIds = get().allTasks.map((t) => t.taskId);
    try {
      await container.videoTaskStorage.clearVideoTasks();
      await clearCacheForTasks(taskIds);
      get().setAllTasks([]);
    } catch (error) {
      errorLogger.error("Failed to clear all video tasks", error);
    }
  },

  clearCompletedTasks: async () => {
    try {
      await container.videoTaskStorage.deleteVideoTasksByStatus(["completed"]);
      get().setAllTasks((prev) => excludeTasksByStatus(prev, ["completed"]));
    } catch (error) {
      errorLogger.error("Failed to clear completed tasks", error);
    }
  },

  clearFailedTasks: async () => {
    try {
      await container.videoTaskStorage.deleteVideoTasksByStatus(["failed"]);
      get().setAllTasks((prev) => excludeTasksByStatus(prev, ["failed"]));
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
        const taskId = result.data.taskId;
        if (typeof taskId !== "string" || taskId.length === 0 || taskId.length > 256) {
          throw new Error("Invalid task ID from provider");
        }
        const newTask: VideoTask = {
          taskId,
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

        const taskLabel = extraOptions?.beatTitle || extraOptions?.storyTitle || newTask.taskId.slice(0, 8);
        emitToast("success", t("video.taskSubmittedTitle"), t("video.taskSubmittedProcessing", { label: taskLabel }));

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

    const mappedStatus = mapApiStatus(status, videoUrl);
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
        ? activeTasks[activeTasks.length - 1]!.taskId
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
