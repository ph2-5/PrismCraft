/**
 * Prop Schema — 道具库类型定义（Task 2A.8）
 *
 * 道具库独立于 elements 表，专门管理可被全局编译器引用的可视化道具：
 *   服装 / 武器 / 配饰 / 道具 / 其他
 *
 * 数据来源：
 *   1. 用户在素材库页面手动创建
 *   2. 从现有 character_outfits 表迁移（type='clothing'）
 *   3. 后续 Task 2A.9 全局编译器可引用 propIds 组合生成图片
 *
 * 依赖方向：仅依赖 zod（domain 层零外部依赖）
 */
import { z } from "zod";

/** 道具类型枚举 */
export const propTypeEnum = z.enum([
  "clothing", // 服装
  "weapon", // 武器
  "accessory", // 配饰
  "prop", // 道具
  "other", // 其他
]);
export type PropType = z.infer<typeof propTypeEnum>;

/** 道具 schema */
export const propSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: propTypeEnum,
  description: z.string().optional().default(""),
  /** 远程参考图 URL（可为空） */
  referenceImage: z.string().optional(),
  /** 本地图片路径（保存后写入，优先于 referenceImage） */
  localImagePath: z.string().optional(),
  /** 缩略图路径 */
  thumbnailPath: z.string().optional(),
  /** 标签列表（用于搜索和筛选） */
  tags: z.array(z.string()).default([]),
  /** 来源角色 ID（若从 character_outfits 迁移而来） */
  sourceCharacterId: z.string().optional(),
  /** 来源 outfit ID（若从 character_outfits 迁移而来） */
  sourceOutfitId: z.string().optional(),
  /** 扩展元数据（如 clothing 详细描述、weapon 类型等） */
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Prop = z.infer<typeof propSchema>;

/** 创建道具输入 */
export const createPropInputSchema = propSchema
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    id: z.string().optional(),
  });

export type CreatePropInput = z.infer<typeof createPropInputSchema>;

/** 更新道具输入（所有字段可选） */
export const updatePropInputSchema = propSchema
  .partial()
  .omit({ id: true, createdAt: true });
export type UpdatePropInput = z.infer<typeof updatePropInputSchema>;
