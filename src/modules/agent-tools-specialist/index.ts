/**
 * Agent Tools Specialist 模块 — Barrel 入口
 *
 * 专家委派工具集（P4 多 Agent 编排），从 agent 模块拆分而来。
 *
 * 包含工具（2 个）：
 * - delegate_to_specialist：委派任务给专家 Agent
 * - list_specialists：列出可用专家
 *
 * 设计要点：
 * - 通过动态 import @/modules/agent 获取 runSpecialist/listAvailableSpecialists
 * - 静态导入 @/modules/agent-specialist 的 specialistRegistry
 */

import type { ToolImpl } from "@/domain/types/agent-tools";

export {
  delegateToSpecialistTool,
  listSpecialistsTool,
  specialistTools,
} from "./specialist-tools";

// 聚合导出
import { specialistTools } from "./specialist-tools";

export const allSpecialistTools: ToolImpl[] = [...specialistTools];
