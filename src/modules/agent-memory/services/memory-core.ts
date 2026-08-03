/**
 * 核心记忆操作（Core Memory Operations）
 *
 * 从 memory-service.ts 拆分而来，包含核心记忆（常驻 system prompt）相关：
 * - getCoreMemory / saveCoreMemory：读取与保存
 * - updatePreference / saveFact / removeFact / removePreference / clearCoreMemory：增删改
 * - buildCoreMemoryPrompt：构建 prompt 片段（注入 system prompt）
 * - shouldExtract / getCoreMemorySize：辅助函数
 *
 * 设计要点：
 * - 存储：getConfig("agent.coreMemory") / setConfig("agent.coreMemory")
 * - 大小限制：facts 最多 MAX_FACTS_COUNT 条（超限时淘汰最旧的 fact）
 * - updatePreference / removeFact 通过 enqueueArchivalWrite 串行化 read-modify-write，
 *   防止并发覆盖（与归档记忆共用同一条写串行化链）
 */

import { getConfig, setConfig } from "@/shared/file-http";
// Memory 领域类型从本模块 domain/types 导入（阶段2-d 迁移）
import type { CoreMemory, MemoryFact } from "../domain/types";
// AgentMessage 仍归属于 @/modules/agent（Agent 核心类型，类型级依赖，编译时擦除）
import type { AgentMessage } from "@/modules/agent";
import { errorLogger } from "@/shared/error-logger";
import { enqueueArchivalWrite } from "./memory-shared";

// ============= 常量 =============

/** 核心记忆配置键 */
const CORE_MEMORY_KEY = "agent.coreMemory";

/** 核心记忆 facts 最大条数 */
const MAX_FACTS_COUNT = 20;

/** 触发自动抽取的消息阈值（用户消息数） */
const EXTRACTION_THRESHOLD = 5;

/** 空的核心记忆（_resetAllMemory 等测试辅助函数也会使用） */
export const EMPTY_CORE_MEMORY: CoreMemory = {
  preferences: {},
  facts: [],
};

// ============= 核心记忆操作 =============

/** 读取核心记忆 */
export async function getCoreMemory(): Promise<CoreMemory> {
  try {
    const raw = await getConfig(CORE_MEMORY_KEY);
    if (!raw || typeof raw !== "object") {
      return { ...EMPTY_CORE_MEMORY };
    }
    const data = raw as Record<string, unknown>;
    const preferences =
      data.preferences && typeof data.preferences === "object"
        ? (data.preferences as CoreMemory["preferences"])
        : {};
    const facts = Array.isArray(data.facts)
      ? (data.facts as MemoryFact[]).filter(
          (f) => f && typeof f.key === "string" && typeof f.value === "string",
        )
      : [];
    return { preferences, facts };
  } catch (err) {
    errorLogger.warn("[MemoryService] 读取核心记忆失败", err);
    return { ...EMPTY_CORE_MEMORY };
  }
}

/** 保存核心记忆 */
export async function saveCoreMemory(memory: CoreMemory): Promise<boolean> {
  try {
    await setConfig(CORE_MEMORY_KEY, memory);
    return true;
  } catch {
    return false;
  }
}

/** 更新单个偏好（覆盖同 key） */
export async function updatePreference(
  key: string,
  value: string | number | boolean,
): Promise<boolean> {
  if (!key || typeof key !== "string") return false;
  // 串行化 read-modify-write，防止并发覆盖（复用共享写串行化锁）
  const result = enqueueArchivalWrite(async () => {
    const memory = await getCoreMemory();
    memory.preferences[key] = value;
    return saveCoreMemory(memory);
  }).catch(() => false);

  return result;
}

/** 保存事实（同 key 覆盖） */
export async function saveFact(key: string, value: string): Promise<boolean> {
  if (!key || !value) return false;
  const memory = await getCoreMemory();
  const now = Date.now();
  const existingIdx = memory.facts.findIndex((f) => f.key === key);
  if (existingIdx >= 0) {
    memory.facts[existingIdx] = { key, value, updatedAt: now };
  } else {
    memory.facts.push({ key, value, updatedAt: now });
    // 超限时淘汰最旧的
    if (memory.facts.length > MAX_FACTS_COUNT) {
      memory.facts.sort((a, b) => a.updatedAt - b.updatedAt);
      memory.facts = memory.facts.slice(memory.facts.length - MAX_FACTS_COUNT);
    }
  }
  return saveCoreMemory(memory);
}

/** 删除事实 */
export async function removeFact(key: string): Promise<boolean> {
  // 串行化 read-modify-write，防止并发覆盖（复用共享写串行化锁）
  const result = enqueueArchivalWrite(async () => {
    const memory = await getCoreMemory();
    const before = memory.facts.length;
    memory.facts = memory.facts.filter((f) => f.key !== key);
    if (memory.facts.length === before) return true; // 不存在也算成功
    return saveCoreMemory(memory);
  }).catch(() => false);

  return result;
}

/** 删除偏好 */
export async function removePreference(key: string): Promise<boolean> {
  const memory = await getCoreMemory();
  if (!(key in memory.preferences)) return true;
  delete memory.preferences[key];
  return saveCoreMemory(memory);
}

/** 清空核心记忆 */
export async function clearCoreMemory(): Promise<boolean> {
  return saveCoreMemory({ ...EMPTY_CORE_MEMORY });
}

// ============= Prompt 构建 =============

/**
 * 构建核心记忆的 prompt 片段（注入 system prompt）
 *
 * 格式：
 * ## 用户偏好
 * - 偏好风格：赛博朋克
 * - 语言：zh-CN
 *
 * ## 项目事实
 * - source_novel: 三体
 * - target_duration: 30s
 */
export async function buildCoreMemoryPrompt(): Promise<string> {
  const memory = await getCoreMemory();

  const prefEntries = Object.entries(memory.preferences);
  const factEntries = memory.facts;

  if (prefEntries.length === 0 && factEntries.length === 0) {
    return ""; // 无记忆时不输出
  }

  const lines: string[] = ["## 记忆"];

  if (prefEntries.length > 0) {
    lines.push("### 用户偏好");
    for (const [k, v] of prefEntries) {
      lines.push(`- ${k}: ${v}`);
    }
  }

  if (factEntries.length > 0) {
    lines.push("### 项目事实");
    for (const f of factEntries) {
      lines.push(`- ${f.key}: ${f.value}`);
    }
  }

  return lines.join("\n");
}

// ============= 辅助函数 =============

/** 判断是否应该触发自动抽取（按用户消息数） */
export function shouldExtract(messages: AgentMessage[]): boolean {
  const userMsgCount = messages.filter((m) => m.role === "user").length;
  return userMsgCount >= EXTRACTION_THRESHOLD;
}

/** 获取核心记忆大小（序列化后字符数） */
export async function getCoreMemorySize(): Promise<number> {
  const memory = await getCoreMemory();
  try {
    return JSON.stringify(memory).length;
  } catch {
    return 0;
  }
}
