import type { VideoTask } from "@/domain/schemas";
import { TaskMachine, mapApiStatus } from "../../domain";
import { container } from "@/infrastructure/di";
import { cacheVideoBlob } from "@/modules/video/cache";
import { saveVideoTask } from "@/modules/video/recovery";
import { errorLogger } from "@/shared/error-logger";
import { emitToast } from "@/shared/utils/toast-bridge";
import { t } from "@/shared/constants";
import { withTransitionGuard } from "./transition-guard";
import { MAX_POLL_FAILURES, MAX_POLL_DURATION } from "./polling-constants";

export interface PollResult {
  taskUpdates: Map<string, Partial<VideoTask>>;
  cacheTasks: Array<{ taskId: string; videoUrl: string }>;
  hasError: boolean;
  hasSuccess: boolean;
}

export async function handleTimedOutTasks(
  tasks: VideoTask[],
  _signal: AbortSignal,
  storeAccessor: { getState: () => { allTasks: VideoTask[]; setAllTasks: (updater: VideoTask[] | ((prev: VideoTask[]) => VideoTask[])) => void } },
): Promise<void> {
  const timedOutTasks = tasks.filter(
    (task) =>
      (task.status === "pending" || task.status === "generating") &&
      Date.now() - new Date(task.createdAt).getTime() > MAX_POLL_DURATION,
  );
  if (timedOutTasks.length === 0) return;

  emitToast("warning", t("error.videoGenerateTimeout"), t("task.timeoutRecoverHint", { count: timedOutTasks.length }));

  const validTimeoutIds = new Set<string>();
  const batchUpdates: Array<{ taskId: string; updates: Partial<VideoTask> }> = [];
  for (const task of timedOutTasks) {
    if (!TaskMachine.canTransition(task.status, "failed")) {
      errorLogger.warn(
        { code: "INVALID_TRANSITION", message: `taskId=${task.taskId}, from=${task.status}, to=failed` },
        "VideoTaskManager",
      );
      continue;
    }
    validTimeoutIds.add(task.taskId);
    batchUpdates.push({
      taskId: task.taskId,
      updates: {
        status: "failed",
        message: t("task.timeoutManualRecover"),
        pollFailureCount: 0,
      },
    });
  }

  if (validTimeoutIds.size > 0) {
    const state = storeAccessor.getState();
    state.setAllTasks((prev) =>
      prev.map((task) => {
        if (validTimeoutIds.has(task.taskId)) {
          return {
            ...task,
            ...withTransitionGuard(task, "failed", {
              message: t("task.timeoutManualRecover"),
              pollFailureCount: 0,
            }),
          };
        }
        return task;
      }),
    );
  }

  if (batchUpdates.length > 0) {
    try {
      await container.videoTaskStorage.batchUpdateVideoTasks(batchUpdates);
    } catch (e) {
      errorLogger.warn("[VideoTaskManager] Failed to persist timeout tasks (batch)", e);
    }
  }
}

async function handlePollException(
  task: VideoTask,
  error: unknown,
  result: PollResult,
): Promise<void> {
  const failCount = (task.pollFailureCount || 0) + 1;
  if (failCount >= MAX_POLL_FAILURES) {
    result.hasError = true;
    result.taskUpdates.set(task.taskId, withTransitionGuard(task, "failed", {
      message: t("task.consecutiveFailRecover", { count: MAX_POLL_FAILURES }),
      pollFailureCount: 0,
    }));
    const taskLabel = task.beatTitle || task.storyTitle || task.taskId.slice(0, 8);
    emitToast("error", t("error.videoGenerateFailed"), t("task.queryException", { label: taskLabel }));
  } else {
    result.taskUpdates.set(task.taskId, {
      pollFailureCount: failCount,
      message: t("task.queryExceptionProgress", { current: failCount, max: MAX_POLL_FAILURES }),
    });
  }
  try {
    const pollSaveResult = await saveVideoTask({
      taskId: task.taskId,
      status: failCount >= MAX_POLL_FAILURES ? "failed" : task.status,
      progress: task.progress,
      videoUrl: task.videoUrl,
      message: failCount >= MAX_POLL_FAILURES
        ? t("task.consecutiveFailRecover", { count: MAX_POLL_FAILURES })
        : task.message,
      createdAt: task.createdAt,
      model: task.model,
      prompt: task.prompt,
      parameters: task.parameters,
      apiUrl: task.apiUrl,
      apiEndpoint: task.apiEndpoint,
      providerId: task.providerId,
      providerModelId: task.providerModelId,
      providerFormat: task.providerFormat,
      fixedImageUrl: task.fixedImageUrl,
      fixedImageLockType: task.fixedImageLockType,
      storyId: task.storyId,
      storyTitle: task.storyTitle,
      beatId: task.beatId,
      beatTitle: task.beatTitle,
      pollFailureCount: failCount >= MAX_POLL_FAILURES ? 0 : failCount,
    });
    if (!pollSaveResult.ok) {
      errorLogger.error("[VideoTaskManager] Failed to save poll failure", pollSaveResult.error);
    }
  } catch (saveError) {
    errorLogger.error("[VideoTaskManager] Failed to save poll failure", saveError);
  }
  errorLogger.warn(
    `[VideoTaskManager] Poll failed for ${task.taskId} (attempt ${failCount}/${MAX_POLL_FAILURES})`,
    error,
  );
}

