/**
 * 网络图片搜索引擎适配（Web Search Engines）
 *
 * 从 web-tools.ts 拆出，降低主文件行数。
 * 支持的搜索引擎：Bing / Unsplash / Pexels / Google Custom Search。
 */

/** 搜索引擎统一返回类型 */
export type SearchResult = {
  success: boolean;
  error?: string;
  data?: Record<string, unknown>;
};

/** 搜索引擎统一参数 */
export interface SearchEngineParams {
  query: string;
  count: number;
  safeSearch: boolean;
  searchApiKey: unknown;
  getConfig: (key: string) => Promise<unknown>;
}

/** 按搜索引擎分发图片搜索 */
export async function searchImagesByEngine(engine: string, params: SearchEngineParams): Promise<SearchResult> {
  if (engine === "bing") return searchBingImages(params);
  if (engine === "unsplash") return searchUnsplashImages(params);
  if (engine === "pexels") return searchPexelsImages(params);
  if (engine === "google") return searchGoogleImages(params);
  return {
    success: false,
    error: `搜索引擎 "${engine}" 暂未实现。当前支持 bing/unsplash/pexels/google。`,
    data: { supportedEngines: ["bing", "unsplash", "pexels", "google"] },
  };
}

/** Bing 图片搜索 */
async function searchBingImages(params: SearchEngineParams): Promise<SearchResult> {
  const { query, count, safeSearch, searchApiKey } = params;
  const url = `https://api.bing.microsoft.com/v7.0/images/search?q=${encodeURIComponent(query)}&count=${count}&safeSearch=${safeSearch ? "Strict" : "Off"}`;
  const response = await fetch(url, {
    headers: { "Ocp-Apim-Subscription-Key": String(searchApiKey) },
  });
  if (!response.ok) {
    return { success: false, error: `Bing 图片搜索请求失败：HTTP ${response.status} ${response.statusText}` };
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
  return { success: true, data: { total: items.length, items } };
}

/** Unsplash 图片搜索 */
async function searchUnsplashImages(params: SearchEngineParams): Promise<SearchResult> {
  const { query, count, safeSearch, searchApiKey } = params;
  const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=${count}&content_filter=${safeSearch ? "high" : "low"}`;
  const response = await fetch(url, {
    headers: { Authorization: `Client-ID ${String(searchApiKey)}` },
  });
  if (!response.ok) {
    return { success: false, error: `Unsplash 图片搜索请求失败：HTTP ${response.status} ${response.statusText}` };
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
  return { success: true, data: { total: items.length, items, source: "unsplash" } };
}

/** Pexels 图片搜索 */
async function searchPexelsImages(params: SearchEngineParams): Promise<SearchResult> {
  const { query, count, searchApiKey } = params;
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${count}`;
  const response = await fetch(url, {
    headers: { Authorization: String(searchApiKey) },
  });
  if (!response.ok) {
    return { success: false, error: `Pexels 图片搜索请求失败：HTTP ${response.status} ${response.statusText}` };
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
  return { success: true, data: { total: items.length, items, source: "pexels" } };
}

/** Google Custom Search 图片搜索 */
async function searchGoogleImages(params: SearchEngineParams): Promise<SearchResult> {
  const { query, count, safeSearch, searchApiKey, getConfig } = params;
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
    return { success: false, error: `Google 图片搜索请求失败：HTTP ${response.status} ${response.statusText}` };
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
  return { success: true, data: { total: items.length, items, source: "google" } };
}
