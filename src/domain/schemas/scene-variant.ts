/**
 * Q3-1 — 场景变体 Domain Schema（持久化层）
 *
 * 对称 character-variant.ts。一个场景可有多个变体（白天/夜晚/战损/雨景等），
 * 每个变体有独立的 prompt_fragment + 8 维参数 + 参考图。
 *
 * 与 @/modules/novel/domain/types.ts 中的 SceneVariant（管道瞬时态）同名但职责不同：
 *   - 本文件（持久化层）：完整字段，含 sceneId/imageUrl/isDefault/createdAt 等，Zod 校验
 *   - novel/domain/types.ts（瞬时态）：管道草稿子集，无外键/时间戳
 * 消费者按需从对应路径导入，避免命名冲突。
 *
 * 接入点：
 *   - asset.ts 的 sceneVariantId 字段已存在
 *   - shared-logic/shot/mood-shot-mapping.ts 的 recommendShotBySceneVariant 已预留 8 维参数消费
 */

import { z } from "zod";

export const sceneVariantSchema = z.object({
  id: z.string(),
  /** 所属场景 ID */
  sceneId: z.string(),
  /** 变体名称，如 "白天"、"雨夜"、"战损" */
  name: z.string().min(1),
  /** 变体描述 */
  description: z.string().default(""),
  /** 英文 prompt 片段，用于覆盖场景基础氛围 */
  promptFragment: z.string().default(""),
  /** 参考图本地路径（用户上传或外部生成） */
  referenceImagePath: z.string().optional(),
  /** 生成图 URL（由 Compositor 或其他生成管道填充） */
  imageUrl: z.string().optional(),
  /** 生成图本地路径 */
  localImagePath: z.string().optional(),
  /** 缩略图路径 */
  thumbnailPath: z.string().optional(),

  // 8 维参数向量（与 CharacterVariant 一致，可选）
  timeOfDay: z.string().optional(),
  weather: z.string().optional(),
  lighting: z.string().optional(),
  mood: z.string().optional(),
  crowdLevel: z.string().optional(),
  cameraAngle: z.string().optional(),
  season: z.string().optional(),
  colorPalette: z.string().optional(),

  /** 由 Compositor 生成时关联的 generation_assets.id */
  sourceCompositorAssetId: z.string().optional(),

  /** 是否默认变体（每个场景最多一个） */
  isDefault: z.preprocess((v) => Boolean(v), z.boolean()).default(false),
  /** 是否正典变体（canonical，作为场景主形象） */
  isCanonical: z.preprocess((v) => Boolean(v), z.boolean()).default(false),

  /** 扩展元数据 */
  metadata: z.record(z.string(), z.unknown()).default({}),

  createdAt: z.string().default(() => new Date().toISOString()),
  updatedAt: z.string().default(() => new Date().toISOString()),
});

export type SceneVariant = z.output<typeof sceneVariantSchema>;

export const createSceneVariantInputSchema = sceneVariantSchema
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({ id: z.string().optional() })
  .partial()
  .required({ sceneId: true, name: true });
export type CreateSceneVariantInput = z.infer<typeof createSceneVariantInputSchema>;

export const updateSceneVariantInputSchema = sceneVariantSchema
  .partial()
  .omit({ id: true, createdAt: true, sceneId: true });
export type UpdateSceneVariantInput = z.infer<typeof updateSceneVariantInputSchema>;
