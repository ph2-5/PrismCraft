import type { VideoTaskStatus } from "@/domain/schemas/api";

export type TaskEvent =
  | { type: "TASK_CREATED"; taskId: string }
  | { type: "TASK_STATUS_CHANGED"; taskId: string; from: VideoTaskStatus; to: VideoTaskStatus }
  | { type: "TASK_POLL_SUCCEEDED"; taskId: string; status: VideoTaskStatus }
  | { type: "TASK_POLL_FAILED"; taskId: string; error: string; failCount: number }
  | { type: "TASK_TIMED_OUT"; taskId: string }
  | { type: "TASK_DELETED"; taskId: string }
  | { type: "TASK_EXPIRED"; taskId: string }
  | { type: "TASK_RECOVERY_REQUESTED"; taskId: string };

export type TaskEventHandler = (event: TaskEvent) => void;
