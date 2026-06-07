import { describe, it, expect } from "vitest";
import {
  validateFeatureAnchoring,
  validateBlendConfig,
  getBlendMode,
  shouldUseChainReference,
  buildBlendPrompt,
  performAutoFallback,
  validateNoFrameBinding,
  performConfigCheck,
} from "../feature-anchoring-service";
import type { FeatureAnchoringConfig } from "@/domain/schemas";

function buildConfig(overrides: Partial<FeatureAnchoringConfig> = {}): FeatureAnchoringConfig {
  return {
    enabled: true,
    characterAnchors: [
      {
        elementId: "char-1",
        referenceImageUrl: "https://example.com/ref.jpg",
        featureTags: ["发色:黑色", "服装:铠甲"],
        weight: 0.8,
      },
    ],
    disableFrameBinding: true,
    featureConsistencyStrength: 0.8,
    ...overrides,
  };
}

describe("feature-anchoring-service", () => {
  describe("validateFeatureAnchoring", () => {
    it("有效配置应通过验证", () => {
      const config = buildConfig();
      const result = validateFeatureAnchoring(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.effectiveStrength).toBe(0.8);
    });

    it("未启用时应返回有效且 effectiveStrength 为 0", () => {
      const config = buildConfig({ enabled: false });
      const result = validateFeatureAnchoring(config);
      expect(result.valid).toBe(true);
      expect(result.effectiveStrength).toBe(0);
    });

    it("启用但无角色锚点应报错", () => {
      const config = buildConfig({ characterAnchors: [] });
      const result = validateFeatureAnchoring(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("特征锚定启用时必须指定至少一个角色锚点");
    });

    it("角色锚点缺少元素ID应报错", () => {
      const config = buildConfig({
        characterAnchors: [
          { elementId: "", referenceImageUrl: "https://example.com/ref.jpg", featureTags: ["tag"], weight: 0.8 },
        ],
      });
      const result = validateFeatureAnchoring(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("缺少元素ID"))).toBe(true);
    });

    it("角色锚点缺少参考图片应报错", () => {
      const config = buildConfig({
        characterAnchors: [
          { elementId: "char-1", referenceImageUrl: "", featureTags: ["tag"], weight: 0.8 },
        ],
      });
      const result = validateFeatureAnchoring(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("缺少参考图片"))).toBe(true);
    });

    it("角色锚点无特征标签应警告", () => {
      const config = buildConfig({
        characterAnchors: [
          { elementId: "char-1", referenceImageUrl: "https://example.com/ref.jpg", featureTags: [], weight: 0.8 },
        ],
      });
      const result = validateFeatureAnchoring(config);
      expect(result.warnings.some((w) => w.includes("没有指定特征标签"))).toBe(true);
    });

    it("角色锚点权重超出范围应报错", () => {
      const config = buildConfig({
        characterAnchors: [
          { elementId: "char-1", referenceImageUrl: "https://example.com/ref.jpg", featureTags: ["tag"], weight: 1.5 },
        ],
      });
      const result = validateFeatureAnchoring(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("权重必须在 0-1 之间"))).toBe(true);
    });

    it("角色锚点权重为负数应报错", () => {
      const config = buildConfig({
        characterAnchors: [
          { elementId: "char-1", referenceImageUrl: "https://example.com/ref.jpg", featureTags: ["tag"], weight: -0.1 },
        ],
      });
      const result = validateFeatureAnchoring(config);
      expect(result.valid).toBe(false);
    });

    it("道具锚点缺少元素ID应报错", () => {
      const config = buildConfig({
        propAnchors: [
          { elementId: "", referenceImageUrl: "https://example.com/ref.jpg", featureTags: ["tag"], weight: 0.8 },
        ],
      });
      const result = validateFeatureAnchoring(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("道具锚点缺少元素ID"))).toBe(true);
    });

    it("道具锚点缺少参考图片应报错", () => {
      const config = buildConfig({
        propAnchors: [
          { elementId: "prop-1", referenceImageUrl: "", featureTags: ["tag"], weight: 0.8 },
        ],
      });
      const result = validateFeatureAnchoring(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("道具锚点") && e.includes("缺少参考图片"))).toBe(true);
    });

    it("特征一致性强度超出范围应报错", () => {
      const config = buildConfig({ featureConsistencyStrength: 1.5 });
      const result = validateFeatureAnchoring(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("特征一致性强度必须在 0-1 之间"))).toBe(true);
    });

    it("特征一致性强度过高应警告", () => {
      const config = buildConfig({ featureConsistencyStrength: 0.95 });
      const result = validateFeatureAnchoring(config);
      expect(result.warnings.some((w) => w.includes("过于僵化"))).toBe(true);
    });

    it("特征一致性强度过低应警告", () => {
      const config = buildConfig({ featureConsistencyStrength: 0.2 });
      const result = validateFeatureAnchoring(config);
      expect(result.warnings.some((w) => w.includes("无法保证角色一致性"))).toBe(true);
    });

    it("未指定 featureConsistencyStrength 时应使用默认值 0.8", () => {
      const config = buildConfig({ featureConsistencyStrength: undefined });
      const result = validateFeatureAnchoring(config);
      expect(result.effectiveStrength).toBe(0.8);
    });
  });

  describe("validateBlendConfig", () => {
    it("无 blend 配置时应通过", () => {
      const config = buildConfig({ blend: undefined });
      const result = validateBlendConfig(config);
      expect(result.valid).toBe(true);
    });

    it("有效 blend 配置应通过", () => {
      const config = buildConfig({
        blend: { mode: "blend", chainWeight: 0.5, anchorWeight: 0.5, autoFallback: true },
      });
      const result = validateBlendConfig(config);
      expect(result.valid).toBe(true);
    });

    it("chainWeight 超出范围应报错", () => {
      const config = buildConfig({
        blend: { mode: "blend", chainWeight: 1.5, anchorWeight: 0.5, autoFallback: true },
      });
      const result = validateBlendConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("链式权重必须在 0-1 之间"))).toBe(true);
    });

    it("anchorWeight 超出范围应报错", () => {
      const config = buildConfig({
        blend: { mode: "blend", chainWeight: 0.5, anchorWeight: -0.1, autoFallback: true },
      });
      const result = validateBlendConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("锚定权重必须在 0-1 之间"))).toBe(true);
    });

    it("blend 模式权重总和不为 1 应警告", () => {
      const config = buildConfig({
        blend: { mode: "blend", chainWeight: 0.3, anchorWeight: 0.3, autoFallback: true },
      });
      const result = validateBlendConfig(config);
      expect(result.warnings.some((w) => w.includes("总和应接近1"))).toBe(true);
    });

    it("anchor_only 模式下 chainWeight > 0 应警告", () => {
      const config = buildConfig({
        blend: { mode: "anchor_only", chainWeight: 0.5, anchorWeight: 0.8, autoFallback: true },
      });
      const result = validateBlendConfig(config);
      expect(result.warnings.some((w) => w.includes("链式权重将不起作用"))).toBe(true);
    });

    it("chain_only 模式下 anchorWeight > 0 应警告", () => {
      const config = buildConfig({
        blend: { mode: "chain_only", chainWeight: 0.8, anchorWeight: 0.5, autoFallback: true },
      });
      const result = validateBlendConfig(config);
      expect(result.warnings.some((w) => w.includes("锚定权重将不起作用"))).toBe(true);
    });

    it("blend 模式权重总和接近 1 不应警告", () => {
      const config = buildConfig({
        blend: { mode: "blend", chainWeight: 0.5, anchorWeight: 0.5, autoFallback: true },
      });
      const result = validateBlendConfig(config);
      expect(result.warnings.some((w) => w.includes("总和应接近1"))).toBe(false);
    });
  });

  describe("getBlendMode", () => {
    it("无 blend 配置时应返回 anchor_only", () => {
      const config = buildConfig({ blend: undefined });
      expect(getBlendMode(config)).toBe("anchor_only");
    });

    it("应返回配置的模式", () => {
      const config = buildConfig({
        blend: { mode: "chain_only", chainWeight: 0.5, anchorWeight: 0.5, autoFallback: true },
      });
      expect(getBlendMode(config)).toBe("chain_only");
    });
  });

  describe("shouldUseChainReference", () => {
    it("chain_only 模式有前一帧时应返回 true", () => {
      const config = buildConfig({
        blend: { mode: "chain_only", chainWeight: 0.5, anchorWeight: 0.5, autoFallback: true },
      });
      expect(shouldUseChainReference(config, true)).toBe(true);
    });

    it("chain_only 模式无前一帧时应返回 false", () => {
      const config = buildConfig({
        blend: { mode: "chain_only", chainWeight: 0.5, anchorWeight: 0.5, autoFallback: true },
      });
      expect(shouldUseChainReference(config, false)).toBe(false);
    });

    it("anchor_only 模式应始终返回 false", () => {
      const config = buildConfig({
        blend: { mode: "anchor_only", chainWeight: 0.5, anchorWeight: 0.5, autoFallback: true },
      });
      expect(shouldUseChainReference(config, true)).toBe(false);
    });

    it("blend 模式有前一帧且 chainWeight > 0 时应返回 true", () => {
      const config = buildConfig({
        blend: { mode: "blend", chainWeight: 0.5, anchorWeight: 0.5, autoFallback: true },
      });
      expect(shouldUseChainReference(config, true)).toBe(true);
    });

    it("blend 模式无前一帧时应返回 false", () => {
      const config = buildConfig({
        blend: { mode: "blend", chainWeight: 0.5, anchorWeight: 0.5, autoFallback: true },
      });
      expect(shouldUseChainReference(config, false)).toBe(false);
    });

    it("blend 模式 chainWeight 为 0 时不应使用链式引用", () => {
      const config = buildConfig({
        blend: { mode: "blend", chainWeight: 0, anchorWeight: 1, autoFallback: true },
      });
      expect(shouldUseChainReference(config, true)).toBe(false);
    });
  });

  describe("buildBlendPrompt", () => {
    it("anchor_only 模式应只使用锚定提示词", () => {
      const config = buildConfig({
        blend: { mode: "anchor_only", chainWeight: 0, anchorWeight: 0.8, autoFallback: true },
      });
      const result = buildBlendPrompt("base prompt", config);
      expect(result.mode).toBe("anchor_only");
      expect(result.chainWeight).toBe(0);
      expect(result.anchorWeight).toBe(0.8);
      expect(result.prompt).toContain("发色:黑色");
      expect(result.prompt).toContain("服装:铠甲");
    });

    it("chain_only 模式有链式引用应使用链式提示词", () => {
      const config = buildConfig({
        blend: { mode: "chain_only", chainWeight: 0.8, anchorWeight: 0, autoFallback: true },
      });
      const result = buildBlendPrompt("base prompt", config, {
        imageUrl: "https://example.com/prev.jpg",
        description: "previous frame",
      });
      expect(result.mode).toBe("chain_only");
      expect(result.chainWeight).toBe(0.8);
      expect(result.anchorWeight).toBe(0);
      expect(result.prompt).toContain("previous frame");
    });

    it("chain_only 模式无链式引用应返回基础提示词", () => {
      const config = buildConfig({
        blend: { mode: "chain_only", chainWeight: 0.8, anchorWeight: 0, autoFallback: true },
      });
      const result = buildBlendPrompt("base prompt", config);
      expect(result.prompt).toBe("base prompt");
    });

    it("blend 模式有链式引用应组合两种提示词", () => {
      const config = buildConfig({
        blend: { mode: "blend", chainWeight: 0.5, anchorWeight: 0.5, autoFallback: true },
      });
      const result = buildBlendPrompt("base prompt", config, {
        imageUrl: "https://example.com/prev.jpg",
        description: "previous scene",
      });
      expect(result.prompt).toContain("Character appearance");
      expect(result.prompt).toContain("visual consistency with the previous frame");
    });

    it("blend 模式无链式引用应降级为锚定模式", () => {
      const config = buildConfig({
        blend: { mode: "blend", chainWeight: 0.5, anchorWeight: 0.5, autoFallback: true },
      });
      const result = buildBlendPrompt("base prompt", config);
      expect(result.prompt).toContain("Character appearance");
      expect(result.chainWeight).toBe(0);
    });

    it("无 blend 配置时应使用默认 anchor_only", () => {
      const config = buildConfig({ blend: undefined });
      const result = buildBlendPrompt("base prompt", config);
      expect(result.mode).toBe("anchor_only");
    });

    it("无角色锚点时 anchor_only 应返回基础提示词", () => {
      const config = buildConfig({
        characterAnchors: [],
        blend: { mode: "anchor_only", chainWeight: 0, anchorWeight: 0.8, autoFallback: true },
      });
      const result = buildBlendPrompt("base prompt", config);
      expect(result.prompt).toBe("base prompt");
    });
  });

  describe("performAutoFallback", () => {
    it("autoFallback 未启用时应返回原配置", () => {
      const config = buildConfig({
        blend: { mode: "blend", chainWeight: 0.5, anchorWeight: 0.5, autoFallback: false },
      });
      const result = performAutoFallback(config, "anchor_failed");
      expect(result.newConfig).toBe(config);
      expect(result.fallbackReason).toBe("autoFallback disabled");
    });

    it("blend 模式锚定失败应降级到 chain_only", () => {
      const config = buildConfig({
        blend: { mode: "blend", chainWeight: 0.5, anchorWeight: 0.5, autoFallback: true },
      });
      const result = performAutoFallback(config, "anchor_failed");
      expect(result.newConfig.blend?.mode).toBe("chain_only");
      expect(result.fallbackReason).toContain("锚定失败");
    });

    it("blend 模式链式失败应降级到 anchor_only", () => {
      const config = buildConfig({
        blend: { mode: "blend", chainWeight: 0.5, anchorWeight: 0.5, autoFallback: true },
      });
      const result = performAutoFallback(config, "chain_failed");
      expect(result.newConfig.blend?.mode).toBe("anchor_only");
      expect(result.fallbackReason).toContain("链式失败");
    });

    it("chain_only 模式链式失败应降级到 anchor_only", () => {
      const config = buildConfig({
        blend: { mode: "chain_only", chainWeight: 0.8, anchorWeight: 0, autoFallback: true },
      });
      const result = performAutoFallback(config, "chain_failed");
      expect(result.newConfig.blend?.mode).toBe("anchor_only");
    });

    it("anchor_only 模式锚定失败应降级到 chain_only", () => {
      const config = buildConfig({
        blend: { mode: "anchor_only", chainWeight: 0, anchorWeight: 0.8, autoFallback: true },
      });
      const result = performAutoFallback(config, "anchor_failed");
      expect(result.newConfig.blend?.mode).toBe("chain_only");
    });

    it("both_failed 不应触发降级", () => {
      const config = buildConfig({
        blend: { mode: "blend", chainWeight: 0.5, anchorWeight: 0.5, autoFallback: true },
      });
      const result = performAutoFallback(config, "both_failed");
      expect(result.newConfig.blend?.mode).toBe("blend");
      expect(result.fallbackReason).toBe("no fallback needed");
    });

    it("anchor_only 模式链式失败不需要降级", () => {
      const config = buildConfig({
        blend: { mode: "anchor_only", chainWeight: 0, anchorWeight: 0.8, autoFallback: true },
      });
      const result = performAutoFallback(config, "chain_failed");
      expect(result.fallbackReason).toBe("no fallback needed");
    });
  });

  describe("validateNoFrameBinding", () => {
    it("未启用特征锚定时应通过", () => {
      const config = buildConfig({ enabled: false });
      const result = validateNoFrameBinding(config);
      expect(result.valid).toBe(true);
    });

    it("启用且禁用帧绑定时应通过", () => {
      const config = buildConfig({ disableFrameBinding: true });
      const result = validateNoFrameBinding(config);
      expect(result.valid).toBe(true);
    });

    it("启用但未禁用帧绑定时应不通过", () => {
      const config = buildConfig({ disableFrameBinding: false });
      const result = validateNoFrameBinding(config);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("disableFrameBinding");
    });
  });

  describe("performConfigCheck", () => {
    it("所有检查都通过时应返回 allValid: true", () => {
      const config = buildConfig({
        disableFrameBinding: true,
        blend: { mode: "anchor_only", chainWeight: 0, anchorWeight: 0.8, autoFallback: true },
      });
      const result = performConfigCheck(config);
      expect(result.allValid).toBe(true);
      expect(result.anchoringValid).toBe(true);
      expect(result.frameBindingValid).toBe(true);
      expect(result.blendValid).toBe(true);
    });

    it("帧绑定未禁用时应 allValid: false", () => {
      const config = buildConfig({ disableFrameBinding: false });
      const result = performConfigCheck(config);
      expect(result.allValid).toBe(false);
      expect(result.frameBindingValid).toBe(false);
    });

    it("应合并所有错误和警告", () => {
      const config = buildConfig({
        characterAnchors: [],
        disableFrameBinding: false,
        blend: { mode: "blend", chainWeight: 1.5, anchorWeight: 0.5, autoFallback: true },
      });
      const result = performConfigCheck(config);
      expect(result.allValid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    });
  });
});
