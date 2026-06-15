import type { VideoTask, VideoTaskStatus } from "@/domain/schemas";
import { TransitionError, isValidTransition } from "../../domain";
import { errorLogger } from "@/shared/error-logger";

export function withTransitionGuard(
  task: VideoTask,
  targetStatus: VideoTaskStatus,
  updates: Partial<VideoTask>,
): Partial<VideoTask> {
  if (isValidTransition(task.status, targetStatus)) {
    return { ...updates, status: targetStatus };
  }
  const detail = `taskId=${task.taskId}, from=${task.status}, to=${targetStatus}`;
  errorLogger.warn(
    { code: "INVALID_TRANSITION", message: detail },
    "VideoTaskManager",
  );
  if (process.env.NODE_ENV === "development") {
    throw new TransitionError(task.status, targetStatus);
  }
  // 生产环境：非法转换时丢弃整个更新，防止已取消/终态任务的字段被轮询结果覆盖
  return {};
}
