import { create } from "zustand";
import type { VideoTask, VideoTaskStatus } from "@/domain/schemas";

export type { VideoTask, VideoTaskStatus };

export interface VideoTaskState {
  allTasks: VideoTask[];
  isBackgroundProcessing: boolean;
  isInitialized: boolean;
  isCreating: boolean;
  initError: string | null;
}

export interface VideoTaskStateActions {
  setAllTasks: (
    tasks: VideoTask[] | ((prev: VideoTask[]) => VideoTask[]),
  ) => void;
  updateTask: (taskId: string, updates: Partial<VideoTask>) => void;
  addTaskToState: (task: VideoTask) => void;
  removeTaskFromState: (taskId: string) => void;
  removeTasksFromState: (taskIds: string[]) => void;
  setIsCreating: (value: boolean) => void;
  setIsBackgroundProcessing: (value: boolean) => void;
  setInitialized: (value: boolean, error?: string | null) => void;
  resetState: () => void;
}

export type VideoTaskStateStore = VideoTaskState & VideoTaskStateActions;

const initialState: VideoTaskState = {
  allTasks: [],
  isBackgroundProcessing: false,
  isInitialized: false,
  isCreating: false,
  initError: null,
};

export const useVideoTaskState = create<VideoTaskStateStore>((set) => ({
  ...initialState,

  setAllTasks: (updater) => {
    set((state) => ({
      allTasks:
        typeof updater === "function" ? updater(state.allTasks) : updater,
    }));
  },

  updateTask: (taskId, updates) => {
    set((state) => ({
      allTasks: state.allTasks.map((t) =>
        t.taskId === taskId ? { ...t, ...updates } : t,
      ),
    }));
  },

  addTaskToState: (task) => {
    set((state) => ({
      allTasks: [task, ...state.allTasks],
    }));
  },

  removeTaskFromState: (taskId) => {
    set((state) => ({
      allTasks: state.allTasks.filter((t) => t.taskId !== taskId),
    }));
  },

  removeTasksFromState: (taskIds) => {
    const idSet = new Set(taskIds);
    set((state) => ({
      allTasks: state.allTasks.filter((t) => !idSet.has(t.taskId)),
    }));
  },

  setIsCreating: (value) => {
    set({ isCreating: value });
  },

  setIsBackgroundProcessing: (value) => {
    set({ isBackgroundProcessing: value });
  },

  setInitialized: (value, error = null) => {
    set({ isInitialized: value, initError: error });
  },

  resetState: () => {
    set(initialState);
  },
}));
