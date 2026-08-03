/**
 * 浏览器/网络工具 - 收藏管理工具
 *
 * 包含工具：
 * - bookmark_resource：收藏资源
 * - list_bookmarks：列出收藏的资源
 *
 * 设计要点：
 * - 收藏存储在配置 agent.bookmarks 中
 * - 错误处理完善，所有操作均 try/catch
 */

import type { ToolImpl } from "@/domain/types/agent-tools";
import { TOOL_TIMEOUTS } from "@/shared/constants/tool-timeouts";

// ============= 工具实现 =============

/** 收藏资源 */
export const bookmarkResourceTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "bookmark_resource",
      description:
        "收藏资源（建立素材收藏库）。可将网页、图片、教程等资源加入收藏，便于后续查找。收藏存储在配置 agent.bookmarks 中。",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "资源 URL", maxLength: 2048 },
          title: { type: "string", description: "资源标题", maxLength: 200 },
          description: { type: "string", description: "资源描述（可选）", maxLength: 1000 },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "标签列表（可选）",
          },
          category: {
            type: "string",
            enum: ["reference", "inspiration", "asset", "tutorial"],
            description: "收藏分类（可选）",
          },
        },
        required: ["url", "title"],
      },
    },
  },
  domain: "web",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.mutation,
  async execute(args) {
    const url = String(args.url);
    const title = String(args.title);
    const description = args.description ? String(args.description) : "";
    const tags = Array.isArray(args.tags) ? (args.tags as string[]) : [];
    const category = args.category ? String(args.category) : undefined;

    try {
      const { getConfig, setConfig } = await import("@/shared/file-http");
      const raw = await getConfig("agent.bookmarks");
      const bookmarks = Array.isArray(raw) ? (raw as Array<Record<string, unknown>>) : [];

      bookmarks.push({
        url,
        title,
        description,
        tags,
        category,
        createdAt: Date.now(),
      });

      const ok = await setConfig("agent.bookmarks", bookmarks);
      if (!ok) {
        return { success: false, error: "保存收藏失败：setConfig 返回 false" };
      }

      return {
        success: true,
        data: {
          bookmarked: true,
          total: bookmarks.length,
        },
      };
    } catch (e) {
      return {
        success: false,
        error: `收藏资源失败：${e instanceof Error ? e.message : String(e)}`,
      };
    }
  },
};

/** 列出收藏的资源 */
export const listBookmarksTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "list_bookmarks",
      description: "列出收藏的资源。支持按分类、标签过滤，可限制返回数量。按 createdAt 倒序返回。",
      parameters: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: ["reference", "inspiration", "asset", "tutorial"],
            description: "按分类过滤（可选）",
          },
          tag: { type: "string", description: "按标签过滤（可选）", maxLength: 200 },
          limit: { type: "number", description: "返回数量上限，默认 20", default: 20, minimum: 1, maximum: 200 },
        },
      },
    },
  },
  domain: "web",
  dangerLevel: "safe",
  timeoutMs: TOOL_TIMEOUTS.query,
  async execute(args) {
    const category = args.category ? String(args.category) : undefined;
    const tag = args.tag ? String(args.tag) : undefined;
    const limit = Math.max(Number(args.limit) || 20, 1);

    try {
      const { getConfig } = await import("@/shared/file-http");
      const raw = await getConfig("agent.bookmarks");
      const bookmarks = Array.isArray(raw) ? (raw as Array<Record<string, unknown>>) : [];

      let filtered = bookmarks;
      if (category) {
        filtered = filtered.filter((b) => b.category === category);
      }
      if (tag) {
        filtered = filtered.filter((b) => Array.isArray(b.tags) && (b.tags as string[]).includes(tag));
      }

      // 倒序（最新优先）
      filtered = [...filtered].sort((a, b) => {
        const ta = Number(a.createdAt) || 0;
        const tb = Number(b.createdAt) || 0;
        return tb - ta;
      });

      const paged = filtered.slice(0, limit);

      return {
        success: true,
        data: {
          total: filtered.length,
          items: paged.map((b) => ({
            url: String(b.url ?? ""),
            title: String(b.title ?? ""),
            description: b.description ? String(b.description) : "",
            tags: Array.isArray(b.tags) ? (b.tags as string[]) : [],
            category: b.category ? String(b.category) : undefined,
            createdAt: b.createdAt,
          })),
        },
      };
    } catch (e) {
      return {
        success: false,
        error: `列出收藏失败：${e instanceof Error ? e.message : String(e)}`,
      };
    }
  },
};
