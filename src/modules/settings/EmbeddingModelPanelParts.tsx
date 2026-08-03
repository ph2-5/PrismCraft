/**
 * EmbeddingModelPanel 的子组件与共享常量
 *
 * 拆分自 EmbeddingModelPanel.tsx，用于降低主组件的函数行数与圈复杂度。
 *
 * 本文件已按职责拆分为多个独立文件（P2.1 拆分超长组件文件），仅保留 re-export：
 * - embedding-model-constants.ts：共享常量与工具（RECOMMENDED_MODELS / REQUIRED_NON_ONNX_FILES / isAcceptedFile）与类型（UploadProgressInfo / PrewarmProgressInfo）
 * - EmbeddingModelCards.tsx：ModelCard / FaceModelCard
 * - EmbeddingModelUpload.tsx：UploadArea / UploadProgress
 * - EmbeddingModelStatus.tsx：StatusCard / PrewarmCard / DownloadGuide
 *
 * 公共 API（导出名与签名）保持不变。
 */

export {
  RECOMMENDED_MODELS,
  REQUIRED_NON_ONNX_FILES,
  isAcceptedFile,
} from "./embedding-model-constants";
export type {
  UploadProgressInfo,
  PrewarmProgressInfo,
} from "./embedding-model-constants";
export {
  ModelCard,
  FaceModelCard,
} from "./EmbeddingModelCards";
export {
  UploadProgress,
  UploadArea,
} from "./EmbeddingModelUpload";
export {
  StatusCard,
  PrewarmCard,
  DownloadGuide,
} from "./EmbeddingModelStatus";
