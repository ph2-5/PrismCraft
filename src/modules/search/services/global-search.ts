/**
 * 全局搜索服务（Global Search Service）
 *
 * 职责：
 * - 统一搜索入口：跨角色 / 场景 / 故事 / 素材四类资源
 * - 支持模糊匹配（名称 + 描述 + 风格 + 标签）
 * - 支持类型筛选（assetType 参数）
 * - 支持标签过滤（tag 参数）
 * - 限制返回数量，避免过载
 *
 * 架构：
 *   SearchDialog / SidebarWithSearch / Agent search_assets 工具
 *     → globalSearch（本文件）
 *       → characterService.getAll() / sceneService.getAll()
 *         storyService.getAll() / mediaAssetService.getAll()
 *
 * 设计要点：
 * - 静态导入会触发循环依赖风险，因此使用动态 import
 * - 各 service 失败时返回空数组而非抛异常，保证部分可用
 * - 搜索结果按相关度（名称匹配 > 描述匹配 > 标签匹配）排序
 * - 单次搜索总结果上限 50 条（每类最多 20 条）
 */

import type { SearchResult } from "@/domain/schemas";

// ============= 类型定义 =============

export type SearchableType = "character" | "scene" | "story" | "media-asset";

export interface GlobalSearchOptions {
  /** 类型筛选：未指定时搜索全部类型 */
  assetType?: SearchableType | "all";
  /** 标签过滤：仅返回包含此标签的结果 */
  tag?: string;
  /** 每类资产返回上限，默认 20 */
  limitPerType?: number;
  /** 总结果上限，默认 50 */
  totalLimit?: number;
}

export interface GlobalSearchResult {
  results: SearchResult[];
  total: number;
  /** 各类匹配数量（用于 UI 显示分类计数） */
  counts: Record<SearchableType, number>;
}

// ============= 内部辅助函数 =============

/** 大小写不敏感的子串匹配 */
function matches(value: string | undefined | null, term: string): boolean {
  if (!value) return false;
  return value.toLowerCase().includes(term.toLowerCase());
}

/** 检查标签数组是否包含某个标签（大小写不敏感） */
function hasTag(tags: string[] | undefined | null, tag: string): boolean {
  if (!tags || tags.length === 0) return false;
  const lowerTag = tag.toLowerCase();
  return tags.some((t) => t.toLowerCase().includes(lowerTag));
}

/** 计算相关度分数：名称匹配 > 描述匹配 > 标签匹配 */
function relevanceScore(item: {
  name?: string;
  title?: string;
  description?: string;
  tags?: string[];
  style?: string;
}, term: string): number {
  const lowerTerm = term.toLowerCase();
  let score = 0;
  const name = (item.name ?? item.title ?? "").toLowerCase();
  if (name.includes(lowerTerm)) {
    score += name === lowerTerm ? 100 : name.startsWith(lowerTerm) ? 80 : 50;
  }
  if (matches(item.description, term)) score += 20;
  if (matches(item.style, term)) score += 15;
  if (item.tags?.some((t) => t.toLowerCase().includes(lowerTerm))) score += 10;
  return score;
}

/** 截断文本到指定长度 */
function truncate(text: string | undefined | null, maxLen: number = 60): string {
  if (!text) return "";
  return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text;
}

// ============= 各类搜索实现 =============

/** 搜索角色 */
async function searchCharacters(
  term: string,
  limit: number,
  tag?: string,
): Promise<SearchResult[]> {
  try {
    const { characterService } = await import("@/modules/character");
    const result = await characterService.getAll();
    if (!result.ok) return [];

    return result.value
      .map((c) => ({
        item: c,
        score: relevanceScore(
          { name: c.name, description: c.description, tags: c.tags, style: c.style },
          term,
        ),
      }))
      .filter(({ item, score }) => {
        if (score === 0) return false;
        if (tag && !hasTag(item.tags, tag)) return false;
        return true;
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ item }) => ({
        type: "character" as const,
        id: item.id,
        title: item.name,
        subtitle: truncate(item.description),
        thumbnailUrl: item.thumbnailPath,
        updatedAt: item.updatedAt,
        tags: item.tags,
      }));
  } catch {
    return [];
  }
}

/** 搜索场景 */
async function searchScenes(
  term: string,
  limit: number,
  tag?: string,
): Promise<SearchResult[]> {
  try {
    const { sceneService } = await import("@/modules/scene");
    const result = await sceneService.getAll();
    if (!result.ok) return [];

    return result.value
      .map((s) => ({
        item: s,
        score: relevanceScore(
          { name: s.name, description: s.description, tags: s.tags },
          term,
        ),
      }))
      .filter(({ item, score }) => {
        if (score === 0) return false;
        if (tag && !hasTag(item.tags, tag)) return false;
        return true;
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ item }) => ({
        type: "scene" as const,
        id: item.id,
        title: item.name,
        subtitle: truncate(item.description),
        thumbnailUrl: item.thumbnailPath,
        updatedAt: item.updatedAt,
        tags: item.tags,
      }));
  } catch {
    return [];
  }
}

