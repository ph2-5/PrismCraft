import { z } from "zod";
import { fixedImageSchema, referenceVideoSchema, templateConfigSchema, featureAnchoringSchema } from "./shot-system";

export const mediaAssetSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().default(""),
  type: z.enum(["image", "video"]),
  url: z.string(),
  thumbnailUrl: z.string().optional(),
  tags: z.array(z.string()).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
  boundTo: z
    .object({ type: z.enum(["character", "scene"]), id: z.string(), name: z.string() })
    .optional(),
  fileSize: z.number().optional(),
  mimeType: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  duration: z.number().optional(),
});

export const videoTemplateShotSchema = z.object({
  id: z.string(),
  sequence: z.number(),
  description: z.string(),
  duration: z.number(),
  cameraAngle: z.string(),
  cameraMovement: z.string(),
  transition: z.string().optional(),
  promptTemplate: z.string().optional(),
});

export const videoTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.string(),
  totalDuration: z.number(),
  shots: z.array(videoTemplateShotSchema),
  tags: z.array(z.string()).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
  thumbnailUrl: z.string().optional(),
});

export const collectionSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const collectionAssetSchema = z.object({
  id: z.string(),
  collectionId: z.string(),
  assetType: z.enum(["character", "scene", "storyboard"]),
  assetId: z.string(),
});

export const batchTaskResultSchema = z.object({
  imageUrl: z.string().optional(),
  source: z.string().optional(),
  prompt: z.string().optional(),
}).passthrough();

export const batchTaskSchema = z.object({
  id: z.string(),
  itemId: z.string(),
  itemName: z.string(),
  status: z.enum(["pending", "generating", "completed", "failed"]),
  progress: z.number().min(0).max(100),
  error: z.string().optional(),
  result: batchTaskResultSchema.optional(),
});

export const storyboardAssetSchema = z.object({
  id: z.string(),
  script: z.string(),
  duration: z.number(),
  shotType: z.enum(["wide", "medium", "close_up", "extreme_close_up", "over_shoulder", "aerial", "tracking", "static"]).optional(),
  previewPath: z.string().optional(),
  characterIds: z.array(z.string()),
  sceneId: z.string().optional(),
  projectId: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const asaExportDataSchema = z.object({
  format: z.literal("asa"),
  version: z.literal("1.0"),
  createdAt: z.string(),
  collections: z.array(z.object({
    id: z.string(),
    name: z.string(),
    assetIds: z.array(z.object({ assetType: z.enum(["character", "scene", "storyboard"]), assetId: z.string() })),
  })).optional(),
  characters: z.array(z.record(z.string(), z.unknown())).optional(),
  scenes: z.array(z.record(z.string(), z.unknown())).optional(),
  storyboards: z.array(z.record(z.string(), z.unknown())).optional(),
});

export const searchResultSchema = z.object({
  type: z.enum(["character", "scene", "story"]),
  id: z.string(),
  title: z.string(),
  subtitle: z.string().optional(),
});

export const enhancedVideoGenerationParamsSchema = z.object({
  prompt: z.string(),
  duration: z.number().optional(),
  fixedImage: z.lazy(() => fixedImageSchema).optional(),
  referenceVideo: z.lazy(() => referenceVideoSchema).optional(),
  template: z.lazy(() => templateConfigSchema).optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
  featureAnchoring: z.lazy(() => featureAnchoringSchema).optional(),
});

export type MediaAssetType = "image" | "video";
export type AssetLibraryType = "character" | "scene" | "storyboard";
export type ImportMode = "replace" | "skip" | "merge";
export type MediaAsset = z.output<typeof mediaAssetSchema>;
export type VideoTemplate = z.output<typeof videoTemplateSchema>;
export type VideoTemplateShot = z.output<typeof videoTemplateShotSchema>;
export type Collection = z.output<typeof collectionSchema>;
export type CollectionAsset = z.output<typeof collectionAssetSchema>;
export type BatchTask = z.output<typeof batchTaskSchema>;
export type BatchTaskResult = z.infer<typeof batchTaskResultSchema>;
export type StoryboardAsset = z.infer<typeof storyboardAssetSchema>;
export type AsaExportData = z.infer<typeof asaExportDataSchema>;
export type SearchResult = z.infer<typeof searchResultSchema>;
export type EnhancedVideoGenerationParams = z.infer<typeof enhancedVideoGenerationParamsSchema>;
