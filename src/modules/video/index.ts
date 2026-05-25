export type { VideoTask } from "./task-management";
export { useVideoTaskManager, useVideoTaskStore } from "./task-management";
export {
  useVideoTasks,
  useFailedVideoTasks,
  useRecoverVideo,
  useCleanExpiredTasks,
  useStartBackgroundRecovery,
} from "./task-management";
export { useVideoCacheStats } from "./cache";
export {
  cacheVideoBlob,
  getVideoUrlWithCache,
  getCacheStats,
  revokeObjectURL,
} from "./cache";
export {
  cacheImageBlob,
  getCachedImagePath,
  getImageUrlWithCache,
  removeCachedImage,
  cleanExpiredImageCache,
  getImageCacheStats,
  recoverUncachedImages,
} from "./cache";
export { recoverVideoByTaskId } from "./recovery";
export { saveVideoTask } from "./recovery";
export { buildTrackingInfo } from "./task-management";
export { detectVideoCodec, isCodecSupportedByProvider } from "./utils";
export { extractVideoFrames } from "./utils";
export { downloadJSONFile } from "./utils";
export { VideoTaskManager } from "./task-management";
export { VideoTaskManagerInitializer } from "./task-management";
export { VideoTaskManagerUI } from "./task-management";
export {
  videoTemplates,
  templateCategories,
  getTemplatesByCategory,
  applyVideoTemplate,
  type VideoTemplate,
} from "./utils";

export type {
  VideoVerificationResult,
  VideoVerificationDetails,
  RetryDecision,
  VideoRecoveryLog,
  VideoTaskRecoveryInfo,
  DuplicateCheckResult,
  RetryConfig,
} from "./recovery";

export {
  verifyVideoUrl,
  verifyMultipleVideos,
} from "./recovery";

export {
  checkForDuplicateVideos,
  findSimilarTasks,
} from "./recovery";

export {
  smartRetryEngine,
  createRetryEngine,
} from "./recovery";

export {
  getTaskRecoveryInfo,
  performIntelligentRecovery,
  checkForTokenWaste,
} from "./recovery";
