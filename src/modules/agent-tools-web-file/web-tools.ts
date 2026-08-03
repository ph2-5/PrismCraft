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
 *
 * 本文件为聚合入口：工具实现已按功能域拆分至
 * web-tools-search（搜索）/ web-tools-download（下载）/ web-tools-fetch（网页获取）/
 * web-tools-bookmark（收藏管理），此处仅汇总导出，公共 API 保持不变。
 */

import type { ToolImpl } from "@/domain/types/agent-tools";

import { searchWebImagesTool, searchWebTool } from "./web-tools-search";
import { downloadWebAssetTool, importFromUrlTool } from "./web-tools-download";
import { fetchWebContentTool, openInBrowserTool } from "./web-tools-fetch";
import { bookmarkResourceTool, listBookmarksTool } from "./web-tools-bookmark";

export { searchWebImagesTool, searchWebTool } from "./web-tools-search";
export { downloadWebAssetTool, importFromUrlTool } from "./web-tools-download";
export { fetchWebContentTool, openInBrowserTool } from "./web-tools-fetch";
export { bookmarkResourceTool, listBookmarksTool } from "./web-tools-bookmark";

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
