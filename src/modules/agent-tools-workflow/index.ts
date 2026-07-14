/**
 * Agent Tools Workflow 模块 — Barrel 入口
 *
 * 工作流与子流程编排工具集，从 agent 模块拆分而来。
 *
 * 包含工具（14 个）：
 * - 5 个工作流编排工具（workflow-tools）：create_workflow / execute_workflow / batch_process / chain_operations / schedule_task
 * - 9 个子流程工具（subworkflow-tools）：auto_create_character / auto_create_scene / auto_plan_storyboard /
 *   auto_generate_beat_full / auto_generate_video_full / auto_find_and_import_asset /
 *   auto_fix_common_errors / auto_create_from_novel / auto_polish_video
 *
 * 设计要点：
 * - workflow-tools 与 subworkflow-helpers 通过 DI container 异步获取 toolExecutor / toolRegistry，
 *   避免对 agent/services 的静态依赖
 * - subworkflow-tools 为 barrel 聚合文件，聚合 7 个子流程实现文件
 */

import type { ToolImpl } from "@/domain/types/agent-tools";

// 工作流编排工具（5 个）
export {
  createWorkflowTool,
  executeWorkflowTool,
  batchProcessTool,
  chainOperationsTool,
  scheduleTaskTool,
  workflowTools,
} from "./workflow-tools";

// 子流程工具（9 个）
export {
  autoCreateCharacterTool,
  autoCreateSceneTool,
  autoPlanStoryboardTool,
  autoCreateFromNovelTool,
  autoGenerateBeatFullTool,
  autoGenerateVideoFullTool,
  autoPolishVideoTool,
  autoFindAndImportAssetTool,
  autoFixCommonErrorsTool,
  subworkflowTools,
} from "./subworkflow-tools";

// 子流程共享辅助函数（供其他 subworkflow 实现文件或测试复用）
export {
  NOVEL_TEXT_MAX_CHARS,
  generateJsonWithAI,
  generateJsonArrayWithAI,
  executeTool,
  pollVideoTask,
  toStringArray,
} from "./subworkflow-helpers";

// 聚合导出：所有工作流相关工具
import { workflowTools } from "./workflow-tools";
import { subworkflowTools } from "./subworkflow-tools";

export const allWorkflowTools: ToolImpl[] = [...workflowTools, ...subworkflowTools];
