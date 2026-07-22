import { useMemo } from "react";
import { create, type StoreApi } from "zustand";
import { container } from "@/infrastructure/di";
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
import { persistVideoTask } from "./internals/persist-task";
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
import { checkForDuplicateVideos } from "../../recovery/services/duplicate-detection-service";

export type { VideoTask, VideoTaskStatus };

/**
 * createTask 的扩展选项。
 * 抽到模块作用域以便辅助函数引用，避免类型重复定义。
 */
export interface VideoTaskExtraOptions {
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
}

/**
 * 重复检测：若命中已有任务则返回该任务，否则返回 null。
 * 命中时同步发出 toast 和日志，行为与原内联逻辑一致。
 */
async function tryReuseDuplicateVideoTask(
  prompt: string,
  extraOptions: VideoTaskExtraOptions | undefined,
  allTasks: VideoTask[],
): Promise<VideoTask | null> {
  const duplicateProbe: Partial<VideoTask> = {
    prompt,
    providerId: extraOptions?.providerId,
    providerModelId: extraOptions?.modelId,
    fixedImageUrl: extraOptions?.fixedImageUrl ?? undefined,
    referenceVideoUrl: extraOptions?.referenceVideo ?? undefined,
  };
  const duplicate = await checkForDuplicateVideos(duplicateProbe, allTasks);
  if (!duplicate.hasDuplicate || !duplicate.existingTaskId) return null;

  const existing = allTasks.find((t) => t.taskId === duplicate.existingTaskId);
  if (!existing || !existing.videoUrl) return null;

  const taskLabel = extraOptions?.beatTitle || extraOptions?.storyTitle || existing.taskId.slice(0, 8);
  emitToast(
    "info",
    t("video.duplicateDetectedTitle"),
    t("video.duplicateDetectedDetail", { label: taskLabel, similarity: Math.round((duplicate.similarity ?? 0) * 100) }),
  );
  errorLogger.info(
    `[VideoTaskManager] 重复检测命中，复用已存在任务 ${existing.taskId} (相似度 ${Math.round((duplicate.similarity ?? 0) * 100)}%)`,
  );
  return existing;
}

/**
 * 派发 provider 视频生成请求。
 * 存在首/尾/固定帧时走 generateVideoWithFrames，否则走 generateVideo。
 */
async function dispatchProviderVideoRequest(
  prompt: string,
  extraOptions: VideoTaskExtraOptions | undefined,
) {
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
    return container.videoProvider.generateVideoWithFrames({
      prompt,
      firstFrameUrl: extraOptions?.firstFrameUrl || extraOptions?.fixedImageUrl,
      lastFrameUrl: extraOptions?.lastFrameUrl,
      ...commonApiOptions,
    });
  }
  return container.videoProvider.generateVideo(prompt, {
    ...commonApiOptions,
    firstFrameUrl: extraOptions?.fixedImageUrl,
  });
}

/**
 * 基于 provider 返回数据构造 VideoTask 内存对象。
 */
function buildNewVideoTask(
  prompt: string,
  extraOptions: VideoTaskExtraOptions | undefined,
  providerData: { taskId: string; providerId: string; providerModelId: string; providerFormat?: string },
): VideoTask {
  return {
    taskId: providerData.taskId,
    status: "pending",
    progress: 0,
    message: extraOptions?.beatTitle
      ? t("video.taskSubmittedWithBeat", { beatTitle: extraOptions.beatTitle })
      : t("video.taskSubmitted"),
    createdAt: new Date().toISOString(),
    prompt,
    fixedImageUrl: extraOptions?.fixedImageUrl,
    fixedImageLockType: extraOptions?.fixedImageLockType,
    providerId: providerData.providerId,
    providerModelId: providerData.providerModelId,
    providerFormat: providerData.providerFormat,
    storyId: extraOptions?.storyId,
    storyTitle: extraOptions?.storyTitle,
    beatId: extraOptions?.beatId,
    beatTitle: extraOptions?.beatTitle,
  };
}

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
    extraOptions?: VideoTaskExtraOptions,
  ) => Promise<(VideoTask & { promptWasTruncated?: boolean }) | null>;
  pollTask: (taskId: string) => Promise<void>;
  cancelTask: (taskId: string) => Promise<void>;
  pauseTask: (taskId: string) => Promise<void>;
  resumeTask: (taskId: string) => Promise<void>;
  recoverTask: (taskId: string, status: string, videoUrl?: string) => void;
  startBackgroundProcessing: () => void;
  cleanup: () => void;
}

