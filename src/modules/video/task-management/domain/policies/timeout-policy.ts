import type { VideoTask } from "@/domain/schemas/api";

const MAX_DURATION_MS = 2 * 60 * 60 * 1000;

export interface PolicyAction {
  type: "TRANSITION" | "DELETE" | "NONE";
  targetStatus?: "failed" | "timeout";
  reason?: string;
}

export function checkTimeout(task: VideoTask): PolicyAction {
  if (!["pending", "generating", "retrying"].includes(task.status)) {
    return { type: "NONE" };
  }
  const age = Date.now() - new Date(task.createdAt).getTime();
  if (age > MAX_DURATION_MS) {
    return {
      type: "TRANSITION",
      targetStatus: "timeout",
      reason: `任务超时 (${Math.round(age / 60000)}分钟)`,
    };
  }
  return { type: "NONE" };
}
