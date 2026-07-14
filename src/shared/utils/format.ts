import { t } from "@/shared/constants";

/**
 * 将时间戳格式化为可读时间字符串 (HH:MM)。
 * 当时间戳缺失时返回本地化的 "未知"。
 */
export function formatTimestamp(
  timestamp: string | number | undefined,
): string {
  if (!timestamp) return t("common.unknown");
  const date = new Date(timestamp);
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * 将毫秒时长转换为可读的相对时间字符串。
 * e.g. "刚刚"、"{count}秒前"、"{count}分钟前"、"{count}小时前"
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return t("task.justNow");
  if (ms < 60000) return t("task.secondsAgo", { count: Math.floor(ms / 1000) });
  if (ms < 3600000)
    return t("task.minutesAgo", { count: Math.floor(ms / 60000) });
  return t("task.hoursAgo", { count: Math.floor(ms / 3600000) });
}

/**
 * 将时间戳格式化为相对当前时间的字符串。
 *
 * P1-6 修复：从 CheckpointRecovery.tsx 和 SessionHistory.tsx 中提取的共享实现。
 * - 1 分钟内：刚刚
 * - 1 小时内：{count} 分钟前
 * - 1 天内：{count} 小时前
 * - 7 天内：{count} 天前
 * - 超过 7 天：M/D（如 3/15）
 *
 * @param timestamp 毫秒时间戳
 * @returns 本地化的相对时间字符串
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return t("common.relativeTime.justNow");
  if (diff < hour) {
    return t("common.relativeTime.minutesAgo", { count: Math.floor(diff / minute) });
  }
  if (diff < day) {
    return t("common.relativeTime.hoursAgo", { count: Math.floor(diff / hour) });
  }
  if (diff < 7 * day) {
    return t("common.relativeTime.daysAgo", { count: Math.floor(diff / day) });
  }
  const date = new Date(timestamp);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

/**
 * 将字节数转换为可读的大小字符串。
 * e.g. "1.5 GB"、"200.0 MB"、"1.0 KB"、"512 B"
 */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024)
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024)
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

/**
 * 截断字符串到指定长度，超长则追加省略号。
 */
export function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "…";
}
