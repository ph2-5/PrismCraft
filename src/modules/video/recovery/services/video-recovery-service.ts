import type { Result } from "@/domain/types";
import { fromAsyncThrowable, err, NotFoundError } from "@/domain/types";
import { container } from "@/infrastructure/di";
import type { VideoTask } from "@/domain/schemas";
import { errorLogger } from "@/shared/error-logger";
import { t } from "@/shared/constants";
import { AppError } from "@/domain/types/result";
import { TaskMachine, isValidTransition, isStuck, STUCK_TASK_THRESHOLD_MS } from "@/modules/video/task-management";

type CacheVideoBlobFn = (taskId: string, videoUrl: string) => Promise<Result<boolean>>;

let _cacheVideoBlobFn: CacheVideoBlobFn | null = null;

export function registerCacheVideoBlobFn(fn: CacheVideoBlobFn): void {
  _cacheVideoBlobFn = fn;
}

function getCacheVideoBlobFn(): CacheVideoBlobFn | null {
  return _cacheVideoBlobFn;
}

const EXPIRY_HOURS = 720;
const MAX_POLL_DURATION_MS = 120 * 60 * 1000;
const POLL_INTERVAL_MS = 60 * 1000;
const MAX_RECOVERY_ATTEMPTS = 60;

export interface VideoRecoverySuccessResult {
  videoUrl?: string;
  message: string;
  status?: string;
}

export async function saveVideoTask(task: VideoTask): Promise<Result<void>> {
  return fromAsyncThrowable(async () => {
    const nowIso = new Date().toISOString();
    const expiresAtIso = task.expiresAt || new Date(Date.now() + EXPIRY_HOURS * 60 * 60 * 1000).toISOString();
    const record = {
      ...task,
      expiresAt: expiresAtIso,
      pollCount: task.pollCount || 0,
      recoveryAttempts: task.recoveryAttempts || 0,
      lastPolledAt: nowIso,
    };

    await container.videoTaskStorage.createVideoTask(record);
  });
}

export async function getFailedTasks(): Promise<Result<VideoTask[]>> {
  return fromAsyncThrowable(async () => {
    const now = Date.now();
    const [failedTasks, timeoutTasks] = await Promise.all([
      container.videoTaskStorage.getVideoTasksByStatus("failed"),
      container.videoTaskStorage.getVideoTasksByStatus("timeout"),
    ]);

    return [...failedTasks, ...timeoutTasks].filter((t) => !t.expiresAt || new Date(t.expiresAt).getTime() > now);
  });
}

export async function getTaskById(
  taskId: string,
): Promise<Result<VideoTask | undefined>> {
  return fromAsyncThrowable(async () => {
    return (
      (await container.videoTaskStorage.getVideoTaskById(taskId)) ??
      undefined
    );
  });
}

export async function recoverVideoByTaskId(taskId: string): Promise<Result<VideoRecoverySuccessResult>> {
  const taskResult = await getTaskById(taskId);
  if (!taskResult.ok) return taskResult;
  const task = taskResult.value;

  if (!task) {
    return err(new NotFoundError("VideoTask", taskId));
  }

  if (task.status === "completed" && task.videoUrl) {
    return { ok: true, value: { videoUrl: task.videoUrl, message: t("error.videoAlreadyExists") } };
  }

  if (TaskMachine.isTerminal(task.status)) {
    errorLogger.warn(
      { code: "INVALID_TRANSITION", message: `taskId=${taskId}, from=${task.status}, to=recovery` },
      "VideoRecovery",
    );
    return err(new AppError("INVALID_TRANSITION", t("error.taskInTerminalState", { status: task.status })));
  }

  return fromAsyncThrowable(async () => {
    const result = await container.videoProvider.queryVideoStatus(taskId, {
      providerId: task.providerId,
      modelId: task.providerModelId,
      format: task.providerFormat,
    });

    if (result.success && result.data) {
      const status = (result.data.status || "").toLowerCase();
      const isSuccess = [
        "done",
        "completed",
        "success",
        "finished",
        "succeeded",
      ].includes(status);
      const isFailed = ["fail", "failed", "error"].includes(status);
      const isPending = [
        "pending",
        "generating",
        "wait",
        "running",
        "queued",
        "in_progress",
      ].includes(status);

      if (isSuccess && result.data.videoUrl) {
        const transitionResult = TaskMachine.transition(
          task as VideoTask,
          "completed",
          { videoUrl: result.data.videoUrl },
        );
        if (!transitionResult.ok) {
          errorLogger.warn(
            { code: "INVALID_TRANSITION", message: `taskId=${taskId}, from=${task.status}, to=completed` },
            "VideoRecovery",
          );
          throw new AppError("INVALID_TRANSITION", t("error.invalidStateTransition", { from: task.status, to: "completed" }));
        }
        const updatedTask = transitionResult.value;
        await container.videoTaskStorage.updateVideoTask(taskId, {
          status: updatedTask.status,
          videoUrl: updatedTask.videoUrl,
          progress: updatedTask.progress,
          message: updatedTask.message,
          recoveryAttempts: (task.recoveryAttempts || 0) + 1,
          lastPolledAt: new Date().toISOString(),
        });

        const cacheFn = getCacheVideoBlobFn();
        if (cacheFn) {
          cacheFn(taskId, result.data.videoUrl).catch((e) =>
            errorLogger.warn(
              new AppError("CACHE_VIDEO_ERROR", "Failed to cache recovered video", e),
              "VideoRecovery",
            ),
          );
        }

        if (typeof window !== "undefined") {
          try {
            window.dispatchEvent(
              new CustomEvent("video-task-recovered", {
                detail: { taskId, status: "completed", videoUrl: result.data.videoUrl },
              }),
            );
          } catch (e) {
            errorLogger.warn("[VideoRecovery] 事件派发失败", e);
          }
        }

        return {
          videoUrl: result.data.videoUrl,
          message: t("error.videoRecoverySuccess"),
          status: "completed",
        };
      }

      if (isFailed) {
        throw new AppError("RECOVERY_FAILED", t("error.cloudTaskFailed"));
      }

      if (isPending) {
        throw new AppError("RECOVERY_PENDING", t("error.videoStillGenerating"));
      }

      throw new AppError("UNKNOWN_STATUS", t("error.unknownStatusRetry", { status }));
    }

    throw new AppError("QUERY_FAILED", t("error.queryFailedCheckNetwork"));
  });
}

