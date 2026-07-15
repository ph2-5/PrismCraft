/**
 * Agent Tools Template 模块 — Barrel 入口
 *
 * 模板工具集（项目模板 + Prompt 模板），从 agent 模块拆分而来。
 *
 * 包含工具（9 个）：
 * - template-tools（5 个）：项目模板管理（list/apply/create/import/export）
 * - prompt-template-tools（4 个）：Prompt 模板管理
 *
 * 设计要点：
 * - template-tools 通过 DI container 访问 videoTaskStorage
 * - 两者都动态导入 character/scene/storyboard 服务
 */

import type { ToolImpl } from "@/domain/types/agent-tools";

export {
  listTemplatesTool,
  applyTemplateTool,
  createTemplateTool,
  importTemplateTool,
  exportTemplateTool,
  templateTools,
} from "./template-tools";
export { promptTemplateTools } from "./prompt-template-tools";

// 聚合导出
import { templateTools } from "./template-tools";
import { promptTemplateTools } from "./prompt-template-tools";

export const allTemplateTools: ToolImpl[] = [...templateTools, ...promptTemplateTools];
