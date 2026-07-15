import type { VideoTask } from "@/domain/schemas";
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
  pauseTask: (taskId: string) => Promise<void>;
  resumeTask: (taskId: string) => Promise<void>;
  recoverTask: (taskId: string, status: string, videoUrl?: string) => void;
  startBackgroundProcessing: () => void;
}

/**
 * Commands 层：所有写操作必须委托给 store action，不得绕过 store 直接调用 setAllTasks。
 * store action 内部已统一处理 scheduleSync() + checkAndStartOrStopPolling()，
 * 绕过会导致：1) 同步不触发（多设备数据不一致）；2) 轮询不启停（活跃任务无人轮询）。
 */
export function useVideoTaskCommands(): VideoTaskCommands {
  const store = useVideoTaskStore;
  return {
    addTask: (task) => store.getState().addTask(task),
    removeTask: (taskId) => store.getState().removeTask(taskId),
    removeTasks: (taskIds) => store.getState().removeTasks(taskIds),
    removeTasksByBeatId: (beatId) => store.getState().removeTasksByBeatId(beatId),
    removeTasksByStoryId: (storyId) => store.getState().removeTasksByStoryId(storyId),
    clearActiveTasks: () => store.getState().clearActiveTasks(),
    clearAllTasks: () => store.getState().clearAllTasks(),
    clearCompletedTasks: () => store.getState().clearCompletedTasks(),
    clearFailedTasks: () => store.getState().clearFailedTasks(),
    createTask: (prompt, _deprecated, extraOptions) =>
      store.getState().createTask(prompt, _deprecated, extraOptions),
    cancelTask: (taskId) => store.getState().cancelTask(taskId),
    pauseTask: (taskId) => store.getState().pauseTask(taskId),
    resumeTask: (taskId) => store.getState().resumeTask(taskId),
    recoverTask: (taskId, status, videoUrl) =>
      store.getState().recoverTask(taskId, status, videoUrl),
    startBackgroundProcessing: () => store.getState().startBackgroundProcessing(),
  };
}
