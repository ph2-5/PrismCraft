import { useMemo } from "react";
import { create } from "zustand";
import { container } from "@/infrastructure/di";
import { saveVideoTask } from "@/modules/video/recovery";
import { errorLogger } from "@/shared/error-logger";
import { emitToast } from "@/shared/utils/toast-bridge";
import { t } from "@/shared/constants";
import type { VideoTask, VideoTaskStatus } from "@/domain/schemas";
import { TaskMachine, mapApiStatus } from "../domain";
import {
  registerPollingStore,
  stopPolling as _stopPolling,
  cleanupAllPollingResources,
  schedulePolling,
  checkAndStartOrStopPolling,
  scheduleSync,
  registerSyncStore,
} from "./internals";
import {
  removeTaskFromStorageAndCache,
  removeTasksFromStorageAndCache,
  clearCacheForTasks,
  filterTasksByStatus,
  excludeTasksByStatus,
  excludeTasksByIds,
} from "./internals/task-removal";
import {
  initializePolling,
  pollTaskShared,
  type PollingStoreAccessor,
} from "./internals/shared-polling-logic";

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
      characterRefs?: string[];
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
    ensureStoresRegistered();
    initializePolling({ getState: get, set } as PollingStoreAccessor);
  },

  setAllTasks: (updater) => {
    set((state) => ({
      allTasks:
        typeof updater === "function" ? updater(state.allTasks) : updater,
    }));
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
    scheduleSync();
    checkAndStartOrStopPolling();
    return newTask;
  },

  removeTask: async (taskId) => {
    try {
      await removeTaskFromStorageAndCache(taskId);
      get().setAllTasks((prev) => prev.filter((task) => task.taskId !== taskId));
      scheduleSync();
      checkAndStartOrStopPolling();
    } catch (error) {
      errorLogger.error("Failed to remove video task", error);
      emitToast("error", t("video.taskDeleteTitle"), t("video.taskDeleteFailed"));
    }
  },

  removeTasks: async (taskIds) => {
    try {
      await removeTasksFromStorageAndCache(taskIds);
      get().setAllTasks((prev) => excludeTasksByIds(prev, taskIds));
      scheduleSync();
      checkAndStartOrStopPolling();
    } catch (error) {
      errorLogger.error("Failed to remove video tasks", error);
    }
  },

  removeTasksByBeatId: async (beatId) => {
    const tasks = get().allTasks.filter((task) => task.beatId === beatId);
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
    await clearCacheForTasks(tasks.map((task) => task.taskId));
    get().setAllTasks((prev) => prev.filter((task) => task.beatId !== beatId));
    scheduleSync();
    checkAndStartOrStopPolling();
  },

  removeTasksByStoryId: async (storyId) => {
    const tasks = get().allTasks.filter((task) => task.storyId === storyId);
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
    await clearCacheForTasks(tasks.map((task) => task.taskId));
    get().setAllTasks((prev) => prev.filter((task) => task.storyId !== storyId));
    scheduleSync();
    checkAndStartOrStopPolling();
  },

  clearActiveTasks: async () => {
    const activeTasks = filterTasksByStatus(get().allTasks, ["pending", "generating"]);
    // 先逐个通知服务端取消（best-effort），避免服务端继续生成造成 token 浪费
    for (const task of activeTasks) {
      if (TaskMachine.isPollable(task.status)) {
        try {
          await get().cancelTask(task.taskId);
        } catch (e) {
          errorLogger.warn("[VideoTaskManager] clearActiveTasks 取消任务失败", e);
        }
      }
    }
    const activeIds = activeTasks.map((task) => task.taskId);
    if (activeIds.length === 0) return;
    try {
      await container.videoTaskStorage.batchDeleteVideoTasks(activeIds);
      await clearCacheForTasks(activeIds);
      get().setAllTasks((prev) => excludeTasksByIds(prev, activeIds));
      scheduleSync();
      checkAndStartOrStopPolling();
    } catch (error) {
      errorLogger.error("Failed to clear active tasks", error);
    }
  },

  clearAllTasks: async () => {
    const allTasks = get().allTasks;
    // 先逐个通知服务端取消活跃任务（best-effort）
    for (const task of allTasks) {
      if (TaskMachine.isPollable(task.status)) {
        try {
          await get().cancelTask(task.taskId);
        } catch (e) {
          errorLogger.warn("[VideoTaskManager] clearAllTasks 取消任务失败", e);
        }
      }
    }
    const taskIds = allTasks.map((task) => task.taskId);
    try {
      await container.videoTaskStorage.clearVideoTasks();
      await clearCacheForTasks(taskIds);
      get().setAllTasks([]);
      scheduleSync();
      checkAndStartOrStopPolling();
    } catch (error) {
      errorLogger.error("Failed to clear all video tasks", error);
    }
  },

  clearCompletedTasks: async () => {
    try {
      await container.videoTaskStorage.deleteVideoTasksByStatus(["completed"]);
      get().setAllTasks((prev) => excludeTasksByStatus(prev, ["completed"]));
      scheduleSync();
    } catch (error) {
      errorLogger.error("Failed to clear completed tasks", error);
    }
  },

  clearFailedTasks: async () => {
    try {
      await container.videoTaskStorage.deleteVideoTasksByStatus(["failed", "timeout"]);
      get().setAllTasks((prev) => excludeTasksByStatus(prev, ["failed", "timeout"]));
      scheduleSync();
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

      const commonApiOptions = {
        duration: extraOptions?.duration,
        referenceVideo: extraOptions?.referenceVideo,
        providerId: extraOptions?.providerId,
        modelId: extraOptions?.modelId,
        format: extraOptions?.format,
        characterRef: extraOptions?.characterRef,
        characterRefs: extraOptions?.characterRefs,
        sceneRef: extraOptions?.sceneRef,
      };

      if (hasFrameOptions) {
        result = await container.videoProvider.generateVideoWithFrames({
          prompt,
          firstFrameUrl:
            extraOptions?.firstFrameUrl || extraOptions?.fixedImageUrl,
          lastFrameUrl: extraOptions?.lastFrameUrl,
          ...commonApiOptions,
        });
      } else {
        result = await container.videoProvider.generateVideo(prompt, {
          ...commonApiOptions,
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
        };
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
    await pollTaskShared({ getState: get, set } as PollingStoreAccessor, taskId);
  },

  cancelTask: async (taskId) => {
    const task = get().allTasks.find((task) => task.taskId === taskId);
    if (!task) return;

    const result = TaskMachine.transition(
      task,
      "cancelled",
      { error: t("video.taskCancelled") },
      t("video.taskTransitionError", { from: task.status, to: "cancelled" }),
    );
    if (!result.ok) {
      errorLogger.warn(
        { code: "INVALID_TRANSITION", message: `taskId=${taskId}, from=${task.status}, to=cancelled` },
        "VideoTaskManager",
      );
      emitToast("warning", t("warning.cannotCancel"), t("warning.cannotCancelDetail", { status: task.status }));
      return;
    }

    // 尝试通知服务端取消（best-effort，失败不影响本地取消）
    try {
      const provider = container.videoProvider;
      if (typeof provider.cancelTask === "function") {
        await provider.cancelTask(taskId);
      }
    } catch (e) {
      errorLogger.warn("Failed to cancel task on server side", e);
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
      prev.map((task) => (task.taskId === taskId ? updatedTask : task)),
    );
    scheduleSync();
    checkAndStartOrStopPolling();
  },

  recoverTask: (taskId, status, videoUrl) => {
    const task = get().allTasks.find((task) => task.taskId === taskId);
    if (!task) return;

    const mappedStatus = mapApiStatus(status, videoUrl);
    const result = TaskMachine.transition(
      task,
      mappedStatus,
      { videoUrl },
      t("video.taskTransitionError", { from: task.status, to: mappedStatus }),
    );
    if (!result.ok) {
      errorLogger.warn(
        { code: "INVALID_TRANSITION", message: `taskId=${taskId}, from=${task.status}, to=${mappedStatus}` },
        "VideoTaskManager",
      );
      return;
    }

    const updatedTask = result.value;
    get().setAllTasks((prev) =>
      prev.map((task) =>
        task.taskId === taskId ? updatedTask : task,
      ),
    );
    scheduleSync();
    checkAndStartOrStopPolling();
  },

  startBackgroundProcessing: () => {
    set({ isBackgroundProcessing: true });
  },

  cleanup: () => {
    cleanupAllPollingResources();
    set({ isInitialized: false, isBackgroundProcessing: false, initError: null });
  },
}));

