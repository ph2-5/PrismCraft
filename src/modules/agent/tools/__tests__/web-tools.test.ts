/**
 * Web Tools 单元测试
 *
 * 8 个浏览器/网络工具的关键路径测试：
 * - search_web_images / search_web：搜索 API（mock fetch + getConfig）
 * - download_web_asset / import_from_url：下载（mock httpDownloadToFile + getCacheDirectory）
 * - fetch_web_content：获取网页（mock fetch）
 * - open_in_browser：打开浏览器（mock window.electronAPI / window.open）
 * - bookmark_resource / list_bookmarks：收藏管理（mock getConfig / setConfig）
 *
 * Mock 策略：
 * - @/shared/file-http：getConfig / setConfig / httpDownloadToFile / getCacheDirectory
 * - @/modules/character / @/modules/scene：下载入库
 * - @/infrastructure/di：container.elementStorage（prop 入库）
 * - ../../services/tool-executor：TOOL_TIMEOUTS
 * - 全局 fetch：vi.stubGlobal("fetch", ...)
 *
 * 测试重点：URL 校验、SSRF 防护、配置检查、错误传播、HTML 转换、收藏过滤
 */

import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
  setConfig: vi.fn(),
  httpDownloadToFile: vi.fn(),
  getCacheDirectory: vi.fn(),
  characterService: { create: vi.fn() },
  sceneService: { create: vi.fn() },
  elementStorage: { createElement: vi.fn() },
}));

vi.mock("@/shared/file-http", () => ({
  getConfig: mocks.getConfig,
  setConfig: mocks.setConfig,
  httpDownloadToFile: mocks.httpDownloadToFile,
  getCacheDirectory: mocks.getCacheDirectory,
}));

vi.mock("@/modules/character", () => ({
  characterService: mocks.characterService,
}));

vi.mock("@/modules/scene", () => ({
  sceneService: mocks.sceneService,
}));

vi.mock("@/infrastructure/di", () => ({
  container: { elementStorage: mocks.elementStorage },
}));

vi.mock("../../services/tool-executor", () => ({
  TOOL_TIMEOUTS: {
    query: 30_000,
    mutation: 60_000,
    generation: 300_000,
    videoTask: 1_800_000,
    download: 600_000,
  },
}));

import {
  searchWebImagesTool,
  searchWebTool,
  downloadWebAssetTool,
  importFromUrlTool,
  fetchWebContentTool,
  openInBrowserTool,
  bookmarkResourceTool,
  listBookmarksTool,
  webTools,
} from "../web-tools";
import type { ToolContext } from "../../domain/types";

function makeCtx(): ToolContext {
  return {
    sessionId: "test-session",
    onProgress: vi.fn(),
  };
}

/** 构造 mock fetch Response 对象 */
function mockResponse(options: {
  ok?: boolean;
  status?: number;
  statusText?: string;
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
}) {
  const ok = options.ok ?? true;
  return {
    ok,
    status: options.status ?? (ok ? 200 : 404),
    statusText: options.statusText ?? (ok ? "OK" : "Not Found"),
    json: options.json ?? (async () => ({})),
    text: options.text ?? (async () => ""),
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", vi.fn());
  // 默认缓存目录可用
  mocks.getCacheDirectory.mockResolvedValue({
    success: true,
    path: "/cache",
  });
});

afterEach(() => {
  // 清理可能挂到 window 上的 electronAPI
  const w = window as Window & { electronAPI?: unknown };
  delete w.electronAPI;
});

