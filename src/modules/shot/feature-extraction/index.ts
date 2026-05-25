export {
  validateReferenceImageQuality,
  extractCharacterFeatures,
  buildFeatureTags,
  buildFeatureAnchor,
  buildFeatureAnchoringConfig,
} from "./services/feature-extraction-service";

export type {
  BlendMode,
  BlendConfig,
  AnchoringValidationResult,
  BlendPromptResult,
} from "./services/feature-anchoring-service";
export {
  validateFeatureAnchoring,
  validateBlendConfig,
  getBlendMode,
  shouldUseChainReference,
  buildBlendPrompt,
  performAutoFallback,
  validateNoFrameBinding,
  performConfigCheck,
} from "./services/feature-anchoring-service";
