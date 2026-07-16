/**
 * 教学帮助工具（Help Tools）— Barrel 入口
 *
 * 包含工具：
 * - explain_feature：解释项目功能（"这个按钮是干什么的"）
 * - show_tutorial：显示教程（按主题/级别）
 * - get_help：获取帮助文档（支持搜索/分类）
 * - list_available_commands：列出可用工具/命令（从 toolRegistry 动态获取）
 * - suggest_next_action：建议下一步操作（基于当前项目状态 + LLM 推理）
 * - get_keyboard_shortcuts：获取快捷键列表
 *
 * 重构说明：
 * 原始 help-tools.ts（~661 行）已按工具职责拆分为 6 个独立文件：
 * - explain-feature-tool.ts：功能说明工具
 * - show-tutorial-tool.ts：教程引导工具
 * - get-help-tool.ts：帮助查询工具
 * - list-commands-tool.ts：命令列表工具
 * - suggest-next-action-tool.ts：智能建议工具（execute 已按状态维度拆分为独立函数）
 * - keyboard-shortcuts-tool.ts：快捷键查询工具
 *
 * 静态字典数据已拆分到 help-tools-data.ts barrel（再导出 4 个数据文件 + shared）。
 * 本文件保持 helpTools 数组的导出不变，向后兼容。
 *
 * 特权访问声明：suggest-next-action-tool 通过 DI container 直接访问 videoTaskStorage，
 * 详见 MODULE.md "Agent 特权访问声明" 章节。
 */

import type { ToolImpl } from "@/domain/types/agent-tools";

export { explainFeatureTool } from "./explain-feature-tool";
export { showTutorialTool } from "./show-tutorial-tool";
export { getHelpTool } from "./get-help-tool";
export { listAvailableCommandsTool } from "./list-commands-tool";
export { suggestNextActionTool } from "./suggest-next-action-tool";
export { getKeyboardShortcutsTool } from "./keyboard-shortcuts-tool";

import { explainFeatureTool } from "./explain-feature-tool";
import { showTutorialTool } from "./show-tutorial-tool";
import { getHelpTool } from "./get-help-tool";
import { listAvailableCommandsTool } from "./list-commands-tool";
import { suggestNextActionTool } from "./suggest-next-action-tool";
import { getKeyboardShortcutsTool } from "./keyboard-shortcuts-tool";

/** 导出所有帮助工具 */
export const helpTools: ToolImpl[] = [
  explainFeatureTool,
  showTutorialTool,
  getHelpTool,
  listAvailableCommandsTool,
  suggestNextActionTool,
  getKeyboardShortcutsTool,
];
