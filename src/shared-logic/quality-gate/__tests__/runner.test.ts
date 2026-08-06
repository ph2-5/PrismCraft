/**
 * quality-gate/__tests__/runner.test.ts — 编排器语义测试（v0.2）
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  QualityGateRunner,
  registerQualityChecker,
  registerBuiltinCheckers,
  getCheckersForKind,
  resolveThresholds,
  classifyScore,
  DEFAULT_THRESHOLDS,
  type QualityCheckInput,
} from "../index";

const baseInput: QualityCheckInput = {
  kind: "character_consistency",
  generated: { imageUrl: "https://mock/g.png" },
  references: [{ imageUrl: "https://mock/ref.png", role: "character" }],
  featureAnchors: { hair: "银白" },
  provenance: { providerId: "kling", modelId: "kling-v1" },
};

describe("quality-gate runner", () => {
  beforeEach(() => {
    registerBuiltinCheckers();
  });

  it("注册表：内置 3 个 rule checker 可查询", () => {
    expect(getCheckersForKind("character_consistency").length).toBeGreaterThanOrEqual(1);
    expect(getCheckersForKind("artifact").length).toBeGreaterThanOrEqual(1);
    expect(getCheckersForKind("scene_consistency").length).toBeGreaterThanOrEqual(1);
  });

  it("正常输入：角色一致性检查通过（pass）", async () => {
    const runner = new QualityGateRunner();
    const report = await runner.run(baseInput);
    expect(report.passed).toBe(true);
    expect(report.standardsUsed["character_consistency"]).toBe("rule");
    expect(report.summary).toBe("pass");
  });

  it("缺失参考图与锚定：得分下降 → fail", async () => {
    const runner = new QualityGateRunner();
    const report = await runner.run({
      ...baseInput,
      references: [],
      featureAnchors: {},
    });
    expect(report.summary).toBe("fail");
    expect(report.passed).toBe(false);
  });

  it("情形 A：无可用实现的 kind → skipped，不参与判定", async () => {
    const runner = new QualityGateRunner();
    const report = await runner.run({ ...baseInput, kind: "continuity" });
    expect(report.standardsUsed["continuity"]).toBe("skipped");
    expect(report.summary).toBe("pass");
  });

  it("R192：编排器不 throw——checker 抛错被捕获为 skipped", async () => {
    registerQualityChecker("test.throwing", () => ({
      id: "test.throwing",
      category: "custom",
      supports: ["artifact"],
      async run() {
        throw new Error("boom");
      },
    }));
    const runner = new QualityGateRunner();
    const report = await runner.run({ ...baseInput, kind: "artifact" });
    expect(report.passed).toBe(true);
    expect(() => report).not.toThrow();
  });

  it("阈值解析：perModel > perProvider > default", () => {
    const config = {
      default: DEFAULT_THRESHOLDS,
      perProvider: { kling: { warnThreshold: 0.7, failThreshold: 0.5 } },
      perModel: { "kling-v1": { warnThreshold: 0.8, failThreshold: 0.6 } },
    };
    expect(resolveThresholds("kling", "kling-v1", config)).toEqual({ warnThreshold: 0.8, failThreshold: 0.6 });
    expect(resolveThresholds("kling", "other", config)).toEqual({ warnThreshold: 0.7, failThreshold: 0.5 });
    expect(resolveThresholds("other", "x", config)).toEqual(DEFAULT_THRESHOLDS);
    expect(resolveThresholds("other", "x", undefined)).toEqual(DEFAULT_THRESHOLDS);
  });

  it("classifyScore：阈值边界", () => {
    expect(classifyScore(0.8, DEFAULT_THRESHOLDS)).toBe("pass");
    expect(classifyScore(0.55, DEFAULT_THRESHOLDS)).toBe("warn");
    expect(classifyScore(0.4, DEFAULT_THRESHOLDS)).toBe("fail");
    expect(classifyScore(0.6, DEFAULT_THRESHOLDS)).toBe("pass");
    expect(classifyScore(0.45, DEFAULT_THRESHOLDS)).toBe("warn");
  });
});
