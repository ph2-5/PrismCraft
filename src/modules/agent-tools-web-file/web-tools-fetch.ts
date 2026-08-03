/**
 * 浏览器/网络工具 - 网页获取工具
 *
 * 包含工具：
 * - fetch_web_content：获取网页内容（用于 AI 阅读网页）
 * - open_in_browser：在系统默认浏览器中打开链接
 *
 * 设计要点：
 * - 错误处理完善，所有 fetch 操作均 try/catch
 * - SSRF 基本校验：fetch_web_content 的 URL 必须是 http/https
 */

import type { ToolImpl } from "@/domain/types/agent-tools";
import { TOOL_TIMEOUTS } from "@/shared/constants/tool-timeouts";
import { isHttpUrl } from "./web-tools-shared";

// ============= 辅助函数 =============

/** 极简 HTML 转纯文本（去除标签、压缩空白） */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** 极简 HTML 转 Markdown（标题/段落/链接的粗略转换） */
function htmlToMarkdown(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, "\n# $1\n")
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "\n## $1\n")
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, "\n### $1\n")
    .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, "\n#### $1\n")
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "- $1\n")
    .replace(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)")
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, "$1\n\n")
    .replace(/<br\s*\/?>(\n)?/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ============= 工具实现 =============

/** 获取网页内容（用于 AI 阅读网页） */
export const fetchWebContentTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "fetch_web_content",
      description:
        "获取网页内容（用于 AI 阅读网页、提取资料）。支持 text/html/markdown 三种输出格式。会截断到 maxLength 避免占用过多 token。URL 必须是 http/https。",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "网页 URL（http/https）", maxLength: 2048 },
          format: {
            type: "string",
            enum: ["text", "html", "markdown"],
            description: "输出格式，默认 markdown",
            default: "markdown",
          },
          maxLength: { type: "number", description: "最大字符数，默认 10000", default: 10000, minimum: 100, maximum: 100000 },
        },
        required: ["url"],
      },
    },
  },
  domain: "web",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.query,
  async execute(args) {
    const url = String(args.url);
    const format = String(args.format || "markdown") as "text" | "html" | "markdown";
    const maxLength = Math.max(Number(args.maxLength) || 10000, 100);

    if (!isHttpUrl(url)) {
      return { success: false, error: `URL 必须是 http/https 协议：${url}` };
    }

    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; AIAnimationStudio/1.0)" },
      });

      if (!response.ok) {
        return {
          success: false,
          error: `获取网页失败：HTTP ${response.status} ${response.statusText}`,
        };
      }

      const rawHtml = await response.text();
      let content: string;

      if (format === "html") {
        content = rawHtml;
      } else if (format === "text") {
        content = htmlToText(rawHtml);
      } else {
        content = htmlToMarkdown(rawHtml);
      }

      // 截断到 maxLength
      const truncated = content.length > maxLength;
      if (truncated) {
        content = content.slice(0, maxLength);
      }

      return {
        success: true,
        data: {
          url,
          content,
          format,
          length: content.length,
          truncated,
        },
      };
    } catch (e) {
      return {
        success: false,
        error: `获取网页内容失败：${e instanceof Error ? e.message : String(e)}`,
      };
    }
  },
};

/** 在系统默认浏览器中打开链接 */
export const openInBrowserTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "open_in_browser",
      description:
        "在系统默认浏览器中打开指定链接（用于打开参考网页、教程、外部资源等）。Electron 环境优先使用 openExternal，Web 环境使用 window.open。",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "要打开的 URL", maxLength: 2048 },
        },
        required: ["url"],
      },
    },
  },
  domain: "web",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.query,
  async execute(args) {
    const url = String(args.url);

    try {
      // Electron 环境：优先 openExternal
      const electronApi = (typeof window !== "undefined"
        ? (window as Window & { electronAPI?: { openExternal?: (url: string) => Promise<void> } }).electronAPI
        : undefined);
      if (electronApi?.openExternal) {
        await electronApi.openExternal(url);
        return { success: true, data: { url, opened: true, method: "openExternal" } };
      }

      // Web 环境 / 回退：window.open
      if (typeof window !== "undefined" && typeof window.open === "function") {
        const win = window.open(url, "_blank");
        if (win) {
          return { success: true, data: { url, opened: true, method: "window.open" } };
        }
        return {
          success: false,
          error: "window.open 被浏览器拦截，请允许弹窗或手动打开链接",
          data: { url, opened: false },
        };
      }

      return {
        success: false,
        error: "当前环境无法打开浏览器（既无 electronAPI.openExternal 也无 window.open）",
        data: { url, opened: false },
      };
    } catch (e) {
      return {
        success: false,
        error: `打开浏览器失败：${e instanceof Error ? e.message : String(e)}`,
        data: { url, opened: false },
      };
    }
  },
};
