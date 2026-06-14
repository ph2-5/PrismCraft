// AI: All API request schemas are defined here. Use z.infer<typeof XSchema> for types.
// AI: Do NOT create new schemas without checking this file first.
import { z } from "zod";

export const uploadSchema = z.object({
  file: z.unknown(),
  category: z.string().optional(),
});
export type UploadRequest = z.infer<typeof uploadSchema>;

export const analyzeImageSchema = z.object({
  image: z.unknown(),
  prompt: z.string().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
});
export type AnalyzeImageRequest = z.infer<typeof analyzeImageSchema>;

export const generateImageSchema = z.object({
  prompt: z.string(),
  category: z.string().optional(),
  size: z.string().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
});
export type GenerateImageRequest = z.infer<typeof generateImageSchema>;

export const generateKeyframeSchema = z.object({
  prompt: z.string().optional(),
  imageUrl: z.string().optional(),
  characterRef: z.string().optional(),
  characterRefs: z.array(z.string()).optional(),
  sceneRef: z.string().optional(),
  prevKeyframe: z.string().optional(),
  shotRequirement: z.record(z.string(), z.unknown()).optional(),
  content: z.string().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
});
export type GenerateKeyframeRequest = z.infer<typeof generateKeyframeSchema>;

export const generateFramePairSchema = z.object({
  firstFrame: z.unknown().optional(),
  lastFrame: z.unknown().optional(),
  keyframeUrl: z.string().optional(),
  keyframePrompt: z.string().optional(),
  characterRef: z.string().optional(),
  characterRefs: z.array(z.string()).optional(),
  sceneRef: z.string().optional(),
  prevLastFrameUrl: z.string().optional(),
  actionDescription: z.string().optional(),
  duration: z.number().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
});
export type GenerateFramePairRequest = z.infer<typeof generateFramePairSchema>;

export const generateVideoSchema = z.object({
  prompt: z.string().optional(),
  imageUrl: z.string().optional(),
  firstFrameUrl: z.string().optional(),
  lastFrameUrl: z.string().optional(),
  characterRef: z.string().optional(),
  characterRefs: z.array(z.string()).optional(),
  sceneRef: z.string().optional(),
  referenceVideo: z.union([z.string(), z.object({ videoUrl: z.string(), mimicryLevel: z.string().optional() })]).optional(),
  duration: z.number().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
  format: z.string().optional(),
});
export type GenerateVideoRequest = z.infer<typeof generateVideoSchema>;

export const videoStatusSchema = z.object({
  taskId: z.string(),
  apiUrl: z.string().optional(),
  apiKey: z.string().optional(),
  model: z.string().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
  format: z.string().optional(),
});
export type VideoStatusRequest = z.infer<typeof videoStatusSchema>;

export const generateTextSchema = z.object({
  prompt: z.string(),
  maxTokens: z.number().optional(),
  temperature: z.number().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
});
export type GenerateTextRequest = z.infer<typeof generateTextSchema>;

export const testConnectionSchema = z.object({
  apiUrl: z.string(),
  apiKey: z.string().optional(),
  model: z.string().optional(),
  providerId: z.string().optional(),
});
export type TestConnectionRequest = z.infer<typeof testConnectionSchema>;

export const exportSchema = z.object({
  data: z.unknown().optional(),
  format: z.string().optional(),
});
export type ExportRequest = z.infer<typeof exportSchema>;

export const storyPlanSchema = z.object({
  story: z.record(z.string(), z.unknown()),
  characters: z.array(z.unknown()),
  scenes: z.array(z.unknown()),
  options: z.record(z.string(), z.unknown()),
  planPrompt: z.string().optional(),
});
export type StoryPlanRequest = z.infer<typeof storyPlanSchema>;

export const storyGenerateVideoSchema = z.object({
  prompt: z.string().optional(),
  imageUrl: z.string().optional(),
  storyId: z.string().optional(),
  beatId: z.string().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
});
export type StoryGenerateVideoRequest = z.infer<typeof storyGenerateVideoSchema>;