type TaskStoreSet = StoreApi<VideoTaskManagerState>["setState"];
type TaskStoreGet = () => VideoTaskManagerState;

async function removeTaskImpl(_set: TaskStoreSet, get: TaskStoreGet, taskId: string): Promise<void> {
  try {
    await removeTaskFromStorageAndCache(taskId);
    get().setAllTasks((prev) => prev.filter((task) => task.taskId !== taskId));
    scheduleSync();
    checkAndStartOrStopPolling();
  } catch (error) {
    errorLogger.error("Failed to remove video task", error);
    emitToast("error", t("video.taskDeleteTitle"), t("video.taskDeleteFailed"));
  }
}

async function removeTasksImpl(_set: TaskStoreSet, get: TaskStoreGet, taskIds: string[]): Promise<void> {
  try {
    await removeTasksFromStorageAndCache(taskIds);
    get().setAllTasks((prev) => excludeTasksByIds(prev, taskIds));
    scheduleSync();
    checkAndStartOrStopPolling();
  } catch (error) {
    errorLogger.error("Failed to remove video tasks", error);
  }
}

async function cancelPollableTasks(get: TaskStoreGet, tasks: VideoTask[], label: string): Promise<void> {
  for (const task of tasks) {
    if (TaskMachine.isPollable(task.status)) {
      try {
        await get().cancelTask(task.taskId);
      } catch (e) {
        errorLogger.warn(`[VideoTaskManager] ${label}`, e);
      }
    }
  }
}

async function removeTasksByBeatIdImpl(_set: TaskStoreSet, get: TaskStoreGet, beatId: string): Promise<void> {
  const tasks = get().allTasks.filter((task) => task.beatId === beatId);
  await cancelPollableTasks(get, tasks, "取消beat关联任务失败");
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
}

async function removeTasksByStoryIdImpl(_set: TaskStoreSet, get: TaskStoreGet, storyId: string): Promise<void> {
  const tasks = get().allTasks.filter((task) => task.storyId === storyId);
  await cancelPollableTasks(get, tasks, "取消故事关联任务失败");
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
}

async function clearActiveTasksImpl(_set: TaskStoreSet, get: TaskStoreGet): Promise<void> {
  const activeTasks = filterTasksByStatus(get().allTasks, ["pending", "generating"]);
  await cancelPollableTasks(get, activeTasks, "clearActiveTasks 取消任务失败");
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
}

async function clearAllTasksImpl(_set: TaskStoreSet, get: TaskStoreGet): Promise<void> {
  const allTasks = get().allTasks;
  await cancelPollableTasks(get, allTasks, "clearAllTasks 取消任务失败");
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
}

async function clearCompletedTasksImpl(_set: TaskStoreSet, get: TaskStoreGet): Promise<void> {
  try {
    await container.videoTaskStorage.deleteVideoTasksByStatus(["completed"]);
    get().setAllTasks((prev) => excludeTasksByStatus(prev, ["completed"]));
    scheduleSync();
  } catch (error) {
    errorLogger.error("Failed to clear completed tasks", error);
  }
}

async function clearFailedTasksImpl(_set: TaskStoreSet, get: TaskStoreGet): Promise<void> {
  try {
    await container.videoTaskStorage.deleteVideoTasksByStatus(["failed", "timeout"]);
    get().setAllTasks((prev) => excludeTasksByStatus(prev, ["failed", "timeout"]));
    scheduleSync();
  } catch (error) {
    errorLogger.error("Failed to clear failed tasks", error);
  }
}

