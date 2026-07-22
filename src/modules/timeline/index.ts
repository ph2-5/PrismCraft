/**
 * Timeline Module — 时间线维度建模（Q3-3）
 *
 * 定义故事时间线系统的核心实体和模块边界。
 * 设计来源：docs/timeline-variant-design.md（故事时间线变体系统）
 *
 * 当前阶段（建模）：
 *   - Domain schemas: StoryTimeline + PlotNode + PlotEventType(22种) + SnapshotStrategy
 *   - Storage: timelineStorage + plotNodeStorage（通过 DI container 访问）
 *   - DB: story_timelines + plot_nodes 表（migration v12）
 *
 * 未来扩展（Phase 4.6）：
 *   - 状态推演引擎（state-propagation-engine）
 *   - React Query hooks（use-timeline, use-plot-nodes）
 *   - UI 组件（TimelineEditor, TimelineTrack, NodeDetailPanel）
 *   - Prompt 合成增强（state snapshot + binding → enhanced prompt）
 */

// Domain schemas & types
export {
  storyTimelineSchema,
  createStoryTimelineInputSchema,
  updateStoryTimelineInputSchema,
  plotNodeSchema,
  createPlotNodeInputSchema,
  updatePlotNodeInputSchema,
  plotEventTypeSchema,
  timelineTypeSchema,
  snapshotStrategySchema,
} from "@/domain/schemas/timeline";

export type {
  StoryTimeline,
  CreateStoryTimelineInput,
  UpdateStoryTimelineInput,
  PlotNode,
  CreatePlotNodeInput,
  UpdatePlotNodeInput,
  PlotEventType,
  TimelineType,
  SnapshotStrategy,
} from "@/domain/schemas/timeline";

// Hooks（Q3-5 / Task 4.6.3）
export { useCascadeUpdate } from "./hooks/use-cascade-update";
export type { CascadeUpdateApi } from "./hooks/use-cascade-update";

// Hooks（Q3-6 / Task 4.6.4）
export { useTimelineBinding } from "./hooks/use-timeline-binding";
export type { TimelineBindingApi, UseTimelineBindingOptions } from "./hooks/use-timeline-binding";

// Hooks（Q3-8 / Task 4.6.6）
export { useEnhancedPrompt } from "./hooks/use-enhanced-prompt";
export type { EnhancedPromptApi, UseEnhancedPromptOptions } from "./hooks/use-enhanced-prompt";

// Hooks（Q3-9 / Task 4.6.7）
export { useMultiTimeline } from "./hooks/use-multi-timeline";
export type { MultiTimelineApi } from "./hooks/use-multi-timeline";

// Presentation 组件（Q3-7 / Task 4.6.5）
export { TimelineEditor } from "./presentation/TimelineEditor";
export { TimelineTrack } from "./presentation/TimelineTrack";
export { NodeDetailPanel } from "./presentation/NodeDetailPanel";
export { StateSnapshotView } from "./presentation/StateSnapshotView";
export { CharacterStateTrack } from "./presentation/CharacterStateTrack";
export { BindingGraph } from "./presentation/BindingGraph";
export { BindingCreatorDialog } from "./presentation/BindingCreatorDialog";
export type { BindingCreatorResult } from "./presentation/BindingCreatorDialog";

// Presentation 组件（Q3-9 / Task 4.6.7）
export { MultiTimelineView } from "./presentation/MultiTimelineView";

// Domain 类型（Q3-9 / Task 4.6.7）
export type {
  TimelineRelationshipType,
  CrossTimelineBindingType,
  NodeMapping,
  TimelineRelationship,
  CrossTimelineBinding,
  MultiTimelineView as MultiTimelineViewData,
  TimelineLayerInfo,
  CrossTimelineInjectionResult as DomainCrossTimelineInjectionResult,
} from "./domain/multi-timeline-types";
export { TIMELINE_RELATIONSHIP_TYPES } from "./domain/multi-timeline-types";
