/**
 * 浏览器/网络工具（Web Tools）
 *
 * 包含工具：
 * - search_web_images：搜索网络图片素材
 * - search_web：通用网页搜索（用于资料查询）
 * - download_web_asset：下载网络素材到本地素材库
 * - import_from_url：从 URL 导入素材
 * - fetch_web_content：获取网页内容（用于 AI 阅读网页）
 * - open_in_browser：在系统默认浏览器中打开链接
 * - bookmark_resource：收藏资源
 * - list_bookmarks：列出收藏的资源
 *
 * 设计要点：
 * - 搜索 API 调用前通过 getConfig 检查 searchApiKey / searchEngine 配置
 * - 下载使用 httpDownloadToFile（主进程流式下载，绕过渲染进程内存）
 * - URL 编码搜索关键词（encodeURIComponent）
 * - 错误处理完善，所有 fetch / 下载操作均 try/catch
 * - SSRF 基本校验：fetch_web_content 的 URL 必须是 http/https
 * - 搜索 API 在浏览器环境可能受 CORS 限制，description 中说明需配置 CORS 代理或服务端转发
 *
 * 特权访问声明：本文件通过 DI container 直接访问 elementStorage（prop 元素入库），
 * 详见 MODULE.md "Agent 特权访问声明" 章节。
 */

import type { ToolImpl } from "@/domain/types/agent-tools";
import { TOOL_TIMEOUTS } from "@/shared/constants/tool-timeouts";
import { errorLogger } from "@/shared/error-logger";

// ============= 辅助函数 =============

/** 从 URL 提取文件扩展名，无法识别时默认 jpg */
function getExtensionFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const match = u.pathname.match(/\.([a-zA-Z0-9]{1,8})$/);
    if (match && match[1]) {
      const ext = match[1].toLowerCase();
      const known = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "mp4", "webm", "mov", "mp3", "wav", "webm"];
      if (known.includes(ext)) return ext;
      return ext;
    }
  } catch {
    // 无效 URL，使用默认扩展名
  }
  return "jpg";
}

