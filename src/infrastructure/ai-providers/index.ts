export {
  ApiClientError,
  getErrorMessage,
  checkApiHealth,
  apiCallWithRetry,
} from "./core";
export {
  resolveCapability,
  safeTruncatePrompt,
  MAX_PROMPT_LENGTH,
} from "./config";
export { generateText } from "./text";
export { generateImage, analyzeImage } from "./image";
export {
  generateVideo,
  generateKeyframe,
  generateFramePair,
  generateVideoWithFrames,
  queryVideoStatus,
} from "./video";
export { getEffectiveVideoParams, type EffectiveVideoParams } from "./video-service";
export { generateEmbedding, generateEmbeddings } from "./embedding";
export { synthesizeSpeech, transcribeAudio } from "./audio";
export {
  secureConfig,
  exportData,
} from "./services";
export { generateEnhancedVideo } from "./enhanced-video";
export { generateVideoWithMultiAPI, testConnection } from "./multi-api";
export { getConfigStatus, clearConfigStatusCache } from "./config-status";
export {
  imageToBase64,
  uploadFile,
  getConfig,
  clearConfigCache,
} from "./utils";

export type {
  ApiRequestOptions,
  CustomApiConfig,
  ApiProviderConfig,
  ImageGenerationRequestBody,
  VideoGenerationRequestBody,
  TextGenerationRequestBody,
  KeyframeGenerationRequestBody,
  FramePairGenerationRequestBody,
  VideoStatusRequestBody,
  UploadRequestBody,
} from "./types";
