/**
 * 工具调用 few-shot 缓存（预训练数据-2）
 *
 * 目标：从历史成功调用中抽取 few-shot 示例，在后续相似查询时注入到 system prompt，
 * 引导 LLM 正确调用工具（减少参数幻觉、提升调用准确率）。
 *
 * 设计：
 * - 缓存文件：{cacheDir}/agent/fewshot-cache.json
 * - 按工具名分组，每个工具保留最近 MAX_ENTRIES_PER_TOOL 条成功调用（LRU 淘汰）
 * - 仅缓存 success=true 的调用（失败调用无引导价值）
 * - args/result 做摘要化处理（避免缓存膨胀）
 * - 检索：根据用户查询做关键词匹配，返回相关工具的 few-shot
 *
 * 持久化：通过 @/shared/file-http（遵守架构规则，不直接调用 electronAPI）
 */

import { getCacheDirectory, readFile, writeFile } from "@/shared/file-http";
import { errorLogger } from "@/shared/error-logger";
import {
  getRelevantBuiltinFewShots,
  BUILTIN_FEWSHOT_EXAMPLES,
} from "./builtin-fewshot-examples";

/** 单条 few-shot 缓存条目 */
export interface FewShotEntry {
  /** 工具名 */
  toolName: string;
  /** 用户查询摘要（截断到 100 字符） */
  userQuery: string;
  /** 工具参数摘要（JSON 截断到 200 字符） */
  argsSummary: string;
  /** 工具结果摘要（JSON 截断到 300 字符） */
  resultSummary: string;
  /** 记录时间戳（ms） */
  timestamp: number;
}

/** 缓存文件结构 */
interface FewShotCacheData {
  version: 1;
  /** 按工具名分组的条目 */
  entries: Record<string, FewShotEntry[]>;
}

/** 每个工具保留的最大条目数（LRU 淘汰） */
const MAX_ENTRIES_PER_TOOL = 3;

/** 缓存文件相对路径（相对于 cacheDir） */
const FEWSHOT_CACHE_REL_PATH = "agent/fewshot-cache.json";

// ── 内部状态 ──

let cachedFilePath: string | null = null;
let cacheData: FewShotCacheData | null = null;
let loadingPromise: Promise<FewShotCacheData | null> | null = null;

// ── 摘要化工具 ──

/** 截断字符串到指定长度，超长则追加省略号 */
function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "…";
}

/** 将参数对象摘要化（JSON 截断） */
function summarizeArgs(args: Record<string, unknown>): string {
  try {
    const json = JSON.stringify(args);
    return truncate(json, 200);
  } catch {
    return "(unserializable)";
  }
}

/** 将结果摘要化（仅保留 success + data/error 的精简 JSON） */
function summarizeResult(result: { success: boolean; data?: unknown; error?: string }): string {
  try {
    if (!result.success) {
      return truncate(`error: ${result.error ?? "unknown"}`, 300);
    }
    // 成功结果：序列化 data 但截断
    const dataStr = JSON.stringify(result.data ?? null);
    return truncate(dataStr, 300);
  } catch {
    return "(unserializable)";
  }
}

// ── 持久化 ──

/** 获取缓存文件绝对路径（带缓存） */
async function getFilePath(): Promise<string> {
  if (cachedFilePath) return cachedFilePath;
  const result = await getCacheDirectory();
  if (!result.success || !result.path) {
    throw new Error("无法获取缓存目录");
  }
  // 规范化路径分隔符
  const base = result.path.replace(/[\\\/]+$/, "");
  cachedFilePath = `${base}/${FEWSHOT_CACHE_REL_PATH}`;
  return cachedFilePath;
}

/** 从磁盘加载缓存（带并发锁） */
async function loadCache(): Promise<FewShotCacheData | null> {
  if (cacheData) return cacheData;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    try {
      const filePath = await getFilePath();
      const result = await readFile(filePath);
      if (!result || !result.success || !result.data) {
        // 文件不存在或读取失败，返回空缓存
        cacheData = { version: 1, entries: {} };
        return cacheData;
      }
      const text = new TextDecoder().decode(result.data);
      const parsed = JSON.parse(text) as FewShotCacheData;
      if (parsed.version !== 1 || !parsed.entries) {
        cacheData = { version: 1, entries: {} };
      } else {
        cacheData = parsed;
      }
      return cacheData;
    } catch (e) {
      errorLogger.debug("[FewShotCache] 加载缓存失败，使用空缓存", e);
      cacheData = { version: 1, entries: {} };
      return cacheData;
    } finally {
      loadingPromise = null;
    }
  })();

  return loadingPromise;
}

