export type { VideoTask } from "./task-management";
export { useVideoTaskManager, useVideoTaskStore } from "./task-management";
export { useVideoTaskQueries } from "./task-management";
export { useVideoTaskCommands } from "./task-management";
export { useVideoTaskPolling } from "./task-management";
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
  getCachedVideoUrl,
  getVideoUrlWithCache,
  removeCachedVideo,
  cleanExpiredVideoCache,
  getCacheStats,
  revokeObjectURL,
  touchMemoryCache,
  clearMemoryCache,
  checkCachedVideo,
  getVideoFileStream,
  getCachedVideo,
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
  SmartRetryEngine,
  createRetryEngine,
} from "./recovery";

export {
  getTaskRecoveryInfo,
  performIntelligentRecovery,
  checkForTokenWaste,
} from "./recovery";

export {
  registerCacheVideoBlobFn,
  getFailedTasks,
  getTaskById,
  startBackgroundRecovery,
  cleanExpiredTasks,
  getAllTaskHistory,
} from "./recovery";
