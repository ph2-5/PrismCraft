/**
 * quality-gate/__tests__/registry.test.ts — 注册表行为测试（v0.2）
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  registerQualityChecker,
  getQualityChecker,
  getAllCheckers,
  getCheckersForKind,
  registerBuiltinCheckers,
} from "../index";

describe("quality-gate registry", () => {
  beforeEach(() => {
    registerBuiltinCheckers();
  });

  it("注册 + 查询：工厂懒实例化", () => {
    let instances = 0;
    registerQualityChecker("test.lazy", () => {
      instances += 1;
      return {
        id: "test.lazy",
        category: "rule",
        supports: ["artifact"],
        async run() {
          return { ok: true, checkerId: "test.lazy", category: "rule", verdict: "pass", score: 1, evidence: "" };
        },
      };
    });
    expect(instances).toBe(0);
    const checker = getQualityChecker("test.lazy");
    expect(checker).toBeDefined();
    expect(instances).toBe(1);
    expect(checker!.id).toBe("test.lazy");
  });

  it("同名注册覆盖（幂等）", () => {
    registerQualityChecker("rule.artifact-scan", () => ({
      id: "rule.artifact-scan.override",
      category: "rule",
      supports: ["artifact"],
      async run() {
        return { ok: true, checkerId: "override", category: "rule", verdict: "pass", score: 1, evidence: "" };
      },
    }));
    const checker = getQualityChecker("rule.artifact-scan");
    expect(checker!.id).toBe("rule.artifact-scan.override");
  });

  it("getAllCheckers 返回全部（含内置）", () => {
    const all = getAllCheckers();
    expect(all.length).toBeGreaterThanOrEqual(3);
    const ids = all.map((c) => c.id);
    expect(ids).toContain("rule.character-consistency");
    expect(ids).toContain("rule.scene-consistency");
    expect(ids).toContain("rule.artifact-scan");
  });

  it("按 kind 过滤路由", () => {
    expect(getCheckersForKind("character_consistency").map((c) => c.id)).toContain("rule.character-consistency");
    expect(getCheckersForKind("scene_consistency").map((c) => c.id)).toContain("rule.scene-consistency");
    expect(getCheckersForKind("continuity")).toEqual([]);
  });
});
