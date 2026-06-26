import { describe, it, expect } from "vitest";
import {
  performConfigCheck,
  performConsistencyCheck,
  validateFeatureAnchoringConfig,
  validateNoFrameBinding,
  type FeatureAnchoringConfig,
} from "../consistency-check";

describe("consistency-check", () => {
  describe("performConfigCheck", () => {
    it("应该对完整配置的角色给出高分并通过", () => {
      const result = performConfigCheck({
        featureAnchoring: {
          enabled: true,
          characterAnchors: [
            {
              elementId: "c1",
              referenceImageUrl: "https://example.com/ref.png",
              featureTags: ["长发", "蓝眼"],
              weight: 0.8,
            },
          ],
        },
        elements: [{ id: "c1", name: "小明" }],
      });
      expect(result.passed).toBe(true);
      expect(result.overallScore).toBe(0.8);
      expect(result.recommendation).toBe("accept");
      expect(result.characterScores).toHaveLength(1);
      expect(result.characterScores[0]!.elementName).toBe("小明");
      expect(result.characterScores[0]!.issues).toHaveLength(0);
    });

    it("缺少参考图的角色应给出较低分并标记问题", () => {
      const result = performConfigCheck({
        featureAnchoring: {
          enabled: true,
          characterAnchors: [
            {
              elementId: "c1",
              featureTags: ["长发"],
              weight: 0.5,
            },
          ],
        },
        elements: [{ id: "c1", name: "小红" }],
      });
      expect(result.passed).toBe(false);
      expect(result.overallScore).toBe(0.5);
      expect(result.recommendation).toBe("adjust");
      expect(result.characterScores[0]!.issues).toContain("Missing character reference image");
    });

    it("缺少特征标签的角色应给出问题提示", () => {
      const result = performConfigCheck({
        featureAnchoring: {
          enabled: true,
          characterAnchors: [
            {
              elementId: "c1",
              referenceImageUrl: "https://example.com/ref.png",
              weight: 0.5,
            },
          ],
        },
        elements: [{ id: "c1", name: "小蓝" }],
      });
      expect(result.characterScores[0]!.issues).toContain(
        "Missing character feature tags, consistency constraint may be insufficient",
      );
    });

    it("元素不存在时应使用'未知角色'作为名称", () => {
      const result = performConfigCheck({
        featureAnchoring: {
          enabled: true,
          characterAnchors: [
            {
              elementId: "missing",
              referenceImageUrl: "https://example.com/ref.png",
              featureTags: ["tag"],
              weight: 0.5,
            },
          ],
        },
        elements: [],
      });
      expect(result.characterScores[0]!.elementName).toBe("Unknown character");
    });

    it("空锚点列表时 overallScore 应为 0", () => {
      const result = performConfigCheck({
        featureAnchoring: {
          enabled: true,
          characterAnchors: [],
        },
        elements: [],
      });
      expect(result.overallScore).toBe(0);
      // overallScore 为 0，不满足 >= 0.6 条件，因此 passed 为 false
      expect(result.passed).toBe(false);
      expect(result.recommendation).toBe("regenerate");
    });

    it("多个问题叠加时分数不应低于 0", () => {
      const result = performConfigCheck({
        featureAnchoring: {
          enabled: true,
          characterAnchors: [
            {
              elementId: "c1",
              weight: 0.5,
            },
          ],
        },
        elements: [],
      });
      expect(result.characterScores[0]!.score).toBeGreaterThanOrEqual(0);
      // 缺参考图 + 缺特征标签 = 2 个问题，0.8 - 0.6 = 0.2（浮点精度容差）
      expect(result.characterScores[0]!.score).toBeCloseTo(0.2, 10);
    });
  });

  describe("performConsistencyCheck", () => {
    it("应该与 performConfigCheck 行为一致", () => {
      const params = {
        featureAnchoring: {
          enabled: true,
          characterAnchors: [
            {
              elementId: "c1",
              referenceImageUrl: "url",
              featureTags: ["tag"],
              weight: 0.5,
            },
          ],
        } as FeatureAnchoringConfig,
        elements: [{ id: "c1", name: "角色A" }],
      };
      const result1 = performConfigCheck(params);
      const result2 = performConsistencyCheck(params);
      expect(result2.overallScore).toBe(result1.overallScore);
      expect(result2.passed).toBe(result1.passed);
      expect(result2.recommendation).toBe(result1.recommendation);
    });
  });

  describe("validateFeatureAnchoringConfig", () => {
    it("未启用时应直接返回 valid=true", () => {
      const result = validateFeatureAnchoringConfig({
        enabled: false,
        characterAnchors: [],
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it("启用但未配置任何角色锚点时应报错", () => {
      const result = validateFeatureAnchoringConfig({
        enabled: true,
        characterAnchors: [],
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Feature anchoring is enabled but no character anchors are configured");
    });

    it("角色锚点缺少参考图时应报错", () => {
      const result = validateFeatureAnchoringConfig({
        enabled: true,
        characterAnchors: [
          { elementId: "c1", featureTags: ["tag"], weight: 0.5 },
        ],
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Character anchor "c1" is missing reference image');
    });

    it("角色锚点缺少特征标签时应给出警告", () => {
      const result = validateFeatureAnchoringConfig({
        enabled: true,
        characterAnchors: [
          {
            elementId: "c1",
            referenceImageUrl: "url",
            weight: 0.5,
          },
        ],
      });
      expect(result.valid).toBe(true);
      expect(result.warnings).toContain('Character anchor "c1" is missing feature tags');
    });

    it("权重过低时应给出警告", () => {
      const result = validateFeatureAnchoringConfig({
        enabled: true,
        characterAnchors: [
          {
            elementId: "c1",
            referenceImageUrl: "url",
            featureTags: ["tag"],
            weight: 0.1,
          },
        ],
      });
      expect(result.warnings).toContain(
        'Character anchor "c1" has abnormal weight (0.1), recommended range 0.3-1.0',
      );
    });

    it("权重过高时应给出警告", () => {
      const result = validateFeatureAnchoringConfig({
        enabled: true,
        characterAnchors: [
          {
            elementId: "c1",
            referenceImageUrl: "url",
            featureTags: ["tag"],
            weight: 1.5,
          },
        ],
      });
      expect(result.warnings).toContain(
        'Character anchor "c1" has abnormal weight (1.5), recommended range 0.3-1.0',
      );
    });

    it("未禁用帧绑定时应给出警告", () => {
      const result = validateFeatureAnchoringConfig({
        enabled: true,
        characterAnchors: [
          {
            elementId: "c1",
            referenceImageUrl: "url",
            featureTags: ["tag"],
            weight: 0.5,
          },
        ],
        disableFrameBinding: false,
      });
      expect(result.warnings).toContain(
        "It is recommended to disable frame binding in feature anchoring mode (disableFrameBinding=true)",
      );
    });

    it("特征一致性强度过低时应给出警告", () => {
      const result = validateFeatureAnchoringConfig({
        enabled: true,
        characterAnchors: [
          {
            elementId: "c1",
            referenceImageUrl: "url",
            featureTags: ["tag"],
            weight: 0.5,
          },
        ],
        disableFrameBinding: true,
        featureConsistencyStrength: 0.2,
      });
      expect(result.warnings).toContain(
        "Feature consistency strength is too low, may cause character distortion",
      );
    });

    it("特征一致性强度过高时应给出警告", () => {
      const result = validateFeatureAnchoringConfig({
        enabled: true,
        characterAnchors: [
          {
            elementId: "c1",
            referenceImageUrl: "url",
            featureTags: ["tag"],
            weight: 0.5,
          },
        ],
        disableFrameBinding: true,
        featureConsistencyStrength: 0.97,
      });
      expect(result.warnings).toContain(
        "Feature consistency strength is too high, may limit video dynamic expression",
      );
    });
  });

  describe("validateNoFrameBinding", () => {
    it("无 videoRequestParams 时应通过", () => {
      const result = validateNoFrameBinding({});
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("videoRequestParams 为空对象时应通过", () => {
      const result = validateNoFrameBinding({ videoRequestParams: {} });
      expect(result.valid).toBe(true);
    });

    it("存在 previousLastFrameUrl 时应不通过", () => {
      const result = validateNoFrameBinding({
        videoRequestParams: {
          previousLastFrameUrl: "https://example.com/last.png",
        },
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Using previous shot's last frame as reference is forbidden");
    });

    it("fixedImage 锁定类型为 first_frame 时应不通过", () => {
      const result = validateNoFrameBinding({
        videoRequestParams: {
          fixedImage: { lockType: "first_frame" },
        },
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Binding reference image as first or last frame is forbidden");
    });

    it("fixedImage 锁定类型为 last_frame 时应不通过", () => {
      const result = validateNoFrameBinding({
        videoRequestParams: {
          fixedImage: { lockType: "last_frame" },
        },
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Binding reference image as first or last frame is forbidden");
    });

    it("fixedImage 锁定类型为其他值时应通过", () => {
      const result = validateNoFrameBinding({
        videoRequestParams: {
          fixedImage: { lockType: "other" },
        },
      });
      expect(result.valid).toBe(true);
    });
  });
});
