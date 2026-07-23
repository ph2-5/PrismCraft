/**
 * SpecialistRegistry 单元测试（agent-specialist 模块内）
 *
 * 测试覆盖：
 * - register / get / has：单个注册、获取、存在性判断
 * - registerAll：批量注册、重名中断
 * - registerBuiltins：内置专家注册、幂等性
 * - list / listSummaries：排序、摘要结构
 * - unregister：卸载已注册/不存在
 * - clear / size：清空与计数
 * - 类型校验与边界情况
 *
 * 注意：本测试在 agent-specialist 模块内部直接验证 SpecialistRegistry 类，
 * 不依赖 @/modules/agent，避免跨模块耦合。
 */

import { describe, it, expect, beforeEach } from "vitest";
import { SpecialistRegistry } from "../specialist-registry";
import { BUILTIN_SPECIALISTS } from "../../domain/specialist-types";
import type { SpecialistAgent } from "../../domain/specialist-types";

// ============= 测试工具 =============

function makeSpecialist(overrides: Partial<SpecialistAgent> = {}): SpecialistAgent {
  return {
    id: "test-specialist",
    name: "测试专家",
    description: "测试用专家",
    systemPrompt: "你是测试专家。",
    enabledTools: ["list_characters"],
    temperature: 0.5,
    maxIterations: 3,
    ...overrides,
  };
}

// ============= 测试用例 =============

