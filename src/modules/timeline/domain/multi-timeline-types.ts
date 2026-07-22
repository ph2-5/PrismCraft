/**
 * Q3-9 / Task 4.6.7 — 多时间线支持 Domain 类型
 *
 * 定义多时间线结构和跨时间线关系。
 * 设计来源：docs/timeline-variant-design.md 第三章 3.4
 *
 * 支持结构：
 *   - 主线 + 支线 + 回忆线 + 并行线 + 替代线
 *   - 《盗梦空间》式多层嵌套时间线
 *   - 跨时间线绑定（fromNodeId ↔ toNodeId 的 relationship 映射）
 *
 * 与 shared-logic/timeline/cross-timeline-injector.ts 的关系：
 *   domain 层定义富类型（含 Zod schema、UI 元数据），
 *   shared-logic 层定义最小零依赖类型并实现注入算法。
 */

import type { StoryTimeline } from "@/domain/schemas/timeline";

// ─────────────────────────────────────────────────────────────
// 时间线关系类型
// ─────────────────────────────────────────────────────────────

/**
 * 时间线之间的关系的类型
 *
 * - prequel: 前传（时间线上在主线之前）
 * - sequel: 后传（时间线上在主线之后）
 * - parallel: 并行（同一时间不同地点/视角）
 * - flashback: 回忆（主线角色的回忆片段）
 * - flashforward: 闪前（对未来的预示）
 * - alternate: 替代（IF 线/平行宇宙）
 */
export type TimelineRelationshipType =
  | "prequel"
  | "sequel"
  | "parallel"
  | "flashback"
  | "flashforward"
  | "alternate";

export const TIMELINE_RELATIONSHIP_TYPES: TimelineRelationshipType[] = [
  "prequel",
  "sequel",
  "parallel",
  "flashback",
  "flashforward",
  "alternate",
];

// ─────────────────────────────────────────────────────────────
// 跨时间线节点映射
// ─────────────────────────────────────────────────────────────

/**
 * 跨时间线节点映射
 *
 * 描述两个不同时间线上的节点之间的关联关系。
 * 用于跨时间线绑定的端点定位。
 */
export interface NodeMapping {
  /** 源节点 ID（fromTimelineId 中的节点） */
  fromNodeId: string;
  /** 目标节点 ID（toTimelineId 中的节点） */
  toNodeId: string;
  /** 节点关系描述（如 "入睡进入"、"触发回忆"） */
  relationship: string;
}

// ─────────────────────────────────────────────────────────────
// 时间线关系
// ─────────────────────────────────────────────────────────────

/**
 * 时间线之间的关系
 *
 * 描述两个时间线如何关联，以及哪些节点相互对应。
 */
export interface TimelineRelationship {
  /** 源时间线 ID */
  fromTimelineId: string;
  /** 目标时间线 ID */
  toTimelineId: string;
  /** 关系类型 */
  type: TimelineRelationshipType;
  /** 关系描述（人类可读） */
  description: string;
  /** 节点映射列表（哪些节点相互对应） */
  nodeMappings: NodeMapping[];
}

// ─────────────────────────────────────────────────────────────
// 跨时间线绑定
// ─────────────────────────────────────────────────────────────

/**
 * 跨时间线绑定的类型（复用 BindingType，但限定为跨时间线场景常见的类型）
 *
 * 跨时间线场景常见：
 *   - foreshadow: 主线埋伏笔，回忆线揭示
 *   - callback: 回忆线的事件，主线后期呼应
 *   - parallel: 并行时间线的事件对照
 *   - cause_effect: 支线事件导致主线变化
 *   - mystery_reveal: 多层时间线渐进式揭示谜团
 *   - user_manual: 用户手动标记
 */
export type CrossTimelineBindingType =
  | "foreshadow"
  | "callback"
  | "parallel"
  | "cause_effect"
  | "mystery_reveal"
  | "user_manual";

/**
 * 跨时间线绑定
 *
 * 扩展 TimelineBindingLike，增加 timelineId 信息以支持跨时间线注入。
 */
export interface CrossTimelineBinding {
  /** 绑定 ID */
  id: string;
  /** 绑定类型 */
  type: CrossTimelineBindingType;
  /** 源时间线 ID */
  sourceTimelineId: string;
  /** 源节点 ID */
  sourceNodeId: string;
  /** 目标时间线 ID */
  targetTimelineId: string;
  /** 目标节点 ID */
  targetNodeId: string;
  /** 注入 Prompt 的文本 */
  injectionText: string;
  /** 重要程度 */
  importance: "critical" | "important" | "optional";
  /** 关系描述（可选，用于增强注入文本） */
  relationshipDescription?: string;
  /** 是否自动注入 */
  autoInject?: boolean;
  /** 是否有级联效应 */
  cascadeEffect?: boolean;
  /** AI 自动检测 */
  aiDetected?: boolean;
  /** 用户确认 */
  userConfirmed?: boolean;
}

// ─────────────────────────────────────────────────────────────
// 多时间线视图
// ─────────────────────────────────────────────────────────────

/**
 * 多时间线视图
 *
 * 聚合项目中的所有时间线和它们之间的关系，
 * 用于《盗梦空间》式多层时间线可视化。
 */
export interface MultiTimelineView {
  /** 项目中的所有时间线 */
  timelines: StoryTimeline[];
  /** 时间线之间的关系 */
  relationships: TimelineRelationship[];
  /** 跨时间线绑定 */
  crossTimelineBindings: CrossTimelineBinding[];
}

// ─────────────────────────────────────────────────────────────
// 辅助类型
// ─────────────────────────────────────────────────────────────

/**
 * 时间线层级信息（用于 UI 展示嵌套结构）
 */
export interface TimelineLayerInfo {
  /** 时间线 ID */
  timelineId: string;
  /** 层级深度（主线=0，第一层支线=1，第二层=2...） */
  depth: number;
  /** 父时间线 ID（若有） */
  parentTimelineId?: string;
  /** 子时间线 ID 列表 */
  childTimelineIds: string[];
  /** 时间线名称 */
  name: string;
  /** 时间线类型 */
  type: StoryTimeline["type"];
}

/**
 * 跨时间线注入结果
 */
export interface CrossTimelineInjectionResult {
  /** 目标节点 ID */
  nodeId: string;
  /** 目标时间线 ID */
  timelineId: string;
  /** 原始 Prompt */
  basePrompt: string;
  /** 注入后的 Prompt */
  injectedPrompt: string;
  /** 已注入的跨时间线绑定 */
  injectedBindings: CrossTimelineBinding[];
  /** 被跳过的绑定 */
  skippedBindings: Array<{ binding: CrossTimelineBinding; reason: string }>;
  /** 注入块文本 */
  injectionBlock: string;
}
