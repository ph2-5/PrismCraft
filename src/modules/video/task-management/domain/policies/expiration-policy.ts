import type { VideoTask } from "@/domain/schemas/api";

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface PolicyAction {
  type: "TRANSITION" | "DELETE" | "NONE";
  reason?: string;
}

export function checkExpiration(task: VideoTask): PolicyAction {
  if (task.status === "completed" && task.expiresAt && Date.now() > new Date(task.expiresAt).getTime()) {
    return { type: "DELETE", reason: "任务已过期" };
  }
  if (task.status === "completed" && !task.expiresAt) {
    const age = Date.now() - new Date(task.createdAt).getTime();
    if (age > MAX_AGE_MS) {
      return { type: "DELETE", reason: "任务超过最大保留期 (7天)" };
    }
  }
  return { type: "NONE" };
}
