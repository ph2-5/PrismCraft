/**
 * Novel 模块入口 — 小说导入管道（Novel Import Pipeline）
 *
 * Phase 2A 一键成片管道的核心模块。三档渐进式复杂度：
 * - quick (3步)：项目初始化 → 内容导入 → 剧本化 → 生成
 * - standard (6步)：+ 角色管理 + 场景管理
 * - professional (8步)：+ 故事结构分析 + 节奏规划
 *
 * 当前状态（Phase 2A 全部 23 个任务已于 2026-07-20 完成）：
 * - ✅ domain/types.ts — 15 个类型定义（Task 2A.1）
 * - ✅ tools/ — 5 个 Novel Agent 工具（Task 2A.2）
 * - ✅ import/services/pipeline-machine.ts — 10 阶段状态机 + 三档模式 + 失败重试（Task 2A.3）
 * - ✅ presentation/ — UI Panel Part 1（导入+分段）（Task 2A.4）
 * - ✅ presentation/ — UI Panel Part 2（提取+拆解+提示词）（Task 2A.5）
 * - ✅ hooks/use-novel-pipeline.ts — 管道状态管理 Hook + StoryPipelineShell 三栏布局（Task 2A.6/2A.8/2A.9）
 * - ✅ presentation/NovelProjectList.tsx — 未完成项目恢复（Task 2A.7）
 * - ✅ domain/types.ts — 角色变体 / 场景变体 8 维参数向量 + Element Binding + Prompt 分层合成（Task 2A.10/2A.11/2A.12）
 * - ✅ structure/ — 故事结构分析层（叙事 beats + Treatment + ShotContract）（Task 2A.13）
 * - ✅ pacing/ — 节奏规划子域（Task 2A.14）
 * - ✅ presentation/ModeSelector.tsx + QuickModePanel.tsx — 三档模式（Task 2A.15）
 * - ✅ presentation/StoryOverviewPanel.tsx + charts/* — 概览视图（Task 2A.16）
 * - ✅ integration/ — 过期标记机制（staleness-tracker）（Task 2A.17）
 * - ✅ continuity/ — 连续性账本（continuity-ledger + tracker + fixer）（Task 2A.18）
 * - ✅ workflow/ — 工作流增强（auto/semi-pipeline + retake-protocol）（Task 2A.19）
 * - ✅ 跨模块 v5.4 协同：@/modules/blockout-3d（Seedance 2.5 + 3D 白盒）、@/modules/video/partial-edit（局部重绘）、@/modules/video/consistency-qc（一致性 QC 闭环）（Task 2A.20/2A.21/2A.22/2A.23）
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

// Hooks（Task 2A.6）
export { useNovelPipeline } from "./hooks/use-novel-pipeline";
export type { UseNovelPipelineOptions, UseNovelPipelineResult } from "./hooks/use-novel-pipeline";

// Presentation — UI Panel Part 1（Task 2A.4）
// 注：NovelImportPage.tsx 已删除（P0 修复，被 StoryPipelineShell 完全替代）
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

// Presentation — StoryPipelineShell 三栏布局（Task 2A.6）
export { StoryPipelineShell } from "./presentation/StoryPipelineShell";
export type { StoryPipelineShellProps } from "./presentation/StoryPipelineShell";
export { PhaseIndicator } from "./presentation/PhaseIndicator";
export type { PhaseIndicatorProps } from "./presentation/PhaseIndicator";
export { SegmentNavColumn } from "./presentation/SegmentNavColumn";
export type { SegmentNavColumnProps } from "./presentation/SegmentNavColumn";
export { MainWorkArea } from "./presentation/MainWorkArea";
export type { MainWorkAreaProps } from "./presentation/MainWorkArea";
export { ContextPanel } from "./presentation/ContextPanel";
export type { ContextPanelProps } from "./presentation/ContextPanel";

// Presentation — 未完成项目恢复对话框（Task 2A.7）
export { NovelProjectList } from "./presentation/NovelProjectList";
export type { NovelProjectListProps } from "./presentation/NovelProjectList";

// Presentation — 原始小说回溯对话框（Novel → Story 软关联）
export { NovelSourceDialog } from "./presentation/NovelSourceDialog";
export type { NovelSourceDialogProps, NovelSourceDialogData } from "./presentation/NovelSourceDialog";

// ============================================================================
// Structure 子域（Task 2A.13）
// ============================================================================
// 故事结构分析层 — 叙事 beats + Treatment + ShotContract
// domain + services 通过 structure/index.ts 桶文件统一导出
// presentation 中的两个 UI Panel 直接从此处导出（与其他 presentation 组件保持一致）
export * from "./structure";

// Presentation — 故事结构分析面板（Task 2A.13）
export { StructureAnalysisPanel } from "./presentation/StructureAnalysisPanel";
export type { StructureAnalysisPanelProps } from "./presentation/StructureAnalysisPanel";

// Presentation — 镜头契约编辑面板（Task 2A.13 v5.3 增强）
export { ShotContractPanel } from "./presentation/ShotContractPanel";
export type { ShotContractPanelProps } from "./presentation/ShotContractPanel";
