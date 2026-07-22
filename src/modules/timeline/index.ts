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