describe("SpecialistRegistry", () => {
  let registry: SpecialistRegistry;

  beforeEach(() => {
    registry = new SpecialistRegistry();
  });

  describe("register / get / has", () => {
    it("注册单个 Specialist 后 get 返回同一对象引用，has 返回 true", () => {
      const s = makeSpecialist({ id: "char-1" });
      registry.register(s);

      expect(registry.get("char-1")).toBe(s);
      expect(registry.has("char-1")).toBe(true);
    });

    it("未注册的 id get 返回 undefined，has 返回 false", () => {
      expect(registry.get("nonexistent")).toBeUndefined();
      expect(registry.has("nonexistent")).toBe(false);
    });

    it("重名注册抛出包含 id 的错误", () => {
      registry.register(makeSpecialist({ id: "dup-id" }));
      try {
        registry.register(makeSpecialist({ id: "dup-id" }));
        throw new Error("应抛错但未抛出");
      } catch (err) {
        expect((err as Error).message).toContain("dup-id");
        expect((err as Error).message).toMatch(/已注册/);
      }
    });

    it("注册时不修改传入的 Specialist 对象", () => {
      const s = makeSpecialist({ id: "immutable" });
      const originalName = s.name;
      registry.register(s);
      // 通过 get 获取后修改不应影响原对象（get 返回同一引用，但验证原对象未被 registry 改写）
      expect(s.name).toBe(originalName);
      expect(s.id).toBe("immutable");
    });
  });

  describe("registerAll（批量注册）", () => {
    it("批量注册多个 Specialist 后 size 等于数量", () => {
      const list = [
        makeSpecialist({ id: "a" }),
        makeSpecialist({ id: "b" }),
        makeSpecialist({ id: "c" }),
      ];
      registry.registerAll(list);
      expect(registry.size()).toBe(3);
      expect(registry.has("a")).toBe(true);
      expect(registry.has("b")).toBe(true);
      expect(registry.has("c")).toBe(true);
    });

    it("批量注册中遇重名抛错，已注册的保留但后续未注册的不写入", () => {
      const list = [
        makeSpecialist({ id: "first" }),
        makeSpecialist({ id: "duplicate" }),
        makeSpecialist({ id: "duplicate" }),
        makeSpecialist({ id: "last" }),
      ];
      expect(() => registry.registerAll(list)).toThrow(/已注册/);

      // registerAll 顺序执行，第一个 dup 已注册，第二个 dup 抛错
      expect(registry.has("first")).toBe(true);
      expect(registry.has("duplicate")).toBe(true);
      // "last" 不会注册（前面抛错中断）
      expect(registry.has("last")).toBe(false);
    });

    it("空数组批量注册无副作用", () => {
      registry.registerAll([]);
      expect(registry.size()).toBe(0);
      expect(registry.list()).toEqual([]);
    });
  });

  describe("registerBuiltins（内置专家）", () => {
    it("注册所有内置 Specialist，数量与 BUILTIN_SPECIALISTS 一致", () => {
      registry.registerBuiltins();
      expect(registry.size()).toBe(BUILTIN_SPECIALISTS.length);
    });

    it("幂等：重复调用 registerBuiltins 不重复注册", () => {
      registry.registerBuiltins();
      const sizeAfterFirst = registry.size();
      registry.registerBuiltins();
      registry.registerBuiltins();
      expect(registry.size()).toBe(sizeAfterFirst);
    });

    it("registerBuiltins 后内置 5 个核心专家都可获取", () => {
      registry.registerBuiltins();
      const expectedIds = [
        "character-creator",
        "video-producer",
        "story-writer",
        "api-configurator",
        "asset-finder",
      ];
      for (const id of expectedIds) {
        const s = registry.get(id);
        expect(s).toBeDefined();
        expect(s!.name).toBeTruthy();
      }
    });

    it("clear 后可重新调用 registerBuiltins", () => {
      registry.registerBuiltins();
      expect(registry.size()).toBe(BUILTIN_SPECIALISTS.length);
      registry.clear();
      expect(registry.size()).toBe(0);
      // registered 标志被重置，可再次注册
      registry.registerBuiltins();
      expect(registry.size()).toBe(BUILTIN_SPECIALISTS.length);
    });
  });

  describe("list / listSummaries", () => {
    it("list 返回所有 Specialist 并按 id 字典序排序", () => {
      registry.registerAll([
        makeSpecialist({ id: "zebra" }),
        makeSpecialist({ id: "apple" }),
        makeSpecialist({ id: "mango" }),
      ]);
      const list = registry.list();
      expect(list.map((s) => s.id)).toEqual(["apple", "mango", "zebra"]);
    });

    it("空注册表 list 返回空数组", () => {
      expect(registry.list()).toEqual([]);
    });

    it("listSummaries 仅返回 id/name/description 三字段", () => {
      registry.register(
        makeSpecialist({
          id: "summary-id",
          name: "摘要专家",
          description: "摘要测试",
          systemPrompt: "应被裁剪",
          enabledTools: ["t1", "t2"],
          temperature: 0.9,
          maxIterations: 7,
        }),
      );
      const summaries = registry.listSummaries();
      expect(summaries).toHaveLength(1);
      expect(summaries[0]).toEqual({
        id: "summary-id",
        name: "摘要专家",
        description: "摘要测试",
      });
      // 不应包含 systemPrompt / enabledTools / temperature / maxIterations
      expect(summaries[0]).not.toHaveProperty("systemPrompt");
      expect(summaries[0]).not.toHaveProperty("enabledTools");
      expect(summaries[0]).not.toHaveProperty("temperature");
      expect(summaries[0]).not.toHaveProperty("maxIterations");
    });

    it("listSummaries 与 list 排序一致", () => {
      registry.registerAll([
        makeSpecialist({ id: "c", name: "C" }),
        makeSpecialist({ id: "a", name: "A" }),
        makeSpecialist({ id: "b", name: "B" }),
      ]);
      const listIds = registry.list().map((s) => s.id);
      const summaryIds = registry.listSummaries().map((s) => s.id);
      expect(summaryIds).toEqual(listIds);
    });
  });

  describe("unregister", () => {
    it("卸载已注册的 Specialist 返回 true 并从注册表移除", () => {
      registry.register(makeSpecialist({ id: "removable" }));
      expect(registry.unregister("removable")).toBe(true);
      expect(registry.has("removable")).toBe(false);
      expect(registry.get("removable")).toBeUndefined();
    });

    it("卸载不存在的 id 返回 false，不影响其他 Specialist", () => {
      registry.register(makeSpecialist({ id: "kept" }));
      expect(registry.unregister("ghost")).toBe(false);
      expect(registry.has("kept")).toBe(true);
      expect(registry.size()).toBe(1);
    });
  });

  describe("size / clear", () => {
    it("size 反映当前注册数量", () => {
      expect(registry.size()).toBe(0);
      registry.register(makeSpecialist({ id: "x" }));
      expect(registry.size()).toBe(1);
      registry.register(makeSpecialist({ id: "y" }));
      expect(registry.size()).toBe(2);
      registry.unregister("x");
      expect(registry.size()).toBe(1);
    });

    it("clear 清空所有 Specialist 并重置 registered 标志", () => {
      registry.registerBuiltins();
      expect(registry.size()).toBeGreaterThan(0);
      registry.clear();
      expect(registry.size()).toBe(0);
      expect(registry.list()).toEqual([]);
      // registered 标志被重置：clear 后 registerBuiltins 可再次注册
      registry.registerBuiltins();
      expect(registry.size()).toBe(BUILTIN_SPECIALISTS.length);
    });

    it("对空注册表 clear 无副作用", () => {
      registry.clear();
      expect(registry.size()).toBe(0);
      // 再次 clear 也不应抛错
      expect(() => registry.clear()).not.toThrow();
    });
  });

  describe("边界情况", () => {
    it("id 含连字符和小写字母可正常注册", () => {
      const s = makeSpecialist({ id: "my-cool-specialist-42" });
      registry.register(s);
      expect(registry.get("my-cool-specialist-42")).toBe(s);
    });

    it("覆盖式 register 不被支持（重名必须抛错，无 upsert 语义）", () => {
      const original = makeSpecialist({ id: "dup", name: "原专家" });
      const updated = makeSpecialist({ id: "dup", name: "新专家" });
      registry.register(original);
      expect(() => registry.register(updated)).toThrow(/已注册/);
      // 原对象仍保留
      expect(registry.get("dup")?.name).toBe("原专家");
    });

    it("Specialist 对象字段为空数组/undefined 也可注册（不做内容校验）", () => {
      const s: SpecialistAgent = {
        id: "minimal",
        name: "",
        description: "",
        systemPrompt: "",
        // enabledTools 故意省略
      };
      registry.register(s);
      expect(registry.has("minimal")).toBe(true);
      const got = registry.get("minimal");
      expect(got?.enabledTools).toBeUndefined();
    });
  });
});
