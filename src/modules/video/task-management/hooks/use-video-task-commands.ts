import { container } from "@/infrastructure/di";
import { saveVideoTask } from "@/modules/video/recovery";
import { errorLogger } from "@/shared/error-logger";
import { emitToast } from "@/shared/utils/toast-bridge";
import { t } from "@/shared/constants";
import type { VideoTask } from "@/domain/schemas";
import { TaskMachine } from "../domain";
import {
  checkAndStartOrStopPolling,
  schedulePolling,
} from "./internals";
import {
  removeTaskFromStorageAndCache,
  removeTasksFromStorageAndCache,
  clearCacheForTasks,
  filterTasksByStatus,
  excludeTasksByStatus,
  excludeTasksByIds,
} from "./internals/task-removal";
import { useVideoTaskStore } from "./use-video-task-manager";

export interface VideoTaskCommands {
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
  cancelTask: (taskId: string) => Promise<void>;
  recoverTask: (taskId: string, status: string, videoUrl?: string) => void;
  startBackgroundProcessing: () => void;
}

function getStore() {
  return useVideoTaskStore.getState();
}

export function useVideoTaskCommands(): VideoTaskCommands {
  return {
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

      getStore().setAllTasks((prev) => [newTask, ...prev]);
      return newTask;
    },

    removeTask: async (taskId) => {
      try {
        await removeTaskFromStorageAndCache(taskId);
        getStore().setAllTasks((prev) => prev.filter((task) => task.taskId !== taskId));
      } catch (error) {
        errorLogger.error("Failed to remove video task", error);
        emitToast("error", t("video.taskDeleteTitle"), t("video.taskDeleteFailed"));
      }
    },

    removeTasks: async (taskIds) => {
      try {
        await removeTasksFromStorageAndCache(taskIds);
        getStore().setAllTasks((prev) => excludeTasksByIds(prev, taskIds));
      } catch (error) {
        errorLogger.error("Failed to remove video tasks", error);
      }
    },

    removeTasksByBeatId: async (beatId) => {
      const tasks = getStore().allTasks.filter((t) => t.beatId === beatId);
      for (const task of tasks) {
        if (TaskMachine.isPollable(task.status)) {
          try {
            await getStore().cancelTask(task.taskId);
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
      getStore().setAllTasks((prev) => prev.filter((t) => t.beatId !== beatId));
      checkAndStartOrStopPolling();
    },

    removeTasksByStoryId: async (storyId) => {
      const tasks = getStore().allTasks.filter((t) => t.storyId === storyId);
      for (const task of tasks) {
        if (TaskMachine.isPollable(task.status)) {
          try {
            await getStore().cancelTask(task.taskId);
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
      getStore().setAllTasks((prev) => prev.filter((t) => t.storyId !== storyId));
      checkAndStartOrStopPolling();
    },

    clearActiveTasks: async () => {
      const activeIds = filterTasksByStatus(getStore().allTasks, ["pending", "generating"]).map((t) => t.taskId);
      if (activeIds.length === 0) return;
      try {
        await container.videoTaskStorage.batchDeleteVideoTasks(activeIds);
        await clearCacheForTasks(activeIds);
        getStore().setAllTasks((prev) => excludeTasksByIds(prev, activeIds));
      } catch (error) {
        errorLogger.error("Failed to clear active tasks", error);
      }
    },

    clearAllTasks: async () => {
      const taskIds = getStore().allTasks.map((t) => t.taskId);
      try {
        await container.videoTaskStorage.clearVideoTasks();
        await clearCacheForTasks(taskIds);
        getStore().setAllTasks([]);
      } catch (error) {
        errorLogger.error("Failed to clear all video tasks", error);
      }
    },

    clearCompletedTasks: async () => {
      try {
        await container.videoTaskStorage.deleteVideoTasksByStatus(["completed"]);
        getStore().setAllTasks((prev) => excludeTasksByStatus(prev, ["completed"]));
      } catch (error) {
        errorLogger.error("Failed to clear completed tasks", error);
      }
    },

    clearFailedTasks: async () => {
      try {
        await container.videoTaskStorage.deleteVideoTasksByStatus(["failed", "timeout"]);
        getStore().setAllTasks((prev) => excludeTasksByStatus(prev, ["failed", "timeout"]));
      } catch (error) {
        errorLogger.error("Failed to clear failed tasks", error);
      }
    },

    createTask: async (prompt, _deprecated, extraOptions) => {
      if (getStore().isCreating) {
        errorLogger.warn("[VideoTaskManager] 已有任务创建中，请稍后重试");
        return null;
      }
      useVideoTaskStore.setState({ isCreating: true });
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
          characterRefs?: string[];
          sceneRef?: string;
        } = {
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

          getStore().setAllTasks((prev) => [newTask, ...prev]);

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
        useVideoTaskStore.setState({ isCreating: false });
      }
    },

    cancelTask: async (taskId) => {
      await getStore().cancelTask(taskId);
    },

    recoverTask: (taskId, status, videoUrl) => {
      getStore().recoverTask(taskId, status, videoUrl);
    },

    startBackgroundProcessing: () => {
      useVideoTaskStore.setState({ isBackgroundProcessing: true });
    },
  };
}
