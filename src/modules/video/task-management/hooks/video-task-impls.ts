/**
 * Video Task Manager — 命令实现（video-task-impls）
 *
 * 从 use-video-task-manager.ts 拆分而来：集中存放 store 各命令的纯实现函数
 * （remove/create/cancel/pause/resume/recover/clear 系列），use-video-task-manager.ts
 * 仅保留 Zustand store 定义与 React hook，通过 (set, get) 委托到本文件实现。
 *
 * 依赖方向与拆分前一致：container / internals（polling/sync/persist/task-removal）/ recovery 服务。
 */
import { container } from "@/infrastructure/di";
import { errorLogger } from "@/shared/error-logger";
import { emitToast } from "@/shared/utils/toast-bridge";
import { t } from "@/shared/constants";
import type { VideoTask } from "@/domain/schemas";
import { TaskMachine, mapApiStatus } from "../domain";
import { checkAndStartOrStopPolling, scheduleSync } from "./internals";
import { persistVideoTask } from "./internals/persist-task";
import {
  removeTaskFromStorageAndCache,
  removeTasksFromStorageAndCache,
  clearCacheForTasks,
  filterTasksByStatus,
  excludeTasksByStatus,
  excludeTasksByIds,
} from "./internals/task-removal";
import { checkForDuplicateVideos } from "../../recovery/services/duplicate-detection-service";
import type { StoreApi } from "zustand";

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

export interface VideoTaskManagerState {
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

export type TaskStoreSet = StoreApi<VideoTaskManagerState>["setState"];
export type TaskStoreGet = () => VideoTaskManagerState;

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

// ─── 命令实现 ─────────────────────────────────────────────────────────────────

export async function removeTaskImpl(_set: TaskStoreSet, get: TaskStoreGet, taskId: string): Promise<void> {
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

export async function removeTasksImpl(_set: TaskStoreSet, get: TaskStoreGet, taskIds: string[]): Promise<void> {
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

export async function removeTasksByBeatIdImpl(_set: TaskStoreSet, get: TaskStoreGet, beatId: string): Promise<void> {
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

export async function removeTasksByStoryIdImpl(_set: TaskStoreSet, get: TaskStoreGet, storyId: string): Promise<void> {
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

export async function clearActiveTasksImpl(_set: TaskStoreSet, get: TaskStoreGet): Promise<void> {
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

export async function clearAllTasksImpl(_set: TaskStoreSet, get: TaskStoreGet): Promise<void> {
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

export async function clearCompletedTasksImpl(_set: TaskStoreSet, get: TaskStoreGet): Promise<void> {
  try {
    await container.videoTaskStorage.deleteVideoTasksByStatus(["completed"]);
    get().setAllTasks((prev) => excludeTasksByStatus(prev, ["completed"]));
    scheduleSync();
  } catch (error) {
    errorLogger.error("Failed to clear completed tasks", error);
  }
}

export async function clearFailedTasksImpl(_set: TaskStoreSet, get: TaskStoreGet): Promise<void> {
  try {
    await container.videoTaskStorage.deleteVideoTasksByStatus(["failed", "timeout"]);
    get().setAllTasks((prev) => excludeTasksByStatus(prev, ["failed", "timeout"]));
    scheduleSync();
  } catch (error) {
    errorLogger.error("Failed to clear failed tasks", error);
  }
}

export async function createTaskImpl(
  set: TaskStoreSet,
  get: TaskStoreGet,
  prompt: string,
  extraOptions?: VideoTaskExtraOptions,
): Promise<(VideoTask & { promptWasTruncated?: boolean }) | null> {
  if (get().isCreating) {
    errorLogger.warn("[VideoTaskManager] 已有任务创建中，请稍后重试");
    // 明确告知用户"被拒绝"而非"失败"（返回 null 供调用方区分）
    emitToast("warning", t("video.taskCreatingInProgress"), t("video.taskCreatingInProgressDesc"));
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

    // 显式校验 provider 返回字段，避免非空断言得到 undefined 导致任务永远轮询不到
    const providerId = result.data.providerId;
    if (typeof providerId !== "string" || providerId.length === 0 || providerId.length > 128) {
      throw new Error("Invalid providerId from provider");
    }
    const providerModelId = result.data.providerModelId;
    if (typeof providerModelId !== "string" || providerModelId.length === 0 || providerModelId.length > 256) {
      throw new Error("Invalid providerModelId from provider");
    }

    const newTask = buildNewVideoTask(prompt, extraOptions, {
      taskId,
      providerId,
      providerModelId,
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
    // 使用 checkAndStartOrStopPolling：若有活跃任务会重置 consecutiveErrors，
    // 避免此前轮询错误暂停（>=5 次）导致新任务永远无法进入轮询队列
    checkAndStartOrStopPolling();
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

export async function cancelTaskImpl(_set: TaskStoreSet, get: TaskStoreGet, taskId: string): Promise<void> {
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

export async function pauseTaskImpl(_set: TaskStoreSet, get: TaskStoreGet, taskId: string): Promise<void> {
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

export async function resumeTaskImpl(_set: TaskStoreSet, get: TaskStoreGet, taskId: string): Promise<void> {
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

export function recoverTaskImpl(_set: TaskStoreSet, get: TaskStoreGet, taskId: string, status: string, videoUrl?: string): void {
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
