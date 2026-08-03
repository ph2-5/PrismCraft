/**
 * 归档记忆操作（Archival Memory Operations）
 *
 * 从 memory-service.ts 拆分而来，包含归档记忆（按需检索）相关：
 * - getAllArchivalMemory / saveArchivalMemory：文件读写
 * - addArchivalMemory / deleteArchivalMemory：增删（串行化锁保护）
 * - searchArchivalMemory：检索（委托 VectorSearchEngine 三策略链）
 * - getArchivalMemoryCount：条目数
 *
 * 设计要点：
 * - 存储：缓存目录 agent/memory/archival.json
 * - 容量上限：MAX_ARCHIVAL_ENTRIES 条，超出按时间淘汰
 * - 检索委托 VectorSearchEngine（API > 本地模型 > 关键词），
 *   引擎单例状态由 memory-embeddings.ts 管理（本文件通过 getSearchEngine 访问同一闭包）
 * - 写操作通过 enqueueArchivalWrite 串行化，防止并发覆盖（P1-2 修复）
 */

import { getCacheDirectory, readFile, writeFile } from "@/shared/file-http";
// Memory 领域类型从本模块 domain/types 导入（阶段2-d 迁移）
import type { ArchivalMemoryEntry } from "../domain/types";
import type { ProgressCallback } from "@/modules/vector-search";
import { enqueueArchivalWrite, MAX_ARCHIVAL_ENTRIES } from "./memory-shared";
// 搜索引擎单例由 memory-embeddings.ts 管理（模块级状态保持同一闭包）
import { getSearchEngine } from "./memory-embeddings";

// ============= 常量 =============

/** 归档记忆文件目录（相对缓存目录） */
const MEMORY_DIR = "agent/memory";

/** 归档记忆文件名 */
const ARCHIVAL_FILE = "archival.json";

// ============= 归档记忆操作 =============

/** 获取归档记忆文件路径 */
async function getArchivalFilePath(): Promise<string | null> {
  const result = await getCacheDirectory();
  if (!result.success || !result.path) return null;
  return `${result.path}/${MEMORY_DIR}/${ARCHIVAL_FILE}`;
}

/** 读取所有归档记忆 */
export async function getAllArchivalMemory(): Promise<ArchivalMemoryEntry[]> {
  const filePath = await getArchivalFilePath();
  if (!filePath) return [];

  try {
    const result = await readFile(filePath);
    if (!result?.success || !result.data) return [];
    const text = new TextDecoder().decode(result.data);
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e) => e && typeof e.id === "string" && typeof e.content === "string",
    ) as ArchivalMemoryEntry[];
  } catch {
    return [];
  }
}

/**
 * 保存归档记忆（全量覆盖）
 *
 * 供本文件内部及 memory-seed（ensureSeedMemory）、memory-embeddings（_resetAllMemory）使用。
 */
export async function saveArchivalMemory(
  entries: ArchivalMemoryEntry[],
): Promise<boolean> {
  const filePath = await getArchivalFilePath();
  if (!filePath) return false;

  try {
    const jsonStr = JSON.stringify(entries, null, 2);
    const result = await writeFile(filePath, jsonStr);
    return result.success;
  } catch {
    return false;
  }
}

/** 追加归档记忆条目 */
export async function addArchivalMemory(
  entry: Omit<ArchivalMemoryEntry, "id" | "createdAt"> & { id?: string; createdAt?: number },
): Promise<boolean> {
  // P1-2 修复：串行化整个 read-modify-write 流程
  const result = enqueueArchivalWrite(async () => {
    const all = await getAllArchivalMemory();
    const newEntry: ArchivalMemoryEntry = {
      id: entry.id ?? `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: entry.type,
      content: entry.content,
      sessionId: entry.sessionId,
      createdAt: entry.createdAt ?? Date.now(),
      tags: entry.tags,
    };

    all.push(newEntry);

    // 容量限制：按时间排序后保留最新的 N 条
    if (all.length > MAX_ARCHIVAL_ENTRIES) {
      all.sort((a, b) => a.createdAt - b.createdAt);
      all.splice(0, all.length - MAX_ARCHIVAL_ENTRIES);
    }

    return saveArchivalMemory(all);
  }).catch(() => false);

  return result;
}

/**
 * 检索归档记忆（委托 VectorSearchEngine 三策略链）
 *
 * 策略链顺序：API 向量 > 本地模型向量 > 关键词匹配（兜底）
 * - API/本地策略失败时自动退回关键词匹配
 * - Embedding 独立存储在 embeddings.json（与 archival.json 解耦）
 * - 维度版本检测：切换模型时自动清空旧 embedding（S2）
 *
 * @param query 检索关键词或自然语言查询；空 query 返回最近 N 条
 * @param limit 返回条数上限，默认 5
 * @param onProgress 可选进度回调（backfill 大批量 embedding 时触发，UI 显示进度条）
 *                   - phase="backfill"：正在生成缺失 embedding
 *                   - phase="search"：正在计算相似度
 *                   - strategy：当前生效的策略名称（"api" / "local" / "keyword"）
 */
export async function searchArchivalMemory(
  query: string,
  limit: number = 5,
  onProgress?: ProgressCallback,
): Promise<ArchivalMemoryEntry[]> {
  if (!query || !query.trim()) {
    // 空 query 返回最近 N 条
    const all = await getAllArchivalMemory();
    return all.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
  }

  const all = await getAllArchivalMemory();
  if (all.length === 0) return [];

  return getSearchEngine().search(query, all, limit, onProgress);
}

/** 删除归档记忆条目 */
export async function deleteArchivalMemory(id: string): Promise<boolean> {
  // P1-2 修复：同样通过串行化锁防止并发覆盖（deleteArchivalMemory 保持原行为：无超时保护）
  const result = enqueueArchivalWrite(
    async () => {
      const all = await getAllArchivalMemory();
      const filtered = all.filter((e) => e.id !== id);
      if (filtered.length === all.length) return true;
      return saveArchivalMemory(filtered);
    },
    { timeout: false },
  ).catch(() => false);

  return result;
}

/** 获取归档记忆条目数 */
export async function getArchivalMemoryCount(): Promise<number> {
  const all = await getAllArchivalMemory();
  return all.length;
}
