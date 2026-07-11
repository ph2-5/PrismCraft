/**
 * 工具插件加载器测试（P3 工具插件化）
 *
 * 测试覆盖：
 * - 模板替换（renderTemplate / renderObject）
 * - URL 安全校验（validateUrl，SSRF 防护）
 * - 配置校验（validateConfig）
 * - 路径提取（extractPath）
 * - 加载/卸载插件（loadToolPlugin / unloadPlugin）
 * - 冲突检测（与内置工具重名时跳过）
 * - 前缀机制（prefix）
 * - 三种 action 执行（text-template / builtin-mirror / http-call）
 * - 幂等加载（ensureToolPluginsLoaded）
 *
 * 注意：file-http 相关函数（getCacheDirectory/readFile/writeFile/getConfig/setConfig）
 * 在测试中通过 vi.mock 替换，避免真实 I/O。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { toolRegistry } from "../tool-registry";
import {
  loadToolPlugin,
  unloadPlugin,
  listLoadedPlugins,
  _resetToolPlugins,
  _getLoadedPluginConfig,
  _testUtils,
} from "../tool-plugin-loader";
import type { ToolPluginConfig } from "../../domain/tool-plugin-types";

// ============= mock file-http =============
// 避免真实 HTTP/IPC 调用，测试中提供内存版实现

const mockStorage = new Map<string, unknown>();

vi.mock("@/shared/file-http", () => ({
  getCacheDirectory: vi.fn().mockResolvedValue({ success: true, path: "/mock-cache" }),
  readFile: vi.fn().mockImplementation(async (filePath: string) => {
    const data = mockStorage.get(filePath);
    if (data === undefined) return { success: false, error: "not found" };
    return { success: true, data: new TextEncoder().encode(JSON.stringify(data)) };
  }),
  writeFile: vi.fn().mockImplementation(async (filePath: string, content: string) => {
    mockStorage.set(filePath, JSON.parse(content));
    return { success: true };
  }),
  deleteFile: vi.fn().mockImplementation(async (filePath: string) => {
    mockStorage.delete(filePath);
    return true;
  }),
  getConfig: vi.fn().mockImplementation(async (key: string) => mockStorage.get(key) ?? null),
  setConfig: vi.fn().mockImplementation(async (key: string, value: unknown) => {
    mockStorage.set(key, value);
    return true;
  }),
}));

// ============= 测试工具 =============

function makeTextTemplatePlugin(
  id: string,
  tools: Array<{ name: string; template: string; description?: string }>,
  prefix?: string,
): ToolPluginConfig {
  return {
    id,
    version: "1.0.0",
    displayName: `测试插件 ${id}`,
    description: "测试用",
    author: "test",
    prefix,
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description ?? `测试工具 ${t.name}`,
      domain: "plugin" as const,
      parameters: {
        type: "object",
        properties: {
          input: { type: "string", description: "输入" },
        },
      },
      action: {
        type: "text-template" as const,
        template: t.template,
      },
    })),
  };
}

function makeHttpCallPlugin(
  id: string,
  url: string,
  options: { method?: "GET" | "POST"; responsePath?: string } = {},
): ToolPluginConfig {
  return {
    id,
    version: "1.0.0",
    displayName: `HTTP 插件 ${id}`,
    tools: [
      {
        name: "fetch_data",
        description: "获取数据",
        domain: "plugin",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "查询词" },
          },
          required: ["query"],
        },
        action: {
          type: "http-call",
          url,
          method: options.method ?? "GET",
          responsePath: options.responsePath,
        },
      },
    ],
  };
}

function makeBuiltinMirrorPlugin(
  id: string,
  targetTool: string,
  presetArgs?: Record<string, unknown>,
): ToolPluginConfig {
  return {
    id,
    version: "1.0.0",
    displayName: `镜像插件 ${id}`,
    tools: [
      {
        name: "mirror",
        description: "镜像工具",
        domain: "plugin",
        parameters: { type: "object", properties: {} },
        action: {
          type: "builtin-mirror",
          targetTool,
          presetArgs,
        },
      },
    ],
  };
}

// ============= 测试用例 =============

describe("ToolPluginLoader", () => {
  beforeEach(() => {
    toolRegistry.clear();
    _resetToolPlugins();
    mockStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    toolRegistry.clear();
    _resetToolPlugins();
  });

  // ============= 模板替换 =============

  describe("renderTemplate", () => {
    it("替换简单变量", () => {
      expect(_testUtils.renderTemplate("hello {{name}}", { name: "world" })).toBe("hello world");
    });

    it("多个变量替换", () => {
      expect(
        _testUtils.renderTemplate("{{a}}-{{b}}-{{c}}", { a: "x", b: "y", c: "z" }),
      ).toBe("x-y-z");
    });

    it("未找到的变量替换为空字符串", () => {
      expect(_testUtils.renderTemplate("hello {{missing}}", {})).toBe("hello ");
    });

    it("null/undefined 值替换为空字符串", () => {
      expect(_testUtils.renderTemplate("a={{x}} b={{y}}", { x: null, y: undefined })).toBe(
        "a= b=",
      );
    });

    it("数字值转换为字符串", () => {
      expect(_testUtils.renderTemplate("count={{n}}", { n: 42 })).toBe("count=42");
    });

    it("无变量的字符串原样返回", () => {
      expect(_testUtils.renderTemplate("static text", {})).toBe("static text");
    });
  });

  describe("renderObject", () => {
    it("递归渲染对象中的字符串", () => {
      const result = _testUtils.renderObject(
        { a: "{{x}}", b: { c: "{{y}}" }, d: ["{{z}}", "static"] },
        { x: "1", y: "2", z: "3" },
      );
      expect(result).toEqual({ a: "1", b: { c: "2" }, d: ["3", "static"] });
    });

    it("非字符串值原样返回", () => {
      const result = _testUtils.renderObject({ n: 42, b: true, arr: [1, 2] }, {});
      expect(result).toEqual({ n: 42, b: true, arr: [1, 2] });
    });

    it("null/undefined 原样返回", () => {
      expect(_testUtils.renderObject(null, {})).toBeNull();
      expect(_testUtils.renderObject(undefined, {})).toBeUndefined();
    });
  });

  // ============= URL 安全校验 =============

  describe("validateUrl (SSRF 防护)", () => {
    it("合法 https URL 通过", () => {
      expect(_testUtils.validateUrl("https://api.example.com/data").ok).toBe(true);
    });

    it("合法 http URL 通过", () => {
      expect(_testUtils.validateUrl("http://api.example.com/data").ok).toBe(true);
    });

    it("非 http(s) 协议被拒绝", () => {
      const result = _testUtils.validateUrl("file:///etc/passwd");
      expect(result.ok).toBe(false);
      expect(result.error).toContain("http");
    });

    it("localhost 被拒绝", () => {
      const result = _testUtils.validateUrl("http://localhost:3000/api");
      expect(result.ok).toBe(false);
      expect(result.error).toContain("localhost");
    });

    it("127.0.0.1 被拒绝", () => {
      const result = _testUtils.validateUrl("http://127.0.0.1/api");
      expect(result.ok).toBe(false);
      expect(result.error).toContain("内网");
    });

    it("10.x 内网 IP 被拒绝", () => {
      const result = _testUtils.validateUrl("http://10.0.0.1/api");
      expect(result.ok).toBe(false);
      expect(result.error).toContain("内网");
    });

    it("192.168.x 内网 IP 被拒绝", () => {
      const result = _testUtils.validateUrl("http://192.168.1.1/api");
      expect(result.ok).toBe(false);
    });

    it("172.16-31.x 内网 IP 被拒绝", () => {
      expect(_testUtils.validateUrl("http://172.16.0.1/api").ok).toBe(false);
      expect(_testUtils.validateUrl("http://172.31.255.255/api").ok).toBe(false);
      // 172.32 不是内网
      expect(_testUtils.validateUrl("http://172.32.0.1/api").ok).toBe(true);
    });

    it("无效 URL 被拒绝", () => {
      const result = _testUtils.validateUrl("not-a-url");
      expect(result.ok).toBe(false);
      expect(result.error).toContain("无效");
    });
  });

  // ============= 配置校验 =============

  describe("validateConfig", () => {
    it("合法配置通过", () => {
      const result = _testUtils.validateConfig(makeTextTemplatePlugin("test", [
        { name: "tool1", template: "hello" },
      ]));
      expect(result.ok).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("id 不合法时报错", () => {
      const config = makeTextTemplatePlugin("Test_ID", [{ name: "t", template: "x" }]);
      const result = _testUtils.validateConfig(config);
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.includes("id"))).toBe(true);
    });

    it("tools 为空数组时报错", () => {
      const config = makeTextTemplatePlugin("test", []);
      const result = _testUtils.validateConfig(config);
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.includes("非空数组"))).toBe(true);
    });

    it("工具名不合法时报错", () => {
      const config = makeTextTemplatePlugin("test", [
        { name: "123invalid", template: "x" },
      ]);
      const result = _testUtils.validateConfig(config);
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.includes("name"))).toBe(true);
    });

    it("action.type 不合法时报错", () => {
      const config: unknown = {
        id: "test",
        version: "1.0.0",
        displayName: "test",
        tools: [
          {
            name: "t",
            description: "test",
            domain: "plugin",
            parameters: {},
            action: { type: "unknown-type" },
          },
        ],
      };
      const result = _testUtils.validateConfig(config);
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.includes("action.type"))).toBe(true);
    });

    it("配置非对象时报错", () => {
      const result = _testUtils.validateConfig("not-an-object");
      expect(result.ok).toBe(false);
      expect(result.errors[0]).toContain("对象");
    });
  });

  // ============= 路径提取 =============

  describe("extractPath", () => {
    it("提取嵌套路径", () => {
      const data = { a: { b: { c: 42 } } };
      expect(_testUtils.extractPath(data, "a.b.c")).toBe(42);
    });

    it("提取数组元素", () => {
      const data = { results: [1, 2, 3] };
      expect(_testUtils.extractPath(data, "results.0")).toBe(1);
    });

    it("路径不存在时返回 undefined", () => {
      const data = { a: { b: 1 } };
      expect(_testUtils.extractPath(data, "a.c")).toBeUndefined();
    });

    it("空路径返回原数据", () => {
      const data = { a: 1 };
      expect(_testUtils.extractPath(data, "")).toBe(data);
    });
  });

  // ============= 加载/卸载插件 =============

  describe("loadToolPlugin", () => {
    it("加载单个插件成功", async () => {
      const plugin = makeTextTemplatePlugin("my-plugin", [
        { name: "greet", template: "hello {{input}}" },
      ]);
      const result = await loadToolPlugin(plugin);
      expect(result.pluginId).toBe("my-plugin");
      expect(result.registeredCount).toBe(1);
      expect(result.skipped).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
      expect(toolRegistry.has("greet")).toBe(true);
    });

    it("加载多个工具的插件", async () => {
      const plugin = makeTextTemplatePlugin("multi", [
        { name: "tool_a", template: "a" },
        { name: "tool_b", template: "b" },
        { name: "tool_c", template: "c" },
      ]);
      const result = await loadToolPlugin(plugin);
      expect(result.registeredCount).toBe(3);
      expect(toolRegistry.size()).toBe(3);
    });

    it("前缀机制：工具名加前缀", async () => {
      const plugin = makeTextTemplatePlugin(
        "prefixed",
        [{ name: "search", template: "result" }],
        "wiki_",
      );
      await loadToolPlugin(plugin);
      expect(toolRegistry.has("wiki_search")).toBe(true);
      expect(toolRegistry.has("search")).toBe(false);
    });

    it("冲突检测：与已注册工具重名时跳过", async () => {
      // 先注册一个内置工具
      await loadToolPlugin(makeTextTemplatePlugin("plugin1", [
        { name: "shared_tool", template: "v1" },
      ]));
      // 再加载另一个插件包含同名工具
      const result = await loadToolPlugin(makeTextTemplatePlugin("plugin2", [
        { name: "shared_tool", template: "v2" },
        { name: "unique_tool", template: "v3" },
      ]));
      expect(result.registeredCount).toBe(1); // unique_tool
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0]?.name).toBe("shared_tool");
    });

    it("非法配置时不注册任何工具", async () => {
      const badConfig: unknown = {
        id: "bad",
        version: "1.0.0",
        displayName: "bad",
        tools: [], // 空 tools
      };
      const result = await loadToolPlugin(badConfig as ToolPluginConfig);
      expect(result.registeredCount).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("重复加载同插件先卸载旧的", async () => {
      // 第一次加载
      await loadToolPlugin(makeTextTemplatePlugin("same-id", [
        { name: "tool_v1", template: "v1" },
      ]));
      expect(toolRegistry.has("tool_v1")).toBe(true);
      expect(toolRegistry.size()).toBe(1);

      // 第二次加载同 id 不同工具
      await loadToolPlugin(makeTextTemplatePlugin("same-id", [
        { name: "tool_v2", template: "v2" },
      ]));
      expect(toolRegistry.has("tool_v1")).toBe(false); // 旧的被卸载
      expect(toolRegistry.has("tool_v2")).toBe(true);
      expect(toolRegistry.size()).toBe(1);
    });
  });

  describe("unloadPlugin", () => {
    it("卸载已加载的插件", async () => {
      await loadToolPlugin(makeTextTemplatePlugin("to-unload", [
        { name: "tool1", template: "x" },
        { name: "tool2", template: "y" },
      ]));
      expect(toolRegistry.size()).toBe(2);

      const result = unloadPlugin("to-unload");
      expect(result).toBe(true);
      expect(toolRegistry.size()).toBe(0);
      expect(toolRegistry.has("tool1")).toBe(false);
      expect(toolRegistry.has("tool2")).toBe(false);
    });

    it("卸载不存在的插件返回 false", () => {
      const result = unloadPlugin("never-loaded");
      expect(result).toBe(false);
    });

    it("卸载后 listLoadedPlugins 不再包含", async () => {
      await loadToolPlugin(makeTextTemplatePlugin("list-test", [
        { name: "t", template: "x" },
      ]));
      expect(listLoadedPlugins()).toHaveLength(1);

      unloadPlugin("list-test");
      expect(listLoadedPlugins()).toHaveLength(0);
    });
  });

  describe("listLoadedPlugins", () => {
    it("列出已加载插件的元信息", async () => {
      await loadToolPlugin(makeTextTemplatePlugin("p1", [
        { name: "t1", template: "x" },
      ]));
      await loadToolPlugin(makeTextTemplatePlugin("p2", [
        { name: "t2", template: "y" },
      ]));

      const list = listLoadedPlugins();
      expect(list).toHaveLength(2);
      const ids = list.map((p) => p.pluginId).sort();
      expect(ids).toEqual(["p1", "p2"]);
      const p1 = list.find((p) => p.pluginId === "p1");
      expect(p1?.toolNames).toEqual(["t1"]);
      expect(p1?.displayName).toBe("测试插件 p1");
    });
  });

  // ============= Action 执行 =============

  describe("text-template action 执行", () => {
    it("模板替换并返回文本", async () => {
      await loadToolPlugin(makeTextTemplatePlugin("tpl-test", [
        { name: "greet", template: "你好，{{input}}！" },
      ]));
      const tool = toolRegistry.get("greet");
      expect(tool).toBeDefined();
      const result = await tool!.execute({ input: "世界" }, { sessionId: "test" });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ text: "你好，世界！" });
    });

    it("缺少参数时替换为空", async () => {
      await loadToolPlugin(makeTextTemplatePlugin("tpl-missing", [
        { name: "echo", template: "[{{x}}]" },
      ]));
      const tool = toolRegistry.get("echo");
      const result = await tool!.execute({}, { sessionId: "test" });
      expect(result.data).toEqual({ text: "[]" });
    });
  });

  describe("builtin-mirror action 执行", () => {
    it("调用目标内置工具", async () => {
      // 先注册一个目标工具
      await loadToolPlugin(makeTextTemplatePlugin("target", [
        { name: "original_tool", template: "原始响应: {{input}}" },
      ]));
      // 再注册镜像工具
      await loadToolPlugin(makeBuiltinMirrorPlugin("mirror", "original_tool"));

      const mirror = toolRegistry.get("mirror");
      expect(mirror).toBeDefined();
      const result = await mirror!.execute({ input: "test" }, { sessionId: "test" });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ text: "原始响应: test" });
    });

    it("目标工具不存在时返回错误", async () => {
      await loadToolPlugin(makeBuiltinMirrorPlugin("bad-mirror", "nonexistent_tool"));
      const mirror = toolRegistry.get("mirror");
      const result = await mirror!.execute({}, { sessionId: "test" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("不存在");
    });

    it("presetArgs 作为默认值，args 优先", async () => {
      // 目标工具接收一个参数
      await loadToolPlugin(makeTextTemplatePlugin("target2", [
        { name: "echo2", template: "val={{p}}" },
      ]));
      // 镜像预设 p=default
      await loadToolPlugin(makeBuiltinMirrorPlugin("mirror2", "echo2", { p: "default" }));

      const mirror = toolRegistry.get("mirror");
      // 不传 p → 用预设
      const r1 = await mirror!.execute({}, { sessionId: "test" });
      expect(r1.data).toEqual({ text: "val=default" });
      // 传 p → 覆盖预设
      const r2 = await mirror!.execute({ p: "override" }, { sessionId: "test" });
      expect(r2.data).toEqual({ text: "val=override" });
    });
  });

  describe("http-call action 执行", () => {
    let originalFetch: typeof globalThis.fetch;
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
      fetchMock = vi.fn();
      globalThis.fetch = fetchMock as unknown as typeof fetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it("成功调用外部 API 并返回 JSON", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: { result: "success" } }),
      });

      await loadToolPlugin(
        makeHttpCallPlugin("http-test", "https://api.example.com/data", {
          responsePath: "data.result",
        }),
      );
      const tool = toolRegistry.get("fetch_data");
      const result = await tool!.execute({ query: "test" }, { sessionId: "s" });
      expect(result.success).toBe(true);
      expect(result.data).toBe("success");
    });

    it("HTTP 错误状态返回失败", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      await loadToolPlugin(makeHttpCallPlugin("http-err", "https://api.example.com/missing"));
      const tool = toolRegistry.get("fetch_data");
      const result = await tool!.execute({ query: "x" }, { sessionId: "s" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("404");
    });

    it("SSRF 内网 IP 被拒绝", async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
      await loadToolPlugin(makeHttpCallPlugin("ssrf-test", "http://127.0.0.1/secret"));
      const tool = toolRegistry.get("fetch_data");
      const result = await tool!.execute({ query: "x" }, { sessionId: "s" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("内网");
      // fetch 不应被调用（SSRF 校验在 fetch 之前）
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("模板替换 URL 中的参数", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      });

      // URL 含 {{query}} 模板
      await loadToolPlugin(
        makeHttpCallPlugin("url-tpl", "https://api.example.com/search?q={{query}}"),
      );
      const tool = toolRegistry.get("fetch_data");
      await tool!.execute({ query: "hello" }, { sessionId: "s" });
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("q=hello"),
        expect.anything(),
      );
    });
  });

  // ============= ToolRegistry 扩展 =============

  describe("ToolRegistry.unregister (P3 扩展)", () => {
    it("卸载已注册工具返回 true", () => {
      const tool = {
        def: { type: "function" as const, function: { name: "temp_tool", description: "t", parameters: {} } },
        domain: "plugin" as const,
        async execute() {
          return { success: true };
        },
      };
      toolRegistry.register(tool);
      expect(toolRegistry.has("temp_tool")).toBe(true);
      expect(toolRegistry.unregister("temp_tool")).toBe(true);
      expect(toolRegistry.has("temp_tool")).toBe(false);
    });

    it("卸载不存在的工具返回 false", () => {
      expect(toolRegistry.unregister("nonexistent")).toBe(false);
    });
  });

  // ============= 内部状态查询 =============

  describe("_getLoadedPluginConfig", () => {
    it("返回已加载插件的配置", async () => {
      const plugin = makeTextTemplatePlugin("cfg-test", [
        { name: "t", template: "x" },
      ]);
      await loadToolPlugin(plugin);
      const cfg = _getLoadedPluginConfig("cfg-test");
      expect(cfg).toBeDefined();
      expect(cfg?.id).toBe("cfg-test");
      expect(cfg?.tools).toHaveLength(1);
    });

    it("未加载的插件返回 undefined", () => {
      expect(_getLoadedPluginConfig("never")).toBeUndefined();
    });
  });
});
