/**
 * Q3-3 — 时间线维度建模 Domain Schema（持久化层）
 *
 * 定义故事时间线系统的核心实体：StoryTimeline + PlotNode。
 * 设计来源：docs/timeline-variant-design.md（故事时间线变体系统）
 *
 * 核心范式：角色/场景的状态是故事时间线的函数，而非独立配置项。
 *   PlotNode 1 ──→ PlotNode 2 ──→ ... ──→ PlotNode N
 *   每个节点包含：剧情事件 + 状态快照 + 状态转换 + 时间线绑定
 *
 * 与现有实体的关系：
 *   - PlotNode.segmentId ↔ NovelSegment.id（Q2-1 的原文回溯字段）
 *   - PlotNode.beatId ↔ StoryBeat.id（可选直接关联）
 *   - 状态快照中的 variantId ↔ CharacterVariant.id / SceneVariant.id（Q3-1）
 *
 * 复杂嵌套类型（CharacterStateSnapshot / SceneStateSnapshot / StateTransition /
 * TimelineBinding）在本阶段以 JSON 列存储，完整类型定义将在状态推演引擎
 * 实现（Phase 4.6）时细化。当前以 z.record() 提供基础结构保证。
 */

import { z } from "zod";

// ── PlotEventType 枚举（22 种剧情事件类型）──

export const plotEventTypeSchema = z.enum([
  // 角色相关事件
  "character_introduce",           // 角色首次登场
  "character_transform",           // 角色形态/服装变化
  "character_injury",              // 角色受伤
  "character_emotion_change",      // 角色情绪变化
  "character_reveal_secret",       // 角色秘密揭示
  "character_relationship_change", // 角色关系变化
  // 场景相关事件
  "scene_change",                  // 场景切换
  "scene_destruction",             // 场景破坏
  "scene_transform",               // 场景变化（时间/天气）
  // 道具/设定相关事件
  "item_introduce",                // 道具首次出现
  "item_use",                      // 道具使用
  "item_destroy",                  // 道具损坏
  "world_rule_reveal",             // 世界观规则揭示
  // 剧情结构事件
  "foreshadow",                    // 埋下伏笔
  "callback",                      // 回收伏笔
  "climax",                        // 高潮
  "twist",                         // 转折
  "resolution",                    // 解决
  // 复合事件
  "compound",                      // 多个事件组合
  // 通用
  "narration",                     // 旁白/叙述
  "dialogue",                      // 对话
  "action",                        // 动作
]);
export type PlotEventType = z.infer<typeof plotEventTypeSchema>;

// ── TimelineType 枚举 ──

export const timelineTypeSchema = z.enum(["main", "branch", "flashback"]);
export type TimelineType = z.infer<typeof timelineTypeSchema>;

// ── SnapshotStrategy 枚举（三层快照架构，治理状态爆炸）──
// 详见 design doc §8：PinnedSnapshot（永久完整）/ ActiveSnapshot（滑动窗口完整）/ DiffOnlySnapshot（仅存 transition）

export const snapshotStrategySchema = z.enum(["pinned", "active", "diff_only"]);
export type SnapshotStrategy = z.infer<typeof snapshotStrategySchema>;

// ── StoryTimeline Schema ──

export const storyTimelineSchema = z.object({
  id: z.string(),
  /** 所属项目 ID（当前固定为默认项目，预留多项目扩展） */
  projectId: z.string().default("default"),
  /** 时间线名称，如 "主线"、"支线A"、"回忆线" */
  name: z.string().min(1),
  /** 时间线描述 */
  description: z.string().default(""),
  /** 时间线类型：主线 / 支线 / 回忆线 */
  type: timelineTypeSchema.default("main"),

  /** 是否与主线并行（支线/回忆线） */
  isParallel: z.preprocess((v) => Boolean(v), z.boolean()).default(false),
  /** 父时间线 ID（支线/回忆线才有） */
  parentTimelineId: z.string().optional(),
  /** 合并回父时间线的节点 ID */
  mergeNodeId: z.string().optional(),

  /** 时间线绑定（与其他时间线的关联），JSON 存储 */
  bindings: z.record(z.string(), z.unknown()).default({}),

  /** 扩展元数据 */
  metadata: z.record(z.string(), z.unknown()).default({}),

  createdAt: z.string().default(() => new Date().toISOString()),
  updatedAt: z.string().default(() => new Date().toISOString()),
});

