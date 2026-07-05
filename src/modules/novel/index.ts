/**
 * Novel Module — Public API Barrel
 *
 * 故事创作流水线模块的公共 API。
 * 其他模块只能通过 @/modules/novel 导入。
 *
 * v5.1 Phase 2A 开发中，当前仅导出 domain 类型。
 * 后续 Task 将逐步添加 import/structure/pacing/overview 等子域 API。
 */

// ============================================================
// domain 子域 — 类型定义（Task 2A.1）
// ============================================================
export type {
  NovelSegment,
  ExtractedCharacter,
  ExtractedScene,
  ShotBreakdown,
  PipelineStage,
  AIAssistLevel,
  PipelineConfig,
  PipelineState,
  NovelProject,
  SegmentPrompt,
  GenerationResult,
} from "./domain/types";

// ============================================================
// import 子域 — 流水线状态机（Task 2A.3，待实现）
// ============================================================
// export {
//   STAGE_ORDER,
//   VALID_TRANSITIONS,
//   getStagesForMode,
//   canTransition,
//   transition,
// } from "./import/services/pipeline-machine";

// ============================================================
// integration 子域 — 联动机制（Task 2A.17，待实现）
// ============================================================
// export {
//   stalenessTracker,
//   triggerDispatcher,
//   StalenessTracker,
//   TriggerDispatcher,
// } from "./integration";
