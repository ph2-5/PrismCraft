import type { Result } from "@/domain/types";
import { fromAsyncThrowable, err, NotFoundError } from "@/domain/types";
import { container } from "@/infrastructure/di";
import type { VideoTask } from "@/domain/schemas";
import { errorLogger } from "@/shared/error-logger";
import { t, HOUR_MS, DAY_MS, MINUTE_MS } from "@/shared/constants";
import { AppError } from "@/domain/types/result";
import { TaskMachine, isValidTransition, isStuck, STUCK_TASK_THRESHOLD_MS } from "@/domain/video/task-state";
// P1-2 修复：接入原本是死代码的视频验证服务
import { verifyVideoUrl } from "./video-verification-service";

type CacheVideoBlobFn = (taskId: string, videoUrl: string) => Promise<Result<boolean>>;

let _cacheVideoBlobFn: CacheVideoBlobFn | null = null;

export function registerCacheVideoBlobFn(fn: CacheVideoBlobFn): void {
  _cacheVideoBlobFn = fn;
}

function getCacheVideoBlobFn(): CacheVideoBlobFn | null {
  return _cacheVideoBlobFn;
}

/**
 * P1-3 审查修复：best-effort 递增 recoveryAttempts。
 * 包裹 try/catch 确保 DB 写入失败不会阻止后续 throw，
 * 避免调用方收到混淆的 DB 错误而非语义清晰的 AppError。
 */
async function incrementRecoveryAttempts(
  taskId: string,
  currentAttempts: number | undefined,
  message?: string,
): Promise<void> {
  try {
    await container.videoTaskStorage.updateVideoTask(taskId, {
      recoveryAttempts: (currentAttempts || 0) + 1,
      lastPolledAt: new Date().toISOString(),
      ...(message ? { message } : {}),
    });
  } catch (e) {
    errorLogger.warn(
      `[VideoRecovery] 递增 recoveryAttempts 失败: taskId=${taskId}`,
      e,
    );
  }
}

const EXPIRY_HOURS = 720;
// 恢复窗口延长至 24 小时，远大于轮询超时（2 小时），确保超时任务仍有充足的恢复时间
const MAX_POLL_DURATION_MS = DAY_MS;
const POLL_INTERVAL_MS = MINUTE_MS;
// 恢复次数上限提升至 240 次（24 小时 / 60 秒 ≈ 1440 次，留余量）
const MAX_RECOVERY_ATTEMPTS = 240;

export interface VideoRecoverySuccessResult {
  videoUrl?: string;
  message: string;
  status?: string;
}

export async function saveVideoTask(task: VideoTask): Promise<Result<void>> {
  return fromAsyncThrowable(async () => {
    const nowIso = new Date().toISOString();
    const expiresAtIso = task.expiresAt || new Date(Date.now() + EXPIRY_HOURS * HOUR_MS).toISOString();
    const record = {
      ...task,
      expiresAt: expiresAtIso,
      pollCount: task.pollCount || 0,
      recoveryAttempts: task.recoveryAttempts || 0,
      lastPolledAt: nowIso,
    };

    // 原子 upsert：先 INSERT OR IGNORE（若已存在则空操作），再 UPDATE（确保所有字段持久化）
    // 修复 TOCTOU 竞态：消除 check-then-act 的时间窗口
    // createVideoTask 使用 INSERT OR IGNORE，对已存在任务是空操作
    // updateVideoTask 确保 videoUrl 等关键字段被持久化
    await container.videoTaskStorage.createVideoTask(record);
    await container.videoTaskStorage.updateVideoTask(record.taskId, record);
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
        // P1-2 修复：接入原本是死代码的视频验证服务。
        // 在将 videoUrl 写入数据库前，验证 URL 是否可访问且内容是有效视频。
        // 这防止将无效/过期的 videoUrl 持久化，避免后续用户拿到坏链。
        const verifyResult = await verifyVideoUrl(result.data.videoUrl);
        if (!verifyResult.ok || !verifyResult.value.isValid) {
          errorLogger.warn(
            `[VideoRecovery] 视频URL验证失败: taskId=${taskId}, url=${result.data.videoUrl}`,
            verifyResult.ok ? undefined : verifyResult.error,
          );
          // P1-3 修复：失败时也递增 recoveryAttempts，确保 MAX_RECOVERY_ATTEMPTS 上限对失败任务生效
          await incrementRecoveryAttempts(taskId, task.recoveryAttempts, "视频URL验证失败，将重试");
          throw new AppError("VIDEO_VERIFY_FAILED", "恢复的视频URL无效或不可访问");
        }

        const transitionResult = TaskMachine.transition(
          task as VideoTask,
          "completed",
          { videoUrl: result.data.videoUrl },
          t("video.taskTransitionError", { from: task.status, to: "completed" }),
        );
        if (!transitionResult.ok) {
          errorLogger.warn(
            { code: "INVALID_TRANSITION", message: `taskId=${taskId}, from=${task.status}, to=completed` },
            "VideoRecovery",
          );
          // P1-3 审查修复：转换失败时也递增 recoveryAttempts，确保 MAX_RECOVERY_ATTEMPTS 上限对失败任务生效。
          // 之前直接 throw 未递增计数，导致状态损坏的任务可被无限重试恢复。
          await incrementRecoveryAttempts(taskId, task.recoveryAttempts);
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
        // P1-3 修复：云端任务失败时也递增 recoveryAttempts
        await incrementRecoveryAttempts(taskId, task.recoveryAttempts);
        throw new AppError("RECOVERY_FAILED", t("error.cloudTaskFailed"));
      }

      if (isPending) {
        // P1-3 修复：任务仍在生成中也递增 recoveryAttempts，避免无限重试
        await incrementRecoveryAttempts(taskId, task.recoveryAttempts);
        throw new AppError("RECOVERY_PENDING", t("error.videoStillGenerating"));
      }

      // P1-3 修复：未知状态也递增 recoveryAttempts
      await incrementRecoveryAttempts(taskId, task.recoveryAttempts);
      throw new AppError("UNKNOWN_STATUS", t("error.unknownStatusRetry", { status }));
    }

    // P1-3 修复：查询失败也递增 recoveryAttempts
    await incrementRecoveryAttempts(taskId, task.recoveryAttempts);
    throw new AppError("QUERY_FAILED", t("error.queryFailedCheckNetwork"));
  });
}

let isRecoveryRunning = false;

export async function startBackgroundRecovery(): Promise<Result<void>> {
  if (isRecoveryRunning) {
    // 跳过时记录日志，便于调用方区分"跳过"与"成功完成"
    errorLogger.info("[VideoRecovery] 恢复任务已在运行，跳过本次请求");
    return { ok: true, value: undefined };
  }
  isRecoveryRunning = true;

  // 使用 try/finally 确保 isRecoveryRunning 在任何情况下（包括 fromAsyncThrowable 未预期的异常）都能复位
  try {
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

    return result;
  } finally {
    isRecoveryRunning = false;
  }
}

export async function cleanExpiredTasks(): Promise<Result<number>> {
  return fromAsyncThrowable(() => container.videoTaskStorage.deleteExpiredVideoTasks());
}

export async function getAllTaskHistory(): Promise<Result<VideoTask[]>> {
  return fromAsyncThrowable(() => container.videoTaskStorage.getVideoTasks());
}
