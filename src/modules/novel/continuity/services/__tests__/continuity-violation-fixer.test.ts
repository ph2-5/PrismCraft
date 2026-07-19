/**
 * Task 2A.18 — ContinuityViolationFixer 单元测试
 *
 * 测试覆盖：
 * - generateRuleBasedSuggestion：服装/发色/时间/氛围/位置 各类建议
 * - applySuggestion：单条应用
 * - applyAllSuggestions：批量应用
 * - applyAllAiSuggestions：AI 模式（含失败回退）
 * - isExplicit 优先级
 * - 多数值选择
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  ContinuityViolationFixer,
  type ViolationFixerOptions,
} from "../continuity-violation-fixer";
import type { ContinuityViolation } from "../../domain/continuity-ledger";

describe("ContinuityViolationFixer", () => {
  let fixer: ContinuityViolationFixer;

  beforeEach(() => {
    fixer = new ContinuityViolationFixer();
  });

  // 工厂函数：创建测试用 violation
  function makeViolation(
    overrides: Partial<ContinuityViolation> = {},
  ): ContinuityViolation {
    return {
      id: "cv-0",
      shotIds: ["shot-1", "shot-2"],
      category: "character",
      key: "林辰.服装",
      conflictingValues: [
        { shotId: "shot-1", value: "红色", isExplicit: false },
        { shotId: "shot-2", value: "蓝色", isExplicit: false },
      ],
      severity: "warning",
      ...overrides,
    };
  }

  describe("generateRuleBasedSuggestion", () => {
    it("服装冲突应建议统一或添加换装说明", () => {
      const violation = makeViolation({
        key: "林辰.服装",
        conflictingValues: [
          { shotId: "shot-1", value: "红色", isExplicit: false },
          { shotId: "shot-2", value: "蓝色", isExplicit: false },
        ],
      });

      const suggestion = fixer.generateRuleBasedSuggestion(violation);

      // 应包含"统一为"或"换装说明"
      expect(suggestion).toContain("统一为");
      expect(suggestion).toContain("换装说明");
      // 应包含推荐值（红色或蓝色，由于都是 1 次，取第一个）
      expect(suggestion).toMatch(/(红色|蓝色)/);
    });

    it("发色冲突应建议统一或添加染发说明", () => {
      const violation = makeViolation({
        key: "林辰.发色",
        conflictingValues: [
          { shotId: "shot-1", value: "黑色", isExplicit: false },
          { shotId: "shot-2", value: "金色", isExplicit: false },
        ],
      });

      const suggestion = fixer.generateRuleBasedSuggestion(violation);

      expect(suggestion).toContain("统一为");
      expect(suggestion).toContain("染发说明");
    });

    it("时间冲突应建议检查时间跳转", () => {
      const violation = makeViolation({
        category: "scene",
        key: "客栈.时间",
        severity: "error",
        conflictingValues: [
          { shotId: "shot-1", value: "夜晚", isExplicit: false },
          { shotId: "shot-2", value: "白天", isExplicit: false },
        ],
      });

      const suggestion = fixer.generateRuleBasedSuggestion(violation);

      expect(suggestion).toContain("时间跳转");
      expect(suggestion).toContain("统一为");
    });

    it("氛围冲突应建议统一", () => {
      const violation = makeViolation({
        category: "scene",
        key: "客栈.氛围",
        conflictingValues: [
          { shotId: "shot-1", value: "温暖", isExplicit: false },
          { shotId: "shot-2", value: "清冷", isExplicit: false },
        ],
      });

      const suggestion = fixer.generateRuleBasedSuggestion(violation);

      expect(suggestion).toContain("统一为");
      expect(suggestion).toContain("参考分镜");
    });

    it("位置冲突应建议统一", () => {
      const violation = makeViolation({
        category: "prop",
        key: "宝剑.位置",
        conflictingValues: [
          { shotId: "shot-1", value: "桌上", isExplicit: false },
          { shotId: "shot-2", value: "腰间", isExplicit: false },
        ],
      });

      const suggestion = fixer.generateRuleBasedSuggestion(violation);

      expect(suggestion).toContain("统一为");
    });

    it("isExplicit=true 的值应优先作为推荐值", () => {
      const violation = makeViolation({
        key: "林辰.服装",
        conflictingValues: [
          { shotId: "shot-1", value: "红色", isExplicit: false },
          { shotId: "shot-2", value: "蓝色", isExplicit: true }, // 用户明确标记
        ],
      });

      const suggestion = fixer.generateRuleBasedSuggestion(violation);

      // 应推荐蓝色（isExplicit=true 优先）
      expect(suggestion).toContain("蓝色");
    });

    it("多数值应优先作为推荐值（无 isExplicit 时）", () => {
      const violation = makeViolation({
        key: "林辰.服装",
        conflictingValues: [
          { shotId: "shot-1", value: "红色", isExplicit: false },
          { shotId: "shot-2", value: "蓝色", isExplicit: false },
          { shotId: "shot-3", value: "红色", isExplicit: false }, // 红色占多数
        ],
      });

      const suggestion = fixer.generateRuleBasedSuggestion(violation);

      expect(suggestion).toContain("红色");
    });

    it("未知 key 后缀应使用通用建议", () => {
      const violation = makeViolation({
        category: "character",
        key: "林辰.未知属性",
        conflictingValues: [
          { shotId: "shot-1", value: "A", isExplicit: false },
          { shotId: "shot-2", value: "B", isExplicit: false },
        ],
      });

      const suggestion = fixer.generateRuleBasedSuggestion(violation);

      // 通用建议包含"统一为"和"剧情说明"
      expect(suggestion).toContain("统一为");
      expect(suggestion).toContain("剧情说明");
    });
  });

  describe("applySuggestion", () => {
    it("应为 violation 添加 suggestedFix", () => {
      const violation = makeViolation();

      const result = fixer.applySuggestion(violation);

      expect(result.suggestedFix).toBeDefined();
      expect(typeof result.suggestedFix).toBe("string");
      expect(result.suggestedFix!.length).toBeGreaterThan(0);
    });

    it("已有 suggestedFix 时不应覆盖", () => {
      const violation = makeViolation({
        suggestedFix: "已有建议",
      });

      const result = fixer.applySuggestion(violation);

      expect(result.suggestedFix).toBe("已有建议");
    });

    it("不应修改原 violation 对象", () => {
      const violation = makeViolation();
      expect(violation.suggestedFix).toBeUndefined();

      const result = fixer.applySuggestion(violation);

      expect(violation.suggestedFix).toBeUndefined(); // 原对象未变
      expect(result).not.toBe(violation); // 返回新对象
      expect(result.suggestedFix).toBeDefined();
    });
  });

  describe("applyAllSuggestions", () => {
    it("应为所有 violation 添加建议", () => {
      const violations = [
        makeViolation({ id: "cv-0", key: "林辰.服装" }),
        makeViolation({ id: "cv-1", key: "苏姑娘.发色" }),
        makeViolation({ id: "cv-2", key: "客栈.时间" }),
      ];

      const results = fixer.applyAllSuggestions(violations);

      expect(results).toHaveLength(3);
      expect(results.every((v) => v.suggestedFix !== undefined)).toBe(true);
    });

    it("空数组应返回空数组", () => {
      expect(fixer.applyAllSuggestions([])).toEqual([]);
    });

    it("不应修改原数组", () => {
      const violations = [makeViolation()];
      const original = [...violations];

      fixer.applyAllSuggestions(violations);

      expect(violations).toEqual(original); // 原数组未变
    });
  });

  describe("generateAiSuggestion", () => {
    it("未配置 aiGenerate 时应返回 undefined", async () => {
      const fixerNoAi = new ContinuityViolationFixer();
      const violation = makeViolation();

      const result = await fixerNoAi.generateAiSuggestion(violation);

      expect(result).toBeUndefined();
    });

    it("配置 aiGenerate 时应调用并返回结果", async () => {
      const aiGenerate = vi.fn().mockResolvedValue("AI 生成的建议");
      const fixerWithAi = new ContinuityViolationFixer({ aiGenerate });
      const violation = makeViolation();

      const result = await fixerWithAi.generateAiSuggestion(violation);

      expect(aiGenerate).toHaveBeenCalledWith(violation);
      expect(result).toBe("AI 生成的建议");
    });

    it("AI 失败时应回退到规则建议", async () => {
      const aiGenerate = vi.fn().mockRejectedValue(new Error("AI 不可用"));
      const fixerWithAi = new ContinuityViolationFixer({ aiGenerate });
      const violation = makeViolation();

      const result = await fixerWithAi.generateAiSuggestion(violation);

      expect(result).toBeDefined();
      expect(result).toContain("统一为"); // 规则建议的特征
    });
  });

  describe("applyAllAiSuggestions", () => {
    it("未配置 aiGenerate 时应回退到规则建议", async () => {
      const fixerNoAi = new ContinuityViolationFixer();
      const violations = [
        makeViolation({ id: "cv-0" }),
        makeViolation({ id: "cv-1" }),
      ];

      const results = await fixerNoAi.applyAllAiSuggestions(violations);

      expect(results).toHaveLength(2);
      expect(results.every((v) => v.suggestedFix !== undefined)).toBe(true);
    });

    it("配置 aiGenerate 时应调用 AI 生成", async () => {
      const aiGenerate = vi
        .fn()
        .mockResolvedValueOnce("建议 1")
        .mockResolvedValueOnce("建议 2");
      const fixerWithAi = new ContinuityViolationFixer({ aiGenerate });
      const violations = [
        makeViolation({ id: "cv-0" }),
        makeViolation({ id: "cv-1" }),
      ];

      const results = await fixerWithAi.applyAllAiSuggestions(violations);

      expect(results[0]!.suggestedFix).toBe("建议 1");
      expect(results[1]!.suggestedFix).toBe("建议 2");
      expect(aiGenerate).toHaveBeenCalledTimes(2);
    });

    it("已有 suggestedFix 的 violation 不应调用 AI", async () => {
      const aiGenerate = vi.fn().mockResolvedValue("不应调用");
      const fixerWithAi = new ContinuityViolationFixer({ aiGenerate });
      const violations = [
        makeViolation({ id: "cv-0", suggestedFix: "已有建议" }),
        makeViolation({ id: "cv-1" }),
      ];

      const results = await fixerWithAi.applyAllAiSuggestions(violations);

      expect(results[0]!.suggestedFix).toBe("已有建议");
      expect(aiGenerate).toHaveBeenCalledTimes(1); // 只调用 1 次
    });

    it("空数组应返回空数组", async () => {
      const aiGenerate = vi.fn();
      const fixerWithAi = new ContinuityViolationFixer({ aiGenerate });

      const results = await fixerWithAi.applyAllAiSuggestions([]);

      expect(results).toEqual([]);
      expect(aiGenerate).not.toHaveBeenCalled();
    });
  });

  describe("构造函数选项", () => {
    it("无选项时应正常工作", () => {
      const fixerNoOptions = new ContinuityViolationFixer();
      const violation = makeViolation();

      const suggestion = fixerNoOptions.generateRuleBasedSuggestion(violation);

      expect(suggestion).toBeDefined();
    });

    it("应接受空 options 对象", () => {
      const options: ViolationFixerOptions = {};
      const fixerWithOptions = new ContinuityViolationFixer(options);

      const violation = makeViolation();
      const suggestion = fixerWithOptions.generateRuleBasedSuggestion(violation);

      expect(suggestion).toBeDefined();
    });
  });
});
