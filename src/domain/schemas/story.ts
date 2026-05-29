import { z } from "zod";
import type { SceneElement } from "./scene";
import {
  fixedImageSchema,
  referenceVideoSchema,
  templateConfigSchema,
  shotReferenceSchema,
  shotInstructionSchema,
  featureAnchoringSchema,
  consistencyCheckResultSchema,
  shotGenerationStatusSchema,
  shotGenerationResultSchema,
  beatCameraSchema,
} from "./shot-system";
export { beatCameraSchema };

function nullToUndef<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((v) => (v ?? undefined), schema.optional());
}

function nullToEmpty(schema: z.ZodString) {
  return z.preprocess((v) => (v ?? ""), schema);
}

function nullToPositiveNumberOptional() {
  return z.preprocess(
    (v) => (v == null ? undefined : Number(v)),
    z.number().positive().optional(),
  );
}

export const storyStyleGuideSchema = z.object({
  styleImageUrl: z.string().optional(),
  stylePrompt: z.string().optional(),
  colorPalette: z.array(z.string()).optional(),
  artStyle: z.string().optional(),
  moodAtmosphere: z.string().optional(),
  generatedAt: z.string().optional(),
  source: z.enum(["ai", "upload", "manual"]).optional(),
});

export const chainModeSchema = z.enum(["auto", "isolated", "custom", "asset"]).default("auto");

export const beatInputSchema = z.enum(["ai", "upload", "asset", "isolated"]).default("ai");
export const frameInputSchema = z.enum(["ai", "upload", "keyframe", "isolated"]).default("ai");
export const videoInputSchema = z.enum(["ai", "upload", "framepair", "isolated"]).default("ai");

export const referenceImageWeightSchema = z.object({
  url: z.string(),
  weight: z.number().min(0).max(1),
  type: z.enum(["portrait", "scene", "style", "prev_frame"]),
  description: z.string(),
});

export const promptLabSchema = z.object({
  coreElements: z.string(),
  cameraAction: z.string(),
  styleAtmosphere: z.string(),
  negativePrompt: z.string().optional(),
  referenceWeights: z.array(referenceImageWeightSchema).optional(),
  targetModel: z.string().optional(),
  targetProvider: z.string().optional(),
  estimatedCost: z.number().optional(),
  estimatedTokens: z.number().optional(),
  firstFramePrompt: z.string().optional(),
  videoPrompt: z.string().optional(),
});

export const storyBeatKeyframeSchema = z.object({
  imageUrl: z.string().optional(),
  prompt: z.string().optional(),
  generatedAt: z.string().optional(),
  source: z.enum(["ai", "upload"]).optional(),
  referencedPrevKeyframe: z.string().optional(),
});

export const storyBeatFramePairSchema = z.object({
  firstFrameUrl: z.string().optional(),
  lastFrameUrl: z.string().optional(),
  firstFramePrompt: z.string().optional(),
  lastFramePrompt: z.string().optional(),
  generatedAt: z.string().optional(),
  source: z.enum(["ai", "upload"]).optional(),
  firstFrame: z.object({
    imageUrl: z.string(),
    prompt: z.string(),
    derivedFrom: z.string(),
  }).optional(),
  lastFrame: z.object({
    imageUrl: z.string(),
    prompt: z.string(),
    derivedFrom: z.string(),
  }).optional(),
});

export const storyBeatVideoSchema = z.object({
  videoUrl: z.string().optional(),
  taskId: z.string().optional(),
  status: shotGenerationStatusSchema.optional(),
  generatedAt: z.string().optional(),
  source: z.enum(["ai", "upload"]).optional(),
  prompt: z.string().optional(),
  error: z.string().optional(),
  createdAt: z.string().optional(),
});

export const elementBindingSchema = z.object({
  role: z.string().optional(),
  position: z.string().optional(),
  action: z.string().optional(),
  emotion: z.string().optional(),
  description: z.string().optional(),
  text: z.string().optional(),
  imageUrl: z.string().optional(),
});

export const VALID_SHOT_TYPES = new Set([
  "wide",
  "medium",
  "close",
  "extreme_close",
  "low",
  "high",
  "birdseye",
  "wormseye",
]);

const shotTypeSchema = z.preprocess(
  (v): unknown => {
    if (typeof v === "string" && VALID_SHOT_TYPES.has(v)) return v;
    return undefined;
  },
  z.string().optional(),
);

