/**
 * Monitor Tools 共享辅助函数
 *
 * 包含多个 monitor 工具文件共用的辅助函数：
 * - truncatePrompt：截断 prompt 避免 token 浪费
 * - isActiveTask / isFailedTask：任务状态判断
 * - toTimestamp：安全解析时间戳（兼容 ISO 字符串 / 数字 / Unix 秒）
 */

import type { VideoTask } from "@/domain/schemas";

/** 截断 prompt 到指定长度，避免 token 浪费 */
export function truncatePrompt(prompt: string | undefined, maxLen = 100): string | undefined {
  if (!prompt) return undefined;
  return prompt.length > maxLen ? `${prompt.slice(0, maxLen)}…` : prompt;
}

/** 判断任务是否处于活跃状态 */
export function isActiveTask(task: VideoTask): boolean {
  return task.status === "pending" || task.status === "generating" || task.status === "retrying";
}

/** 判断任务是否处于失败状态 */
export function isFailedTask(task: VideoTask): boolean {
  return task.status === "failed" || task.status === "timeout";
}

/** 安全解析时间戳（兼容 ISO 字符串 / 数字 / Unix 秒） */
export function toTimestamp(value: string | number | undefined): number {
  if (!value) return 0;
  if (typeof value === "number") {
    // 数据库中可能是 Unix 秒
    return value < 1e12 ? value * 1000 : value;
  }
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}
