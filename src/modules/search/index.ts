/**
 * Search Module - Public API
 *
 * 全局搜索模块，提供跨角色 / 场景 / 故事 / 素材的统一搜索能力。
 *
 * 使用方式：
 * ```ts
 * // 服务层（Agent 工具 / 程序化调用）
 * import { globalSearch, quickSearch, getSearchResultRoute } from "@/modules/search";
 *
 * // UI 组件（顶栏 / 侧边栏嵌入）
 * import { SearchBar } from "@/modules/search";
 * ```
 */

// === 1. 搜索服务 ===
export {
  globalSearch,
  quickSearch,
  getSearchResultRoute,
} from "./services/global-search";

export type {
  GlobalSearchOptions,
  GlobalSearchResult,
  SearchableType,
} from "./services/global-search";

// === 2. 搜索栏 UI 组件 ===
export { SearchBar } from "./presentation/search-bar";
