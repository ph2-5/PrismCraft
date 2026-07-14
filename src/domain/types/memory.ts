/**
 * 归档记忆条目类型
 *
 * 定义在全局 domain 层，供 agent 模块和 vector-search 模块共享。
 * agent/domain/types.ts re-export 此类型保持向后兼容。
 */

/** 归档记忆条目 */
export interface ArchivalMemoryEntry {
  id: string;
  type: "summary" | "fact" | "decision";
  content: string;
  /** 来源会话 ID */
  sessionId?: string;
  /** 创建时间戳 */
  createdAt: number;
  /** 标签（便于分类检索） */
  tags?: string[];
  /**
   * 内容的向量嵌入（已废弃，不再使用）
   *
   * S5 之后 embedding 独立存储到 embeddings.json，由 EmbeddingStore 管理。
   * 此字段保留仅为向后兼容旧 archival.json 数据的读取（解析时由 getAllArchivalMemory 忽略）。
   * 新数据不再写入此字段；VectorSearchEngine 的策略从 EmbeddingStore 读取。
   * @deprecated 使用 EmbeddingStore（@/modules/vector-search/embedding-store）替代
   */
  embedding?: number[];
}
