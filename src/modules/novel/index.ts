/**
 * Novel 模块入口 — 小说导入管道（Novel Import Pipeline）
 *
 * Phase 2A 一键成片管道的核心模块。三档渐进式复杂度：
 * - quick (3步)：项目初始化 → 内容导入 → 剧本化 → 生成
 * - standard (6步)：+ 角色管理 + 场景管理
 * - professional (8步)：+ 故事结构分析 + 节奏规划
 *
 * 当前状态（Task 2A.1 + 2A.2 + 2A.3 + 2A.4）：
 * - ✅ domain/types.ts — 15 个类型定义
 * - ✅ tools/ — 5 个 Novel Agent 工具
 * - ✅ import/services/pipeline-machine.ts — 10 阶段状态机 + 三档模式 + 失败重试
 * - ✅ presentation/ — UI Panel Part 1（导入+分段）
 * - ⏳ hooks/ — 管道状态管理（Task 2A.5，待实施）
 * - ⏳ presentation/ — UI Panel Part 2（提取+拆解+提示词，Task 2A.5，待实施）
 * - ⏳ services/ — 故事结构分析 + 节奏规划（Task 2A.13/2A.14，待实施）
 *
 * 依赖方向：
 * - 仅依赖 @/domain/* + @/infrastructure/di + @/shared-logic/* + @/shared/*
 * - 不依赖其他 @/modules/*（match-entities 通过动态 import 调用 characterService/sceneService）
 */

// Domain 类型
export type {
  NovelSegment,
  ExtractedCharacter,
  ExtractedScene,
  ShotBreakdown,
  PipelineStage,
  PipelineConfig,
  Segment,
  CharacterVariant,
  CharacterInPipeline,
  SceneVariant,
  SceneInPipeline,
  SegmentPrompt,
  GenerationResult,
  PipelineState,
  NovelProject,
} from "./domain/types";

// Tools（5 个 Novel Agent 工具）
export {
  segmentNovelTextTool,
  extractCharactersFromTextTool,
  extractScenesFromTextTool,
  matchEntitiesTool,
  breakdownTextToShotsTool,
  novelTools,
} from "./tools";

// Pipeline 状态机（Task 2A.3）
export {
  STAGE_ORDER,
  VALID_TRANSITIONS,
  canTransition,
  transition,
  getAutoGates,
  shouldPauseAtStage,
  getStagesForMode,
  retryStage,
  getRetryableStages,
  FALLBACK_STRATEGIES,
} from "./import/services/pipeline-machine";

// Presentation — UI Panel Part 1（Task 2A.4）
export { NovelImportPage } from "./presentation/NovelImportPage";
export type { NovelImportPageProps } from "./presentation/NovelImportPage";
export { ImportStep } from "./presentation/ImportStep";
export type { ImportStepProps } from "./presentation/ImportStep";
export { SegmentList } from "./presentation/SegmentList";
export type { SegmentListProps } from "./presentation/SegmentList";
export { SegmentCard } from "./presentation/SegmentCard";
export type { SegmentCardProps } from "./presentation/SegmentCard";
export { PipelineProgress } from "./presentation/PipelineProgress";
export type { PipelineProgressProps } from "./presentation/PipelineProgress";
export { PipelineControls } from "./presentation/PipelineControls";
export type { PipelineControlsProps } from "./presentation/PipelineControls";

// Presentation — UI Panel Part 2（Task 2A.5）
export { EntityReviewPanel } from "./presentation/EntityReviewPanel";
export type { EntityReviewPanelProps } from "./presentation/EntityReviewPanel";
export { CharacterExtractCard } from "./presentation/CharacterExtractCard";
export type { CharacterExtractCardProps } from "./presentation/CharacterExtractCard";
export { SceneExtractCard } from "./presentation/SceneExtractCard";
export type { SceneExtractCardProps } from "./presentation/SceneExtractCard";
export { ShotBreakdownList } from "./presentation/ShotBreakdownList";
export type { ShotBreakdownListProps } from "./presentation/ShotBreakdownList";
export { ShotCard } from "./presentation/ShotCard";
export type { ShotCardProps } from "./presentation/ShotCard";
export { FinalizePanel } from "./presentation/FinalizePanel";
export type { FinalizePanelProps, FinalizeSummary } from "./presentation/FinalizePanel";
