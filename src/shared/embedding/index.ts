/**
 * Embedding 基础设施代理导出
 *
 * 架构规则：modules/ 层不能直接导入 @/infrastructure/*，
 * 必须通过 @/shared/ 代理模块访问。
 *
 * 本模块 re-export @/infrastructure/embedding 的公开 API，
 * 供 modules/ 层通过 @/shared/embedding 使用。
 */

export {
  detectLocalModel,
  getLocalEmbeddingProvider,
  findTopK,
  cosineSimilarity,
  batchCosineSimilarity,
  ACCEPTED_ONNX_FILES,
  ALL_REQUIRED_FILES,
  installModelFromFiles,
  setActiveModel,
  removeModel,
  deriveModelId,
  // Face embedding ONNX provider（供 consistency-qc/face-embedding-service 使用）
  createOnnxFaceEmbeddingProvider,
  clearOnnxFaceEmbeddingCache,
  type EmbeddingModelInfo,
  type ModelStatus,
  type LocalModelEntry,
  type ModelRegistry,
  type VectorIndex,
  type OnnxFaceEmbeddingRunner,
} from "@/infrastructure/embedding";
