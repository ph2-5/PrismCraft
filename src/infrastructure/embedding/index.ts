/**
 * 本地 Embedding 基础设施 barrel export
 *
 * 提供：
 * - 模型管理（检测、删除、路径查询、M5 多模型管理）
 * - 本地推理引擎（transformers.js + ONNX）
 * - 余弦相似度计算工具
 */

export {
  getModelDirectory,
  detectLocalModel,
  deleteLocalModel,
  // M5 多模型管理 API
  listLocalModels,
  getActiveModelId,
  getActiveModelEntry,
  setActiveModel,
  removeModel,
  installModelFromFiles,
  _setActiveModelChangeCallback,
  deriveModelId,
  // 常量
  ACCEPTED_ONNX_FILES,
  ALL_REQUIRED_FILES,
  // 类型
  type EmbeddingModelInfo,
  type ModelStatus,
  type LocalModelEntry,
  type ModelRegistry,
} from "./model-manager";

export {
  getLocalEmbeddingProvider,
  preloadLocalModel,
  clearLocalModelCache,
} from "./local-embedding-provider";

// Face embedding ONNX provider（image-feature-extraction pipeline）
// 与 text embedding 独立，模型路径通过 faceEmbeddingModelPath 配置
export {
  createOnnxFaceEmbeddingProvider,
  clearOnnxFaceEmbeddingCache,
  type OnnxFaceEmbeddingRunner,
} from "./face-embedding-onnx-provider";

export { cosineSimilarity, batchCosineSimilarity, findTopK } from "./similarity";

// L4：向量索引抽象（flat index 默认，未来可扩展 HNSW/IVF）
export { FlatIndex, createDefaultIndex, type VectorIndex } from "./vector-index";
