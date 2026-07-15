/**
 * Agent Tools Meta 模块 — Barrel 入口
 *
 * 元工具集（系统配置/诊断/监控/帮助），从 agent 模块拆分而来。
 *
 * 包含工具（21 个）：
 * - config-tools（6 个）：API 配置管理
 * - diagnostic-tools（4 个）：系统诊断与修复
 * - monitor-tools（5 个）：任务监控与活动日志
 * - help-tools（6 个）：功能解释/教程/帮助文档/命令列表
 *
 * 设计要点：
 * - help-tools 通过 DI container 异步获取 toolRegistry
 * - diagnostic/monitor 通过 DI container 访问 videoTaskStorage 等
 * - help-tools-data 提供静态字典数据
 */

import type { ToolImpl } from "@/domain/types/agent-tools";

export { configTools } from "./config-tools";
export {
  diagnoseErrorTool,
  autoFixTool,
  diagnoseSystemHealthTool,
  rollbackTool,
  diagnosticTools,
} from "./diagnostic-tools";
export {
  monitorTasksTool,
  notifyCompletionTool,
  getActivityLogTool,
  watchProgressTool,
  getErrorHistoryTool,
  monitorTools,
} from "./monitor-tools";
export {
  explainFeatureTool,
  showTutorialTool,
  getHelpTool,
  listAvailableCommandsTool,
  suggestNextActionTool,
  getKeyboardShortcutsTool,
  helpTools,
} from "./help-tools";

// 聚合导出
import { configTools } from "./config-tools";
import { diagnosticTools } from "./diagnostic-tools";
import { monitorTools } from "./monitor-tools";
import { helpTools } from "./help-tools";

export const allMetaTools: ToolImpl[] = [
  ...configTools,
  ...diagnosticTools,
  ...monitorTools,
  ...helpTools,
];
