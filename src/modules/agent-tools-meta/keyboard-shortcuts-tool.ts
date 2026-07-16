/**
 * get_keyboard_shortcuts 工具实现
 *
 * 获取键盘快捷键列表。支持按上下文过滤（global/editor/shot_page/all）。
 *
 * 设计要点：
 * - 从静态字典 KEYBOARD_SHORTCUTS 返回
 * - global：全局快捷键；editor：编辑器快捷键；shot_page：分镜页面快捷键；all：全部
 */

import type { ToolImpl } from "@/domain/types/agent-tools";
import { TOOL_TIMEOUTS } from "@/shared/constants/tool-timeouts";
import { KEYBOARD_SHORTCUTS } from "./keyboard-shortcuts-data";

/** 获取快捷键列表 */
export const getKeyboardShortcutsTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "get_keyboard_shortcuts",
      description:
        "获取键盘快捷键列表。支持按上下文过滤（global/editor/shot_page/all）。" +
        "global：全局快捷键；editor：编辑器快捷键；shot_page：分镜页面快捷键；all：全部。",
      parameters: {
        type: "object",
        properties: {
          context: {
            type: "string",
            enum: ["global", "editor", "shot_page", "all"],
            description: "按上下文过滤，默认 all",
            default: "all",
          },
        },
      },
    },
  },
  domain: "help",
  dangerLevel: "safe",
  timeoutMs: TOOL_TIMEOUTS.query,
  async execute(args) {
    const context = String(args.context || "all").trim();

    let filtered = KEYBOARD_SHORTCUTS;
    if (context && context !== "all") {
      filtered = filtered.filter((s) => s.context === context);
    }

    return {
      success: true,
      data: {
        shortcuts: filtered.map((s) => ({
          key: s.key,
          description: s.description,
          context: s.context,
        })),
      },
    };
  },
};
