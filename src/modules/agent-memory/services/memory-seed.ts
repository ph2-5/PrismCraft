/**
 * 种子记忆（Seed Memory）
 *
 * 从 memory-service.ts 拆分而来，包含种子记忆注入相关：
 * - ensureSeedMemory：首次启动时注入预置通用动画创作知识
 * - getSeedMemoryStats：统计信息（UI 展示）
 * - resetSeedMemoryFlag：重置注入标记（测试用 + 用户手动重新注入）
 *
 * 设计要点：
 * - 静态数据 SEED_MEMORY_ENTRIES 在 memory-service-seed-data.ts
 * - 注入标记 SEED_MEMORY_FLAG_KEY 独立于 archival.json，防止用户清空后被重复注入
 * - 通过 seed_ 前缀 id 幂等检查，已存在的种子不会被重复添加
 * - 种子记忆与用户记忆共存，遵循统一的容量限制（MAX_ARCHIVAL_ENTRIES 条）
 */

import { getConfig, setConfig } from "@/shared/file-http";
import { SEED_MEMORY_ENTRIES } from "./memory-service-seed-data";
import { getAllArchivalMemory, saveArchivalMemory } from "./memory-archival";
import { MAX_ARCHIVAL_ENTRIES } from "./memory-shared";

// ============= 常量 =============

/** 种子记忆注入标记配置键（独立于 archival.json，防止用户清空后被重复注入） */
const SEED_MEMORY_FLAG_KEY = "agent.seedMemoryInjected";

// ============= 种子记忆操作 =============

/**
 * 检查种子记忆是否已注入
 *
 * 通过 config 标记判断，独立于 archival.json 文件存在性。
 * 这样即使用户清空了归档记忆，也不会被重复注入。
 */
async function isSeedMemoryInjected(): Promise<boolean> {
  try {
    const flag = await getConfig(SEED_MEMORY_FLAG_KEY);
    return flag === true;
  } catch {
    return false;
  }
}

/** 标记种子记忆已注入 */
async function markSeedMemoryInjected(): Promise<void> {
  try {
    await setConfig(SEED_MEMORY_FLAG_KEY, true);
  } catch {
    // 标记失败不阻断，下次启动可能重复注入（幂等检查会跳过已存在的种子）
  }
}

/**
 * 确保种子记忆已注入（首次启动时调用）
 *
 * 行为：
 * - 若已注入（config 标记为 true）→ 直接返回，跳过
 * - 若未注入 → 检查 archival.json 是否已有种子条目（防止标记丢失导致重复）
 * - 注入缺失的种子条目，最后设置标记
 *
 * 幂等性：通过 seed_ 前缀 id 检查，已存在的种子不会被重复添加。
 */
export async function ensureSeedMemory(): Promise<void> {
  try {
    // 已注入标记存在 → 跳过
    if (await isSeedMemoryInjected()) {
      return;
    }

    // 获取现有归档记忆（检查是否已有种子条目，防止标记丢失导致重复注入）
    const existing = await getAllArchivalMemory();
    const existingSeedIds = new Set(
      existing
        .map((e) => e.id)
        .filter((id): id is string => typeof id === "string" && id.startsWith("seed_")),
    );

    // 注入缺失的种子条目
    const now = Date.now();
    let injectedCount = 0;
    for (const entry of SEED_MEMORY_ENTRIES) {
      const seedId = `seed_${entry.localId}`;
      if (existingSeedIds.has(seedId)) continue;

      existing.push({
        id: seedId,
        type: entry.type,
        content: entry.content,
        createdAt: now + injectedCount, // 错开时间戳便于排序
        tags: entry.tags,
      });
      injectedCount++;
    }

    if (injectedCount > 0) {
      // 容量限制：种子记忆 + 用户记忆总数不超过上限
      if (existing.length > MAX_ARCHIVAL_ENTRIES) {
        existing.sort((a, b) => a.createdAt - b.createdAt);
        existing.splice(0, existing.length - MAX_ARCHIVAL_ENTRIES);
      }
      await saveArchivalMemory(existing);
    }

    // 标记已注入（无论本次是否实际注入，只要检查过就标记）
    await markSeedMemoryInjected();
  } catch {
    // 种子注入失败不阻断主流程，下次启动会重试
  }
}

/** 获取种子记忆统计信息（用于 UI 展示） */
export async function getSeedMemoryStats(): Promise<{
  total: number;
  injected: number;
}> {
  try {
    const existing = await getAllArchivalMemory();
    const injected = existing.filter(
      (e) => typeof e.id === "string" && e.id.startsWith("seed_"),
    ).length;
    return {
      total: SEED_MEMORY_ENTRIES.length,
      injected,
    };
  } catch {
    return { total: SEED_MEMORY_ENTRIES.length, injected: 0 };
  }
}

/**
 * 重置种子记忆注入标记（测试用 + 用户手动重新注入）
 *
 * 注意：此函数不会删除已注入的种子条目，仅清除标记。
 * 下次调用 ensureSeedMemory 时会检查并补充缺失的种子。
 */
export async function resetSeedMemoryFlag(): Promise<void> {
  try {
    await setConfig(SEED_MEMORY_FLAG_KEY, false);
  } catch {
    // 静默失败
  }
}