/** 持久化缓存到磁盘（best-effort，失败静默） */
async function saveCache(): Promise<void> {
  if (!cacheData) return;
  try {
    const filePath = await getFilePath();
    const text = JSON.stringify(cacheData, null, 2);
    const encoded = new TextEncoder().encode(text);
    const result = await writeFile(filePath, encoded);
    if (!result.success) {
      errorLogger.debug("[FewShotCache] 保存缓存失败", result.error);
    }
  } catch (e) {
    errorLogger.debug("[FewShotCache] 保存缓存异常", e);
  }
}

// ── 公开 API ──

/**
 * 记录一条 few-shot（仅 success=true 的调用才记录）
 *
 * @param toolName 工具名
 * @param args 工具参数
 * @param result 工具结果
 * @param userQuery 触发此调用的用户查询
 */
export async function recordFewShot(
  toolName: string,
  args: Record<string, unknown>,
  result: { success: boolean; data?: unknown; error?: string },
  userQuery: string,
): Promise<void> {
  if (!result.success) return; // 仅记录成功调用

  try {
    const cache = await loadCache();
    if (!cache) return;

    const entry: FewShotEntry = {
      toolName,
      userQuery: truncate(userQuery, 100),
      argsSummary: summarizeArgs(args),
      resultSummary: summarizeResult(result),
      timestamp: Date.now(),
    };

    if (!cache.entries[toolName]) {
      cache.entries[toolName] = [];
    }
    const list = cache.entries[toolName];

    // 去重：如果同一工具已有相同 argsSummary 的条目，先移除旧的
    const dupIdx = list.findIndex((e) => e.argsSummary === entry.argsSummary);
    if (dupIdx >= 0) {
      list.splice(dupIdx, 1);
    }

    // 追加到末尾（最新的在后）
    list.push(entry);

    // LRU 淘汰：保留最后 MAX_ENTRIES_PER_TOOL 条
    if (list.length > MAX_ENTRIES_PER_TOOL) {
      list.splice(0, list.length - MAX_ENTRIES_PER_TOOL);
    }

    await saveCache();
  } catch (e) {
    errorLogger.debug("[FewShotCache] 记录 few-shot 失败", e);
  }
}

/**
 * 获取指定工具的 few-shot 条目
 *
 * @param toolName 工具名
 * @param limit 返回条数上限（默认 MAX_ENTRIES_PER_TOOL）
 */
export async function getFewShots(toolName: string, limit = MAX_ENTRIES_PER_TOOL): Promise<FewShotEntry[]> {
  const cache = await loadCache();
  if (!cache) return [];
  const list = cache.entries[toolName] ?? [];
  // 返回最新的 limit 条
  return list.slice(-limit);
}

/**
 * 根据用户查询检索相关 few-shot（关键词匹配）
 *
 * 策略：
 * 1. 合并内置示例 + 运行时缓存示例（运行时优先，因其更贴近用户实际使用场景）
 * 2. 提取用户查询中的关键词
 * 3. 遍历所有合并后的条目，计算 userQuery 字段的关键词匹配度
 * 4. 按匹配度排序，返回前 N 条
 *
 * @param userQuery 用户查询
 * @param limit 返回条数上限（默认 5）
 */
export async function getRelevantFewShots(userQuery: string, limit = 5): Promise<FewShotEntry[]> {
  const cache = await loadCache();

  // 合并内置示例 + 运行时缓存
  // 内置示例最多取 limit 条（保证至少有一些示例可参考）
  // 运行时示例全部参与排序（更贴近用户场景，优先级更高）
  const builtinShots = getRelevantBuiltinFewShots(userQuery, limit);
  const runtimeShots: FewShotEntry[] = [];
  if (cache) {
    for (const list of Object.values(cache.entries)) {
      runtimeShots.push(...list);
    }
  }
  const all = [...runtimeShots, ...builtinShots];

  if (all.length === 0) return [];

  // 提取查询关键词（中文按字，英文按词，长度 ≥ 2）
  const keywords = extractKeywords(userQuery);
  if (keywords.length === 0) {
    // 无关键词时返回最近使用的 few-shot（按 timestamp 排序，运行时优先于内置）
    all.sort((a, b) => b.timestamp - a.timestamp);
    return all.slice(0, limit);
  }

  // 计算每条 few-shot 的匹配度
  const scored: Array<{ entry: FewShotEntry; score: number }> = [];
  for (const entry of all) {
    const score = scoreMatch(entry.userQuery + " " + entry.argsSummary, keywords);
    if (score > 0) {
      scored.push({ entry, score });
    }
  }

  // 按匹配度降序排序，相同分数按时间倒序（运行时示例 timestamp > 0，内置 = 0，因此运行时优先）
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.entry.timestamp - a.entry.timestamp;
  });

  return scored.slice(0, limit).map((s) => s.entry);
}

