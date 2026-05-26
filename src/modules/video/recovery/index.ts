export type {
  VideoVerificationResult,
  VideoVerificationDetails,
  RetryDecision,
  VideoRecoveryLog,
  VideoTaskRecoveryInfo,
  DuplicateCheckResult,
  RetryConfig,
} from "./types/video-recovery-types";

export {
  verifyVideoUrl,
  verifyVideoFile,
  verifyMultipleVideos,
} from "./services/video-verification-service";

export {
  checkForDuplicateVideos,
  findSimilarTasks,
} from "./services/duplicate-detection-service";

export {
  SmartRetryEngine,
  smartRetryEngine,
  createRetryEngine,
} from "./services/smart-retry-engine";

export { classifyError } from "@/domain/types";
export type { ErrorCategory } from "@/domain/types";

export {
  getTaskRecoveryInfo,
  performIntelligentRecovery,
  checkForTokenWaste,
} from "./services/video-intelligent-recovery-service";

export {
  registerCacheVideoBlobFn,
  saveVideoTask,
  getFailedTasks,
  getTaskById,
  recoverVideoByTaskId,
  startBackgroundRecovery,
  cleanExpiredTasks,
  getAllTaskHistory,
} from "./services/video-recovery-service";

export type { VideoRecoverySuccessResult } from "./services/video-recovery-service";
