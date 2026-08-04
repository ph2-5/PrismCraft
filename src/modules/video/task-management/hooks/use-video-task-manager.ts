import { useMemo } from "react";
import { create } from "zustand";
import type { VideoTask, VideoTaskStatus } from "@/domain/schemas";
import {
  registerPollingStore,
  cleanupAllPollingResources,
  checkAndStartOrStopPolling,
  scheduleSync,
  registerSyncStore,
} from "./internals";
import { persistVideoTask } from "./internals/persist-task";
import {
  initializePolling,
  pollTaskShared,
  type PollingStoreAccessor,
} from "./internals/shared-polling-logic";
import {
  removeTaskImpl,
  removeTasksImpl,
  removeTasksByBeatIdImpl,
  removeTasksByStoryIdImpl,
  clearActiveTasksImpl,
  clearAllTasksImpl,
  clearCompletedTasksImpl,
  clearFailedTasksImpl,
  createTaskImpl,
  cancelTaskImpl,
  pauseTaskImpl,
  resumeTaskImpl,
  recoverTaskImpl,
  type VideoTaskManagerState,
} from "./video-task-impls";

export type { VideoTask, VideoTaskStatus };

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

    await persistVideoTask(newTask, {
      logLabel: "持久化任务失败，仅保留在内存中",
      catchExceptions: false,
    });

    get().setAllTasks((prev) => [newTask, ...prev]);
    scheduleSync();
    checkAndStartOrStopPolling();
    return newTask;
  },

  removeTask: (taskId) => removeTaskImpl(set, get, taskId),
  removeTasks: (taskIds) => removeTasksImpl(set, get, taskIds),
  removeTasksByBeatId: (beatId) => removeTasksByBeatIdImpl(set, get, beatId),
  removeTasksByStoryId: (storyId) => removeTasksByStoryIdImpl(set, get, storyId),
  clearActiveTasks: () => clearActiveTasksImpl(set, get),
  clearAllTasks: () => clearAllTasksImpl(set, get),
  clearCompletedTasks: () => clearCompletedTasksImpl(set, get),
  clearFailedTasks: () => clearFailedTasksImpl(set, get),
  createTask: (prompt, extraOptions) => createTaskImpl(set, get, prompt, extraOptions),

  pollTask: async (taskId) => {
    await pollTaskShared({ getState: get, set } as PollingStoreAccessor, taskId);
  },

  cancelTask: (taskId) => cancelTaskImpl(set, get, taskId),
  pauseTask: (taskId) => pauseTaskImpl(set, get, taskId),
  resumeTask: (taskId) => resumeTaskImpl(set, get, taskId),
  recoverTask: (taskId, status, videoUrl) => recoverTaskImpl(set, get, taskId, status, videoUrl),

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
    pauseTask: store.getState().pauseTask,
    resumeTask: store.getState().resumeTask,
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
