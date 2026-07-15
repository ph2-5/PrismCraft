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

// === Task 4.8: 跨分镜一致性自动修复 ===
export { autoFixCrossShotConsistency, applyManualReferenceUrlFix } from "./services/cross-shot-auto-fix";
export type {
  DriftKind,
  DriftAnalysis,
  AppliedFix,
  ManualConfirmFix,
  AutoFixResult,
} from "./services/cross-shot-auto-fix";

// === Task 4.12: 跨分镜 IP 安全改写一致性 ===
export { checkCrossShotIpConsistency, fixCrossShotIpConsistency } from "./services/cross-shot-safety-check";
export type {
  BeatIpRewriteSnapshot,
  IpRewriteConflict,
  CrossShotSafetyCheckResult,
  CrossShotSafetyFixResult,
} from "./services/cross-shot-safety-check";
