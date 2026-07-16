/**
 * 监控/通知工具（Monitor Tools）— Barrel 入口
 *
 * 原始实现已按工具职责拆分为 5 个独立文件：
 * - monitor-tasks-tool.ts：任务监控工具（monitor_tasks）
 * - notify-completion-tool.ts：完成通知工具（notify_completion）
 * - get-activity-log-tool.ts：活动日志查询工具（get_activity_log）
 * - watch-progress-tool.ts：进度观察工具（watch_progress，ETA 估算已拆为独立函数 estimateEta）
 * - get-error-history-tool.ts：错误历史查询工具（get_error_history）
 *
 * 共享辅助函数位于 monitor-tools-shared.ts：
 * - truncatePrompt / isActiveTask / isFailedTask / toTimestamp
 *
 * 本文件仅作为聚合 barrel，保持原导出签名不变（向后兼容）：
 * - 各工具对象命名导出
 * - `monitorTools` 数组聚合导出
 *
 * 设计要点见各工具文件头部注释。
 *
 * 特权访问声明：见各工具文件头部，详见 MODULE.md "Agent 特权访问声明" 章节。
 */

import type { ToolImpl } from "@/domain/types/agent-tools";

export { monitorTasksTool } from "./monitor-tasks-tool";
export { notifyCompletionTool } from "./notify-completion-tool";
export { getActivityLogTool } from "./get-activity-log-tool";
export { watchProgressTool } from "./watch-progress-tool";
export { getErrorHistoryTool } from "./get-error-history-tool";

import { monitorTasksTool } from "./monitor-tasks-tool";
import { notifyCompletionTool } from "./notify-completion-tool";
import { getActivityLogTool } from "./get-activity-log-tool";
import { watchProgressTool } from "./watch-progress-tool";
import { getErrorHistoryTool } from "./get-error-history-tool";

/** 导出所有监控工具 */
export const monitorTools: ToolImpl[] = [
  monitorTasksTool,
  notifyCompletionTool,
  getActivityLogTool,
  watchProgressTool,
  getErrorHistoryTool,
];
