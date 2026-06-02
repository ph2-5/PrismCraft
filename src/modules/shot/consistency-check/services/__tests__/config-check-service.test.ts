import { describe, it, expect } from "vitest";
import {
  performConfigCheck,
  performConsistencyCheck,
  validateFeatureAnchoringConfig,
  validateNoFrameBinding,
} from "@/modules/shot";
import type { FeatureAnchoringConfig, StoryElement } from "@/domain/schemas";

function makeElement(overrides: Record<string, unknown> = {}): StoryElement {
  return {
    id: "elem-1",
    type: "character",
    name: "角色A",
    description: "主角",
    bindings: [],
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    ...overrides,
  } as StoryElement;
}

function makeFeatureAnchoringConfig(
  overrides: Partial<FeatureAnchoringConfig> = {},
): FeatureAnchoringConfig {
  return {
    enabled: true,
    characterAnchors: [
      {
        elementId: "elem-1",
        referenceImageUrl: "https://example.com/ref.png",
        featureTags: ["face", "hair"],
        weight: 0.8,
      },
    ],
    disableFrameBinding: true,
    featureConsistencyStrength: 0.8,
    ...overrides,
  };
}

describe("performConfigCheck", () => {
  it("有效锚点应返回高分", () => {
    const config = makeFeatureAnchoringConfig();
    const elements = [makeElement()];

    const result = performConfigCheck({ featureAnchoring: config, elements });

    expect(result.passed).toBe(true);
    expect(result.overallScore).toBe(0.8);
    expect(result.recommendation).toBe("accept");
    expect(result.characterScores).toHaveLength(1);
    expect(result.characterScores[0].issues).toHaveLength(0);
  });

  it("缺少参考图应添加问题", () => {
    const config = makeFeatureAnchoringConfig({
      characterAnchors: [
        {
          elementId: "elem-1",
          referenceImageUrl: "",
          featureTags: ["face"],
          weight: 0.8,
        },
      ],
    });
    const elements = [makeElement()];

    const result = performConfigCheck({ featureAnchoring: config, elements });

    expect(result.characterScores[0].issues).toContain("缺少角色参考图");
    expect(result.characterScores[0].score).toBeLessThan(0.8);
  });

  it("缺少特征标签应添加问题", () => {
    const config = makeFeatureAnchoringConfig({
      characterAnchors: [
        {
          elementId: "elem-1",
          referenceImageUrl: "https://example.com/ref.png",
          featureTags: [],
          weight: 0.8,
        },
      ],
    });
    const elements = [makeElement()];

    const result = performConfigCheck({ featureAnchoring: config, elements });

    expect(result.characterScores[0].issues).toContain(
      "缺少角色特征标签，一致性约束可能不足",
    );
  });

  it("缺少参考图和特征标签应有两个问题", () => {
    const config = makeFeatureAnchoringConfig({
      characterAnchors: [
        {
          elementId: "elem-1",
          referenceImageUrl: "",
          featureTags: [],
          weight: 0.8,
        },
      ],
    });
    const elements = [makeElement()];

    const result = performConfigCheck({ featureAnchoring: config, elements });

    expect(result.characterScores[0].issues).toHaveLength(2);
    expect(result.characterScores[0].score).toBeCloseTo(0.2);
    expect(result.passed).toBe(false);
  });

  it("未找到对应元素时应使用未知角色名", () => {
    const config = makeFeatureAnchoringConfig({
      characterAnchors: [
        {
          elementId: "elem-999",
          referenceImageUrl: "https://example.com/ref.png",
          featureTags: ["face"],
          weight: 0.8,
        },
      ],
    });
    const elements = [makeElement({ id: "elem-1" })];

    const result = performConfigCheck({ featureAnchoring: config, elements });

    expect(result.characterScores[0].elementName).toBe("未知角色");
  });

  it("无锚点时 overallScore 应为 0", () => {
    const config = makeFeatureAnchoringConfig({ characterAnchors: [] });
    const elements: StoryElement[] = [];

    const result = performConfigCheck({ featureAnchoring: config, elements });

    expect(result.overallScore).toBe(0);
  });

  it("有问题的配置应返回 adjust 或 regenerate 建议", () => {
    const config = makeFeatureAnchoringConfig({
      characterAnchors: [
        {
          elementId: "elem-1",
          referenceImageUrl: "",
          featureTags: [],
          weight: 0.8,
        },
      ],
    });
    const elements = [makeElement()];

    const result = performConfigCheck({ featureAnchoring: config, elements });

    expect(result.recommendation).not.toBe("accept");
  });
});

describe("performConsistencyCheck", () => {
  it("应委托给 performConfigCheck", () => {
    const config = makeFeatureAnchoringConfig();
    const elements = [makeElement()];

    const result = performConsistencyCheck({
      videoUrl: "https://example.com/video.mp4",
      featureAnchoring: config,
      elements,
    });

    const expected = performConfigCheck({ featureAnchoring: config, elements });
    expect(result).toEqual(expected);
  });
});

