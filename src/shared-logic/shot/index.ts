export {
  ReferenceDirection,
  ReferenceContentType,
  validateReference,
  getTargetShot,
  getReferenceVideoUrl,
  buildReferenceDescription,
} from "./reference-engine";
export type {
  ReferenceDirectionType,
  ReferenceContentTypeType,
  Shot as ReferenceShot,
  Reference,
} from "./reference-engine";

export {
  performConfigCheck,
  performConsistencyCheck,
  validateFeatureAnchoringConfig,
  validateNoFrameBinding,
} from "./consistency-check";
export type { FeatureAnchoringConfig } from "./consistency-check";

export {
  checkCharacterReferences,
  checkSceneReferences,
  checkMultipleCharacterReferences,
  checkMultipleSceneReferences,
} from "./reference-check";
export type { Story as ReferenceCheckStory, ReferenceResult } from "./reference-check";

export {
  buildConsistencyPrompt,
  parseConsistencyAnalysis,
  checkVisualConsistency,
  checkBeatElementConsistency,
} from "./visual-consistency-check";
export type { Element as VisualConsistencyElement, Beat as VisualConsistencyBeat } from "./visual-consistency-check";

export {
  MOOD_TO_CAMERA_MAPPING,
  WEATHER_MODIFIERS,
  CROWD_MODIFIERS,
  recommendShotBySceneVariant,
} from "./mood-shot-mapping";
export type {
  ShotSize as MoodShotSize,
  CameraMovement as MoodCameraMovement,
  CameraAngle as MoodCameraAngle,
  MoodShotMapping,
  SceneVariantInput,
  ShotRecommendation,
} from "./mood-shot-mapping";

// Task 2A.12: 角色一致性增强器
export {
  DEFAULT_PREPROCESS_HINT,
  extractCharacterReferenceCandidates,
  selectConsistencyStrategy,
  selectReferenceImages,
  buildConsistencyEnhancedCharacterRefs,
  listAllCharacterReferenceOptions,
  buildManualCharacterRefs,
  describeConsistencyStrategy,
} from "./consistency-enhancer";
export type {
  ConsistencyStrategy,
  CharacterRefSource,
  CharacterRefCandidate,
  PreprocessHint,
  CharacterAssetInput,
  ModelConsistencyCapability,
} from "./consistency-enhancer";