export const storyGenerateKeyframeSchema = z.object({
  beat: z.unknown().optional(),
  storyId: z.string().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
});
export type StoryGenerateKeyframeRequest = z.infer<typeof storyGenerateKeyframeSchema>;

export const storyGenerateFramePairSchema = z.object({
  beat: z.unknown().optional(),
  storyId: z.string().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
});
export type StoryGenerateFramePairRequest = z.infer<typeof storyGenerateFramePairSchema>;

export const quickGenerateVideoSchema = z.object({
  prompt: z.string().optional(),
  imageUrl: z.string().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
});
export type QuickGenerateVideoRequest = z.infer<typeof quickGenerateVideoSchema>;

export const characterGenerateImageSchema = z.object({
  character: z.record(z.string(), z.unknown()),
  useDetailedPrompt: z.boolean().optional(),
  imageSize: z.string().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
  imagePrompt: z.string().optional(),
  detailedPromptInstruction: z.string().optional(),
});
export type CharacterGenerateImageRequest = z.infer<typeof characterGenerateImageSchema>;

export const sceneGenerateImageSchema = z.object({
  scene: z.record(z.string(), z.unknown()),
  useDetailedPrompt: z.boolean().optional(),
  imageSize: z.string().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
  imagePrompt: z.string().optional(),
  detailedPromptInstruction: z.string().optional(),
});
export type SceneGenerateImageRequest = z.infer<typeof sceneGenerateImageSchema>;

export const characterAnalyzeImageSchema = z.object({
  image: z.unknown(),
  analysisPrompt: z.string().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
});
export type CharacterAnalyzeImageRequest = z.infer<typeof characterAnalyzeImageSchema>;

export const sceneAnalyzeImageSchema = z.object({
  image: z.unknown(),
  analysisPrompt: z.string().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
});
export type SceneAnalyzeImageRequest = z.infer<typeof sceneAnalyzeImageSchema>;

export const videoSelectStrategySchema = z.object({
  apiUrl: z.string(),
  model: z.string(),
});
export type VideoSelectStrategyRequest = z.infer<typeof videoSelectStrategySchema>;

export const videoDetectFormatSchema = z.object({
  apiUrl: z.string(),
  modelId: z.string().optional(),
});
export type VideoDetectFormatRequest = z.infer<typeof videoDetectFormatSchema>;

export const pluginAddSchema = z.object({
  config: z.record(z.string(), z.unknown()),
});
export type PluginAddRequest = z.infer<typeof pluginAddSchema>;

export const pluginDeleteSchema = z.object({
  pluginId: z.string(),
});
export type PluginDeleteRequest = z.infer<typeof pluginDeleteSchema>;

export const pluginValidateSchema = z.object({
  config: z.record(z.string(), z.unknown()),
});
export type PluginValidateRequest = z.infer<typeof pluginValidateSchema>;

export const videoTrackingInfoSchema = z.object({
  taskId: z.string(),
  apiUrl: z.string(),
  apiKeyPreview: z.string(),
  model: z.string(),
});
export type VideoTrackingInfoRequest = z.infer<typeof videoTrackingInfoSchema>;

export const videoProviderInfoSchema = z.object({
  apiUrl: z.string().optional(),
});
export type VideoProviderInfoRequest = z.infer<typeof videoProviderInfoSchema>;

export const shotValidateReferenceSchema = z.object({
  shot: z.unknown(),
  allShots: z.array(z.unknown()),
  reference: z.unknown(),
});
export type ShotValidateReferenceRequest = z.infer<typeof shotValidateReferenceSchema>;

export const shotGetReferenceVideoUrlSchema = z.object({
  shot: z.unknown(),
  allShots: z.array(z.unknown()),
  reference: z.unknown(),
});
export type ShotGetReferenceVideoUrlRequest = z.infer<typeof shotGetReferenceVideoUrlSchema>;

