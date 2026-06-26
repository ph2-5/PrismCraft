import { describe, it, expect } from "vitest";
import {
  shotInstructionSchema,
  featureAnchoringSchema,
  consistencyCheckResultSchema,
  shotReferenceSchema,
  shotGenerationStatusSchema,
  fixedImageSchema,
  referenceVideoSchema,
  elementTypeSchema,
  elementFeatureAnchorSchema,
} from "@/domain/schemas/shot-system";

describe("shotInstructionSchema", () => {
  it("应解析有效的镜头指令", () => {
    const result = shotInstructionSchema.safeParse({
      shotSize: "close",
      cameraMovement: "push",
      cameraAngle: "low",
    });
    expect(result.success).toBe(true);
  });

  it("应拒绝非法 shotSize 枚举值", () => {
    const result = shotInstructionSchema.safeParse({
      shotSize: "invalid",
      cameraMovement: "static",
      cameraAngle: "eye_level",
    });
    expect(result.success).toBe(false);
  });

  it("应拒绝非法 cameraMovement 枚举值", () => {
    const result = shotInstructionSchema.safeParse({
      shotSize: "wide",
      cameraMovement: "fly",
      cameraAngle: "eye_level",
    });
    expect(result.success).toBe(false);
  });

  it("应接受所有合法 shotSize 值", () => {
    const values = ["extreme_close", "close", "medium", "wide", "extreme_wide"];
    for (const val of values) {
      const result = shotInstructionSchema.safeParse({
        shotSize: val,
        cameraMovement: "static",
        cameraAngle: "eye_level",
      });
      expect(result.success).toBe(true);
    }
  });

  it("应接受所有合法 cameraAngle 值", () => {
    const values = ["eye_level", "low", "high", "birds_eye", "worms_eye", "dutch"];
    for (const val of values) {
      const result = shotInstructionSchema.safeParse({
        shotSize: "medium",
        cameraMovement: "static",
        cameraAngle: val,
      });
      expect(result.success).toBe(true);
    }
  });
});

describe("featureAnchoringSchema", () => {
  it("应解析有效的特征锚定配置", () => {
    const result = featureAnchoringSchema.safeParse({
      enabled: true,
      characterAnchors: [{
        elementId: "elem_1",
        referenceImageUrl: "/mock/ref.png",
        featureTags: ["face", "hair"],
      }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.characterAnchors[0]!.weight).toBe(0.8);
      expect(result.data.featureConsistencyStrength).toBe(0.8);
      expect(result.data.disableFrameBinding).toBe(true);
    }
  });

  it("应拒绝 weight 超出 0-1 范围", () => {
    const result = featureAnchoringSchema.safeParse({
      enabled: true,
      characterAnchors: [{
        elementId: "elem_1",
        referenceImageUrl: "/mock/ref.png",
        featureTags: [],
        weight: 1.5,
      }],
    });
    expect(result.success).toBe(false);
  });

  it("应拒绝 featureConsistencyStrength 超出范围", () => {
    const result = featureAnchoringSchema.safeParse({
      enabled: true,
      characterAnchors: [],
      featureConsistencyStrength: 2.0,
    });
    expect(result.success).toBe(false);
  });

  it("应正确应用默认值", () => {
    const result = featureAnchoringSchema.safeParse({
      enabled: false,
      characterAnchors: [],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.featureConsistencyStrength).toBe(0.8);
      expect(result.data.disableFrameBinding).toBe(true);
    }
  });
});

describe("consistencyCheckResultSchema", () => {
  it("应解析有效的一致性检查结果", () => {
    const result = consistencyCheckResultSchema.safeParse({
      passed: true,
      characterScores: [{
        elementId: "elem_1",
        elementName: "角色A",
        score: 0.95,
        issues: [],
      }],
      overallScore: 0.95,
      recommendation: "accept",
    });
    expect(result.success).toBe(true);
  });

  it("应拒绝非法 recommendation 枚举值", () => {
    const result = consistencyCheckResultSchema.safeParse({
      passed: false,
      characterScores: [],
      overallScore: 0.3,
      recommendation: "invalid",
    });
    expect(result.success).toBe(false);
  });
});

describe("shotReferenceSchema", () => {
  it("应解析有效的镜头引用", () => {
    const result = shotReferenceSchema.safeParse({
      direction: "previous",
      contentType: "last_frame",
    });
    expect(result.success).toBe(true);
  });

  it("应拒绝非法 direction 枚举值", () => {
    const result = shotReferenceSchema.safeParse({
      direction: "invalid",
      contentType: "full_video",
    });
    expect(result.success).toBe(false);
  });

  it("应接受所有合法 direction 值", () => {
    const values = ["none", "previous", "next", "custom"];
    for (const val of values) {
      const result = shotReferenceSchema.safeParse({
        direction: val,
        contentType: "full_video",
      });
      expect(result.success).toBe(true);
    }
  });
});

describe("shotGenerationStatusSchema", () => {
  it("应接受所有合法枚举值", () => {
    const values = ["idle", "pending", "generating", "completed", "failed"];
    for (const val of values) {
      expect(shotGenerationStatusSchema.safeParse(val).success).toBe(true);
    }
  });

  it("应拒绝非法枚举值", () => {
    expect(shotGenerationStatusSchema.safeParse("running").success).toBe(false);
  });
});

describe("fixedImageSchema", () => {
  it("应解析有效的固定图片配置", () => {
    const result = fixedImageSchema.safeParse({
      enabled: true,
      lockType: "character",
    });
    expect(result.success).toBe(true);
  });

  it("应拒绝非法 lockType 枚举值", () => {
    const result = fixedImageSchema.safeParse({
      enabled: true,
      lockType: "invalid",
    });
    expect(result.success).toBe(false);
  });
});

describe("referenceVideoSchema", () => {
  it("应解析有效的参考视频配置", () => {
    const result = referenceVideoSchema.safeParse({
      enabled: true,
      mimicryLevel: "medium",
    });
    expect(result.success).toBe(true);
  });

  it("应拒绝非法 mimicryLevel 枚举值", () => {
    const result = referenceVideoSchema.safeParse({
      enabled: true,
      mimicryLevel: "extreme",
    });
    expect(result.success).toBe(false);
  });
});

describe("elementTypeSchema", () => {
  it("应接受所有合法枚举值", () => {
    const values = ["character", "prop", "effect", "scene"];
    for (const val of values) {
      expect(elementTypeSchema.safeParse(val).success).toBe(true);
    }
  });

  it("应拒绝非法枚举值", () => {
    expect(elementTypeSchema.safeParse("invalid").success).toBe(false);
  });
});

describe("elementFeatureAnchorSchema", () => {
  it("应解析有效的元素特征锚定", () => {
    const result = elementFeatureAnchorSchema.safeParse({
      elementId: "elem_1",
      elementType: "character",
      referenceImageUrl: "/mock/ref.png",
      featureTags: ["face"],
      extractedAt: "2024-01-01T00:00:00Z",
      confidence: 0.9,
    });
    expect(result.success).toBe(true);
  });

  it("应拒绝缺少必填字段", () => {
    const result = elementFeatureAnchorSchema.safeParse({
      elementId: "elem_1",
      elementType: "character",
    });
    expect(result.success).toBe(false);
  });
});
