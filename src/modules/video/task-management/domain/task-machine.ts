import { ok, err, AppError } from "@/domain/types/result";
import type { Result } from "@/domain/types/result";
import type { VideoTask, VideoTaskStatus } from "@/domain/schemas/api";
import { t } from "@/shared/constants/messages";

export class TransitionError extends AppError {
  constructor(
    public readonly from: VideoTaskStatus,
    public readonly to: VideoTaskStatus,
  ) {
    super("INVALID_TRANSITION", t("video.taskTransitionError", { from, to }));
  }
}

export const VALID_TRANSITIONS: Record<VideoTaskStatus, VideoTaskStatus[]> = {
  pending: ["generating", "failed", "cancelled", "timeout"],
  generating: ["completed", "failed", "cancelled", "timeout"],
  completed: ["pending"],
  // 允许 failed → completed：防止假失败导致已生成的视频被丢弃
  failed: ["retrying", "cancelled", "completed"],
  cancelled: [],
  retrying: ["generating", "completed", "failed", "cancelled", "timeout"],
  // 允许 timeout → completed：超时后云端可能仍在生成，恢复服务需要能标记完成
  timeout: ["retrying", "failed", "cancelled", "completed"],
};

export const TERMINAL_STATUSES: VideoTaskStatus[] = ["completed", "cancelled"];

const POLLABLE_STATUSES: VideoTaskStatus[] = ["pending", "generating", "retrying"];

export const STUCK_TASK_THRESHOLD_MS = 30 * 60 * 1000;

export function isValidTransition(from: VideoTaskStatus, to: VideoTaskStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isStuck(task: VideoTask, nowMs: number = Date.now()): boolean {
  if (task.status !== "generating" && task.status !== "pending" && task.status !== "retrying") {
    return false;
  }
  const lastActivity = task.updatedAt || task.lastPolledAt || task.createdAt;
  if (!lastActivity) return false;
  return nowMs - new Date(lastActivity).getTime() > STUCK_TASK_THRESHOLD_MS;
}

export const TaskMachine = {
  canTransition(from: VideoTaskStatus, to: VideoTaskStatus): boolean {
    return isValidTransition(from, to);
  },

  isPollable(status: VideoTaskStatus): boolean {
    return POLLABLE_STATUSES.includes(status);
  },

  isTerminal(status: VideoTaskStatus): boolean {
    return TERMINAL_STATUSES.includes(status);
  },

  isRecoverable(status: VideoTaskStatus): boolean {
    return status === "failed" || status === "timeout";
  },

  transition(
    task: VideoTask,
    targetStatus: VideoTaskStatus,
    context?: { videoUrl?: string; error?: string; progress?: number },
  ): Result<VideoTask, TransitionError> {
    if (!isValidTransition(task.status, targetStatus)) {
      return err(new TransitionError(task.status, targetStatus));
    }

    if (targetStatus === "completed" && task.status === "completed") {
      return err(new TransitionError(task.status, targetStatus));
    }

    const now = new Date().toISOString();
    const updated: VideoTask = {
      ...task,
      status: targetStatus,
      updatedAt: now,
      ...TaskMachine.applySideEffects(task, targetStatus, context),
    };

    return ok(updated);
  },

  applySideEffects(
    task: VideoTask,
    targetStatus: VideoTaskStatus,
    context?: { videoUrl?: string; error?: string; progress?: number },
  ): Partial<VideoTask> {
    switch (targetStatus) {
      case "generating":
        return { lastPolledAt: new Date().toISOString(), pollFailureCount: 0 };
      case "completed":
        return {
          progress: 100,
          videoUrl: context?.videoUrl,
          message: "",
        };
      case "failed":
        return { message: context?.error || t("video.taskFailed") };
      case "cancelled":
        return { message: context?.error || t("video.taskCancelled") };
      case "pending":
        return {
          progress: 0,
          videoUrl: undefined,
          message: "",
          pollFailureCount: 0,
        };
      case "retrying":
        return {
          recoveryAttempts: (recoveryAttemptsCount(task)) + 1,
          pollFailureCount: 0,
        };
      case "timeout":
        return {
          pollFailureCount: 0,
          message: context?.error || t("video.taskTimeout"),
        };
      default:
        return {};
    }
  },
} as const;

function recoveryAttemptsCount(task: VideoTask): number {
  return task.recoveryAttempts ?? 0;
}