describe("validateFeatureAnchoringConfig", () => {
  it("禁用配置应返回 valid:true", () => {
    const config = makeFeatureAnchoringConfig({ enabled: false });

    const result = validateFeatureAnchoringConfig(config);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it("空锚点应返回错误", () => {
    const config = makeFeatureAnchoringConfig({
      enabled: true,
      characterAnchors: [],
    });

    const result = validateFeatureAnchoringConfig(config);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("特征锚定已启用但未配置任何角色锚点");
  });

  it("缺少参考图应返回错误", () => {
    const config = makeFeatureAnchoringConfig({
      characterAnchors: [
        {
          elementId: "elem-1",
          referenceImageUrl: "",
          featureTags: ["face"],
          weight: 0.8,
        },
      ],
    });

    const result = validateFeatureAnchoringConfig(config);

    expect(result.errors).toContain('角色锚点"elem-1"缺少参考图');
  });

  it("缺少特征标签应返回警告", () => {
    const config = makeFeatureAnchoringConfig({
      characterAnchors: [
        {
          elementId: "elem-1",
          referenceImageUrl: "https://example.com/ref.png",
          featureTags: [],
          weight: 0.8,
        },
      ],
    });

    const result = validateFeatureAnchoringConfig(config);

    expect(result.warnings).toContain('角色锚点"elem-1"缺少特征标签');
  });

  it("权重低于 0.3 应返回警告", () => {
    const config = makeFeatureAnchoringConfig({
      characterAnchors: [
        {
          elementId: "elem-1",
          referenceImageUrl: "https://example.com/ref.png",
          featureTags: ["face"],
          weight: 0.2,
        },
      ],
    });

    const result = validateFeatureAnchoringConfig(config);

    expect(result.warnings).toContain(
      '角色锚点"elem-1"权重异常(0.2)，建议范围0.3-1.0',
    );
  });

  it("权重高于 1.0 应返回警告", () => {
    const config = makeFeatureAnchoringConfig({
      characterAnchors: [
        {
          elementId: "elem-1",
          referenceImageUrl: "https://example.com/ref.png",
          featureTags: ["face"],
          weight: 1.2,
        },
      ],
    });

    const result = validateFeatureAnchoringConfig(config);

    expect(result.warnings).toContain(
      '角色锚点"elem-1"权重异常(1.2)，建议范围0.3-1.0',
    );
  });

  it("未禁用帧绑定应返回警告", () => {
    const config = makeFeatureAnchoringConfig({
      disableFrameBinding: false,
    });

    const result = validateFeatureAnchoringConfig(config);

    expect(result.warnings).toContain(
      "特征锚定模式下建议禁用帧绑定(disableFrameBinding=true)",
    );
  });

  it("一致性强度过低应返回警告", () => {
    const config = makeFeatureAnchoringConfig({
      featureConsistencyStrength: 0.2,
    });

    const result = validateFeatureAnchoringConfig(config);

    expect(result.warnings).toContain(
      "特征一致性强度过低，可能导致角色崩坏",
    );
  });

  it("一致性强度过高应返回警告", () => {
    const config = makeFeatureAnchoringConfig({
      featureConsistencyStrength: 0.96,
    });

    const result = validateFeatureAnchoringConfig(config);

    expect(result.warnings).toContain(
      "特征一致性强度过高，可能限制视频动态表现力",
    );
  });

  it("有效配置应返回 valid:true 且无错误", () => {
    const config = makeFeatureAnchoringConfig();

    const result = validateFeatureAnchoringConfig(config);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

describe("validateNoFrameBinding", () => {
  it("无帧绑定时应返回 valid:true", () => {
    const result = validateNoFrameBinding({
      videoRequestParams: {},
    });

    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("有 previousLastFrameUrl 时应返回 valid:false", () => {
    const result = validateNoFrameBinding({
      videoRequestParams: {
        previousLastFrameUrl: "https://example.com/last-frame.png",
      },
    });

    expect(result.valid).toBe(false);
    expect(result.error).toContain("上一分镜尾帧");
  });

  it("fixedImage lockType 为 first_frame 时应返回 valid:false", () => {
    const result = validateNoFrameBinding({
      videoRequestParams: {
        fixedImage: { lockType: "first_frame" },
      },
    });

    expect(result.valid).toBe(false);
    expect(result.error).toContain("首帧或尾帧");
  });

  it("fixedImage lockType 为 last_frame 时应返回 valid:false", () => {
    const result = validateNoFrameBinding({
      videoRequestParams: {
        fixedImage: { lockType: "last_frame" },
      },
    });

    expect(result.valid).toBe(false);
    expect(result.error).toContain("首帧或尾帧");
  });

  it("fixedImage lockType 为 character 时应返回 valid:true", () => {
    const result = validateNoFrameBinding({
      videoRequestParams: {
        fixedImage: { lockType: "character" },
      },
    });

    expect(result.valid).toBe(true);
  });
});
