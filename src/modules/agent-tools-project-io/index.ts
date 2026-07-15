/**
 * Agent Tools Project IO 模块 — Barrel 入口
 *
 * 项目导入导出工具集，从 agent 模块拆分而来。
 *
 * 包含工具（4 个）：
 * - export_project / import_project / export_characters / export_scenes
 *
 * 设计要点：
 * - 静态导入 @/shared/file-http
 * - 动态导入 @/modules/asset 服务
 */

import type { ToolImpl } from "@/domain/types/agent-tools";

export {
  exportProjectTool,
  importProjectTool,
  exportCharactersTool,
  exportScenesTool,
  projectIoTools,
} from "./project-io-tools";

// 聚合导出
import { projectIoTools } from "./project-io-tools";

export const allProjectIoTools: ToolImpl[] = [...projectIoTools];
