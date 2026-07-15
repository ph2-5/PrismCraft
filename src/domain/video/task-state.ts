import { ok, err, AppError } from "@/domain/types/result";
import type { Result } from "@/domain/types/result";
import type { VideoTask, VideoTaskStatus } from "@/domain/schemas/api";

export class TransitionError extends AppError {
  constructor(
    public readonly from: VideoTaskStatus,
    public readonly to: VideoTaskStatus,
    message?: string,
  ) {
    super("INVALID_TRANSITION", message ?? `Invalid transition from ${from} to ${to}`);
  }
}

export const VALID_TRANSITIONS: Record<VideoTaskStatus, VideoTaskStatus[]> = {
  // 允许 pending → completed：同步生成场景下服务端可能立即返回完成
  pending: ["generating", "failed", "cancelled", "timeout", "completed"],
  generating: ["completed", "failed", "cancelled", "timeout", "paused"],
  completed: ["pending"],
  // 允许 failed → completed：防止假失败导致已生成的视频被丢弃
  failed: ["retrying", "cancelled", "completed"],
  cancelled: [],
  // `retrying` 是状态机层面定义的"恢复中"中间态，语义为：
  //   failed/timeout → retrying → generating（恢复服务接管后重新轮询）
  // 当前生产代码中，恢复服务直接从 failed/timeout 转到 generating/completed
  // （见 video-recovery-service.ts），未经过 retrying 中间态。
  // UI 的"重试"按钮使用本地 loading 状态（setRetryingTaskId）承担视觉反馈，
  // 因此 retrying 在生产路径上暂未被赋值。保留此状态是为了：
  //   1. 支持未来"原地重试"流程（不跳转 beat 页面，直接重新发起生成）
  //   2. 与 contract.json 中已声明的恢复路径保持一致
  //   3. isStuck / isPollable 已正确处理 retrying，未来启用零成本
  retrying: ["generating", "completed", "failed", "cancelled", "timeout"],
  // 允许 timeout → completed：超时后云端可能仍在生成，恢复服务需要能标记完成
  timeout: ["retrying", "failed", "cancelled", "completed"],
  // paused: 用户主动暂停生成中任务，可恢复或取消
  paused: ["generating", "cancelled"],
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
  // paused 任务不视为卡住（用户主动暂停）
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
    errorMessage?: string,
  ): Result<VideoTask, TransitionError> {
    if (!isValidTransition(task.status, targetStatus)) {
      return err(new TransitionError(task.status, targetStatus, errorMessage));
    }

    if (targetStatus === "completed" && task.status === "completed") {
      return err(new TransitionError(task.status, targetStatus, errorMessage));
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
        return { message: context?.error || "" };
      case "cancelled":
        return { message: context?.error || "" };
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
          message: context?.error || "",
        };
      case "paused":
        return {
          message: context?.error || "",
        };
      default:
        return {};
    }
  },
} as const;

function recoveryAttemptsCount(task: VideoTask): number {
  return task.recoveryAttempts ?? 0;
}
