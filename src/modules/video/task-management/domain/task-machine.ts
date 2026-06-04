import { ok, err, AppError } from "@/domain/types/result";
import type { Result } from "@/domain/types/result";
import type { VideoTask, VideoTaskStatus } from "@/domain/schemas/api";

export class TransitionError extends AppError {
  constructor(
    public readonly from: VideoTaskStatus,
    public readonly to: VideoTaskStatus,
  ) {
    super("INVALID_TRANSITION", `不允许从 ${from} 转换到 ${to}`);
  }
}

const VALID_TRANSITIONS: Record<VideoTaskStatus, VideoTaskStatus[]> = {
  pending: ["generating", "failed", "cancelled"],
  generating: ["completed", "failed", "cancelled"],
  completed: ["pending"],
  failed: ["retrying", "cancelled"],
  cancelled: [],
  retrying: ["generating", "completed", "failed", "cancelled"],
};

const POLLABLE_STATUSES: VideoTaskStatus[] = ["pending", "generating", "retrying"];

export const TaskMachine = {
  canTransition(from: VideoTaskStatus, to: VideoTaskStatus): boolean {
    return VALID_TRANSITIONS[from]?.includes(to) ?? false;
  },

  isPollable(status: VideoTaskStatus): boolean {
    return POLLABLE_STATUSES.includes(status);
  },

  isTerminal(status: VideoTaskStatus): boolean {
    return status === "completed" || status === "cancelled";
  },

  transition(
    task: VideoTask,
    targetStatus: VideoTaskStatus,
    context?: { videoUrl?: string; error?: string; progress?: number },
  ): Result<VideoTask, TransitionError> {
    if (!TaskMachine.canTransition(task.status, targetStatus)) {
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
        return { message: context?.error || "任务失败" };
      case "cancelled":
        return { message: context?.error || "任务已取消" };
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
      default:
        return {};
    }
  },
} as const;

function recoveryAttemptsCount(task: VideoTask): number {
  return task.recoveryAttempts ?? 0;
}
