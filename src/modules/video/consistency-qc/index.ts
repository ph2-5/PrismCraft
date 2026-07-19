/**
 * Task 2A.23: consistency-qc 模块公共 API
 *
 * 视频生成完成后的自动一致性 QC 闭环：
 *   1. 抽帧 → face/visual embedding → 与角色参考图比对 → 生成 QCReport
 *   2. 按 verdict（pass / drift_warning / drift_critical）触发动作
 *   3. 按分镜类型应用不同的连续性策略
 *
 * 设计策略：VLM 优先 + face embedding 可插拔
 *   - 主路径：VLM 视觉一致性检查（复用 container.imageApi.analyze）
 *   - 可选增强：face embedding（ONNX 模型可用时激活）
 *   - 降级：所有 provider 不可用时返回空 QCReport
 *
 * 详见 MODULE.md
 */

// ─── Domain 层（类型 + 工厂函数 + 校验） ────────────────────────────────────

export type {
  Verdict,
  ActionTaken,
  FrameScore,
  QCReport,
} from "./domain/qc-schema";

export {
  createEmptyQCReport,
  computeAggregates,
  determineVerdict,
  shouldTriggerFallback as shouldTriggerFallbackForVerdict,
  isQCReportComplete,
} from "./domain/qc-schema";

export type {
  ShotStrategyType,
  LastFrameUsage,
  ShotStrategy,
} from "./domain/shot-strategy";

export {
  inferStrategyFromShotType,
  createStrategy,
  describeStrategy,
  getStrategyThresholdMultiplier,
  usesLastFrame,
  isContinuousAction,
} from "./domain/shot-strategy";

export type { DriftPolicy } from "./domain/drift-policy";
export {
  DEFAULT_DRIFT_POLICY,
  resolvePolicy,
  validatePolicy,
  shouldFallbackToFaceSwap,
  shouldMarkManualReview,
} from "./domain/drift-policy";

// ─── Services 层 ────────────────────────────────────────────────────────────

export type {
  EmbeddingMetadata,
  FaceEmbeddingProvider,
} from "./services/face-embedding-service";

export {
  getFaceEmbeddingProvider,
  clearFaceEmbeddingProviderCache,
  isFaceEmbeddingAvailable,
  extractFaceEmbedding,
} from "./services/face-embedding-service";

export type {
  SimilarityCheckerError,
  SimilarityResult,
  FrameEmbeddingInput,
  FrameScoreStats,
} from "./services/similarity-checker";

export {
  computeFrameSimilarity,
  checkFrameConsistency,
  findWorstFrame,
  findWorstFrames,
  filterFramesWithFace,
  computeFrameStats,
} from "./services/similarity-checker";

export type {
  QCInput,
  QCOutput,
  QCErrorKind,
} from "./services/qc-orchestrator";

export {
  runQualityCheck,
  shouldTriggerFallback,
  decideFallbackAction,
  getFrameStats,
  shouldDispatchFallback,
} from "./services/qc-orchestrator";

export type { StrategyOverride } from "./services/shot-strategy-router";

export {
  routeStrategy,
  applyStrategyToPrompt,
  getEffectiveThreshold,
  describeRoutedStrategy,
  shouldUseLastFrame,
  getLastFrameUsage,
  isStrategyLocked,
  buildStrategyAwarePrompt,
} from "./services/shot-strategy-router";

export type {
  FallbackAction,
  FallbackInput,
  FallbackResult,
} from "./services/fallback-dispatcher";

export {
  dispatchFallback,
  listFallbackHistory,
  isFallbackTerminal,
  predictNextAction,
} from "./services/fallback-dispatcher";

// ─── Hooks 层（Task 2A.23） ─────────────────────────────────────────────────

export {
  useQCTrigger,
  buildQCInput,
  triggerQCForTask,
  type QCTriggerInput,
} from "./hooks/use-qc-trigger";

// ─── Presentation 层（Task 2A.23） ───────────────────────────────────────────

export { QCDashboardPanel } from "./presentation/QCDashboardPanel";