/** 校验 URL 是否为 http/https 协议（防 SSRF / 协议混淆） */
function isHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

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

      if (engine === "bing") {
        const url = `https://api.bing.microsoft.com/v7.0/images/search?q=${encodeURIComponent(query)}&count=${count}&safeSearch=${safeSearch ? "Strict" : "Off"}`;
        const response = await fetch(url, {
          headers: { "Ocp-Apim-Subscription-Key": String(searchApiKey) },
        });

        if (!response.ok) {
          return {
            success: false,
            error: `Bing 图片搜索请求失败：HTTP ${response.status} ${response.statusText}`,
          };
        }

        const json = (await response.json()) as { value?: Array<Record<string, unknown>> };
        const items = (json.value ?? []).map((item) => ({
          title: String(item.name ?? ""),
          imageUrl: String(item.contentUrl ?? ""),
          thumbnailUrl: String(item.thumbnailUrl ?? ""),
          sourceUrl: String(item.hostPageUrl ?? ""),
          width: item.width ? Number(item.width) : undefined,
          height: item.height ? Number(item.height) : undefined,
        }));

        return {
          success: true,
          data: {
            total: items.length,
            items,
          },
        };
      }

      if (engine === "unsplash") {
        // Unsplash：免费图库，需注册开发者账号获取 API key
        // API 文档：https://unsplash.com/documentation
        const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=${count}&content_filter=${safeSearch ? "high" : "low"}`;
        const response = await fetch(url, {
          headers: { Authorization: `Client-ID ${String(searchApiKey)}` },
        });

        if (!response.ok) {
          return {
            success: false,
            error: `Unsplash 图片搜索请求失败：HTTP ${response.status} ${response.statusText}`,
          };
        }

        const json = (await response.json()) as { results?: Array<Record<string, unknown>> };
        const items = (json.results ?? []).map((item) => {
          const urls = item.urls as Record<string, string> | undefined;
          const links = item.links as Record<string, string> | undefined;
          const user = item.user as Record<string, string> | undefined;
          return {
            title: String(item.alt_description ?? item.description ?? ""),
            imageUrl: urls?.full ?? urls?.regular ?? "",
            thumbnailUrl: urls?.thumb ?? "",
            sourceUrl: String(links?.download ?? ""),
            width: item.width ? Number(item.width) : undefined,
            height: item.height ? Number(item.height) : undefined,
            author: String(user?.name ?? ""),
          };
        });

        return {
          success: true,
          data: { total: items.length, items, source: "unsplash" },
        };
      }

      if (engine === "pexels") {
        // Pexels：免费图库，需注册开发者账号获取 API key
        // API 文档：https://www.pexels.com/api/documentation/
        const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${count}`;
        const response = await fetch(url, {
          headers: { Authorization: String(searchApiKey) },
        });

        if (!response.ok) {
          return {
            success: false,
            error: `Pexels 图片搜索请求失败：HTTP ${response.status} ${response.statusText}`,
          };
        }

        const json = (await response.json()) as { photos?: Array<Record<string, unknown>> };
        const items = (json.photos ?? []).map((item) => {
          const src = item.src as Record<string, string> | undefined;
          return {
            title: String(item.alt ?? ""),
            imageUrl: src?.original ?? "",
            thumbnailUrl: src?.medium ?? src?.tiny ?? "",
            sourceUrl: String(item.url ?? ""),
            width: item.width ? Number(item.width) : undefined,
            height: item.height ? Number(item.height) : undefined,
            author: String(item.photographer ?? ""),
          };
        });

        return {
          success: true,
          data: { total: items.length, items, source: "pexels" },
        };
      }

      if (engine === "google") {
        // Google Custom Search：需 Google Cloud API key + Custom Search Engine ID
        // 配置 searchEngine 字段存储 cx（Search Engine ID）
        const cx = (await getConfig("searchEngineId")) as string | null;
        if (!cx) {
          return {
            success: false,
            error: "Google 搜索需要配置 searchEngineId（Custom Search Engine ID）。请在设置中配置。",
            data: { configGuide: "在设置 → 搜索配置 中填写 searchEngineId" },
          };
        }

        const url = `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(query)}&num=${count}&searchType=image&key=${String(searchApiKey)}&cx=${encodeURIComponent(cx)}&safe=${safeSearch ? "active" : "off"}`;
        const response = await fetch(url);

        if (!response.ok) {
          return {
            success: false,
            error: `Google 图片搜索请求失败：HTTP ${response.status} ${response.statusText}`,
          };
        }

        const json = (await response.json()) as { items?: Array<Record<string, unknown>> };
        const items = (json.items ?? []).map((item) => {
          const image = item.image as Record<string, unknown> | undefined;
          return {
            title: String(item.title ?? ""),
            imageUrl: String(image?.contextLink ?? item.link ?? ""),
            thumbnailUrl: String(image?.thumbnailLink ?? ""),
            sourceUrl: String(image?.contextLink ?? item.link ?? ""),
            width: image?.width ? Number(image.width) : undefined,
            height: image?.height ? Number(image.height) : undefined,
          };
        });

        return {
          success: true,
          data: { total: items.length, items, source: "google" },
        };
      }

      return {
        success: false,
        error: `搜索引擎 "${engine}" 暂未实现。当前支持 bing/unsplash/pexels/google。`,
        data: { supportedEngines: ["bing", "unsplash", "pexels", "google"] },
      };
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
        error: `搜索引擎 "${engine}" 暂未实现。当前仅支持 bing。`,
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

