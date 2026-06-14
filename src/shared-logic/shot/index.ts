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