/**
 * 构建 few-shot 提示文本（注入到 system prompt）
 *
 * 格式：
 * ```
 * ## 工具调用示例（从历史成功调用中提取）
 *
 * ### 示例 1：list_characters
 * 用户意图：列出所有角色
 * 参数：{"limit": 20}
 * 结果：{"items": [...], "total": 5}
 *
 * ### 示例 2：generate_character_image
 * ...
 * ```
 */
export async function buildFewShotPrompt(userQuery: string, limit = 5): Promise<string> {
  const shots = await getRelevantFewShots(userQuery, limit);
  if (shots.length === 0) return "";

  const lines: string[] = ["## 工具调用示例（从历史成功调用中提取，供参考）"];
  lines.push("");

  shots.forEach((shot, idx) => {
    lines.push(`### 示例 ${idx + 1}：${shot.toolName}`);
    lines.push(`用户意图：${shot.userQuery}`);
    lines.push(`参数：${shot.argsSummary}`);
    lines.push(`结果：${shot.resultSummary}`);
    lines.push("");
  });

  return lines.join("\n");
}

/**
 * 清空所有 few-shot 缓存
 */
export async function clearFewShotCache(): Promise<void> {
  cacheData = { version: 1, entries: {} };
  await saveCache();
}

/**
 * 获取缓存统计信息（用于 UI 展示）
 *
 * 包含运行时缓存 + 内置示例的统计
 */
export async function getFewShotStats(): Promise<{
  totalEntries: number;
  toolCount: number;
  tools: Array<{ toolName: string; count: number; lastUsed: number }>;
  builtinEntries: number;
}> {
  const cache = await loadCache();
  // 内置示例统计
  const builtinStats = getBuiltinFewShotStatsInline();

  if (!cache) {
    return {
      totalEntries: 0,
      toolCount: 0,
      tools: [],
      builtinEntries: builtinStats.totalEntries,
    };
  }

  const tools: Array<{ toolName: string; count: number; lastUsed: number }> = [];
  let total = 0;
  for (const [toolName, list] of Object.entries(cache.entries)) {
    if (list.length === 0) continue;
    tools.push({
      toolName,
      count: list.length,
      lastUsed: list[list.length - 1]!.timestamp,
    });
    total += list.length;
  }
  tools.sort((a, b) => b.lastUsed - a.lastUsed);

  return {
    totalEntries: total,
    toolCount: tools.length,
    tools,
    builtinEntries: builtinStats.totalEntries,
  };
}

/** 内联导入内置示例统计（避免循环依赖） */
function getBuiltinFewShotStatsInline(): { totalEntries: number } {
  return { totalEntries: BUILTIN_FEWSHOT_EXAMPLES.length };
}

// ── 辅助函数 ──

/** 提取关键词（简单的分词，中文按字，英文按词） */
function extractKeywords(text: string): string[] {
  if (!text) return [];
  const keywords = new Set<string>();

  // 英文单词（长度 ≥ 2）
  const englishWords = text.match(/[a-zA-Z]{2,}/g);
  if (englishWords) {
    for (const w of englishWords) {
      keywords.add(w.toLowerCase());
    }
  }

  // 中文连续字符（长度 ≥ 2）
  const chineseSegments = text.match(/[\u4e00-\u9fa5]{2,}/g);
  if (chineseSegments) {
    for (const seg of chineseSegments) {
      keywords.add(seg);
    }
  }

  return Array.from(keywords);
}

/** 计算文本与关键词的匹配度（命中数） */
function scoreMatch(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  let score = 0;
  for (const kw of keywords) {
    if (lower.includes(kw.toLowerCase())) {
      score += 1;
    }
  }
  return score;
}
