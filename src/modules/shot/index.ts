/**
 * Shot Module - Public API
 *
 * 本文件只导出供外部模块使用的公共 API。
 * 模块内部子域的详细实现请通过各子域目录访问。
 */

// === 1. 一致性检查（API 路由 /api/validate 使用）===
export { performConsistencyCheck } from "./consistency-check";
export {
  validateFeatureAnchoringConfig as validateFeatureAnchoringConfigFull,
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
} from "./shot-instruction";

// === 4. 元素管理（story 模块使用）===
export { elementManager } from "./element-binding";

// === 5. 特征锚定（story 模块使用）===
export {
  validateReferenceImageQuality,
  buildFeatureAnchoringConfig,
} from "./feature-extraction";

// === 6. 引用引擎（story 模块使用）===
export { referenceEngine } from "./shot-reference";
