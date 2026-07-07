import { describe, it, expect, beforeEach } from "vitest";
import { toolRegistry } from "../tool-registry";
import type { ToolImpl, ToolDomain } from "../../domain/types";
import { TOOL_TIMEOUTS } from "../tool-executor";

function makeTool(name: string, domain: ToolDomain = "asset"): ToolImpl {
  return {
    def: {
      type: "function",
      function: {
        name,
        description: `Test tool ${name}`,
        parameters: { type: "object", properties: {} },
      },
    },
    domain,
    timeoutMs: TOOL_TIMEOUTS.query,
    async execute() {
      return { success: true, data: { name } };
    },
  };
}

describe("ToolRegistry", () => {
  beforeEach(() => {
    toolRegistry.clear();
  });

  describe("register / get / has", () => {
    it("注册单个工具后能 get 到", () => {
      const tool = makeTool("foo");
      toolRegistry.register(tool);
      const got = toolRegistry.get("foo");
      expect(got).toBeDefined();
      expect(got).toBe(tool);
    });

    it("注册后 has 返回 true", () => {
      toolRegistry.register(makeTool("bar"));
      expect(toolRegistry.has("bar")).toBe(true);
    });

    it("未注册的工具 get 返回 undefined", () => {
      expect(toolRegistry.get("not-exists")).toBeUndefined();
    });

    it("未注册的工具 has 返回 false", () => {
      expect(toolRegistry.has("not-exists")).toBe(false);
    });

    it("空注册表时 get 返回 undefined", () => {
      expect(toolRegistry.get("anything")).toBeUndefined();
    });

    it("空注册表时 has 返回 false", () => {
      expect(toolRegistry.has("anything")).toBe(false);
    });
  });

  describe("registerAll（批量注册）", () => {
    it("批量注册多个工具", () => {
      const tools = [makeTool("a"), makeTool("b"), makeTool("c")];
      toolRegistry.registerAll(tools);
      expect(toolRegistry.get("a")).toBe(tools[0]);
      expect(toolRegistry.get("b")).toBe(tools[1]);
      expect(toolRegistry.get("c")).toBe(tools[2]);
    });

    it("size 返回正确数量", () => {
      toolRegistry.registerAll([makeTool("a"), makeTool("b"), makeTool("c")]);
      expect(toolRegistry.size()).toBe(3);
    });

    it("每个工具都能 get 到", () => {
      const names = ["alpha", "beta", "gamma"];
      toolRegistry.registerAll(names.map((n) => makeTool(n)));
      for (const name of names) {
        expect(toolRegistry.get(name)).toBeDefined();
        expect(toolRegistry.get(name)?.def.function.name).toBe(name);
      }
    });

    it("空数组批量注册不改变 size", () => {
      toolRegistry.registerAll([]);
      expect(toolRegistry.size()).toBe(0);
    });

    it("registerAll 后 has 对每个工具都返回 true", () => {
      toolRegistry.registerAll([makeTool("a"), makeTool("b")]);
      expect(toolRegistry.has("a")).toBe(true);
      expect(toolRegistry.has("b")).toBe(true);
    });
  });

  describe("命名冲突检测", () => {
    it("注册同名工具应抛出错误", () => {
      toolRegistry.register(makeTool("dup"));
      expect(() => toolRegistry.register(makeTool("dup"))).toThrow();
    });

    it("错误消息包含工具名", () => {
      toolRegistry.register(makeTool("dup-name"));
      try {
        toolRegistry.register(makeTool("dup-name"));
        expect.fail("应抛出错误");
      } catch (e) {
        expect(e).toBeInstanceOf(Error);
        expect((e as Error).message).toContain("dup-name");
        expect((e as Error).message).toContain("already registered");
      }
    });

    it("registerAll 中遇到重复工具名也抛错", () => {
      expect(() =>
        toolRegistry.registerAll([makeTool("x"), makeTool("x")]),
      ).toThrow();
    });

    it("与已注册工具同名时抛错且不污染已有数据", () => {
      const original = makeTool("keep");
      toolRegistry.register(original);
      expect(() => toolRegistry.register(makeTool("keep"))).toThrow();
      expect(toolRegistry.size()).toBe(1);
      expect(toolRegistry.get("keep")).toBe(original);
    });
  });

  describe("getToolDefs", () => {
    it("返回所有工具定义（ToolDef 格式）", () => {
      toolRegistry.registerAll([makeTool("a"), makeTool("b")]);
      const defs = toolRegistry.getToolDefs();
      expect(defs).toHaveLength(2);
      for (const def of defs) {
        expect(def.type).toBe("function");
        expect(def.function).toBeDefined();
        expect(typeof def.function.name).toBe("string");
        expect(typeof def.function.description).toBe("string");
        expect(def.function.parameters).toBeDefined();
      }
    });

    it("传入 filter 参数时只返回匹配的工具", () => {
      toolRegistry.registerAll([makeTool("a"), makeTool("b"), makeTool("c")]);
      const defs = toolRegistry.getToolDefs(["a", "c"]);
      expect(defs).toHaveLength(2);
      const names = defs.map((d) => d.function.name);
      expect(names).toContain("a");
      expect(names).toContain("c");
      expect(names).not.toContain("b");
    });

    it("filter 包含未注册的名字时只返回已注册的", () => {
      toolRegistry.registerAll([makeTool("a")]);
      const defs = toolRegistry.getToolDefs(["a", "not-exists"]);
      expect(defs).toHaveLength(1);
      expect(defs[0].function.name).toBe("a");
    });

    it("filter 为空数组时返回全部", () => {
      toolRegistry.registerAll([makeTool("a"), makeTool("b")]);
      const defs = toolRegistry.getToolDefs([]);
      expect(defs).toHaveLength(2);
    });

    it("filter 为 undefined 时返回全部", () => {
      toolRegistry.registerAll([makeTool("a"), makeTool("b")]);
      const defs = toolRegistry.getToolDefs(undefined);
      expect(defs).toHaveLength(2);
    });

    it("空注册表时返回空数组", () => {
      expect(toolRegistry.getToolDefs()).toEqual([]);
    });
  });

  describe("getByDomain", () => {
    it("按业务域过滤返回工具列表", () => {
      toolRegistry.register(makeTool("a1", "asset"));
      toolRegistry.register(makeTool("a2", "asset"));
      toolRegistry.register(makeTool("v1", "video"));
      const assets = toolRegistry.getByDomain("asset");
      expect(assets).toHaveLength(2);
      expect(assets.every((t) => t.domain === "asset")).toBe(true);
      const videos = toolRegistry.getByDomain("video");
      expect(videos).toHaveLength(1);
      expect(videos[0].def.function.name).toBe("v1");
    });

    it("未注册的域返回空数组", () => {
      toolRegistry.register(makeTool("a1", "asset"));
      expect(toolRegistry.getByDomain("video")).toEqual([]);
    });

    it("空注册表时返回空数组", () => {
      expect(toolRegistry.getByDomain("asset")).toEqual([]);
    });

    it("不同业务域互不干扰", () => {
      toolRegistry.register(makeTool("a", "asset"));
      toolRegistry.register(makeTool("s", "story"));
      toolRegistry.register(makeTool("v", "video"));
      expect(toolRegistry.getByDomain("asset")).toHaveLength(1);
      expect(toolRegistry.getByDomain("story")).toHaveLength(1);
      expect(toolRegistry.getByDomain("video")).toHaveLength(1);
    });
  });

  describe("getAllNames", () => {
    it("返回所有工具名数组", () => {
      toolRegistry.registerAll([makeTool("a"), makeTool("b"), makeTool("c")]);
      const names = toolRegistry.getAllNames();
      expect(names).toHaveLength(3);
      expect(names).toContain("a");
      expect(names).toContain("b");
      expect(names).toContain("c");
    });

    it("长度等于 size", () => {
      toolRegistry.registerAll([makeTool("x"), makeTool("y")]);
      expect(toolRegistry.getAllNames().length).toBe(toolRegistry.size());
    });

    it("空注册表时返回空数组", () => {
      expect(toolRegistry.getAllNames()).toEqual([]);
    });

    it("返回的数组可修改而不影响注册表内部状态", () => {
      toolRegistry.register(makeTool("a"));
      const names = toolRegistry.getAllNames();
      names.push("injected");
      expect(toolRegistry.has("injected")).toBe(false);
      expect(toolRegistry.size()).toBe(1);
    });
  });

  describe("getToolDescriptions", () => {
    it("返回 { name, description, domain } 数组", () => {
      toolRegistry.register(makeTool("a", "asset"));
      const descs = toolRegistry.getToolDescriptions();
      expect(descs).toHaveLength(1);
      expect(descs[0]).toEqual({
        name: "a",
        description: "Test tool a",
        domain: "asset",
      });
    });

    it("传入 filter 时只返回匹配的", () => {
      toolRegistry.registerAll([makeTool("a"), makeTool("b"), makeTool("c")]);
      const descs = toolRegistry.getToolDescriptions(["a", "c"]);
      expect(descs).toHaveLength(2);
      const names = descs.map((d) => d.name);
      expect(names).toContain("a");
      expect(names).toContain("c");
      expect(names).not.toContain("b");
    });

    it("filter 包含未注册名字时只返回已注册的", () => {
      toolRegistry.register(makeTool("a"));
      const descs = toolRegistry.getToolDescriptions(["a", "missing"]);
      expect(descs).toHaveLength(1);
      expect(descs[0].name).toBe("a");
    });

    it("不传 filter 时返回全部", () => {
      toolRegistry.registerAll([makeTool("a"), makeTool("b")]);
      const descs = toolRegistry.getToolDescriptions();
      expect(descs).toHaveLength(2);
    });

    // 注意：getToolDescriptions 与 getToolDefs 行为不一致。
    // getToolDefs 显式判断 filter.length === 0 时返回全部；
    // getToolDescriptions 用 truthiness 判断 filter，空数组 [] 是 truthy，
    // 因此会进入 filter.map 分支，返回空数组。
    it("filter 为空数组时返回空数组（与 getToolDefs 行为不同）", () => {
      toolRegistry.registerAll([makeTool("a"), makeTool("b")]);
      const descs = toolRegistry.getToolDescriptions([]);
      expect(descs).toHaveLength(0);
    });

    it("返回的 description 与工具定义一致", () => {
      toolRegistry.register(makeTool("alpha", "story"));
      const descs = toolRegistry.getToolDescriptions();
      expect(descs[0].description).toBe("Test tool alpha");
      expect(descs[0].domain).toBe("story");
    });

    it("空注册表时返回空数组", () => {
      expect(toolRegistry.getToolDescriptions()).toEqual([]);
    });
  });

  describe("clear", () => {
    it("清空后 size 为 0", () => {
      toolRegistry.registerAll([makeTool("a"), makeTool("b")]);
      expect(toolRegistry.size()).toBe(2);
      toolRegistry.clear();
      expect(toolRegistry.size()).toBe(0);
    });

    it("清空后 get 返回 undefined", () => {
      toolRegistry.register(makeTool("a"));
      toolRegistry.clear();
      expect(toolRegistry.get("a")).toBeUndefined();
    });

    it("清空后 has 返回 false", () => {
      toolRegistry.register(makeTool("a"));
      toolRegistry.clear();
      expect(toolRegistry.has("a")).toBe(false);
    });

    it("清空后 getAllNames 返回空数组", () => {
      toolRegistry.register(makeTool("a"));
      toolRegistry.clear();
      expect(toolRegistry.getAllNames()).toEqual([]);
    });

    it("清空后 getByDomain 返回空数组", () => {
      toolRegistry.register(makeTool("a", "asset"));
      toolRegistry.clear();
      expect(toolRegistry.getByDomain("asset")).toEqual([]);
    });

    it("清空后可重新注册同名工具", () => {
      toolRegistry.register(makeTool("a"));
      toolRegistry.clear();
      expect(() => toolRegistry.register(makeTool("a"))).not.toThrow();
      expect(toolRegistry.has("a")).toBe(true);
    });

    it("多次 clear 是幂等的", () => {
      toolRegistry.clear();
      toolRegistry.clear();
      expect(toolRegistry.size()).toBe(0);
    });
  });
});
