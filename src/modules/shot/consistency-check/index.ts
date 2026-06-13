export {
  performConfigCheck,
  performConsistencyCheck,
  validateFeatureAnchoringConfig,
  validateNoFrameBinding,
} from "./services/config-check-service";

export { checkVisualConsistency, parseConsistencyAnalysisFromStructured } from "./services/consistency-check-service";
export type { ConsistencyCheckInput } from "./services/consistency-check-service";
