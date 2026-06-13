import { z } from "zod";

export const uploadSchema = z.object({
  file: z.unknown(),
  category: z.string().optional(),
});

export const analyzeImageSchema = z.object({
  image: z.unknown(),
  prompt: z.string().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
});

export const generateImageSchema = z.object({
  prompt: z.string(),
  category: z.string().optional(),
  size: z.string().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
});

export const generateKeyframeSchema = z.object({
  prompt: z.string().optional(),
  imageUrl: z.string().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
});

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

export const generateVideoSchema = z.object({
  prompt: z.string().optional(),
  imageUrl: z.string().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
});

export const videoStatusSchema = z.object({
  taskId: z.string().optional(),
  apiUrl: z.string().optional(),
  apiKey: z.string().optional(),
  model: z.string().optional(),
});

export const generateTextSchema = z.object({
  prompt: z.string(),
  maxTokens: z.number().optional(),
  temperature: z.number().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
});

export const testConnectionSchema = z.object({
  apiUrl: z.string(),
  apiKey: z.string().optional(),
  model: z.string().optional(),
  providerId: z.string().optional(),
});

export const exportSchema = z.object({
  data: z.unknown().optional(),
  format: z.string().optional(),
});

export const storyPlanSchema = z.object({
  story: z.record(z.string(), z.unknown()),
  characters: z.array(z.unknown()),
  scenes: z.array(z.unknown()),
  options: z.record(z.string(), z.unknown()),
  planPrompt: z.string().optional(),
});

export const storyGenerateVideoSchema = z.object({
  prompt: z.string().optional(),
  imageUrl: z.string().optional(),
  storyId: z.string().optional(),
  beatId: z.string().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
});

export const storyGenerateKeyframeSchema = z.object({
  beat: z.unknown().optional(),
  storyId: z.string().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
});

export const storyGenerateFramePairSchema = z.object({
  beat: z.unknown().optional(),
  storyId: z.string().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
});

export const quickGenerateVideoSchema = z.object({
  prompt: z.string().optional(),
  imageUrl: z.string().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
});

export const characterGenerateImageSchema = z.object({
  character: z.record(z.string(), z.unknown()),
  useDetailedPrompt: z.boolean().optional(),
  imageSize: z.string().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
  imagePrompt: z.string().optional(),
  detailedPromptInstruction: z.string().optional(),
});

export const sceneGenerateImageSchema = z.object({
  scene: z.record(z.string(), z.unknown()),
  useDetailedPrompt: z.boolean().optional(),
  imageSize: z.string().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
  imagePrompt: z.string().optional(),
  detailedPromptInstruction: z.string().optional(),
});

export const characterAnalyzeImageSchema = z.object({
  image: z.unknown(),
  analysisPrompt: z.string().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
});

export const sceneAnalyzeImageSchema = z.object({
  image: z.unknown(),
  analysisPrompt: z.string().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
});

export const videoSelectStrategySchema = z.object({
  apiUrl: z.string(),
  model: z.string(),
});

export const videoDetectFormatSchema = z.object({
  apiUrl: z.string(),
  modelId: z.string().optional(),
});

export const pluginAddSchema = z.object({
  config: z.record(z.string(), z.unknown()),
});

export const pluginDeleteSchema = z.object({
  pluginId: z.string(),
});

export const pluginValidateSchema = z.object({
  config: z.record(z.string(), z.unknown()),
});

export const videoTrackingInfoSchema = z.object({
  taskId: z.string(),
  apiUrl: z.string(),
  apiKeyPreview: z.string(),
  model: z.string(),
});

export const videoProviderInfoSchema = z.object({
  apiUrl: z.string().optional(),
});

export const shotValidateReferenceSchema = z.object({
  shot: z.unknown(),
  allShots: z.array(z.unknown()),
  reference: z.unknown(),
});

export const shotGetReferenceVideoUrlSchema = z.object({
  shot: z.unknown(),
  allShots: z.array(z.unknown()),
  reference: z.unknown(),
});

export const shotBuildReferenceDescriptionSchema = z.object({
  shot: z.unknown(),
  allShots: z.array(z.unknown()),
  reference: z.unknown(),
});

export const validateConsistencySchema = z.object({}).passthrough();

export const validateFeatureAnchoringSchema = z.object({
  config: z.unknown(),
});

export const validateNoFrameBindingSchema = z.object({}).passthrough();

export const referenceCheckCharacterSchema = z.object({
  characterId: z.string(),
  stories: z.array(z.unknown()),
});

export const referenceCheckSceneSchema = z.object({
  sceneId: z.string(),
  stories: z.array(z.unknown()),
});

export const visualConsistencyCheckSchema = z.object({
  generatedImageUrl: z.string().optional(),
  referenceImageUrl: z.string().optional(),
  element: z.record(z.string(), z.unknown()),
});

export const visualConsistencyCheckBeatSchema = z.object({
  beat: z.unknown(),
  elements: z.array(z.unknown()),
  generatedImageMap: z.record(z.string(), z.string()).optional(),
});

export const storyboardGenerateKeyframeSchema = z.object({
  beat: z.unknown(),
  prevBeat: z.unknown().optional(),
  options: z.record(z.string(), z.unknown()),
});

export const storyboardGenerateFramePairSchema = z.object({
  beat: z.unknown(),
  options: z.record(z.string(), z.unknown()),
});

export const storyboardGenerateVideoSchema = z.object({
  beat: z.unknown(),
  options: z.record(z.string(), z.unknown()),
});

export const storyboardGenerateFullWorkflowSchema = z.object({
  beat: z.unknown(),
  prevBeat: z.unknown().optional(),
  options: z.record(z.string(), z.unknown()),
});

export const storyboardGenerateKeyframeChainSchema = z.object({
  beats: z.array(z.unknown()),
  options: z.record(z.string(), z.unknown()),
});

export const videoRecoverSchema = z.object({
  taskId: z.string(),
  taskRecord: z.record(z.string(), z.unknown()).optional(),
});

export const videoTasksBulkSaveSchema = z.object({
  tasks: z.array(z.record(z.string(), z.unknown())).optional(),
});
