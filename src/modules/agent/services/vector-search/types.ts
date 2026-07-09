/**
 * 向量检索策略类型定义
 *
 * 三模式检索架构（API > 本地模型 > 关键词）的策略接口。
 * 每种策略封装一种检索方式，VectorSearchEngine 按优先级链式调用。
 *
 * 设计要点：
 * - 策略返回 null 表示不可用/失败，引擎尝试下一个策略
 * - 策略返回数组（含空数组）表示成功，引擎直接返回
 * - EmbeddingStore 管理 embedding 的独立存储与维度版本管理
 * - 进度通知（S3）：backfill 大批量 embedding 时通过 onProgress 回调报告进度
 */

import type { ArchivalMemoryEntry } from "../memory-service";

/**
 * Embedding 独立存储接口
 *
 * 替代将 embedding 混入 archival.json 的做法。
 * 独立文件存储，支持维度版本检测与自动失效。
 *
 * 存储结构：
 * - <cacheDir>/agent/memory/embeddings.json
 *   {
 *     meta: { modelId, dimensions, updatedAt },
 *     entries: { [id]: { embedding: number[], updatedAt } }
 *   }
 */
export interface EmbeddingStore {
  /** 读取存储元信息（modelId + dimensions） */
  getMeta(): Promise<EmbeddingMeta | null>;

  /**
   * 检查给定 modelId + dimensions 是否与存储兼容
   *
   * 不兼容（modelId 或 dimensions 变化）时，调用方应 invalidateAll 后重新生成。
   */
  isCompatible(modelId: string, dimensions: number): Promise<boolean>;

  /** 获取指定 id 的 embedding */
  getEmbedding(id: string): Promise<number[] | null>;

  /** 批量获取多个 id 的 embedding */
  getEmbeddings(ids: string[]): Promise<Map<string, number[]>>;

  /**
   * 批量设置 embedding（合并写入）
   *
   * @param updates id → embedding 映射
   * @param modelId 生成这些 embedding 的模型 id（用于维度版本追踪）
   * @param dimensions 向量维度
   */
  setEmbeddings(
    updates: Map<string, number[]>,
    modelId: string,
    dimensions: number,
  ): Promise<void>;

  /** 清空所有 embedding（维度变更时调用） */
  invalidateAll(): Promise<void>;
}

/** Embedding 存储元信息 */
export interface EmbeddingMeta {
  modelId: string;
  dimensions: number;
  updatedAt: number;
}

/**
 * 检索进度信息（S3 异步 backfill 进度通知）
 *
 * 在 backfill 大批量 embedding 时通过 ProgressCallback 报告进度，
 * 让 UI 层显示进度条/状态消息。
 */
export interface SearchProgress {
  /** 当前阶段 */
  phase: "backfill" | "search";
  /** 已处理条数 */
  current: number;
  /** 总条数 */
  total: number;
  /** 触发进度的策略名称（如 "api"、"local"） */
  strategy?: string;
  /** 人类可读消息（用于 UI 显示） */
  message?: string;
}

/** 进度回调类型 */
export type ProgressCallback = (progress: SearchProgress) => void;

/**
 * 检索策略接口
 *
 * 策略实现某种检索方式（API 向量 / 本地向量 / 关键词）。
 * VectorSearchEngine 按 strategies 数组顺序尝试，首个成功的策略结果直接返回。
 */
export interface RetrievalStrategy {
  /** 策略名称（用于日志） */
  readonly name: string;

  /**
   * 检查策略是否可用
   *
   * 例：API 策略需 embeddingProvider 已配置；本地策略需模型文件已安装。
   */
  isAvailable(): Promise<boolean>;

  /**
   * 执行检索
   *
   * @param query 查询文本
   * @param entries 所有归档记忆条目
   * @param limit 返回条数上限
   * @param onProgress 可选进度回调（backfill 大批量 embedding 时触发）
   * @returns 检索结果数组；null 表示策略不可用或失败，引擎应尝试下一个策略
   */
  search(
    query: string,
    entries: ArchivalMemoryEntry[],
    limit: number,
    onProgress?: ProgressCallback,
  ): Promise<ArchivalMemoryEntry[] | null>;
}
