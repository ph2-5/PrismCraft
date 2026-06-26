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
  return date.toLocaleTimeString("zh-CN", {
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