export const storyBeatSchema = z.object({
  id: z.string(),
  sequence: z.number(),
  order: z.number().optional(),
  description: nullToEmpty(z.string()),
  duration: nullToPositiveNumberOptional(),
  type: z
    .enum(["action", "dialogue", "scene", "transition", "effect"])
    .optional(),
  title: nullToUndef(z.string()),
  content: nullToUndef(z.string()),
  character: nullToUndef(z.string()),
  characters: z.array(z.string()),
  scene: nullToUndef(z.string()),
  fixedImage: fixedImageSchema.optional(),
  referenceVideo: referenceVideoSchema.optional(),
  template: templateConfigSchema.optional(),
  shotType: shotTypeSchema,
  elementIds: z.array(z.string()),
  elementBindings: z.record(z.string(), elementBindingSchema).optional(),
  reference: shotReferenceSchema.optional(),
  generationStatus: shotGenerationStatusSchema.optional(),
  generationResult: shotGenerationResultSchema.optional(),
  generationPrompt: nullToUndef(z.string()),
  camera: beatCameraSchema.optional(),
  shotInstruction: shotInstructionSchema.optional(),
  featureAnchoring: featureAnchoringSchema.optional(),
  consistencyCheck: consistencyCheckResultSchema.optional(),
  keyframe: storyBeatKeyframeSchema.optional(),
  framePair: storyBeatFramePairSchema.optional(),
  videoGen: storyBeatVideoSchema.optional(),
  characterIds: z.array(z.string()),
  sceneId: nullToUndef(z.string()),
  enhancedGeneration: z.preprocess(
    (v) => (v == null ? undefined : Boolean(v)),
    z.boolean().optional(),
  ),
  imageGenerationPrompt: nullToUndef(z.string()),
  firstFramePrompt: nullToUndef(z.string()),
  lastFramePrompt: nullToUndef(z.string()),
  _blobUrls: z.array(z.string()).optional(),
  characterOutfits: z.record(z.string(), z.string()).optional(),
  transition: nullToUndef(z.string()),
  imageUrl: nullToUndef(z.string()),
  videoReferenceUrl: nullToUndef(z.string()),
  promptLayers: z.object({
    coreElements: z.string(),
    cameraAction: z.string(),
    styleAtmosphere: z.string().optional(),
  }).optional(),
  sceneElements: z.array(z.custom<SceneElement>()).optional(),
  proElementInstances: z.array(z.unknown()).optional(),
  proActions: z.array(z.unknown()).optional(),

  keyframeInput: beatInputSchema.optional(),
  framePairInput: frameInputSchema.optional(),
  videoInput: videoInputSchema.optional(),

  uploadedKeyframe: nullToUndef(z.string()),
  uploadedFramePair: z.object({
    firstFrame: z.string(),
    lastFrame: z.string(),
    firstFramePrompt: z.string().optional(),
    lastFramePrompt: z.string().optional(),
  }).optional(),
  uploadedVideo: nullToUndef(z.string()),

  chainMode: chainModeSchema.optional(),
  customChainTarget: nullToUndef(z.string()),

  localVideoPath: nullToUndef(z.string()),
  localKeyframePath: nullToUndef(z.string()),
  localFirstFramePath: nullToUndef(z.string()),
  localLastFramePath: nullToUndef(z.string()),

  promptLab: promptLabSchema.optional(),
});

export const storyVersionSchema = z.object({
  id: z.string(),
  storyId: z.string(),
  timestamp: z.number(),
  beats: z.array(storyBeatSchema),
  title: z.string(),
  description: z.string(),
  genre: z.string(),
  tone: z.string(),
  targetDuration: z.number(),
  characters: z.array(z.string()),
  scenes: z.array(z.string()),
  changeSummary: z.string(),
  autoSaved: z.preprocess((v) => Boolean(v), z.boolean()),
});

export const storySchema = z.object({
  id: z.string(),
  title: z.string().min(1, "故事标题不能为空"),
  description: nullToEmpty(z.string()),
  characters: z.array(z.string()),
  scenes: z.array(z.string()),
  createdAt: z.number(),
  updatedAt: z.number(),
  genre: nullToUndef(z.string()),
  tone: nullToUndef(z.string()),
  targetDuration: nullToPositiveNumberOptional(),
  keyframeChainValid: z.preprocess(
    (v) => v == null ? undefined : Boolean(v),
    z.boolean().optional(),
  ),
  beats: z.array(storyBeatSchema),
  elementIds: z.array(z.string()),
  elementBindings: z.record(z.string(), elementBindingSchema).optional(),
  styleGuide: storyStyleGuideSchema.optional(),
});

export type StoryVersion = z.infer<typeof storyVersionSchema>;
export type StoryBeat = z.infer<typeof storyBeatSchema>;
export type Story = z.infer<typeof storySchema>;
export type StoryStyleGuide = z.infer<typeof storyStyleGuideSchema>;
export type StoryBeatKeyframe = z.infer<typeof storyBeatKeyframeSchema>;
export type StoryBeatFramePair = z.infer<typeof storyBeatFramePairSchema>;
export type StoryBeatVideoGeneration = z.infer<typeof storyBeatVideoSchema>;
export type ElementBinding = z.infer<typeof elementBindingSchema>;
export type BeatCamera = z.infer<typeof beatCameraSchema>;
export type ChainMode = z.infer<typeof chainModeSchema>;
export type BeatInput = z.infer<typeof beatInputSchema>;
export type FrameInput = z.infer<typeof frameInputSchema>;
export type VideoInput = z.infer<typeof videoInputSchema>;
export type ReferenceImageWeight = z.infer<typeof referenceImageWeightSchema>;
export type PromptLab = z.infer<typeof promptLabSchema>;

export const createStoryInputSchema = storySchema.pick({
  title: true,
  description: true,
  genre: true,
  tone: true,
  targetDuration: true,
  characters: true,
  scenes: true,
  beats: true,
  elementIds: true,
  elementBindings: true,
});

export type CreateStoryInput = z.infer<typeof createStoryInputSchema>;

export const updateStoryInputSchema = storySchema.partial().required({ id: true });

export type UpdateStoryInput = z.infer<typeof updateStoryInputSchema>;
