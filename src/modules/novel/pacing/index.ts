/**
 * Task 2A.14 — Pacing 子域公共 API
 *
 * 节奏规划引擎：基于 StoryStructure 按预设比例分配时长，产出可应用的 PacingResult。
 *
 * 依赖方向：
 * - domain/pacing-types 仅依赖 structure/domain/narrative-beats（同模块内）
 * - services/pacing-engine 仅依赖 domain/pacing-types + structure/domain + domain/types
 * - 不依赖 infrastructure / shared-logic / 其他 modules
 *
 * 调用方：
 * - useNovelPipeline：在 pacing_planning 阶段调用 planPacing 产出建议时长
 * - PacingPanel：展示 PacingResult + 用户编辑 PacingConfig
 * - EmotionCurveChart：复用 PacingResult.emotionCurve 绘制曲线
 */

// Domain — 类型与常量
export type {
  PacingPreset,
  PacingConfig,
  PacingRatios,
  PacingResult,
} from "./domain/pacing-types";

export {
  DEFAULT_PACING_PRESETS,
  DEFAULT_PACING_CONFIG,
  SEGMENT_DURATION_MIN,
  SEGMENT_DURATION_MAX,
} from "./domain/pacing-types";

// Services — 节奏规划引擎
export {
  groupSegmentsByBeat,
  resolvePacingConfig,
  normalizeRatios,
  allocateDurationByBeat,
  distributeDurationToSegments,
  distributeUngroupedSegments,
  generatePacingNotes,
  planPacing,
  applyPacingToBeats,
} from "./services/pacing-engine";

export type { BeatWithDuration } from "./services/pacing-engine";