let isRecoveryRunning = false;

export async function startBackgroundRecovery(): Promise<Result<void>> {
  if (isRecoveryRunning) return { ok: true, value: undefined };
  isRecoveryRunning = true;

  const result = await fromAsyncThrowable(async () => {
    const failedTasksResult = await getFailedTasks();
    if (!failedTasksResult.ok) {
      throw failedTasksResult.error;
    }
    const failedTasks = failedTasksResult.value;

    const allTasksResult = await fromAsyncThrowable(() => container.videoTaskStorage.getVideoTasks());
    const allTasks = allTasksResult.ok ? allTasksResult.value : [];

    const stuckTasks = allTasks.filter((task) => isStuck(task));

    if (stuckTasks.length > 0) {
      errorLogger.info(
        `[VideoRecovery] 发现 ${stuckTasks.length} 个卡住的任务 (超过 ${STUCK_TASK_THRESHOLD_MS / 60000} 分钟无活动)`,
      );
      for (const stuckTask of stuckTasks) {
        if (isValidTransition(stuckTask.status, "timeout")) {
          try {
            await container.videoTaskStorage.updateVideoTask(stuckTask.taskId, {
              status: "timeout",
              message: `任务卡住超过 ${STUCK_TASK_THRESHOLD_MS / 60000} 分钟`,
              pollFailureCount: 0,
            });
          } catch (e) {
            errorLogger.warn(
              `[VideoRecovery] 标记卡住任务失败: ${stuckTask.taskId}`,
              e,
            );
          }
        }
      }
    }

    const eligibleTasks = failedTasks.filter((task) => {
      const createdAtMs = new Date(task.createdAt).getTime();
      // 校验时间戳有效性，防止 NaN 导致错误判断
      if (Number.isNaN(createdAtMs)) {
        // 记录损坏数据，便于排查；否则损坏任务会被静默跳过无法被发现
        errorLogger.warn(
          `[VideoRecovery] 跳过 NaN 时间戳任务: taskId=${task.taskId}, createdAt=${task.createdAt}`,
        );
        return false;
      }
      const timeSinceCreation = Date.now() - createdAtMs;
      if (timeSinceCreation > MAX_POLL_DURATION_MS) {
        return false;
      }

      if (
        task.recoveryAttempts &&
        task.recoveryAttempts >= MAX_RECOVERY_ATTEMPTS
      ) {
        return false;
      }

      const lastPolledMs = task.lastPolledAt
        ? new Date(task.lastPolledAt).getTime()
        : null;
      const timeSinceLastPoll = lastPolledMs !== null && !Number.isNaN(lastPolledMs)
        ? Date.now() - lastPolledMs
        : POLL_INTERVAL_MS;

      if (timeSinceLastPoll < POLL_INTERVAL_MS) {
        return false;
      }

      return true;
    });

    const BATCH_SIZE = 3;
    for (let i = 0; i < eligibleTasks.length; i += BATCH_SIZE) {
      const batch = eligibleTasks.slice(i, i + BATCH_SIZE);
      await Promise.allSettled(
        batch.map((task) => recoverVideoByTaskId(task.taskId)),
      );
    }
  });

  isRecoveryRunning = false;
  return result;
}

export async function cleanExpiredTasks(): Promise<Result<number>> {
  return fromAsyncThrowable(() => container.videoTaskStorage.deleteExpiredVideoTasks());
}

export async function getAllTaskHistory(): Promise<Result<VideoTask[]>> {
  return fromAsyncThrowable(() => container.videoTaskStorage.getVideoTasks());
}
