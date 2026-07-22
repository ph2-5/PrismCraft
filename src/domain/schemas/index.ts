export { characterSchema, characterOutfitSchema, characterAppearanceSchema, createCharacterInputSchema, updateCharacterInputSchema } from "./character";
export type { Character, CharacterOutfit, CharacterAppearance, CreateCharacterInput, UpdateCharacterInput } from "./character";

export { sceneSchema, sceneCameraSchema, sceneElementTypeSchema, sceneElementSchema, createSceneInputSchema, updateSceneInputSchema } from "./scene";
export type { Scene, SceneCamera, SceneElementType, SceneElement, CreateSceneInput, UpdateSceneInput } from "./scene";

export { storySchema, storyBeatSchema, storyBeatKeyframeSchema, storyBeatFramePairSchema, storyBeatVideoSchema, elementBindingSchema, sceneTransitionSchema, beatCameraSchema, createStoryInputSchema, updateStoryInputSchema, chainModeSchema, beatInputSchema, frameInputSchema, videoInputSchema, referenceImageWeightSchema, promptLabSchema, storyVersionSchema, storyStyleGuideSchema, storyStatusSchema, STORY_STATUSES, VALID_SHOT_TYPES } from "./story";
export type { Story, StoryBeat, StoryBeatKeyframe, StoryBeatFramePair, StoryBeatVideoGeneration, ElementBinding, SceneTransition, BeatCamera, CreateStoryInput, UpdateStoryInput, ChainMode, BeatInput, FrameInput, VideoInput, ReferenceImageWeight, PromptLab, StoryVersion, StoryStyleGuide, StoryStatus } from "./story";

export { shotInstructionSchema, featureAnchorItemSchema, featureAnchoringSchema, consistencyCheckResultSchema, shotReferenceSchema, shotGenerationStatusSchema, shotGenerationResultSchema, fixedImageSchema, referenceVideoSchema, templateConfigSchema, elementTypeSchema, assetTypeSchema, assetBindingSchema, referenceImageQualitySchema, elementFeatureAnchorSchema, storyElementSchema, elementLibrarySchema } from "./shot-system";
export type { ShotInstruction, ShotInstructionTemplate, FeatureAnchoringConfig, ConsistencyCheckResult, ShotReference, ShotGenerationStatus, ShotGenerationResult, FixedImageConfig, ReferenceVideoConfig, TemplateConfig, ElementType, AssetType, AssetBinding, ReferenceImageQuality, ElementFeatureAnchor, StoryElement, ElementLibrary } from "./shot-system";

export { apiConfigSchema, apiErrorCodeSchema, apiResponseSchema, imageGenerationResultSchema, videoGenerationResultSchema, videoTaskStatusSchema, videoTaskSchema, healthStatusSchema, userApiConfigSchema } from "./api";
export type { ApiConfig, ApiErrorCode, ApiResponse, ImageGenerationResult, VideoGenerationResult, HealthStatus, UserApiConfig, VideoTask, VideoTaskStatus, ModelSelection } from "./api";

export type { LLMMessage, ToolDef, ToolCall, StreamChunk, ChatCompletionRequest, ChatCompletionResponse, ProviderCapability } from "./llm-message";

export { mediaAssetSchema, videoTemplateShotSchema, videoTemplateSchema, collectionSchema, collectionAssetSchema, batchTaskSchema, batchTaskResultSchema, storyboardAssetSchema, asaExportDataSchema, searchResultSchema, enhancedVideoGenerationParamsSchema } from "./media";
export type { MediaAssetType, AssetLibraryType, ImportMode, MediaAsset, VideoTemplateShot, VideoTemplate, Collection, CollectionAsset, BatchTask, BatchTaskResult, StoryboardAsset, AsaExportData, SearchResult, EnhancedVideoGenerationParams } from "./media";

export { subShotSchema } from "./shot";
export type { SubShot } from "./shot";

export { assetTypeEnum, generationAssetSchema } from "./asset";
export type { AssetType as GenerationAssetType, GenerationAsset } from "./asset";

// Task 2A.8: 道具库
export { propTypeEnum, propSchema, createPropInputSchema, updatePropInputSchema } from "./prop";
export type { PropType, Prop, CreatePropInput, UpdatePropInput } from "./prop";

// Task 2A.10: 角色变体
export { characterVariantSchema, createCharacterVariantInputSchema, updateCharacterVariantInputSchema } from "./character-variant";
export type { CharacterVariant, CreateCharacterVariantInput, UpdateCharacterVariantInput } from "./character-variant";

// Q3-1: 场景变体（对称角色变体）
export { sceneVariantSchema, createSceneVariantInputSchema, updateSceneVariantInputSchema } from "./scene-variant";
export type { SceneVariant, CreateSceneVariantInput, UpdateSceneVariantInput } from "./scene-variant";

// Task 2A.21: 3D 白盒预览编辑器（类型定义在 domain 层，工厂函数/预设库在 @/modules/blockout-3d）
export type {
  Vec3,
  Vec2,
  GroundType,
  GroundPlane,
  PrimitiveType,
  PrimitiveShape,
  LightingType,
  LightingPreset,
  ShotCamera,
  PosePreset,
  PoseMetadata,
  HeightPreset,
  HeightMetadata,
  Mannequin,
  CameraInterpolation,
  CameraKeyframe,
  CameraPath,
  CameraPathValidation,
  BlockoutScene,
} from "./blockout-scene";
