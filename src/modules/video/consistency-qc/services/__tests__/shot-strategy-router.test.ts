/**
 * Task 2A.23: shot-strategy-router 单元测试
 *
 * 覆盖：
 * - routeStrategy: 显式覆盖 / shotInstruction.shotSize / beat.shotType fallback / 默认
 * - applyStrategyToPrompt: 各策略追加约束 / 已包含关键词不重复 / 空 prompt
 * - getEffectiveThreshold: 阈值系数调整
 * - shouldUseLastFrame / getLastFrameUsage
 * - isStrategyLocked / buildStrategyAwarePrompt
 */
import { describe, it, expect } from "vitest";
import {
  routeStrategy,
  applyStrategyToPrompt,
  getEffectiveThreshold,
  describeRoutedStrategy,
  shouldUseLastFrame,
  getLastFrameUsage,
  isStrategyLocked,
  buildStrategyAwarePrompt,
} from "../shot-strategy-router";
import { createStrategy } from "../../domain/shot-strategy";
import { DEFAULT_DRIFT_POLICY } from "../../domain/drift-policy";
import type { StoryBeat } from "@/domain/schemas";

describe("shot-strategy-router", () => {
  // ── routeStrategy ─────────────────────────────────────────────────────────

  describe("routeStrategy", () => {
    it("用例1: 显式覆盖优先", () => {
      const beat: StoryBeat = {
        id: "beat-1",
        index: 0,
        shotInstruction: { shotSize: "close", cameraMovement: "static", cameraAngle: "eye_level" },
      } as StoryBeat;
      const strategy = routeStrategy(beat, { type: "scene_transition" });
      expect(strategy.type).toBe("scene_transition");
      expect(strategy.useLastFrame).toBe("none");
    });

    it("用例2: 优先读取 shotInstruction.shotSize", () => {
      const beat: StoryBeat = {
        id: "beat-1",
        index: 0,
        shotInstruction: { shotSize: "close", cameraMovement: "static", cameraAngle: "eye_level" },
        shotType: "wide", // deprecated，应被忽略
      } as StoryBeat;
      const strategy = routeStrategy(beat);
      expect(strategy.type).toBe("continuous_action"); // close → continuous_action
    });

    it("用例3: fallback 到 beat.shotType（deprecated）", () => {
      const beat: StoryBeat = {
        id: "beat-1",
        index: 0,
        shotType: "wide",
      } as StoryBeat;
      const strategy = routeStrategy(beat);
      expect(strategy.type).toBe("scene_transition"); // wide → scene_transition
    });

    it("用例4: 两者都缺失时返回默认 angle_switch", () => {
      const beat: StoryBeat = {
        id: "beat-1",
        index: 0,
      } as StoryBeat;
      const strategy = routeStrategy(beat);
      expect(strategy.type).toBe("angle_switch");
    });

    it("用例5: beat 为 undefined 时返回默认", () => {
      const strategy = routeStrategy(undefined);
      expect(strategy.type).toBe("angle_switch");
      expect(strategy.useLastFrame).toBe("weak");
    });

    it("用例6: medium shotSize 映射到 continuous_action", () => {
      const beat: StoryBeat = {
        id: "beat-1",
        index: 0,
        shotInstruction: { shotSize: "medium", cameraMovement: "push", cameraAngle: "eye_level" },
      } as StoryBeat;
      const strategy = routeStrategy(beat);
      expect(strategy.type).toBe("continuous_action");
    });
  });

  // ── applyStrategyToPrompt ─────────────────────────────────────────────────

  describe("applyStrategyToPrompt", () => {
    it("用例1: continuous_action 追加连续动作约束", () => {
      const strategy = createStrategy("continuous_action");
      const result = applyStrategyToPrompt(strategy, "角色走进咖啡馆");
      expect(result).toContain("角色走进咖啡馆");
      expect(result).toContain("[连续动作约束]");
      expect(result).toContain("尾帧");
    });

    it("用例2: angle_switch 追加换角度约束", () => {
      const strategy = createStrategy("angle_switch");
      const result = applyStrategyToPrompt(strategy, "角色坐在桌前");
      expect(result).toContain("[换角度约束]");
      expect(result).toContain("外观一致");
    });

    it("用例3: scene_transition 追加场景转场约束", () => {
      const strategy = createStrategy("scene_transition");
      // 注意：prompt 不能包含"新场景"/"场景转场"关键词，否则会被判定为已包含约束
      const result = applyStrategyToPrompt(strategy, "夜晚街道上的霓虹灯");
      expect(result).toContain("[场景转场约束]");
      expect(result).toContain("夜晚街道上的霓虹灯");
    });

    it("用例4: 已包含关键词时不重复追加", () => {
      const strategy = createStrategy("continuous_action");
      const prompt = "角色走进咖啡馆，保持与上一镜尾帧的视觉连续性";
      const result = applyStrategyToPrompt(strategy, prompt);
      expect(result).toBe(prompt); // 不追加
    });

    it("用例5: 空 prompt 原样返回", () => {
      const strategy = createStrategy("continuous_action");
      expect(applyStrategyToPrompt(strategy, "")).toBe("");
      expect(applyStrategyToPrompt(strategy, "   ")).toBe("   ");
    });

    it("用例6: 不修改原始 prompt 内容（INV-5）", () => {
      const strategy = createStrategy("angle_switch");
      const original = "角色 A 站在窗边";
      const result = applyStrategyToPrompt(strategy, original);
      expect(result.startsWith(original)).toBe(true);
    });
  });

  // ── getEffectiveThreshold ─────────────────────────────────────────────────

  describe("getEffectiveThreshold", () => {
    it("用例1: continuous_action 阈值更严格（×1.1）", () => {
      const strategy = createStrategy("continuous_action");
      const { warningThreshold, criticalThreshold } = getEffectiveThreshold(strategy, DEFAULT_DRIFT_POLICY);
      expect(warningThreshold).toBeCloseTo(0.825, 5); // 0.75 * 1.1
      expect(criticalThreshold).toBeCloseTo(0.66, 5); // 0.6 * 1.1
    });

    it("用例2: angle_switch 阈值不变（×1.0）", () => {
      const strategy = createStrategy("angle_switch");
      const { warningThreshold, criticalThreshold } = getEffectiveThreshold(strategy, DEFAULT_DRIFT_POLICY);
      expect(warningThreshold).toBe(DEFAULT_DRIFT_POLICY.warningThreshold);
      expect(criticalThreshold).toBe(DEFAULT_DRIFT_POLICY.criticalThreshold);
    });

    it("用例3: scene_transition 阈值更宽松（×0.9）", () => {
      const strategy = createStrategy("scene_transition");
      const { warningThreshold, criticalThreshold } = getEffectiveThreshold(strategy, DEFAULT_DRIFT_POLICY);
      expect(warningThreshold).toBeCloseTo(0.675, 5); // 0.75 * 0.9
      expect(criticalThreshold).toBeCloseTo(0.54, 5); // 0.6 * 0.9
    });

    it("用例4: 阈值 clamp 到 [0, 1]", () => {
      const strategy = createStrategy("continuous_action");
      const extremePolicy = { ...DEFAULT_DRIFT_POLICY, warningThreshold: 1.0, criticalThreshold: 0.95 };
      const { warningThreshold, criticalThreshold } = getEffectiveThreshold(strategy, extremePolicy);
      expect(warningThreshold).toBeLessThanOrEqual(1);
      expect(criticalThreshold).toBeLessThanOrEqual(1);
    });
  });

  // ── describeRoutedStrategy ────────────────────────────────────────────────

  describe("describeRoutedStrategy", () => {
    it("用例1: 各策略返回非空描述", () => {
      expect(describeRoutedStrategy(createStrategy("continuous_action"))).toContain("连续动作");
      expect(describeRoutedStrategy(createStrategy("angle_switch"))).toContain("换角度");
      expect(describeRoutedStrategy(createStrategy("scene_transition"))).toContain("场景转场");
    });
  });

  // ── shouldUseLastFrame / getLastFrameUsage ────────────────────────────────

  describe("shouldUseLastFrame", () => {
    it("用例1: continuous_action 和 angle_switch 返回 true", () => {
      expect(shouldUseLastFrame(createStrategy("continuous_action"))).toBe(true);
      expect(shouldUseLastFrame(createStrategy("angle_switch"))).toBe(true);
    });

    it("用例2: scene_transition 返回 false", () => {
      expect(shouldUseLastFrame(createStrategy("scene_transition"))).toBe(false);
    });
  });

  describe("getLastFrameUsage", () => {
    it("用例3: 返回正确的强度", () => {
      expect(getLastFrameUsage(createStrategy("continuous_action"))).toBe("strong");
      expect(getLastFrameUsage(createStrategy("angle_switch"))).toBe("weak");
      expect(getLastFrameUsage(createStrategy("scene_transition"))).toBe("none");
    });
  });

  // ── isStrategyLocked ──────────────────────────────────────────────────────

  describe("isStrategyLocked", () => {
    it("用例1: locked=true 返回 true", () => {
      expect(isStrategyLocked({ type: "continuous_action", locked: true })).toBe(true);
    });

    it("用例2: locked=false 或缺失返回 false", () => {
      expect(isStrategyLocked({ type: "continuous_action", locked: false })).toBe(false);
      expect(isStrategyLocked({ type: "continuous_action" })).toBe(false);
      expect(isStrategyLocked(undefined)).toBe(false);
    });
  });

  // ── buildStrategyAwarePrompt ──────────────────────────────────────────────

  describe("buildStrategyAwarePrompt", () => {
    it("用例1: 返回增强后的 prompt 和策略描述", () => {
      const strategy = createStrategy("continuous_action");
      const result = buildStrategyAwarePrompt(strategy, "角色走进咖啡馆");
      expect(result.prompt).toContain("角色走进咖啡馆");
      expect(result.prompt).toContain("[连续动作约束]");
      expect(result.strategyDescription).toContain("连续动作");
      expect(result.constraintAppended).toBe(true);
    });

    it("用例2: 已包含关键词时 constraintAppended=false", () => {
      const strategy = createStrategy("continuous_action");
      const prompt = "保持与上一镜尾帧的视觉连续性，角色走进咖啡馆";
      const result = buildStrategyAwarePrompt(strategy, prompt);
      expect(result.constraintAppended).toBe(false);
      expect(result.prompt).toBe(prompt);
    });
  });
});