let _storesRegistered = false;
function ensureStoresRegistered() {
  if (_storesRegistered) return;
  _storesRegistered = true;
  registerPollingStore(useVideoTaskStore);
  registerSyncStore(useVideoTaskStore);
}

export function useVideoTaskManager() {
  ensureStoresRegistered();
  const store = useVideoTaskStore;

  const allTasks = store((s) => s.allTasks);
  const isBackgroundProcessing = store((s) => s.isBackgroundProcessing);

  const activeTasks = useMemo(
    () => allTasks.filter((task) => task.status === "pending" || task.status === "generating"),
    [allTasks],
  );
  const hasActiveTasks = activeTasks.length > 0;
  const activeTaskId = activeTasks.length > 0 ? activeTasks[activeTasks.length - 1]?.taskId ?? null : null;

  // Stable references — these never change because they come from zustand store.getState()
  const stableActions = useMemo(() => ({
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
  }), [store]);

  return useMemo(() => ({
    tasks: allTasks,
    allTasks,
    isGenerating: hasActiveTasks,
    activeTaskId,
    activeTasks,
    hasActiveTasks,
    ...stableActions,
    isBackgroundProcessing,
  }), [allTasks, activeTasks, hasActiveTasks, activeTaskId, stableActions, isBackgroundProcessing]);
}
