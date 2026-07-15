/**
 * Vocabulary 模块 barrel（Task 4.7 v5.3 增强）
 *
 * 包含多语言电影词汇表 + 模型 ID 防混淆表。
 * 本文件属于 shared-logic 层，零外部依赖。
 */

export {
  translate,
  getTranslations,
  listConcepts,
  buildMixedPrompt,
} from "./multilingual";
export type { SupportedLanguage, MultilingualTerm } from "./multilingual";

export {
  lookupModelId,
  normalizeModelId,
  getModelStandardName,
  listModelEntries,
  listModelsByFamily,
  areSameModel,
} from "./model-name-map";
export type { ModelIdEntry } from "./model-name-map";