async function pollSingleTask(
  task: VideoTask,
  signal: AbortSignal,
  result: PollResult,
): Promise<void> {
  if (signal.aborted) return;
  try {
    const pollOptions: Parameters<typeof container.videoProvider.queryVideoStatus>[1] = {};
    if (task.providerId && task.providerModelId) {
      pollOptions.providerId = task.providerId;
      pollOptions.modelId = task.providerModelId;
      if (task.providerFormat) {
        pollOptions.format = task.providerFormat;
      }
    }
    const pollResp = await container.videoProvider.queryVideoStatus(task.taskId, pollOptions);
    if (signal.aborted) return;

    if (pollResp.success && pollResp.data) {
      result.hasSuccess = true;
      const justCompleted = pollResp.data.status === "completed" && !!pollResp.data.videoUrl;
      if (justCompleted && pollResp.data.videoUrl) {
        result.cacheTasks.push({ taskId: task.taskId, videoUrl: pollResp.data.videoUrl });
        const taskLabel = task.beatTitle || task.storyTitle || task.taskId.slice(0, 8);
        emitToast("success", t("task.videoGenerated"), t("task.videoSavingLocal", { label: taskLabel }));
      }
      const mappedStatus = mapApiStatus(pollResp.data.status || "failed", pollResp.data.videoUrl);
      result.taskUpdates.set(task.taskId, withTransitionGuard(task, mappedStatus, {
        progress: pollResp.data.progress || task.progress,
        videoUrl: pollResp.data.videoUrl,
        message: pollResp.data.message || task.message,
        pollFailureCount: 0,
      }));
    } else {
      const apiErrorMsg = pollResp.error || t("task.apiReturnFailed");
      const isRetryable =
        (pollResp as { retryable?: boolean }).retryable === true ||
        (pollResp as { data?: { retryable?: boolean } }).data?.retryable === true;
      if (isRetryable) {
        result.taskUpdates.set(task.taskId, {
          message: t("task.retryableQueryFail", { error: apiErrorMsg }),
        });
      } else {
        result.hasError = true;
        const failCount = (task.pollFailureCount || 0) + 1;
        result.taskUpdates.set(task.taskId, {
          message: t("task.queryFail", { error: apiErrorMsg }),
          pollFailureCount: failCount,
        });
        if (failCount >= MAX_POLL_FAILURES) {
          result.taskUpdates.set(task.taskId, withTransitionGuard(task, "failed", {
            message: t("task.consecutiveQueryFail", { count: MAX_POLL_FAILURES }),
            pollFailureCount: 0,
          }));
          const taskLabel = task.beatTitle || task.storyTitle || task.taskId.slice(0, 8);
          emitToast("error", t("error.videoGenerateFailed"), t("task.consecutiveQueryFailLabel", { label: taskLabel }));
        }
        try {
          const pollSaveResult = await saveVideoTask({
            taskId: task.taskId,
            status: failCount >= MAX_POLL_FAILURES ? "failed" : task.status,
            progress: task.progress,
            videoUrl: task.videoUrl,
            message: failCount >= MAX_POLL_FAILURES
              ? t("task.consecutiveQueryFail", { count: MAX_POLL_FAILURES })
              : task.message,
            createdAt: task.createdAt,
            model: task.model,
            prompt: task.prompt,
            parameters: task.parameters,
            apiUrl: task.apiUrl,
            apiEndpoint: task.apiEndpoint,
            providerId: task.providerId,
            providerModelId: task.providerModelId,
            providerFormat: task.providerFormat,
            fixedImageUrl: task.fixedImageUrl,
            fixedImageLockType: task.fixedImageLockType,
            storyId: task.storyId,
            storyTitle: task.storyTitle,
            beatId: task.beatId,
            beatTitle: task.beatTitle,
            pollFailureCount: failCount >= MAX_POLL_FAILURES ? 0 : failCount,
          });
          if (!pollSaveResult.ok) {
            errorLogger.error("[VideoTaskManager] Failed to save non-retryable poll failure", pollSaveResult.error);
          }
        } catch (saveError) {
          errorLogger.error("[VideoTaskManager] Failed to save non-retryable poll failure", saveError);
        }
      }
    }
  } catch (error) {
    await handlePollException(task, error, result);
  }
}

