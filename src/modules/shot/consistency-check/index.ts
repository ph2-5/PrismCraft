export {
  performConfigCheck,
  performConsistencyCheck,
  validateFeatureAnchoringConfig,
  validateNoFrameBinding,
} from "./services/config-check-service";

export { checkVisualConsistency, parseConsistencyAnalysisFromStructured } from "./services/consistency-check-service";
export type { ConsistencyCheckInput } from "./services/consistency-check-service";

export { checkCrossShotConsistency } from "./services/cross-shot-consistency-service";
export type { CrossShotConsistencyInput, CrossShotConsistencyResult, ElementDriftReport } from "./services/cross-shot-consistency-service";
