/**
 * Shot Module - Public API
 *
 * 本文件只导出供外部模块使用的公共 API。
 * 模块内部子域的详细实现请通过各子域目录访问。
 */

// === 1. 一致性检查（API 路由 /api/validate 使用）===
export { performConsistencyCheck, performConfigCheck, checkVisualConsistency, parseConsistencyAnalysisFromStructured } from "./consistency-check";
export type { ConsistencyCheckInput } from "./consistency-check";
export {
  validateFeatureAnchoringConfig,
  validateFeatureAnchoringConfig as validateFeatureAnchoringConfigFull,
  validateNoFrameBinding,
  validateNoFrameBinding as validateNoFrameBindingParams,
} from "./consistency-check";

// === 2. 元素引用检查（character / scene 模块删除前校验）===
export {
  checkCharacterReferences,
  checkSceneReferences,
  checkElementReferences,
} from "@/domain/services/reference-check";
export type { ReferenceInfo, DeleteCheckResult } from "@/domain/services/reference-check";

// === 3. 分镜指令常量（story 模块 UI 组件使用）===
export {
  SHOT_SIZE_OPTIONS,
  CAMERA_MOVEMENT_OPTIONS,
  CAMERA_ANGLE_OPTIONS,
  buildPromptLayers,
} from "./shot-instruction";

// === 4. 元素管理（story 模块使用）===
export { elementManager } from "./element-binding";

// === 5. 特征锚定（story 模块使用）===
export {
  validateReferenceImageQuality,
  buildFeatureAnchoringConfig,
  extractCharacterFeatures,
  buildFeatureTags,
  buildFeatureAnchor,
} from "./feature-extraction";

export type { FeatureLanguage } from "./feature-extraction";

// === 6. 引用引擎（story 模块使用）===
export { referenceEngine } from "./shot-reference";

// === 7. 分镜生成与校验 ===
export {
  validateShotParams,
  validateStoryBeatOutput,
  validateStoryPlanOutput,
  generateFallbackParams,
  formatValidationResult,
} from "./shot-generation";
export type { ValidationResult, ShotParamsType } from "./shot-generation";
export { generateStoryPlanWithValidation } from "./shot-generation";
