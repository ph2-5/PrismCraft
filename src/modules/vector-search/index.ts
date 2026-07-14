/**
 * 向量检索子模块 barrel export
 *
 * 三模式向量检索架构（API > 本地模型 > 关键词）的公开 API。
 *
 * 使用方式：
 * - 默认引擎：通过 barrel 导入 createDefaultEngine
 * - 自定义策略：实现 RetrievalStrategy 接口，注入 VectorSearchEngine
 * - 自定义存储：实现 EmbeddingStore 接口，传入 createDefaultEngine(store)
 * - 进度通知：传入 ProgressCallback 监听 backfill/search 阶段进度
 *
 * 设计要点：
 * - 引擎单例由调用方管理（memory-service 模块级缓存）
 * - 策略可独立测试（mock EmbeddingStore）
 * - 存储可替换（如未来支持 SQLite 向量库）
 * - 进度回调透传至策略层，便于 UI 显示进度条
 */

export type {
  EmbeddingStore,
  EmbeddingMeta,
  RetrievalStrategy,
  SearchProgress,
  ProgressCallback,
} from "./types";

export {
  FileEmbeddingStore,
  createEmbeddingStore,
} from "./embedding-store";

export {
  ApiVectorStrategy,
  LocalVectorStrategy,
  KeywordStrategy,
  keywordSearch,
} from "./strategies";

export {
  VectorSearchEngine,
  createDefaultEngine,
} from "./engine";