async function createTaskImpl(
  set: TaskStoreSet,
  get: TaskStoreGet,
  prompt: string,
  extraOptions?: VideoTaskExtraOptions,
): Promise<(VideoTask & { promptWasTruncated?: boolean }) | null> {
  if (get().isCreating) {
    errorLogger.warn("[VideoTaskManager] 已有任务创建中，请稍后重试");
    return null;
  }
  set({ isCreating: true });
  try {
    const reused = await tryReuseDuplicateVideoTask(prompt, extraOptions, get().allTasks);
    if (reused) return reused;

    const result = await dispatchProviderVideoRequest(prompt, extraOptions);
    if (!result.success || !result.data) {
      throw new Error(result.error || "Failed to create video task");
    }

    const taskId = result.data.taskId;
    if (typeof taskId !== "string" || taskId.length === 0 || taskId.length > 256) {
      throw new Error("Invalid task ID from provider");
    }

    const newTask = buildNewVideoTask(prompt, extraOptions, {
      taskId,
      providerId: result.data.providerId!,
      providerModelId: result.data.providerModelId!,
      providerFormat: result.data.providerFormat,
    });
    const taskLabel = extraOptions?.beatTitle || extraOptions?.storyTitle || newTask.taskId.slice(0, 8);
    await persistVideoTask(newTask, {
      logLabel: "持久化任务失败，仅保留在内存中",
      toastOnFailure: {
        titleKey: "warning.memoryOnly",
        detailKey: "warning.memoryOnlyDetail",
        detailArgs: { taskLabel },
      },
      catchExceptions: false,
    });

    get().setAllTasks((prev) => [newTask, ...prev]);
    schedulePolling();
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
  } catch (error) {
    errorLogger.error("Error creating video task", error);
    throw error;
  } finally {
    set({ isCreating: false });
  }
}

async function cancelTaskImpl(_set: TaskStoreSet, get: TaskStoreGet, taskId: string): Promise<void> {
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
}

async function pauseTaskImpl(_set: TaskStoreSet, get: TaskStoreGet, taskId: string): Promise<void> {
  const task = get().allTasks.find((task) => task.taskId === taskId);
  if (!task) return;

  const result = TaskMachine.transition(
    task,
    "paused",
    { error: t("video.userPaused") },
    t("video.taskTransitionError", { from: task.status, to: "paused" }),
  );
  if (!result.ok) {
    errorLogger.warn(
      { code: "INVALID_TRANSITION", message: `taskId=${taskId}, from=${task.status}, to=paused` },
      "VideoTaskManager",
    );
    emitToast("warning", t("warning.cannotPause"), t("warning.cannotPauseDetail", { status: task.status }));
    return;
  }

  const updatedTask = result.value;

  try {
    await container.videoTaskStorage.updateVideoTask(taskId, {
      status: "paused",
      message: t("video.userPaused"),
    });
  } catch (e) {
    errorLogger.warn("[VideoTaskManager] Failed to persist paused task", e);
  }

  get().setAllTasks((prev) =>
    prev.map((task) => (task.taskId === taskId ? updatedTask : task)),
  );
  scheduleSync();
  checkAndStartOrStopPolling();
  emitToast("info", t("video.taskPaused"), t("video.userPaused"));
}

async function resumeTaskImpl(_set: TaskStoreSet, get: TaskStoreGet, taskId: string): Promise<void> {
  const task = get().allTasks.find((task) => task.taskId === taskId);
  if (!task) return;

  const result = TaskMachine.transition(
    task,
    "generating",
    { error: t("video.userResumed") },
    t("video.taskTransitionError", { from: task.status, to: "generating" }),
  );
  if (!result.ok) {
    errorLogger.warn(
      { code: "INVALID_TRANSITION", message: `taskId=${taskId}, from=${task.status}, to=generating` },
      "VideoTaskManager",
    );
    emitToast("warning", t("warning.cannotResume"), t("warning.cannotResumeDetail", { status: task.status }));
    return;
  }

  const updatedTask = result.value;

  try {
    await container.videoTaskStorage.updateVideoTask(taskId, {
      status: "generating",
      message: t("video.userResumed"),
    });
  } catch (e) {
    errorLogger.warn("[VideoTaskManager] Failed to persist resumed task", e);
  }

  get().setAllTasks((prev) =>
    prev.map((task) => (task.taskId === taskId ? updatedTask : task)),
  );
  scheduleSync();
  checkAndStartOrStopPolling();
  emitToast("info", t("video.taskResumed"), t("video.userResumed"));
}

function recoverTaskImpl(_set: TaskStoreSet, get: TaskStoreGet, taskId: string, status: string, videoUrl?: string): void {
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
