/**
 * get_help 工具实现
 *
 * 获取帮助文档。支持按关键词搜索或按分类筛选。
 *
 * 设计要点：
 * - 从静态字典 HELP_DOCS 返回
 * - 如果不提供 query 和 category，返回帮助文档目录（不含完整 content）
 * - 有筛选条件时返回完整内容
 */

import type { ToolImpl } from "@/domain/types/agent-tools";
import { TOOL_TIMEOUTS } from "@/shared/constants/tool-timeouts";
import { HELP_DOCS } from "./help-docs-data";

/** 获取帮助文档 */
export const getHelpTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "get_help",
      description:
        "获取帮助文档。支持按关键词搜索或按分类筛选。" +
        "如果不提供 query 和 category，返回帮助文档目录。" +
        "分类包括：general（通用）、features（功能）、faq（常见问题）、shortcuts（快捷键）。",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "搜索关键词（匹配标题、摘要、内容）。不填则不按关键词搜索。",
            maxLength: 500,
          },
          category: {
            type: "string",
            enum: ["general", "features", "faq", "shortcuts"],
            description: "按分类筛选。不填则返回所有分类。",
          },
        },
      },
    },
  },
  domain: "help",
  dangerLevel: "safe",
  timeoutMs: TOOL_TIMEOUTS.query,
  async execute(args) {
    const query = args.query ? String(args.query).toLowerCase().trim() : "";
    const category = args.category ? String(args.category).trim() : "";

    let filtered = HELP_DOCS;

    // 按分类筛选
    if (category) {
      filtered = filtered.filter((d) => d.category === category);
    }

    // 按关键词搜索
    if (query) {
      filtered = filtered.filter(
        (d) =>
          d.title.toLowerCase().includes(query) ||
          d.summary.toLowerCase().includes(query) ||
          d.content.toLowerCase().includes(query),
      );
    }

    // 如果既没有 query 也没有 category，返回目录（只含 title/category/summary，不含完整 content）
    if (!query && !category) {
      return {
        success: true,
        data: {
          articles: filtered.map((d) => ({
            title: d.title,
            category: d.category,
            summary: d.summary,
            content: "",
          })),
          total: filtered.length,
        },
      };
    }

    // 有筛选条件时返回完整内容
    return {
      success: true,
      data: {
        articles: filtered.map((d) => ({
          title: d.title,
          category: d.category,
          summary: d.summary,
          content: d.content,
        })),
        total: filtered.length,
      },
    };
  },
};
