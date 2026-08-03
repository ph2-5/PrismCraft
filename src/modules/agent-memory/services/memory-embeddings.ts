/**
 * 记忆嵌入与检索引擎管理（Memory Embeddings & Search Engine）
 *
 * 从 memory-service.ts 拆分而来，包含：
 * - VectorSearchEngine 单例管理（模块级 _searchEngine / _testStore）
 * - getSearchEngine：供 searchArchivalMemory（memory-archival.ts）访问同一引擎闭包
 * - _setSearchEngine / _getTestEmbeddingStore / _resetSearchEngine：测试注入
 * - prewarmEmbeddings：预热 Embedding 缓存
 * - _resetAllMemory：测试用重置所有记忆
 *
 * 设计要点：
 * - 引擎单例状态（模块级变量）与本文件闭包一致；searchArchivalMemory 在
 *   memory-archival.ts 中通过 getSearchEngine() 引用同一份状态（函数级循环依赖，
 *   ESM 实例化阶段绑定已创建，运行时安全）
 * - 首次调用 searchArchivalMemory 时懒初始化默认引擎（createDefaultEngine）
 * - 测试可通过 _setSearchEngine / _resetSearchEngine 替换或重置引擎
 */

import {
  createDefaultEngine,
  type VectorSearchEngine,
  type EmbeddingStore,
} from "@/modules/vector-search";
import { getAllArchivalMemory, saveArchivalMemory } from "./memory-archival";
import { EMPTY_CORE_MEMORY, saveCoreMemory } from "./memory-core";

// ============= VectorSearchEngine 单例管理 =============

/**
 * 模块级引擎单例
 *
 * 首次调用 searchArchivalMemory 时懒初始化。
 * 测试可通过 _setSearchEngine / _resetSearchEngine 替换或重置。
 */
let _searchEngine: VectorSearchEngine | null = null;

/** 获取引擎单例（首次调用时创建默认引擎） */
export function getSearchEngine(): VectorSearchEngine {
  if (!_searchEngine) {
    _searchEngine = createDefaultEngine();
  }
  return _searchEngine;
}

/**
 * 注入自定义引擎（测试用）
 *
 * 允许测试替换引擎实现，避免真实文件 I/O 与 API 调用。
 * 必须在测试 beforeEach 中调用，测试 afterEach 中调用 _resetSearchEngine。
 *
 * @param engine 自定义引擎实例；传 null 等同于 _resetSearchEngine
 * @param store 可选，同时暴露 EmbeddingStore 供测试断言
 */
export function _setSearchEngine(
  engine: VectorSearchEngine | null,
  store?: EmbeddingStore,
): void {
  _searchEngine = engine;
  _testStore = store ?? null;
}

/** 测试用 EmbeddingStore 引用（_setSearchEngine 时设置） */
let _testStore: EmbeddingStore | null = null;

/** 获取测试注入的 EmbeddingStore（无注入时返回 null） */
export function _getTestEmbeddingStore(): EmbeddingStore | null {
  return _testStore;
}

/** 重置引擎单例（测试用，恢复默认懒初始化行为） */
export function _resetSearchEngine(): void {
  _searchEngine = null;
  _testStore = null;
}

// ============= Embedding 缓存预热（预训练数据-4） =============

/**
 * 预热 Embedding 缓存
 *
 * 为所有归档记忆条目预生成 embedding，避免首次 RAG 检索时因懒生成导致延迟。
 *
 * 触发条件（用户主动调用）：
 * - 安装/启用本地 embedding 模型后
 * - 配置 API embedding capability 后
 * - 注入新的种子记忆后
 *
 * 行为：
 * - 遍历可用的向量策略（API 优先于本地），找到首个可用策略
 * - 使用通用 query 触发 search，复用策略内部的 backfill 逻辑
 * - 通过 onProgress 回调报告进度（phase="backfill"）
 * - 已有 embedding 的条目会被跳过（由 EmbeddingStore 判断）
 *
 * @param onProgress 可选进度回调
 * @returns 预热结果统计
 */
export async function prewarmEmbeddings(
  onProgress?: (progress: {
    phase: "backfill" | "search";
    current: number;
    total: number;
    strategy?: string;
    message?: string;
  }) => void,
): Promise<{
  success: boolean;
  total: number;
  strategy?: string;
  message?: string;
}> {
  try {
    const entries = await getAllArchivalMemory();
    if (entries.length === 0) {
      return { success: true, total: 0, message: "no entries" };
    }

    const engine = getSearchEngine();
    const result = await engine.prewarmEmbeddings(entries, onProgress);

    return {
      success: result.success,
      total: entries.length,
      strategy: result.strategy,
      message: result.message,
    };
  } catch (e) {
    return {
      success: false,
      total: 0,
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

// ============= 测试辅助 =============

/** 测试用：重置所有记忆 */
export async function _resetAllMemory(): Promise<void> {
  await saveCoreMemory({ ...EMPTY_CORE_MEMORY });
  await saveArchivalMemory([]);
}
