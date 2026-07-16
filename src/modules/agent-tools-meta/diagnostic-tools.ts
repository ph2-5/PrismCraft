/**
 * 错误诊断工具（Diagnostic Tools）— Barrel 入口
 *
 * 原始实现已按工具职责拆分为 4 个独立文件：
 * - diagnose-error-tool.ts：错误诊断工具（diagnose_error）
 * - auto-fix-tool.ts：自动修复工具（auto_fix，策略模式重构）
 * - system-health-tool.ts：系统健康诊断工具（diagnose_system_health，按检查项拆分）
 * - rollback-tool.ts：回滚工具（rollback，策略模式重构）
 *
 * 本文件仅作为聚合 barrel，保持原导出签名不变（向后兼容）：
 * - 各工具对象命名导出
 * - `diagnosticTools` 数组聚合导出
 *
 * 设计要点见各工具文件头部注释。
 *
 * 特权访问声明：见各工具文件头部，详见 MODULE.md "Agent 特权访问声明" 章节。
 */

import type { ToolImpl } from "@/domain/types/agent-tools";

export { diagnoseErrorTool } from "./diagnose-error-tool";
export { autoFixTool } from "./auto-fix-tool";
export { diagnoseSystemHealthTool } from "./system-health-tool";
export { rollbackTool } from "./rollback-tool";

import { diagnoseErrorTool } from "./diagnose-error-tool";
import { autoFixTool } from "./auto-fix-tool";
import { diagnoseSystemHealthTool } from "./system-health-tool";
import { rollbackTool } from "./rollback-tool";

/** 导出所有诊断工具 */
export const diagnosticTools: ToolImpl[] = [
  diagnoseErrorTool,
  autoFixTool,
  diagnoseSystemHealthTool,
  rollbackTool,
];
