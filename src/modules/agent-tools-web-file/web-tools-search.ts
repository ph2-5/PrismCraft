/**
 * 浏览器/网络工具 - 搜索工具
 *
 * 包含工具：
 * - search_web_images：搜索网络图片素材
 * - search_web：通用网页搜索（用于资料查询）
 *
 * 设计要点：
 * - 搜索 API 调用前通过 getConfig 检查 searchApiKey / searchEngine 配置
 * - URL 编码搜索关键词（encodeURIComponent）
 * - 错误处理完善，所有 fetch 操作均 try/catch
 * - 搜索 API 在浏览器环境可能受 CORS 限制，description 中说明需配置 CORS 代理或服务端转发
 */

import type { ToolImpl } from "@/domain/types/agent-tools";
import { TOOL_TIMEOUTS } from "@/shared/constants/tool-timeouts";
import { searchImagesByEngine } from "./web-search-engines";

// ============= 工具实现 =============

/** 搜索网络图片素材 */
export const searchWebImagesTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "search_web_images",
      description:
        "搜索网络图片素材（用于查找角色/场景参考图、灵感图、风格参考等）。返回图片 URL、缩略图、标题、来源。" +
        "支持 bing/unsplash/pexels/google 四个图源，需在设置中配置 searchApiKey。" +
        "unsplash 和 pexels 免费且易申请；bing 需 Azure 账号；google 需额外配置 searchEngineId。",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "搜索关键词", maxLength: 500 },
          count: { type: "number", description: "返回数量，默认 10，最大 30", default: 10, minimum: 1, maximum: 30 },
          source: {
            type: "string",
            enum: ["bing", "google", "unsplash", "pexels"],
            description: "搜索引擎/图源，默认 bing",
            default: "bing",
          },
          safeSearch: { type: "boolean", description: "是否启用安全搜索，默认 true", default: true },
        },
        required: ["query"],
      },
    },
  },
  domain: "web",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.query,
  async execute(args) {
    const query = String(args.query);
    const count = Math.min(Math.max(Number(args.count) || 10, 1), 30);
    const source = String(args.source || "bing");
    const safeSearch = args.safeSearch !== false;

    const { getConfig } = await import("@/shared/file-http");
    const searchApiKey = await getConfig("searchApiKey");
    const searchEngine = await getConfig("searchEngine");

    if (!searchApiKey) {
      return {
        success: false,
        error: "未配置搜索 API。请在设置中配置 Bing/Google 图片搜索 API key",
        data: {
          configGuide:
            "在设置 → 搜索配置 中填写 searchApiKey（Bing Image Search API key），可选填 searchEngine（bing/google/unsplash/pexels）",
        },
      };
    }

    try {
      const engine = (searchEngine as string | null) || source;
      return await searchImagesByEngine(engine, { query, count, safeSearch, searchApiKey, getConfig });
    } catch (e) {
      return {
        success: false,
        error: `搜索网络图片失败：${e instanceof Error ? e.message : String(e)}`,
      };
    }
  },
};

/** 通用网页搜索（用于资料查询） */
export const searchWebTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "search_web",
      description:
        "通用网页搜索（用于资料查询、获取背景知识、了解概念等）。返回网页标题、URL、内容摘要。当前仅支持已配置 CORS 代理或服务端转发的搜索 API（默认 Bing Web Search），浏览器直接调用第三方 API 可能受 CORS 限制。",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "搜索关键词", maxLength: 500 },
          count: { type: "number", description: "返回数量，默认 5，最大 20", default: 5, minimum: 1, maximum: 20 },
          source: {
            type: "string",
            enum: ["bing", "google"],
            description: "搜索引擎，默认 bing",
            default: "bing",
          },
        },
        required: ["query"],
      },
    },
  },
  domain: "web",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.query,
  async execute(args) {
    const query = String(args.query);
    const count = Math.min(Math.max(Number(args.count) || 5, 1), 20);
    const source = String(args.source || "bing");

    const { getConfig } = await import("@/shared/file-http");
    const searchApiKey = await getConfig("searchApiKey");
    const searchEngine = await getConfig("searchEngine");

    if (!searchApiKey) {
      return {
        success: false,
        error: "未配置搜索 API。请在设置中配置 Bing/Google 网页搜索 API key",
        data: {
          configGuide:
            "在设置 → 搜索配置 中填写 searchApiKey（Bing Web Search API key），可选填 searchEngine（bing/google）",
        },
      };
    }

    try {
      const engine = (searchEngine as string | null) || source;

      if (engine === "bing") {
        const url = `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(query)}&count=${count}`;
        const response = await fetch(url, {
          headers: { "Ocp-Apim-Subscription-Key": String(searchApiKey) },
        });

        if (!response.ok) {
          return {
            success: false,
            error: `Bing 网页搜索请求失败：HTTP ${response.status} ${response.statusText}`,
          };
        }

        const json = (await response.json()) as {
          webPages?: { value?: Array<Record<string, unknown>> };
        };
        const rawItems = json.webPages?.value ?? [];
        const items = rawItems.map((item) => ({
          title: String(item.name ?? ""),
          url: String(item.url ?? ""),
          snippet: String(item.snippet ?? ""),
        }));

        return {
          success: true,
          data: {
            total: items.length,
            items,
          },
        };
      }

      return {
        success: false,
        error: `当前网页搜索仅支持 bing，图片搜索支持 bing/unsplash/pexels/google。`,
        data: { supportedEngines: ["bing"] },
      };
    } catch (e) {
      return {
        success: false,
        error: `网页搜索失败：${e instanceof Error ? e.message : String(e)}`,
      };
    }
  },
};