export type StoryTimeline = z.output<typeof storyTimelineSchema>;

export const createStoryTimelineInputSchema = storyTimelineSchema
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({ id: z.string().optional() })
  .partial()
  .required({ name: true });
export type CreateStoryTimelineInput = z.infer<typeof createStoryTimelineInputSchema>;

export const updateStoryTimelineInputSchema = storyTimelineSchema
  .partial()
  .omit({ id: true, createdAt: true });
export type UpdateStoryTimelineInput = z.infer<typeof updateStoryTimelineInputSchema>;

// ── PlotNode Schema ──

export const plotNodeSchema = z.object({
  id: z.string(),
  /** 所属时间线 ID */
  timelineId: z.string(),
  /** 在时间线中的顺序（0-based） */
  order: z.number(),
  /** 所属章节序号（1-based，与 NovelSegment.chapterIndex 对应） */
  chapterIndex: z.number().optional(),
  /** 所属章节标题 */
  chapterTitle: z.string().optional(),
  /** 关联的 NovelSegment ID（Q2-1 的原文回溯锚点） */
  segmentId: z.string().optional(),
  /** 关联的 StoryBeat ID（可选直接关联） */
  beatId: z.string().optional(),

  // ── 剧情事件 ──
  /** 事件类型（驱动状态变化的核心） */
  plotEventType: plotEventTypeSchema.default("narration"),
  /** 事件描述（人类可读） */
  plotEventDescription: z.string().default(""),
  /** 事件参数（机器可处理的结构化数据），JSON 存储 */
  plotEventParameters: z.record(z.string(), z.unknown()).default({}),
  /** AI 分析结果（伏笔/回调/情感基调/叙事功能），JSON 存储 */
  aiAnalysis: z.record(z.string(), z.unknown()).optional(),

  // ── 状态快照（JSON 存储，完整类型在状态推演引擎实现时细化）──
  /** 角色状态快照数组：CharacterStateSnapshot[] */
  characterSnapshots: z.array(z.record(z.string(), z.unknown())).default([]),
  /** 场景状态快照数组：SceneStateSnapshot[] */
  sceneSnapshots: z.array(z.record(z.string(), z.unknown())).default([]),

  // ── 状态转换与绑定 ──
  /** 状态转换规则数组：StateTransition[] */
  transitions: z.array(z.record(z.string(), z.unknown())).default([]),
  /** 节点绑定数组：NodeBinding[] */
  bindings: z.array(z.record(z.string(), z.unknown())).default([]),

  // ── 快照策略（三层快照架构）──
  snapshotStrategy: snapshotStrategySchema.default("active"),

  /** 缓存的 Prompt（含前情提要注入后的完整 Prompt） */
  cachedPrompt: z.string().optional(),

  /** 扩展元数据 */
  metadata: z.record(z.string(), z.unknown()).default({}),

  createdAt: z.string().default(() => new Date().toISOString()),
  updatedAt: z.string().default(() => new Date().toISOString()),
});

export type PlotNode = z.output<typeof plotNodeSchema>;

export const createPlotNodeInputSchema = plotNodeSchema
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({ id: z.string().optional() })
  .partial()
  .required({ timelineId: true, order: true });
export type CreatePlotNodeInput = z.infer<typeof createPlotNodeInputSchema>;

export const updatePlotNodeInputSchema = plotNodeSchema
  .partial()
  .omit({ id: true, createdAt: true, timelineId: true });
export type UpdatePlotNodeInput = z.infer<typeof updatePlotNodeInputSchema>;
