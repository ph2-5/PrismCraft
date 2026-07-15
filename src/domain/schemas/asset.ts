/**
 * GenerationAsset Schema — 生成资产统一管理（Task 4.11）
 *
 * 设计背景：
 *   生成的图片/视频 URL 散落在 StoryBeat.imageUrl、SubShot.imageUrl、
 *   Character.generatedImage 等多个字段。无法统一管理、搜索、去重、清理。
 *   generation_assets 表统一管理所有生成/上传的图片/视频，其他表只引用 assetId。
 *
 * 与 media_assets 表的区别：
 *   - media_assets：用户手动管理的素材库（用户上传的参考图、素材）
 *   - generation_assets：系统生成/上传的产出物（关键帧、视频、角色图等）
 */
import { z } from "zod";

export const assetTypeEnum = z.enum([
  "keyframe",
  "first_frame",
  "last_frame",
  "video",
  "character_image",
  "scene_image",
  "variant_image",
  "compositor_result",
  "uploaded",
]);

export const generationAssetSchema = z.object({
  id: z.string(),
  type: assetTypeEnum,
  sourceType: z.enum(["ai_generated", "user_uploaded", "composited"]),
  url: z.string(),
  localPath: z.string().optional(),
  thumbnailPath: z.string().optional(),
  prompt: z.string().optional(),
  modelId: z.string().optional(),
  providerId: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  storyBeatId: z.string().optional(),
  subShotId: z.string().optional(),
  characterId: z.string().optional(),
  characterVariantId: z.string().optional(),
  sceneId: z.string().optional(),
  sceneVariantId: z.string().optional(),
  projectId: z.string().optional(),
  createdAt: z.string(),
});

export type AssetType = z.infer<typeof assetTypeEnum>;
export type GenerationAsset = z.infer<typeof generationAssetSchema>;