const CONCURRENT_LIMIT = 3;

export async function pollActiveTasks(
  tasks: VideoTask[],
  signal: AbortSignal,
): Promise<PollResult> {
  const result: PollResult = {
    taskUpdates: new Map(),
    cacheTasks: [],
    hasError: false,
    hasSuccess: false,
  };

  const activeTaskList = tasks.filter(
    (t) => t.status !== "completed" && t.status !== "failed",
  );

  for (let i = 0; i < activeTaskList.length; i += CONCURRENT_LIMIT) {
    if (signal.aborted) return result;
    const batch = activeTaskList.slice(i, i + CONCURRENT_LIMIT);
    await Promise.allSettled(
      batch.map((task) => pollSingleTask(task, signal, result)),
    );
  }

  return result;
}

const CACHE_RETRY_DELAYS = [1000, 2000, 4000];

async function cacheSingleVideo(
  taskId: string,
  videoUrl: string,
  signal: AbortSignal,
): Promise<boolean> {
  try {
    await cacheVideoBlob(taskId, videoUrl);
    return true;
  } catch (firstError) {
    errorLogger.warn("[VideoTaskManager] Failed to cache video blob (initial)", firstError);
    for (let retry = 0; retry < CACHE_RETRY_DELAYS.length; retry++) {
      if (signal.aborted) return false;
      await new Promise((r) => setTimeout(r, CACHE_RETRY_DELAYS[retry]));
      if (signal.aborted) return false;
      try {
        await cacheVideoBlob(taskId, videoUrl);
        errorLogger.info(`[VideoTaskManager] Cache retry succeeded (attempt ${retry + 1}) for ${taskId}`);
        return true;
      } catch (retryError) {
        errorLogger.warn(`[VideoTaskManager] Cache retry failed (attempt ${retry + 1}) for ${taskId}`, retryError);
      }
    }
    return false;
  }
}

export async function cacheCompletedVideos(
  cacheTasks: Array<{ taskId: string; videoUrl: string }>,
  signal: AbortSignal,
  storeAccessor: { getState: () => { allTasks: VideoTask[]; setAllTasks: (updater: VideoTask[] | ((prev: VideoTask[]) => VideoTask[])) => void } },
): Promise<void> {
  const batchUpdates: Map<string, boolean> = new Map();
  for (const { taskId, videoUrl } of cacheTasks) {
    if (signal.aborted) break;
    const cached = await cacheSingleVideo(taskId, videoUrl, signal);
    if (signal.aborted) break;
    batchUpdates.set(taskId, cached);
    if (!cached) {
      const state = storeAccessor.getState();
      const task = state.allTasks.find((t) => t.taskId === taskId);
      const taskLabel = task?.beatTitle || task?.storyTitle || taskId.slice(0, 8);
      emitToast("warning", t("task.cacheFailed"), t("task.cacheFailedHint", { label: taskLabel }));
    }
  }
  if (batchUpdates.size > 0) {
    const state = storeAccessor.getState();
    state.setAllTasks((prev) =>
      prev.map((t) => {
        const cached = batchUpdates.get(t.taskId);
        if (cached === undefined) return t;
        return { ...t, cacheFailed: !cached };
      }),
    );
  }
}
