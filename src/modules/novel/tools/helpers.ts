/**
 * Novel Tools — 共享辅助函数
 *
 * 封装 AI JSON 推理逻辑，避免每个工具重复 try/catch + JSON 解析代码。
 * 复用 @/shared-logic/json 的 extractJsonArray / extractJsonObject（零依赖纯函数）。
 */

import { container } from "@/infrastructure/di";
import { extractJsonArray, extractJsonObject } from "@/shared-logic/json";

/**
 * 调用 textProvider 生成文本，从中提取 JSON 数组并解析。
 *
 * @param prompt AI 提示词
 * @param maxTokens 最大 token 数（默认 4096）
 * @returns 成功返回 unknown[]，失败返回 null
 */
export async function generateJsonArrayWithAI(
  prompt: string,
  maxTokens = 4096,
): Promise<unknown[] | null> {
  const result = await container.textProvider.generateText(prompt, {
    maxTokens,
    temperature: 0.7,
  });
  if (!result.success || !result.data) return null;
  const jsonStr = extractJsonArray(result.data.text);
  if (!jsonStr) return null;
  try {
    const parsed = JSON.parse(jsonStr);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * 调用 textProvider 生成文本，从中提取 JSON 对象并解析。
 *
 * @param prompt AI 提示词
 * @param maxTokens 最大 token 数（默认 2048）
 * @returns 成功返回 Record<string, unknown>，失败返回 null
 */
export async function generateJsonObjectWithAI(
  prompt: string,
  maxTokens = 2048,
): Promise<Record<string, unknown> | null> {
  const result = await container.textProvider.generateText(prompt, {
    maxTokens,
    temperature: 0.7,
  });
  if (!result.success || !result.data) return null;
  const jsonStr = extractJsonObject(result.data.text);
  if (!jsonStr) return null;
  try {
    const parsed = JSON.parse(jsonStr);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** 安全字符串提取 */
export function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

/** 安全数字提取 */
export function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** 安全字符串数组提取 */
export function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/**
 * Levenshtein 编辑距离（名称相似度匹配用）。
 *
 * 未来可提取到 @/shared-logic/string（目前 agent-tools-asset/asset-crud-tools.ts 也有同名私有实现）。
 * Task 2A.2 范围内先在 novel 模块本地实现，避免跨模块依赖。
 *
 * P1-11 修复：增加长度上限保护。Levenshtein 算法复杂度为 O(len1 * len2)，
 * 超长字符串（如 AI 返回 10k+ 字符）会导致事件循环阻塞。当任一输入超过
 * MAX_LEVENSHTEIN_LEN 时，降级为基于长度差异的快速估算，避免 DoS。
 */
const MAX_LEVENSHTEIN_LEN = 256;

export function levenshteinDistance(s1: string, s2: string): number {
  const len1 = s1.length;
  const len2 = s2.length;
  if (len1 === 0) return len2;
  if (len2 === 0) return len1;

  // P1-11: 超长输入降级为长度差异（避免 O(n*m) 阻塞事件循环）
  if (len1 > MAX_LEVENSHTEIN_LEN || len2 > MAX_LEVENSHTEIN_LEN) {
    return Math.abs(len1 - len2);
  }

  let prev = new Array<number>(len2 + 1).fill(0);
  let curr = new Array<number>(len2 + 1).fill(0);
  for (let j = 0; j <= len2; j++) prev[j] = j;

  for (let i = 1; i <= len1; i++) {
    curr[0] = i;
    for (let j = 1; j <= len2; j++) {
      const cost = s1.charCodeAt(i - 1) === s2.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        (prev[j] ?? 0) + 1,        // 删除
        (curr[j - 1] ?? 0) + 1,    // 插入
        (prev[j - 1] ?? 0) + cost, // 替换
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[len2] ?? 0;
}

/**
 * 名称相似度匹配（0-1，1 表示完全相同）。
 * 基于 Levenshtein 距离归一化：1 - distance / max(len1, len2)
 *
 * P1-11 修复：两空字符串不再返回 1.0（"完全匹配"），改为返回 0（无信息，不匹配）。
 * 原行为会导致两个空名称的实体被标记为 matched（置信度 1.0），这是错误的——
 * 空名称意味着"没有名称信息"，不应被视为"名称相同"。
 */
export function nameSimilarity(s1: string, s2: string): number {
  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 0;
  return 1 - levenshteinDistance(s1, s2) / maxLen;
}

/** 三级匹配阈值（精确 → 模糊 → 向量） */
export const MATCH_THRESHOLDS = {
  exact: 1.0,
  fuzzy: 0.8,    // 模糊匹配阈值（>=0.8 视为 matched）
  conflict: 0.6, // 冲突阈值（0.6-0.8 视为 conflict，需用户确认）
} as const;
