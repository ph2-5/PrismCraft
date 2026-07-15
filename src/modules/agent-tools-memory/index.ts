/**
 * Agent Tools Memory 模块 — Barrel 入口
 *
 * 记忆管理工具集，从 agent 模块拆分而来。
 *
 * 包含工具（6 个）：
 * - save_memory / recall_memory / get_user_preferences
 * - update_preference / delete_memory / list_archival_memory
 *
 * 设计要点：
 * - 静态导入 @/modules/agent-memory 的函数
 */

import type { ToolImpl } from "@/domain/types/agent-tools";

export {
  saveMemoryTool,
  recallMemoryTool,
  getUserPreferencesTool,
  updatePreferenceTool,
  deleteMemoryTool,
  listArchivalMemoryTool,
  memoryTools,
} from "./memory-tools";

// 聚合导出
import { memoryTools } from "./memory-tools";

export const allMemoryTools: ToolImpl[] = [...memoryTools];
