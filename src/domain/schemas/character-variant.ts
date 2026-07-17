/**
 * Task 2A.10 — 角色变体 Domain Schema
 *
 * 替代 characterOutfitSchema 的功能。一个角色可有多个变体（少年/老年/战损等），
 * 每个变体有独立的 prompt_fragment + 8 维参数 + 参考图。
 *
 * 字段对齐：
 *   - characterOutfitSchema（旧）：name/description/clothing/accessories/imageUrl/...
 *   - characterVariantSchema（新）：name/description/prompt_fragment + 8 维参数 + referenceImagePath + ...
 *
 * 迁移来源：character_outfits → character_variants（通过 source_outfit_id 追溯）
 * 新变体来源：Compositor 生成（通过 source_compositor_asset_id 追溯）
 */

import { z } from "zod";

export const characterVariantSchema = z.object({
  id: z.string(),
  /** 所属角色 ID */
  characterId: z.string(),
  /** 变体名称，如 "战斗服·零"、"少年" */
  name: z.string().min(1),
  /** 变体描述 */
  description: z.string().default(""),
  /** 英文 prompt 片段，用于覆盖角色基础 clothing */
  promptFragment: z.string().default(""),
  /** 参考图本地路径（用户上传或外部生成） */
  referenceImagePath: z.string().optional(),
  /** 生成图 URL（由 Compositor 或其他生成管道填充） */
  imageUrl: z.string().optional(),
  /** 生成图本地路径 */
  localImagePath: z.string().optional(),
  /** 缩略图路径 */
  thumbnailPath: z.string().optional(),

  // 8 维参数向量（与 SceneVariant 一致，可选）
  timeOfDay: z.string().optional(),
  weather: z.string().optional(),
  lighting: z.string().optional(),
  mood: z.string().optional(),
  crowdLevel: z.string().optional(),
  cameraAngle: z.string().optional(),
  season: z.string().optional(),
  colorPalette: z.string().optional(),

  /** 迁移自 character_outfits.id（幂等迁移用） */
  sourceOutfitId: z.string().optional(),
  /** 由 Compositor 生成时关联的 generation_assets.id */
  sourceCompositorAssetId: z.string().optional(),

  /** 是否默认变体（每个角色最多一个） */
  isDefault: z.preprocess((v) => Boolean(v), z.boolean()).default(false),
  /** 是否正典变体（canonical，作为角色主形象） */
  isCanonical: z.preprocess((v) => Boolean(v), z.boolean()).default(false),

  /** 扩展元数据（如原 outfit 的 accessories_json） */
  metadata: z.record(z.string(), z.unknown()).default({}),

  createdAt: z.string().default(() => new Date().toISOString()),
  updatedAt: z.string().default(() => new Date().toISOString()),
});

export type CharacterVariant = z.output<typeof characterVariantSchema>;

export const createCharacterVariantInputSchema = characterVariantSchema
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({ id: z.string().optional() })
  .partial()
  .required({ characterId: true, name: true });
export type CreateCharacterVariantInput = z.infer<typeof createCharacterVariantInputSchema>;

export const updateCharacterVariantInputSchema = characterVariantSchema
  .partial()
  .omit({ id: true, createdAt: true, characterId: true });
export type UpdateCharacterVariantInput = z.infer<typeof updateCharacterVariantInputSchema>;