export const shotBuildReferenceDescriptionSchema = z.object({
  shot: z.unknown(),
  allShots: z.array(z.unknown()),
  reference: z.unknown(),
});
export type ShotBuildReferenceDescriptionRequest = z.infer<typeof shotBuildReferenceDescriptionSchema>;

export const validateConsistencySchema = z.object({}).passthrough();
export type ValidateConsistencyRequest = z.infer<typeof validateConsistencySchema>;

export const validateFeatureAnchoringSchema = z.object({
  config: z.unknown(),
});
export type ValidateFeatureAnchoringRequest = z.infer<typeof validateFeatureAnchoringSchema>;

export const validateNoFrameBindingSchema = z.object({}).passthrough();
export type ValidateNoFrameBindingRequest = z.infer<typeof validateNoFrameBindingSchema>;

export const referenceCheckCharacterSchema = z.object({
  characterId: z.string(),
  stories: z.array(z.unknown()),
});
export type ReferenceCheckCharacterRequest = z.infer<typeof referenceCheckCharacterSchema>;

export const referenceCheckSceneSchema = z.object({
  sceneId: z.string(),
  stories: z.array(z.unknown()),
});
export type ReferenceCheckSceneRequest = z.infer<typeof referenceCheckSceneSchema>;

export const visualConsistencyCheckSchema = z.object({
  generatedImageUrl: z.string().optional(),
  referenceImageUrl: z.string().optional(),
  element: z.record(z.string(), z.unknown()),
});
export type VisualConsistencyCheckRequest = z.infer<typeof visualConsistencyCheckSchema>;

export const visualConsistencyCheckBeatSchema = z.object({
  beat: z.unknown(),
  elements: z.array(z.unknown()),
  generatedImageMap: z.record(z.string(), z.string()).optional(),
});
export type VisualConsistencyCheckBeatRequest = z.infer<typeof visualConsistencyCheckBeatSchema>;

export const storyboardGenerateKeyframeSchema = z.object({
  beat: z.unknown(),
  prevBeat: z.unknown().optional(),
  options: z.record(z.string(), z.unknown()),
});
export type StoryboardGenerateKeyframeRequest = z.infer<typeof storyboardGenerateKeyframeSchema>;

export const storyboardGenerateFramePairSchema = z.object({
  beat: z.unknown(),
  options: z.record(z.string(), z.unknown()),
});
export type StoryboardGenerateFramePairRequest = z.infer<typeof storyboardGenerateFramePairSchema>;

export const storyboardGenerateVideoSchema = z.object({
  beat: z.unknown(),
  options: z.record(z.string(), z.unknown()),
});
export type StoryboardGenerateVideoRequest = z.infer<typeof storyboardGenerateVideoSchema>;

export const storyboardGenerateFullWorkflowSchema = z.object({
  beat: z.unknown(),
  prevBeat: z.unknown().optional(),
  options: z.record(z.string(), z.unknown()),
});
export type StoryboardGenerateFullWorkflowRequest = z.infer<typeof storyboardGenerateFullWorkflowSchema>;

export const storyboardGenerateKeyframeChainSchema = z.object({
  beats: z.array(z.unknown()),
  options: z.record(z.string(), z.unknown()),
});
export type StoryboardGenerateKeyframeChainRequest = z.infer<typeof storyboardGenerateKeyframeChainSchema>;

export const videoRecoverSchema = z.object({
  taskId: z.string(),
  taskRecord: z.record(z.string(), z.unknown()).optional(),
});
export type VideoRecoverRequest = z.infer<typeof videoRecoverSchema>;

export const videoTasksBulkSaveSchema = z.object({
  tasks: z.array(z.record(z.string(), z.unknown())).optional(),
});
export type VideoTasksBulkSaveRequest = z.infer<typeof videoTasksBulkSaveSchema>;
