export {
  resolveImageSize,
  getModelParameterProfile,
  getAllModelProfiles,
  getModelCapabilities,
  supportsLastFrame,
  adjustReferenceImages,
  getVideoGenerationStrategy,
  getUnknownModelStrategy,
  setUnknownModelStrategy,
  setModelProfiles,
  loadModelProfilesFromServer,
  type ImageSizePurpose,
  type ModelCapabilities,
  type ModelParameterProfile,
  type ImageSizeOption,
  type ReferenceImageItem,
  type VideoGenerationStrategy,
  type ReferenceStrategy,
  type ReferenceDeliveryMode,
  type UnknownModelStrategy,
  ReferencePriority,
  BUILTIN_MODEL_CAPABILITIES,
} from "@/infrastructure/ai-providers/model-capabilities";

// Task 3.2 Step 2：视频生成有效参数（能力过滤后的），调用方无需再手动查询 strategy
export {
  getEffectiveVideoParams,
  type EffectiveVideoParams,
} from "@/infrastructure/ai-providers";