/** 下载网络素材到本地素材库 */
export const downloadWebAssetTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "download_web_asset",
      description:
        "下载网络素材到本地素材库。支持角色/场景/道具三种类型，下载成功后会尝试入库（character/scene 调用对应 service，prop 调用 elementStorage）。下载是安全操作，无需用户确认。",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "素材 URL（http/https）", maxLength: 2048 },
          assetType: {
            type: "string",
            enum: ["character", "scene", "prop"],
            description: "素材类型",
          },
          name: { type: "string", description: "素材名称（用于文件名和入库）" },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "标签列表（可选）",
          },
        },
        required: ["url", "assetType", "name"],
      },
    },
  },
  domain: "web",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.download,
  requiresConfirmation: false,
  async execute(args) {
    const url = String(args.url);
    const assetType = String(args.assetType) as "character" | "scene" | "prop";
    const name = String(args.name);
    const tags = Array.isArray(args.tags) ? (args.tags as string[]) : [];

    if (!isHttpUrl(url)) {
      return { success: false, error: `URL 必须是 http/https 协议：${url}` };
    }

    const { httpDownloadToFile, getCacheDirectory } = await import("@/shared/file-http");

    const dirResult = await getCacheDirectory();
    if (!dirResult?.success || !dirResult.path) {
      return { success: false, error: `无法获取缓存目录：${dirResult?.error || "unknown"}` };
    }

    const ext = getExtensionFromUrl(url);
    const safeName = name.replace(/[\\/:*?"<>|]/g, "_");
    const localPath = `${dirResult.path}/assets/${assetType}/${Date.now()}_${safeName}.${ext}`;

    try {
      const result = await httpDownloadToFile(url, localPath);
      if (!result?.success) {
        return {
          success: false,
          error: `下载失败：${result?.error || "httpDownloadToFile 返回 null（HTTP 不可用且无 IPC 回退）"}`,
        };
      }
    } catch (e) {
      return {
        success: false,
        error: `下载失败：${e instanceof Error ? e.message : String(e)}`,
      };
    }

    // 可选入库（best-effort，失败不影响下载结果）
    let assetId: string | undefined;
    try {
      if (assetType === "character") {
        const { characterService } = await import("@/modules/character");
        const r = await characterService.create({
          name,
          description: `从网络下载的角色素材：${name}`,
          gender: "unknown",
          style: "",
          personality: [],
          appearance: { hairColor: "", hairStyle: "", eyeColor: "", height: "", build: "", clothing: "" },
          prompt: "",
          thumbnailPath: localPath,
          tags,
        });
        if (r.ok) assetId = r.value.id;
      } else if (assetType === "scene") {
        const { sceneService } = await import("@/modules/scene");
        const r = await sceneService.create({
          name,
          description: `从网络下载的场景素材：${name}`,
          type: "",
          timeOfDay: "",
          weather: "",
          mood: "",
          lighting: "",
          elements: [],
          colors: [],
          prompt: "",
          thumbnailPath: localPath,
          tags,
        });
        if (r.ok) assetId = r.value.id;
      } else if (assetType === "prop") {
        const { container } = await import("@/infrastructure/di");
        const element = await container.elementStorage.createElement("prop", name);
        assetId = element.id;
      }
    } catch (err) {
      errorLogger.warn("[WebTools] 素材入库失败", err);
    }

    return {
      success: true,
      data: {
        localPath,
        assetType,
        name,
        assetId,
      },
    };
  },
};

/** 从 URL 导入素材（直接 URL，非搜索） */
export const importFromUrlTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "import_from_url",
      description:
        "从 URL 导入素材（直接 URL，非搜索）。比 download_web_asset 更通用：支持 image 类型，不强制入库。适用于用户已知道素材直链的场景。",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "素材 URL（http/https）", maxLength: 2048 },
          assetType: {
            type: "string",
            enum: ["character", "scene", "prop", "image"],
            description: "素材类型",
          },
          name: { type: "string", description: "素材名称" },
          description: { type: "string", description: "素材描述（可选）", maxLength: 1000 },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "标签列表（可选）",
          },
        },
        required: ["url", "assetType", "name"],
      },
    },
  },
  domain: "web",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.download,
  requiresConfirmation: false,
  async execute(args) {
    const url = String(args.url);
    const assetType = String(args.assetType) as "character" | "scene" | "prop" | "image";
    const name = String(args.name);
    const description = args.description ? String(args.description) : "";
    const tags = Array.isArray(args.tags) ? (args.tags as string[]) : [];

    if (!isHttpUrl(url)) {
      return { success: false, error: `URL 必须是 http/https 协议：${url}` };
    }

    const { httpDownloadToFile, getCacheDirectory } = await import("@/shared/file-http");

    const dirResult = await getCacheDirectory();
    if (!dirResult?.success || !dirResult.path) {
      return { success: false, error: `无法获取缓存目录：${dirResult?.error || "unknown"}` };
    }

    const ext = getExtensionFromUrl(url);
    const safeName = name.replace(/[\\/:*?"<>|]/g, "_");
    const localPath = `${dirResult.path}/assets/${assetType}/${Date.now()}_${safeName}.${ext}`;

    try {
      const result = await httpDownloadToFile(url, localPath);
      if (!result?.success) {
        return {
          success: false,
          error: `导入失败：${result?.error || "httpDownloadToFile 返回 null（HTTP 不可用且无 IPC 回退）"}`,
        };
      }
    } catch (e) {
      return {
        success: false,
        error: `导入失败：${e instanceof Error ? e.message : String(e)}`,
      };
    }

    return {
      success: true,
      data: {
        localPath,
        assetType,
        name,
        description,
        tags,
        imported: true,
      },
    };
  },
};

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

/** 导出所有浏览器/网络工具 */
export const webTools: ToolImpl[] = [
  searchWebImagesTool,
  searchWebTool,
  downloadWebAssetTool,
  importFromUrlTool,
  fetchWebContentTool,
  openInBrowserTool,
  bookmarkResourceTool,
  listBookmarksTool,
];
