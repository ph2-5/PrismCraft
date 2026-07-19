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
  // Task 2A.21: 3D 白盒预览编辑器输出物
  "preview_3d_snapshot",  // 3D 场景预览快照（单帧 PNG，取相机轨迹中间时刻）
  "blockout_animatic",    // 3D 白盒 animatic 视频（MP4，由 ffmpeg-runner 合成）
  "blockout_glb",         // 3D 白盒 GLB 模型（用于 Seedance 2.5 输入）
  "blockout_seedance_input", // Seedance 2.5 完整输入包（GLB + JSON + MP4 组合）
  "blockout_fallback_frames", // Fallback 关键帧图集（5 张 PNG，用于不支持 3D 的模型）
  // Task 2A.22: 局部重绘输出物（关联原视频 Asset）
  "partial_edit_video",
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
  // Task 2A.22: 局部重绘 Asset 关联的原视频 Asset ID
  sourceAssetId: z.string().optional(),
});

export type AssetType = z.infer<typeof assetTypeEnum>;
export type GenerationAsset = z.infer<typeof generationAssetSchema>;
