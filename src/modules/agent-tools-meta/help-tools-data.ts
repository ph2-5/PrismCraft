/**
 * Help Tools 静态字典与辅助函数 — Barrel 入口
 *
 * 原本集中存放的静态字典与辅助函数已按数据类型拆分为独立文件：
 * - feature-docs-data.ts：FEATURE_DOCS（功能说明字典）
 * - tutorials-data.ts：TUTORIALS（教程字典）
 * - help-docs-data.ts：HELP_DOCS（帮助文档数组）
 * - keyboard-shortcuts-data.ts：KEYBOARD_SHORTCUTS（键盘快捷键字典）
 * - help-tools-shared.ts：safeParseJson（共享辅助函数）
 *
 * 本文件作为 barrel 重新导出，保持向后兼容。
 */

export { FEATURE_DOCS } from "./feature-docs-data";
export type { FeatureDoc } from "./feature-docs-data";

export { TUTORIALS } from "./tutorials-data";
export type { Tutorial, TutorialStep } from "./tutorials-data";

export { HELP_DOCS } from "./help-docs-data";
export type { HelpDoc } from "./help-docs-data";

export { KEYBOARD_SHORTCUTS } from "./keyboard-shortcuts-data";
export type { KeyboardShortcut } from "./keyboard-shortcuts-data";

export { safeParseJson } from "./help-tools-shared";
