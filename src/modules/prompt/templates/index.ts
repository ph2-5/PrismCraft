/**
 * 提示词模板子域 barrel export
 *
 * 提供用户可编辑的提示词模板系统：
 * - 类型定义（PromptTemplate、PromptTemplateCategory 等）
 * - 内置高质量模板库（24 个，来源 PromptHero/Civitai/LiblibAI 等社区）
 * - 存储服务（CRUD + 变量替换 + 导入导出）
 * - 负面提示词智能生成（风格匹配 + LLM 增强）
 * - 提示词 LLM 自动优化（角色/视频）
 */

export type {
  PromptTemplateCategory,
  PromptTemplateTarget,
  PromptTemplateVariable,
  PromptTemplate,
  CreatePromptTemplateInput,
  PromptTemplateStoreData,
  ApplyTemplateResult,
} from "./prompt-template-types";

export {
  CATEGORY_LABELS,
  TARGET_LABELS,
} from "./prompt-template-types";

export { BUILTIN_TEMPLATES } from "./builtin-templates";

export {
  initTemplates,
  listPromptTemplates,
  searchPromptTemplates,
  getPromptTemplate,
  createPromptTemplate,
  updatePromptTemplate,
  deletePromptTemplate,
  applyPromptTemplate,
  exportPromptTemplates,
  importPromptTemplates,
  getPromptTemplateStats,
  _resetTemplateCache,
} from "./prompt-template-service";

// 负面提示词智能生成
export type {
  NegativePromptConfig,
  NegativePromptScene,
} from "./negative-prompt-service";

export {
  getNegativePrompt,
  enhanceNegativePromptWithLLM,
  getNegativePromptConfig,
  saveNegativePromptConfig,
  getSmartNegativePrompt,
} from "./negative-prompt-service";

// 提示词 LLM 自动优化
export type { OptimizedPromptResult } from "./prompt-optimizer";

export {
  optimizeCharacterPrompt,
  optimizeVideoPrompt,
  optimizePrompt,
  getCharacterStyles,
  getVideoStyles,
} from "./prompt-optimizer";