// ============================================================
// 1. search_web_images
// ============================================================
describe("search_web_images", () => {
  it("1. 未配置 searchApiKey 时返回失败及配置指引", async () => {
    mocks.getConfig.mockResolvedValue(null);

    const result = await searchWebImagesTool.execute(
      { query: "赛博朋克" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("未配置搜索 API");
    const data = result.data as { configGuide: string };
    expect(data.configGuide).toContain("searchApiKey");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("2. Bing 搜索正常返回图片列表", async () => {
    mocks.getConfig
      .mockResolvedValueOnce("test-api-key")
      .mockResolvedValueOnce("bing");
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(
      mockResponse({
        ok: true,
        json: async () => ({
          value: [
            {
              name: "图片1",
              contentUrl: "https://img1.png",
              thumbnailUrl: "https://thumb1.png",
              hostPageUrl: "https://page1.com",
              width: 800,
              height: 600,
            },
          ],
        }),
      }) as never,
    );

    const result = await searchWebImagesTool.execute(
      { query: "动漫角色", count: 5, source: "bing" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      total: number;
      items: Array<{ title: string; imageUrl: string; width: number }>;
    };
    expect(data.total).toBe(1);
    expect(data.items[0].title).toBe("图片1");
    expect(data.items[0].imageUrl).toBe("https://img1.png");
    expect(data.items[0].width).toBe(800);
    // 验证 fetch 调用 URL 包含编码后的 query 和 count
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain(encodeURIComponent("动漫角色"));
    expect(calledUrl).toContain("count=5");
  });

  it("3. Bing 请求 HTTP 错误时返回失败", async () => {
    mocks.getConfig
      .mockResolvedValueOnce("test-key")
      .mockResolvedValueOnce("bing");
    vi.mocked(fetch).mockResolvedValue(
      mockResponse({ ok: false, status: 401, statusText: "Unauthorized" }) as never,
    );

    const result = await searchWebImagesTool.execute(
      { query: "test" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("HTTP 401");
  });

  it("4. baidu 搜索引擎暂未实现（返回支持列表）", async () => {
    mocks.getConfig
      .mockResolvedValueOnce("key")
      .mockResolvedValueOnce("baidu");

    const result = await searchWebImagesTool.execute(
      { query: "test", source: "baidu" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("暂未实现");
    const data = result.data as { supportedEngines: string[] };
    expect(data.supportedEngines).toContain("bing");
    expect(data.supportedEngines).toContain("unsplash");
    expect(data.supportedEngines).toContain("pexels");
    expect(data.supportedEngines).toContain("google");
  });

  it("4a. Unsplash 搜索正常返回（Client-ID 鉴权）", async () => {
    mocks.getConfig
      .mockResolvedValueOnce("unsplash-key")
      .mockResolvedValueOnce("unsplash");
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(
      mockResponse({
        ok: true,
        json: async () => ({
          results: [
            {
              alt_description: "city skyline",
              description: "Urban scene",
              urls: { full: "https://img-full.png", regular: "https://img-reg.png", thumb: "https://thumb.png" },
              links: { download: "https://download.png" },
              user: { name: "Photographer A" },
              width: 4000,
              height: 3000,
            },
          ],
        }),
      }) as never,
    );

    const result = await searchWebImagesTool.execute(
      { query: "city", count: 5, source: "unsplash" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      total: number;
      items: Array<{ title: string; imageUrl: string; thumbnailUrl: string; author: string; width: number }>;
    };
    expect(data.total).toBe(1);
    expect(data.items[0].imageUrl).toBe("https://img-full.png");
    expect(data.items[0].thumbnailUrl).toBe("https://thumb.png");
    expect(data.items[0].author).toBe("Photographer A");
    expect(data.items[0].width).toBe(4000);
    // 验证 Authorization 头使用 Client-ID
    const fetchInit = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = fetchInit.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Client-ID unsplash-key");
  });

  it("4b. Pexels 搜索正常返回（Bearer-style 鉴权）", async () => {
    mocks.getConfig
      .mockResolvedValueOnce("pexels-key")
      .mockResolvedValueOnce("pexels");
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(
      mockResponse({
        ok: true,
        json: async () => ({
          photos: [
            {
              alt: "forest path",
              src: { original: "https://orig.png", medium: "https://med.png", tiny: "https://tiny.png" },
              url: "https://pexels.com/photo/1",
              width: 2000,
              height: 1500,
              photographer: "Photographer B",
            },
          ],
        }),
      }) as never,
    );

    const result = await searchWebImagesTool.execute(
      { query: "forest", source: "pexels" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      total: number;
      items: Array<{ title: string; imageUrl: string; thumbnailUrl: string; author: string }>;
    };
    expect(data.total).toBe(1);
    expect(data.items[0].imageUrl).toBe("https://orig.png");
    expect(data.items[0].thumbnailUrl).toBe("https://med.png");
    expect(data.items[0].author).toBe("Photographer B");
    // 验证 Authorization 头直接使用 key（非 Client-ID）
    const fetchInit = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = fetchInit.headers as Record<string, string>;
    expect(headers.Authorization).toBe("pexels-key");
  });

  it("4c. Google 搜索未配置 searchEngineId 时返回失败及配置指引", async () => {
    mocks.getConfig
      .mockResolvedValueOnce("google-key")
      .mockResolvedValueOnce("google")
      .mockResolvedValueOnce(null); // searchEngineId 未配置

    const result = await searchWebImagesTool.execute(
      { query: "test", source: "google" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("searchEngineId");
    const data = result.data as { configGuide: string };
    expect(data.configGuide).toContain("searchEngineId");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("4d. Google 搜索正常返回（含 cx 参数）", async () => {
    mocks.getConfig
      .mockResolvedValueOnce("google-key")
      .mockResolvedValueOnce("google")
      .mockResolvedValueOnce("test-cx-id"); // searchEngineId
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(
      mockResponse({
        ok: true,
        json: async () => ({
          items: [
            {
              title: "Result 1",
              link: "https://example.com/page",
              image: {
                contextLink: "https://img-context.png",
                thumbnailLink: "https://thumb.png",
                width: 1024,
                height: 768,
              },
            },
          ],
        }),
      }) as never,
    );

    const result = await searchWebImagesTool.execute(
      { query: "test", count: 5, source: "google" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      total: number;
      items: Array<{ title: string; imageUrl: string; thumbnailUrl: string; width: number }>;
    };
    expect(data.total).toBe(1);
    expect(data.items[0].title).toBe("Result 1");
    expect(data.items[0].imageUrl).toBe("https://img-context.png");
    expect(data.items[0].thumbnailUrl).toBe("https://thumb.png");
    expect(data.items[0].width).toBe(1024);
    // 验证 URL 包含 cx 和 key 参数
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("cx=test-cx-id");
    expect(calledUrl).toContain("key=google-key");
    expect(calledUrl).toContain("searchType=image");
  });

  it("4e. Unsplash HTTP 错误时返回失败", async () => {
    mocks.getConfig
      .mockResolvedValueOnce("unsplash-key")
      .mockResolvedValueOnce("unsplash");
    vi.mocked(fetch).mockResolvedValue(
      mockResponse({ ok: false, status: 401, statusText: "Unauthorized" }) as never,
    );

    const result = await searchWebImagesTool.execute(
      { query: "test", source: "unsplash" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("HTTP 401");
    expect(result.error).toContain("Unsplash");
  });
});

// ============================================================
// 2. search_web
// ============================================================
describe("search_web", () => {
  it("5. 未配置 searchApiKey 时返回失败", async () => {
    mocks.getConfig.mockResolvedValue(null);

    const result = await searchWebTool.execute({ query: "test" }, makeCtx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("未配置搜索 API");
  });

  it("6. Bing 网页搜索正常返回结果", async () => {
    mocks.getConfig
      .mockResolvedValueOnce("key")
      .mockResolvedValueOnce("bing");
    vi.mocked(fetch).mockResolvedValue(
      mockResponse({
        ok: true,
        json: async () => ({
          webPages: {
            value: [
              { name: "结果1", url: "https://r1.com", snippet: "摘要1" },
              { name: "结果2", url: "https://r2.com", snippet: "摘要2" },
            ],
          },
        }),
      }) as never,
    );

    const result = await searchWebTool.execute(
      { query: "AI 动画", count: 2 },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      total: number;
      items: Array<{ title: string; url: string; snippet: string }>;
    };
    expect(data.total).toBe(2);
    expect(data.items[0].title).toBe("结果1");
    expect(data.items[0].url).toBe("https://r1.com");
    expect(data.items[1].snippet).toBe("摘要2");
  });

  it("7. Bing 网页搜索 HTTP 错误时返回失败", async () => {
    mocks.getConfig
      .mockResolvedValueOnce("key")
      .mockResolvedValueOnce("bing");
    vi.mocked(fetch).mockResolvedValue(
      mockResponse({ ok: false, status: 503, statusText: "Server Error" }) as never,
    );

    const result = await searchWebTool.execute({ query: "test" }, makeCtx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("HTTP 503");
  });
});

// ============================================================
// 3. download_web_asset
// ============================================================
describe("download_web_asset", () => {
  it("8. 非 http/https URL 时返回失败（SSRF 防护）", async () => {
    const result = await downloadWebAssetTool.execute(
      { url: "file:///etc/passwd", assetType: "character", name: "test" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("http/https");
    expect(mocks.httpDownloadToFile).not.toHaveBeenCalled();
  });

  it("9. 正常下载 character 类型并入库", async () => {
    mocks.httpDownloadToFile.mockResolvedValue({ success: true });
    mocks.characterService.create.mockResolvedValue({ ok: true, value: { id: "char_new" } });

    const result = await downloadWebAssetTool.execute(
      {
        url: "https://example.com/image.png",
        assetType: "character",
        name: "下载角色",
        tags: ["参考"],
      },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      localPath: string;
      assetType: string;
      name: string;
      assetId: string;
    };
    expect(data.localPath).toContain("/assets/character/");
    expect(data.localPath).toContain("下载角色");
    expect(data.localPath).toContain(".png");
    expect(data.assetId).toBe("char_new");
    // 验证 characterService.create 被调用且传入 thumbnailPath
    const createInput = mocks.characterService.create.mock.calls[0][0];
    expect(createInput.name).toBe("下载角色");
    expect(createInput.thumbnailPath).toBe(data.localPath);
    expect(createInput.tags).toEqual(["参考"]);
  });

  it("10. 获取缓存目录失败时返回错误", async () => {
    mocks.getCacheDirectory.mockResolvedValue({ success: false, error: "磁盘满" });

    const result = await downloadWebAssetTool.execute(
      { url: "https://example.com/img.png", assetType: "prop", name: "x" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("无法获取缓存目录");
    expect(mocks.httpDownloadToFile).not.toHaveBeenCalled();
  });

  it("11. httpDownloadToFile 失败时返回错误", async () => {
    mocks.httpDownloadToFile.mockResolvedValue({ success: false, error: "网络超时" });

    const result = await downloadWebAssetTool.execute(
      { url: "https://example.com/img.png", assetType: "prop", name: "x" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("下载失败");
    expect(result.error).toContain("网络超时");
  });

  it("12. prop 类型使用 container.elementStorage.createElement 入库", async () => {
    mocks.httpDownloadToFile.mockResolvedValue({ success: true });
    mocks.elementStorage.createElement.mockResolvedValue({ id: "elem_1" });

    const result = await downloadWebAssetTool.execute(
      { url: "https://example.com/prop.png", assetType: "prop", name: "道具" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { assetId: string };
    expect(data.assetId).toBe("elem_1");
    expect(mocks.elementStorage.createElement).toHaveBeenCalledWith("prop", "道具");
  });

  it("13. 入库失败不影响下载结果（best-effort）", async () => {
    mocks.httpDownloadToFile.mockResolvedValue({ success: true });
    mocks.characterService.create.mockRejectedValue(new Error("DB error"));

    const result = await downloadWebAssetTool.execute(
      { url: "https://example.com/img.png", assetType: "character", name: "x" },
      makeCtx(),
    );

    // 下载仍成功，但 assetId 未设置
    expect(result.success).toBe(true);
    const data = result.data as { assetId: string | undefined };
    expect(data.assetId).toBeUndefined();
  });
});

// ============================================================
// 4. import_from_url
// ============================================================
describe("import_from_url", () => {
  it("14. 非 http URL 时返回失败", async () => {
    const result = await importFromUrlTool.execute(
      { url: "javascript:alert(1)", assetType: "image", name: "x" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("http/https");
  });

  it("15. 正常导入 image 类型（不强制入库）", async () => {
    mocks.httpDownloadToFile.mockResolvedValue({ success: true });

    const result = await importFromUrlTool.execute(
      {
        url: "https://example.com/photo.jpg",
        assetType: "image",
        name: "风景图",
        description: "测试描述",
        tags: ["风景"],
      },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      localPath: string;
      assetType: string;
      name: string;
      description: string;
      tags: string[];
      imported: boolean;
    };
    expect(data.localPath).toContain("/assets/image/");
    expect(data.localPath).toContain(".jpg");
    expect(data.assetType).toBe("image");
    expect(data.name).toBe("风景图");
    expect(data.description).toBe("测试描述");
    expect(data.tags).toEqual(["风景"]);
    expect(data.imported).toBe(true);
    // image 类型不调用 characterService / sceneService
    expect(mocks.characterService.create).not.toHaveBeenCalled();
    expect(mocks.sceneService.create).not.toHaveBeenCalled();
  });

  it("16. 下载失败时返回错误", async () => {
    mocks.httpDownloadToFile.mockResolvedValue({ success: false, error: "404 Not Found" });

    const result = await importFromUrlTool.execute(
      { url: "https://example.com/missing.png", assetType: "image", name: "x" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("导入失败");
    expect(result.error).toContain("404 Not Found");
  });
});

// ============================================================
// 5. fetch_web_content
// ============================================================
describe("fetch_web_content", () => {
  it("17. 非 http URL 时返回失败", async () => {
    const result = await fetchWebContentTool.execute(
      { url: "ftp://example.com" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("http/https");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("18. 正常获取并转为 markdown 格式", async () => {
    vi.mocked(fetch).mockResolvedValue(
      mockResponse({
        ok: true,
        text: async () => "<h1>标题</h1><p>正文内容</p>",
      }) as never,
    );

    const result = await fetchWebContentTool.execute(
      { url: "https://example.com/page", format: "markdown" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      url: string;
      content: string;
      format: string;
      length: number;
      truncated: boolean;
    };
    expect(data.url).toBe("https://example.com/page");
    expect(data.format).toBe("markdown");
    expect(data.content).toContain("# 标题");
    expect(data.content).toContain("正文内容");
    expect(data.truncated).toBe(false);
    expect(data.length).toBe(data.content.length);
  });

  it("19. format=text 时去除 HTML 标签", async () => {
    vi.mocked(fetch).mockResolvedValue(
      mockResponse({
        ok: true,
        text: async () => "<p>Hello</p><script>alert(1)</script>World",
      }) as never,
    );

    const result = await fetchWebContentTool.execute(
      { url: "https://example.com", format: "text" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { content: string };
    expect(data.content).toContain("Hello");
    expect(data.content).toContain("World");
    // script 内容被移除
    expect(data.content).not.toContain("alert(1)");
  });

  it("20. HTTP 错误时返回失败", async () => {
    vi.mocked(fetch).mockResolvedValue(
      mockResponse({ ok: false, status: 500, statusText: "Internal Server Error" }) as never,
    );

    const result = await fetchWebContentTool.execute(
      { url: "https://example.com/error" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("HTTP 500");
  });

  it("21. 内容超过 maxLength 时截断并标记 truncated=true", async () => {
    // maxLength 有 Math.max(..., 100) 下限保护，最小为 100
    const longText = "A".repeat(500);
    vi.mocked(fetch).mockResolvedValue(
      mockResponse({
        ok: true,
        text: async () => `<p>${longText}</p>`,
      }) as never,
    );

    const result = await fetchWebContentTool.execute(
      { url: "https://example.com", format: "text", maxLength: 100 },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { content: string; truncated: boolean; length: number };
    expect(data.truncated).toBe(true);
    expect(data.length).toBe(100);
  });
});

// ============================================================
// 6. open_in_browser
// ============================================================
describe("open_in_browser", () => {
  it("22. Electron 环境：使用 openExternal 打开", async () => {
    const openExternal = vi.fn().mockResolvedValue(undefined);
    const w = window as Window & { electronAPI?: { openExternal?: typeof openExternal } };
    w.electronAPI = { openExternal } as any;

    const result = await openInBrowserTool.execute(
      { url: "https://example.com" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { opened: boolean; method: string };
    expect(data.opened).toBe(true);
    expect(data.method).toBe("openExternal");
    expect(openExternal).toHaveBeenCalledWith("https://example.com");
  });

  it("23. Web 环境：使用 window.open 打开", async () => {
    // 不设置 electronAPI
    const originalOpen = window.open;
    const openMock = vi.fn().mockReturnValue({}) as unknown as typeof window.open;
    Object.defineProperty(window, "open", { value: openMock, configurable: true, writable: true });

    try {
      const result = await openInBrowserTool.execute(
        { url: "https://example.com" },
        makeCtx(),
      );

      expect(result.success).toBe(true);
      const data = result.data as { opened: boolean; method: string };
      expect(data.opened).toBe(true);
      expect(data.method).toBe("window.open");
      expect(openMock).toHaveBeenCalledWith("https://example.com", "_blank");
    } finally {
      Object.defineProperty(window, "open", { value: originalOpen, configurable: true, writable: true });
    }
  });

  it("24. window.open 被拦截时返回失败", async () => {
    const originalOpen = window.open;
    Object.defineProperty(window, "open", {
      value: vi.fn().mockReturnValue(null),
      configurable: true,
      writable: true,
    });

    try {
      const result = await openInBrowserTool.execute(
        { url: "https://example.com" },
        makeCtx(),
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("拦截");
      const data = result.data as { opened: boolean };
      expect(data.opened).toBe(false);
    } finally {
      Object.defineProperty(window, "open", { value: originalOpen, configurable: true, writable: true });
    }
  });
});

// ============================================================
// 7. bookmark_resource
// ============================================================
describe("bookmark_resource", () => {
  it("25. 正常收藏资源（追加到已有列表）", async () => {
    mocks.getConfig.mockResolvedValue([
      { url: "https://old.com", title: "旧收藏", createdAt: 1000 },
    ]);
    mocks.setConfig.mockResolvedValue(true);

    const result = await bookmarkResourceTool.execute(
      {
        url: "https://new.com",
        title: "新收藏",
        description: "描述",
        tags: ["参考"],
        category: "reference",
      },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { bookmarked: boolean; total: number };
    expect(data.bookmarked).toBe(true);
    expect(data.total).toBe(2);
    // 验证 setConfig 被调用且包含新收藏
    const savedBookmarks = mocks.setConfig.mock.calls[0][1] as Array<{ url: string; title: string }>;
    expect(savedBookmarks).toHaveLength(2);
    expect(savedBookmarks[1].url).toBe("https://new.com");
    expect(savedBookmarks[1].title).toBe("新收藏");
  });

  it("26. setConfig 返回 false 时返回失败", async () => {
    mocks.getConfig.mockResolvedValue([]);
    mocks.setConfig.mockResolvedValue(false);

    const result = await bookmarkResourceTool.execute(
      { url: "https://x.com", title: "x" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("保存收藏失败");
  });

  it("27. 首次收藏时 getConfig 返回非数组（按空列表处理）", async () => {
    mocks.getConfig.mockResolvedValue(null);
    mocks.setConfig.mockResolvedValue(true);

    const result = await bookmarkResourceTool.execute(
      { url: "https://first.com", title: "首次" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { total: number };
    expect(data.total).toBe(1);
  });
});

// ============================================================
// 8. list_bookmarks
// ============================================================
describe("list_bookmarks", () => {
  it("28. 列出全部收藏（按 createdAt 倒序）", async () => {
    mocks.getConfig.mockResolvedValue([
      { url: "https://a.com", title: "A", createdAt: 100 },
      { url: "https://b.com", title: "B", createdAt: 300 },
      { url: "https://c.com", title: "C", createdAt: 200 },
    ]);

    const result = await listBookmarksTool.execute({}, makeCtx());

    expect(result.success).toBe(true);
    const data = result.data as {
      total: number;
      items: Array<{ title: string; createdAt: number }>;
    };
    expect(data.total).toBe(3);
    // 倒序：B(300) > C(200) > A(100)
    expect(data.items.map((i) => i.title)).toEqual(["B", "C", "A"]);
  });

  it("29. 按分类过滤", async () => {
    mocks.getConfig.mockResolvedValue([
      { url: "https://a.com", title: "A", category: "reference", createdAt: 100 },
      { url: "https://b.com", title: "B", category: "tutorial", createdAt: 200 },
      { url: "https://c.com", title: "C", category: "reference", createdAt: 300 },
    ]);

    const result = await listBookmarksTool.execute(
      { category: "reference" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { total: number; items: Array<{ title: string }> };
    expect(data.total).toBe(2);
    expect(data.items.map((i) => i.title)).toEqual(["C", "A"]);
  });

  it("30. 按标签过滤", async () => {
    mocks.getConfig.mockResolvedValue([
      { url: "https://a.com", title: "A", tags: ["灵感", "参考"], createdAt: 100 },
      { url: "https://b.com", title: "B", tags: ["教程"], createdAt: 200 },
    ]);

    const result = await listBookmarksTool.execute(
      { tag: "灵感" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { total: number; items: Array<{ title: string }> };
    expect(data.total).toBe(1);
    expect(data.items[0].title).toBe("A");
  });

  it("31. 无收藏时返回空列表", async () => {
    mocks.getConfig.mockResolvedValue(null);

    const result = await listBookmarksTool.execute({}, makeCtx());

    expect(result.success).toBe(true);
    const data = result.data as { total: number; items: unknown[] };
    expect(data.total).toBe(0);
    expect(data.items).toEqual([]);
  });
});

// ============================================================
// 导出完整性
// ============================================================
describe("webTools 导出", () => {
  it("32. 导出 8 个工具", () => {
    expect(webTools).toHaveLength(8);
    expect(webTools).toContain(searchWebImagesTool);
    expect(webTools).toContain(searchWebTool);
    expect(webTools).toContain(downloadWebAssetTool);
    expect(webTools).toContain(importFromUrlTool);
    expect(webTools).toContain(fetchWebContentTool);
    expect(webTools).toContain(openInBrowserTool);
    expect(webTools).toContain(bookmarkResourceTool);
    expect(webTools).toContain(listBookmarksTool);
  });
});