/** 搜索故事/分镜 */
async function searchStories(
  term: string,
  limit: number,
  tag?: string,
): Promise<SearchResult[]> {
  try {
    const { storyService } = await import("@/modules/storyboard");
    const result = await storyService.getAll();
    if (!result.ok) return [];

    return result.value
      .map((s) => ({
        item: s,
        score: relevanceScore(
          { title: s.title, description: s.description },
          term,
        ),
      }))
      .filter(({ item, score }) => {
        if (score === 0) return false;
        // Story schema 没有 tags 字段，tag 过滤跳过
        void item;
        void tag;
        return true;
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ item }) => ({
        type: "story" as const,
        id: item.id,
        title: item.title,
        subtitle: truncate(item.description),
        updatedAt: typeof item.updatedAt === "number" ? String(item.updatedAt) : item.updatedAt,
      }));
  } catch {
    return [];
  }
}

/** 搜索媒体素材 */
async function searchMediaAssets(
  term: string,
  limit: number,
  tag?: string,
): Promise<SearchResult[]> {
  try {
    const { mediaAssetService } = await import("@/modules/asset");
    const assets = await mediaAssetService.getAll();

    return assets
      .map((a) => ({
        item: a,
        score: relevanceScore(
          { name: a.name, description: a.description, tags: a.tags },
          term,
        ),
      }))
      .filter(({ item, score }) => {
        if (score === 0) return false;
        if (tag && !hasTag(item.tags, tag)) return false;
        return true;
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ item }) => ({
        type: "media-asset" as const,
        id: item.id,
        title: item.name,
        subtitle: truncate(item.description),
        thumbnailUrl: item.thumbnailUrl ?? item.url,
        updatedAt: item.updatedAt,
        tags: item.tags,
      }));
  } catch {
    return [];
  }
}

// ============= 公共 API =============

/**
 * 全局搜索：跨角色 / 场景 / 故事 / 素材搜索
 *
 * @param term 搜索关键词（空字符串返回空结果）
 * @param options 搜索选项（类型筛选 / 标签过滤 / 数量限制）
 * @returns 搜索结果（按相关度排序）+ 各类计数
 *
 * @example
 * ```ts
 * // 搜索所有类型
 * const { results } = await globalSearch("勇者");
 * // 仅搜索角色，限制 10 条
 * const { results, counts } = await globalSearch("勇者", {
 *   assetType: "character",
 *   limitPerType: 10,
 * });
 * // 按标签过滤
 * const { results } = await globalSearch("", { tag: "主角" });
 * ```
 */
export async function globalSearch(
  term: string,
  options: GlobalSearchOptions = {},
): Promise<GlobalSearchResult> {
  const trimmed = term.trim();
  const assetType = options.assetType ?? "all";
  const limitPerType = Math.min(options.limitPerType ?? 20, 50);
  const totalLimit = Math.min(options.totalLimit ?? 50, 100);
  const tag = options.tag?.trim() || undefined;

  // 空关键词 + 无标签 → 返回空
  if (!trimmed && !tag) {
    return {
      results: [],
      total: 0,
      counts: { character: 0, scene: 0, story: 0, "media-asset": 0 },
    };
  }

  const searchTerm = trimmed || ""; // 标签搜索时关键词可为空
  const tasks: Array<Promise<SearchResult[]>> = [];

  if (assetType === "all" || assetType === "character") {
    tasks.push(searchCharacters(searchTerm, limitPerType, tag));
  }
  if (assetType === "all" || assetType === "scene") {
    tasks.push(searchScenes(searchTerm, limitPerType, tag));
  }
  if (assetType === "all" || assetType === "story") {
    tasks.push(searchStories(searchTerm, limitPerType, tag));
  }
  if (assetType === "all" || assetType === "media-asset") {
    tasks.push(searchMediaAssets(searchTerm, limitPerType, tag));
  }

  const allResults = await Promise.all(tasks);
  const flatResults = allResults.flat();

  // 计算各类计数
  const counts: Record<SearchableType, number> = {
    character: 0,
    scene: 0,
    story: 0,
    "media-asset": 0,
  };
  for (const r of flatResults) {
    counts[r.type] += 1;
  }

  // 总结果限制
  const limited = flatResults.slice(0, totalLimit);

  return {
    results: limited,
    total: flatResults.length,
    counts,
  };
}

/**
 * 快速搜索（简化接口，仅返回结果数组）
 *
 * 用于 SearchDialog 的 onSearch 回调签名兼容。
 */
export async function quickSearch(term: string): Promise<SearchResult[]> {
  if (!term.trim()) return [];
  const { results } = await globalSearch(term, { limitPerType: 10, totalLimit: 20 });
  return results;
}

/**
 * 获取搜索结果的路由路径
 *
 * 用于点击搜索结果后跳转。
 */
export function getSearchResultRoute(result: SearchResult): string {
  switch (result.type) {
    case "character":
      return `/characters?highlight=${encodeURIComponent(result.id)}`;
    case "scene":
      return `/scenes?highlight=${encodeURIComponent(result.id)}`;
    case "story":
      return `/storyboard/${encodeURIComponent(result.id)}`;
    case "media-asset":
      return `/asset-library?highlight=${encodeURIComponent(result.id)}`;
  }
}
