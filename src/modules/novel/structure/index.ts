/**
 * Task 2A.13 — Structure 子域桶文件
 *
 * 导出故事结构分析层的所有公共 API：
 * - domain：叙事 beats + Treatment + ShotContract 类型
 * - services：structure-analyzer + treatment-extractor + shot-contract-builder
 *
 * 依赖方向（contract.json）：
 * - domain 仅依赖 @/modules/novel/domain/types（NovelSegment）
 * - services 仅依赖 domain + @/modules/novel/tools/helpers（asString/asNumber/asStringArray）
 * - 不依赖任何 infrastructure / shared-logic / 其他 modules
 *
 * 调用方：
 * - novel/index.ts 通过此桶文件导出 structure 子域
 * - Task 2A.16 三档模式接入时，useNovelPipeline 将调用 analyzeStoryStructure / extractTreatment / buildShotContractsForBeats
 */

// ============================================================================
// Domain — 叙事 beats（Task 2A.13 基础）
// ============================================================================
export type {
  NarrativeBeat,
  NarrativeBeatType,
  EmotionPoint,
  OverallPacing,
  StoryStructure,
} from "./domain/narrative-beats";
export {
  NARRATIVE_BEAT_TYPES,
  computeBeatPosition,
  findClimaxPosition,
  inferOverallPacing,
  computeEmotionCurve,
} from "./domain/narrative-beats";

// ============================================================================
// Domain — Treatment（Task 2A.13 v5.3 增强）
// ============================================================================
export type {
  StoryTone,
  CharacterArc,
  StoryTreatment,
} from "./domain/treatment";
export {
  STORY_TONES,
  EMPTY_TREATMENT,
  isTreatmentComplete,
} from "./domain/treatment";

// ============================================================================
// Domain — ShotContract（Task 2A.13 v5.3 增强）
// ============================================================================
export type {
  ShotSize,
  ShotMovement,
  ShotLighting,
  ShotContract,
} from "./domain/shot-contract";
export {
  SHOT_SIZES,
  SHOT_MOVEMENTS,
  SHOT_LIGHTINGS,
  DEFAULT_LENS_BY_SIZE,
  DEFAULT_DURATION_BY_SIZE,
  validateShotContract,
  clampDuration,
} from "./domain/shot-contract";

// ============================================================================
// Services — structure-analyzer
// ============================================================================
export type { GenerateTextFn } from "./services/structure-analyzer";
export {
  buildStructureAnalysisPrompt,
  parseNarrativeBeats,
  populateBeatPositionsAndDurations,
  extractJsonArrayFromText,
  analyzeStoryStructure,
  suggestDurationByStructure,
  recalculateStoryStructure,
  DEFAULT_DURATION_ADJUSTMENTS,
} from "./services/structure-analyzer";

// ============================================================================
// Services — treatment-extractor
// ============================================================================
export {
  buildTreatmentExtractionPrompt,
  parseTreatment,
  extractJsonObjectFromText,
  extractTreatment,
} from "./services/treatment-extractor";

// ============================================================================
// Services — shot-contract-builder
// ============================================================================
export {
  DEFAULT_SHOT_COUNT_BY_BEAT,
  DEFAULT_SHOT_SIZE_BY_BEAT,
  getDefaultLighting,
  buildShotContractPrompt,
  parseShotContracts,
  buildShotContractsForBeat,
  buildShotContractsForBeats,
} from "./services/shot-contract-builder";
