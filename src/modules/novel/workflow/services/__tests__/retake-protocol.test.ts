/**
 * Task 2A.19 — RetakeProtocol 单元测试
 *
 * 测试覆盖：
 * - evaluate：五等级 triage（keep / minor_fix / retake_single_var / retake_full / replan）
 *   每等级覆盖：边界值（阈值线）+ 中间值
 * - scoreToVerdict（间接通过 evaluate 测试）
 * - retakeSingleVar：单变量重试 + 预算耗尽升级
 * - retakeFull：完全重试 + 预算耗尽升级
 * - hasBudget
 * - requiresUserIntervention
 * - createInitialVerdict
 * - 失败维度映射 singleVariable
 * - 预算耗尽强制升级 replan
 */

import { describe, it, expect, beforeEach } from "vitest";
import { RetakeProtocol } from "../retake-protocol";
import type { RetakeInput } from "../retake-protocol";
import { DEFAULT_ATTEMPT_BUDGET, RETAKE_THRESHOLDS } from "../../domain/workflow-mode";

describe("RetakeProtocol", () => {
  let protocol: RetakeProtocol;

  beforeEach(() => {
    protocol = new RetakeProtocol();
  });

  // ==========================================================================
  // evaluate — 五等级 triage
  // ==========================================================================
  describe("evaluate — 五等级 triage", () => {
    it("score=100 → keep（满分）", () => {
      const input: RetakeInput = { score: 100, attemptBudget: 3 };
      const v = protocol.evaluate(input);
      expect(v.verdict).toBe("keep");
      expect(v.score).toBe(100);
      expect(v.attemptBudget).toBe(3); // keep 不消耗预算
    });

    it(`score=${RETAKE_THRESHOLDS.keep} → keep（边界值）`, () => {
      const input: RetakeInput = { score: RETAKE_THRESHOLDS.keep, attemptBudget: 3 };
      const v = protocol.evaluate(input);
      expect(v.verdict).toBe("keep");
    });

    it(`score=${RETAKE_THRESHOLDS.keep - 1} → minor_fix（边界值下方）`, () => {
      const input: RetakeInput = { score: RETAKE_THRESHOLDS.keep - 1, attemptBudget: 3 };
      const v = protocol.evaluate(input);
      expect(v.verdict).toBe("minor_fix");
      expect(v.attemptBudget).toBe(3); // minor_fix 不消耗预算
    });

    it(`score=${RETAKE_THRESHOLDS.minor_fix} → minor_fix（边界值）`, () => {
      const input: RetakeInput = { score: RETAKE_THRESHOLDS.minor_fix, attemptBudget: 3 };
      const v = protocol.evaluate(input);
      expect(v.verdict).toBe("minor_fix");
    });

    it(`score=${RETAKE_THRESHOLDS.minor_fix - 1} → retake_single_var`, () => {
      const input: RetakeInput = {
        score: RETAKE_THRESHOLDS.minor_fix - 1,
        attemptBudget: 3,
        failedDimension: "camera",
      };
      const v = protocol.evaluate(input);
      expect(v.verdict).toBe("retake_single_var");
      expect(v.attemptBudget).toBe(2); // 消耗 1 次
      expect(v.singleVariable).toBe("prompt.camera_angle");
      expect(v.failedDimension).toBe("camera");
    });

    it(`score=${RETAKE_THRESHOLDS.retake_single_var} → retake_single_var（边界值）`, () => {
      const input: RetakeInput = {
        score: RETAKE_THRESHOLDS.retake_single_var,
        attemptBudget: 3,
        failedDimension: "lighting",
      };
      const v = protocol.evaluate(input);
      expect(v.verdict).toBe("retake_single_var");
      expect(v.singleVariable).toBe("prompt.lighting");
    });

    it(`score=${RETAKE_THRESHOLDS.retake_single_var - 1} → retake_full`, () => {
      const input: RetakeInput = {
        score: RETAKE_THRESHOLDS.retake_single_var - 1,
        attemptBudget: 3,
      };
      const v = protocol.evaluate(input);
      expect(v.verdict).toBe("retake_full");
      expect(v.attemptBudget).toBe(2); // 消耗 1 次
      expect(v.singleVariable).toBeUndefined();
    });

    it(`score=${RETAKE_THRESHOLDS.retake_full} → retake_full（边界值）`, () => {
      const input: RetakeInput = {
        score: RETAKE_THRESHOLDS.retake_full,
        attemptBudget: 3,
      };
      const v = protocol.evaluate(input);
      expect(v.verdict).toBe("retake_full");
    });

    it(`score=${RETAKE_THRESHOLDS.retake_full - 1} → replan`, () => {
      const input: RetakeInput = {
        score: RETAKE_THRESHOLDS.retake_full - 1,
        attemptBudget: 3,
      };
      const v = protocol.evaluate(input);
      expect(v.verdict).toBe("replan");
      expect(v.attemptBudget).toBe(3); // replan 不消耗预算
    });

    it("score=0 → replan（最低分）", () => {
      const input: RetakeInput = { score: 0, attemptBudget: 3 };
      const v = protocol.evaluate(input);
      expect(v.verdict).toBe("replan");
    });
  });

  // ==========================================================================
  // evaluate — 失败维度映射
  // ==========================================================================
  describe("evaluate — failedDimension 映射 singleVariable", () => {
    it("camera → prompt.camera_angle", () => {
      const v = protocol.evaluate({
        score: 60,
        attemptBudget: 3,
        failedDimension: "camera",
      });
      expect(v.singleVariable).toBe("prompt.camera_angle");
    });

    it("lighting → prompt.lighting", () => {
      const v = protocol.evaluate({
        score: 60,
        attemptBudget: 3,
        failedDimension: "lighting",
      });
      expect(v.singleVariable).toBe("prompt.lighting");
    });

    it("motion → prompt.motion", () => {
      const v = protocol.evaluate({
        score: 60,
        attemptBudget: 3,
        failedDimension: "motion",
      });
      expect(v.singleVariable).toBe("prompt.motion");
    });

    it("character → prompt.character_appearance", () => {
      const v = protocol.evaluate({
        score: 60,
        attemptBudget: 3,
        failedDimension: "character",
      });
      expect(v.singleVariable).toBe("prompt.character_appearance");
    });

    it("composition → prompt.composition", () => {
      const v = protocol.evaluate({
        score: 60,
        attemptBudget: 3,
        failedDimension: "composition",
      });
      expect(v.singleVariable).toBe("prompt.composition");
    });

    it("safety → prompt.safety_filter", () => {
      const v = protocol.evaluate({
        score: 60,
        attemptBudget: 3,
        failedDimension: "safety",
      });
      expect(v.singleVariable).toBe("prompt.safety_filter");
    });

    it("retake_single_var 无 failedDimension → singleVariable 为 undefined", () => {
      const v = protocol.evaluate({
        score: 60,
        attemptBudget: 3,
        // 不传 failedDimension
      });
      expect(v.verdict).toBe("retake_single_var");
      expect(v.singleVariable).toBeUndefined();
    });
  });

  // ==========================================================================
  // evaluate — 预算耗尽强制升级 replan
  // ==========================================================================
  describe("evaluate — 预算耗尽升级", () => {
    it("attemptBudget=0 且分数对应 retake_single_var → 强制升级 replan", () => {
      const v = protocol.evaluate({
        score: 60, // 正常应 retake_single_var
        attemptBudget: 0,
        failedDimension: "camera",
      });
      expect(v.verdict).toBe("replan");
      expect(v.attemptBudget).toBe(0); // 不再消耗
    });

    it("attemptBudget=0 且分数对应 retake_full → 强制升级 replan", () => {
      const v = protocol.evaluate({
        score: 40, // 正常应 retake_full
        attemptBudget: 0,
      });
      expect(v.verdict).toBe("replan");
    });
  });

  // ==========================================================================
  // evaluate — score 边界
  // ==========================================================================
  describe("evaluate — score 边界处理", () => {
    it("score=150 → clamp 到 100 → keep", () => {
      const v = protocol.evaluate({ score: 150, attemptBudget: 3 });
      expect(v.score).toBe(100);
      expect(v.verdict).toBe("keep");
    });

    it("score=-10 → clamp 到 0 → replan", () => {
      const v = protocol.evaluate({ score: -10, attemptBudget: 3 });
      expect(v.score).toBe(0);
      expect(v.verdict).toBe("replan");
    });
  });

  // ==========================================================================
  // retakeSingleVar
  // ==========================================================================
  describe("retakeSingleVar", () => {
    it("正常调用：消耗 1 次预算并设置 singleVariable", () => {
      const initial = protocol.createInitialVerdict(3);
      const v = protocol.retakeSingleVar(initial, "prompt.lighting");
      expect(v.verdict).toBe("retake_single_var");
      expect(v.singleVariable).toBe("prompt.lighting");
      expect(v.attemptBudget).toBe(2);
    });

    it("attemptBudget=0 → 强制升级 replan", () => {
      const initial = protocol.createInitialVerdict(0);
      const v = protocol.retakeSingleVar(initial, "prompt.lighting");
      expect(v.verdict).toBe("replan");
      expect(v.singleVariable).toBeUndefined();
    });
  });

  // ==========================================================================
  // retakeFull
  // ==========================================================================
  describe("retakeFull", () => {
    it("正常调用：消耗 1 次预算并清空 singleVariable", () => {
      const initial = protocol.createInitialVerdict(3);
      const v = protocol.retakeFull(initial);
      expect(v.verdict).toBe("retake_full");
      expect(v.singleVariable).toBeUndefined();
      expect(v.attemptBudget).toBe(2);
    });

    it("attemptBudget=0 → 强制升级 replan", () => {
      const initial = protocol.createInitialVerdict(0);
      const v = protocol.retakeFull(initial);
      expect(v.verdict).toBe("replan");
    });
  });

  // ==========================================================================
  // hasBudget
  // ==========================================================================
  describe("hasBudget", () => {
    it("attemptBudget > 0 → true", () => {
      const v = protocol.createInitialVerdict(3);
      expect(protocol.hasBudget(v)).toBe(true);
    });

    it("attemptBudget = 0 → false", () => {
      const v = protocol.createInitialVerdict(0);
      expect(protocol.hasBudget(v)).toBe(false);
    });
  });

  // ==========================================================================
  // requiresUserIntervention
  // ==========================================================================
  describe("requiresUserIntervention", () => {
    it("replan → true", () => {
      const v = protocol.evaluate({ score: 10, attemptBudget: 3 });
      expect(protocol.requiresUserIntervention(v)).toBe(true);
    });

    it("keep → false", () => {
      const v = protocol.evaluate({ score: 100, attemptBudget: 3 });
      expect(protocol.requiresUserIntervention(v)).toBe(false);
    });

    it("retake_single_var + attemptBudget=0 → true", () => {
      // 通过 retakeSingleVar 触发预算耗尽
      const initial = protocol.createInitialVerdict(1);
      const v1 = protocol.retakeSingleVar(initial, "prompt.camera_angle");
      // 此时 v1.verdict=retake_single_var, attemptBudget=0
      // 再次调用 evaluate 应升级 replan，但这里直接构造
      const drained = { ...v1, verdict: "retake_single_var" as const, attemptBudget: 0 };
      expect(protocol.requiresUserIntervention(drained)).toBe(true);
    });

    it("retake_full + attemptBudget>0 → false", () => {
      const initial = protocol.createInitialVerdict(2);
      const v = protocol.retakeFull(initial);
      expect(protocol.requiresUserIntervention(v)).toBe(false);
    });
  });

  // ==========================================================================
  // createInitialVerdict
  // ==========================================================================
  describe("createInitialVerdict", () => {
    it("使用默认 attemptBudget", () => {
      const v = protocol.createInitialVerdict();
      expect(v.verdict).toBe("keep");
      expect(v.score).toBe(100);
      expect(v.attemptBudget).toBe(DEFAULT_ATTEMPT_BUDGET);
    });

    it("使用自定义 attemptBudget", () => {
      const v = protocol.createInitialVerdict(5);
      expect(v.attemptBudget).toBe(5);
    });
  });
});
