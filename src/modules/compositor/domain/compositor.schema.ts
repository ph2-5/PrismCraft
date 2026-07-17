/**
 * Task 2A.9 — 全局编译器（Compositor）Domain Schema
 *
 * 用于组合 角色 + 道具 + 场景 → AI 图像合成。
 * 生成结果通过 `@/modules/asset` 的 `createAsset({ type: "compositor_result" })` 持久化到
 * generation_assets 表（无需新建表）。
 */

import { z } from "zod";

/** 画布上的图层类型 */
export const composerLayerTypeSchema = z.enum(["character", "scene", "prop"]);
export type ComposerLayerType = z.infer<typeof composerLayerTypeSchema>;

/** 画布图层（用户拖入的素材节点） */
export const composerLayerSchema = z.object({
  /** 图层 ID（画布内唯一，删除/拖拽用） */
  layerId: z.string(),
  /** 引用实体 ID（character/scene/prop 的 id） */
  id: z.string(),
  /** 图层类型 */
  type: composerLayerTypeSchema,
  /** 显示名 */
  name: z.string(),
  /** 显示 emoji/图标 */
  emoji: z.string().default("🖼"),
  /** 画布坐标 X（px，相对画布左上角） */
  x: z.number().default(0),
  /** 画布坐标 Y（px） */
  y: z.number().default(0),
  /** 缩放（1 = 原始尺寸） */
  scale: z.number().default(1),
  /** 层级（z-index，越大越在上） */
  zIndex: z.number().default(1),
});
export type ComposerLayer = z.infer<typeof composerLayerSchema>;

/** 编译器输入（生成图像请求） */
export const compositorInputSchema = z.object({
  /** 角色 ID（必填，编译器主对象） */
  characterId: z.string(),
  /** Task 2A.10: 角色变体 ID（可选，使用变体的 promptFragment + 参考图覆盖角色基础设定） */
  characterVariantId: z.string().optional(),
  /** 道具 ID 列表（可选，组合到角色身上） */
  propIds: z.array(z.string()).optional(),
  /** 场景 ID（可选，背景） */
  sceneId: z.string().optional(),
  /** 额外提示词（用户自定义补充） */
  extraPrompt: z.string().optional(),
  /** 指定 AI 提供商（可选，不填用默认图像模型） */
  provider: z.string().optional(),
  /** 指定模型 ID（可选） */
  modelId: z.string().optional(),
  /** 输出分辨率（可选，默认 1024x1024） */
  resolution: z.string().optional(),
});
export type CompositorInput = z.infer<typeof compositorInputSchema>;

/** 编译器生成结果 */
export const compositorResultSchema = z.object({
  /** 生成结果 ID（与 generation_assets.id 一致） */
  id: z.string(),
  characterId: z.string(),
  /** Task 2A.10: 角色变体 ID（如果使用了变体） */
  characterVariantId: z.string().optional(),
  propIds: z.array(z.string()).default([]),
  sceneId: z.string().optional(),
  /** 生成的图像 URL（本地路径或 data: URL） */
  imageUrl: z.string(),
  /** 实际使用的合成 prompt */
  prompt: z.string(),
  /** 生成时间 ISO */
  createdAt: z.string(),
});
export type CompositorResult = z.infer<typeof compositorResultSchema>;

/** 编译器预设（保存常用组合） */
export const compositorPresetSchema = z.object({
  id: z.string(),
  name: z.string(),
  characterId: z.string(),
  propIds: z.array(z.string()).default([]),
  sceneId: z.string().optional(),
  extraPrompt: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CompositorPreset = z.infer<typeof compositorPresetSchema>;

/** 生成状态 */
export const compositorStatusSchema = z.enum([
  "idle",
  "building-prompt",
  "generating",
  "saving",
  "success",
  "error",
]);
export type CompositorStatus = z.infer<typeof compositorStatusSchema>;
