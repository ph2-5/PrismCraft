/**
 * cross-shot-auto-fix 服务单元测试
 *
 * 验证 Task 4.8 Done 标准：
 * - featureTags 漂移自动修复成功
 * - referenceImageUrl 漂移提示用户确认
 * - 修复后一致性检查通过
 * - 不可自动修复的情况（referenceImageUrl 不一致）提示用户手动确认
 */

import { describe, it, expect } from "vitest";
import {
  autoFixCrossShotConsistency,
  applyManualReferenceUrlFix,
} from "../cross-shot-auto-fix";
import type { CrossShotConsistencyInput } from "../cross-shot-consistency-service";
import type { StoryBeat, StoryElement } from "@/domain/schemas";

// ============= 测试辅助函数 =============

function makeBeat(overrides: Partial<StoryBeat> = {}): StoryBeat {
  return {
    id: "beat-1",
    sequence: 1,
    description: "A scene",
    duration: 5,
    characters: [],
    elementIds: [],
    characterIds: [],
    enhancedGeneration: false,
    ...overrides,
  } as StoryBeat;
}

function makeElement(overrides: Partial<StoryElement> = {}): StoryElement {
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

function makeFeatureAnchoring(
  elementId: string,
  featureTags: string[],
  referenceImageUrl: string,
) {
  return {
    enabled: true,
    disableFrameBinding: true,
    featureConsistencyStrength: 0.8,
    characterAnchors: [
      { elementId, referenceImageUrl, featureTags, weight: 0.8 },
    ],
  };
}

// ============= 测试 =============

describe("autoFixCrossShotConsistency", () => {
  describe("无漂移场景", () => {
    it("无漂移时应直接返回原 beats，无修复", () => {
      const input: CrossShotConsistencyInput = {
        beats: [
          makeBeat({
            id: "beat-1",
            elementIds: ["elem-1"],
            featureAnchoring: makeFeatureAnchoring("elem-1", ["黑发", "蓝眼"], "ref.png"),
          }),
          makeBeat({
            id: "beat-2",
            elementIds: ["elem-1"],
            featureAnchoring: makeFeatureAnchoring("elem-1", ["黑发", "蓝眼"], "ref.png"),
          }),
        ],
        elements: [makeElement({ id: "elem-1", name: "角色A" })],
      };

      const result = autoFixCrossShotConsistency(input);

      expect(result.appliedFixes).toHaveLength(0);
      expect(result.manualConfirmFixes).toHaveLength(0);
      expect(result.allResolved).toBe(true);
      expect(result.postFixConsistency.passed).toBe(true);
      expect(result.driftAnalyses).toHaveLength(0);
    });

    it("单个分镜无漂移 → allResolved: true", () => {
      const input: CrossShotConsistencyInput = {
        beats: [
          makeBeat({
            id: "beat-1",
            elementIds: ["elem-1"],
            featureAnchoring: makeFeatureAnchoring("elem-1", ["黑发"], "ref.png"),
          }),
        ],
        elements: [makeElement({ id: "elem-1" })],
      };

      const result = autoFixCrossShotConsistency(input);
      expect(result.allResolved).toBe(true);
      expect(result.appliedFixes).toHaveLength(0);
    });
  });

  describe("featureTags 漂移自动修复", () => {
    it("featureTags 漂移但 referenceImageUrl 一致 → 应自动修复", () => {
      const input: CrossShotConsistencyInput = {
        beats: [
          makeBeat({
            id: "beat-1",
            elementIds: ["elem-1"],
            featureAnchoring: makeFeatureAnchoring("elem-1", ["黑发", "蓝眼"], "ref.png"),
          }),
          makeBeat({
            id: "beat-2",
            elementIds: ["elem-1"],
            featureAnchoring: makeFeatureAnchoring("elem-1", ["金发", "绿眼"], "ref.png"),
          }),
        ],
        elements: [makeElement({ id: "elem-1", name: "角色A" })],
      };

      const result = autoFixCrossShotConsistency(input);

      // 应自动修复
      expect(result.appliedFixes).toHaveLength(1);
      expect(result.appliedFixes[0]!.elementId).toBe("elem-1");
      expect(result.appliedFixes[0]!.kind).toBe("featureTags");
      // beat-1 是基准（1:1 并列时选第一个），只有 beat-2 被修改
      expect(result.appliedFixes[0]!.beatIds).toEqual(["beat-2"]);

      // 不应需要手动确认
      expect(result.manualConfirmFixes).toHaveLength(0);

      // 修复后一致性检查应通过
      expect(result.postFixConsistency.passed).toBe(true);
      expect(result.postFixConsistency.overallDriftScore).toBe(0);

      // allResolved 应为 true（无剩余手动确认项）
      expect(result.allResolved).toBe(true);
    });

    it("多数派 featureTags 应被选为基准（2:1 场景）", () => {
      const input: CrossShotConsistencyInput = {
        beats: [
          makeBeat({
            id: "beat-1",
            elementIds: ["elem-1"],
            featureAnchoring: makeFeatureAnchoring("elem-1", ["黑发", "蓝眼"], "ref.png"),
          }),
          makeBeat({
            id: "beat-2",
            elementIds: ["elem-1"],
            featureAnchoring: makeFeatureAnchoring("elem-1", ["黑发", "蓝眼"], "ref.png"),
          }),
          makeBeat({
            id: "beat-3",
            elementIds: ["elem-1"],
            featureAnchoring: makeFeatureAnchoring("elem-1", ["金发", "绿眼"], "ref.png"),
          }),
        ],
        elements: [makeElement({ id: "elem-1", name: "角色A" })],
      };

      const result = autoFixCrossShotConsistency(input);

      expect(result.appliedFixes).toHaveLength(1);
      // 多数派是 ["黑发", "蓝眼"]（出现 2 次）
      expect(result.appliedFixes[0]!.afterFeatureTags).toEqual(["黑发", "蓝眼"]);
      // 只 beat-3 需要修改
      expect(result.appliedFixes[0]!.beatIds).toEqual(["beat-3"]);
    });

    it("并列时选第一个出现的作为基准（1:1 场景）", () => {
      const input: CrossShotConsistencyInput = {
        beats: [
          makeBeat({
            id: "beat-1",
            elementIds: ["elem-1"],
            featureAnchoring: makeFeatureAnchoring("elem-1", ["黑发"], "ref.png"),
          }),
          makeBeat({
            id: "beat-2",
            elementIds: ["elem-1"],
            featureAnchoring: makeFeatureAnchoring("elem-1", ["金发"], "ref.png"),
          }),
        ],
        elements: [makeElement({ id: "elem-1", name: "角色A" })],
      };

      const result = autoFixCrossShotConsistency(input);

      expect(result.appliedFixes).toHaveLength(1);
      // 第一个出现的 ["黑发"] 被选为基准
      expect(result.appliedFixes[0]!.afterFeatureTags).toEqual(["黑发"]);
      // beat-2 需要修改
      expect(result.appliedFixes[0]!.beatIds).toEqual(["beat-2"]);
    });

    it("修复后的 beats 应同步更新 featureTags", () => {
      const input: CrossShotConsistencyInput = {
        beats: [
          makeBeat({
            id: "beat-1",
            elementIds: ["elem-1"],
            featureAnchoring: makeFeatureAnchoring("elem-1", ["黑发", "蓝眼"], "ref.png"),
          }),
          makeBeat({
            id: "beat-2",
            elementIds: ["elem-1"],
            featureAnchoring: makeFeatureAnchoring("elem-1", ["金发", "绿眼"], "ref.png"),
          }),
        ],
        elements: [makeElement({ id: "elem-1" })],
      };

      const result = autoFixCrossShotConsistency(input);

      // beat-2 的 featureTags 应被更新为多数派
      const fixedBeat2 = result.fixedBeats.find((b) => b.id === "beat-2")!;
      const anchor = fixedBeat2.featureAnchoring!.characterAnchors[0]!;
      expect(anchor.featureTags).toEqual(["黑发", "蓝眼"]);
    });

    it("修复不应修改原 beats 数组（纯函数）", () => {
      const originalBeat2Tags = ["金发", "绿眼"];
      const input: CrossShotConsistencyInput = {
        beats: [
          makeBeat({
            id: "beat-1",
            elementIds: ["elem-1"],
            featureAnchoring: makeFeatureAnchoring("elem-1", ["黑发", "蓝眼"], "ref.png"),
          }),
          makeBeat({
            id: "beat-2",
            elementIds: ["elem-1"],
            featureAnchoring: makeFeatureAnchoring("elem-1", originalBeat2Tags, "ref.png"),
          }),
        ],
        elements: [makeElement({ id: "elem-1" })],
      };

      autoFixCrossShotConsistency(input);

      // 原 input.beats[1] 的 featureTags 应保持不变
      const originalAnchor = input.beats[1]!.featureAnchoring!.characterAnchors[0]!;
      expect(originalAnchor.featureTags).toEqual(originalBeat2Tags);
    });

    it("propAnchors 中的 featureTags 漂移也应被修复", () => {
      const input: CrossShotConsistencyInput = {
        beats: [
          makeBeat({
            id: "beat-1",
            elementIds: ["prop-1"],
            featureAnchoring: {
              enabled: true,
              disableFrameBinding: true,
              featureConsistencyStrength: 0.8,
              characterAnchors: [],
              propAnchors: [
                { elementId: "prop-1", referenceImageUrl: "ref.png", featureTags: ["金属", "银色"], weight: 0.8 },
              ],
            },
          }),
          makeBeat({
            id: "beat-2",
            elementIds: ["prop-1"],
            featureAnchoring: {
              enabled: true,
              disableFrameBinding: true,
              featureConsistencyStrength: 0.8,
              characterAnchors: [],
              propAnchors: [
                { elementId: "prop-1", referenceImageUrl: "ref.png", featureTags: ["木质", "棕色"], weight: 0.8 },
              ],
            },
          }),
        ],
        elements: [makeElement({ id: "prop-1", name: "宝剑", type: "prop" })],
      };

      const result = autoFixCrossShotConsistency(input);

      expect(result.appliedFixes).toHaveLength(1);
      expect(result.appliedFixes[0]!.elementId).toBe("prop-1");
      expect(result.appliedFixes[0]!.afterFeatureTags).toEqual(["金属", "银色"]);
    });
  });

  describe("referenceImageUrl 漂移提示用户确认", () => {
    it("referenceImageUrl 漂移但 featureTags 一致 → 应提示手动确认", () => {
      const input: CrossShotConsistencyInput = {
        beats: [
          makeBeat({
            id: "beat-1",
            elementIds: ["elem-1"],
            featureAnchoring: makeFeatureAnchoring("elem-1", ["黑发", "蓝眼"], "ref1.png"),
          }),
          makeBeat({
            id: "beat-2",
            elementIds: ["elem-1"],
            featureAnchoring: makeFeatureAnchoring("elem-1", ["黑发", "蓝眼"], "ref2.png"),
          }),
        ],
        elements: [makeElement({ id: "elem-1", name: "角色A" })],
      };

      const result = autoFixCrossShotConsistency(input);

      // 不应自动修复
      expect(result.appliedFixes).toHaveLength(0);

      // 应需要手动确认
      expect(result.manualConfirmFixes).toHaveLength(1);
      expect(result.manualConfirmFixes[0]!.elementId).toBe("elem-1");
      expect(result.manualConfirmFixes[0]!.kind).toBe("referenceImageUrl");
      expect(result.manualConfirmFixes[0]!.candidateReferenceImageUrls).toContain("ref1.png");
      expect(result.manualConfirmFixes[0]!.candidateReferenceImageUrls).toContain("ref2.png");
      expect(result.manualConfirmFixes[0]!.reason).toContain("referenceImageUrl");

      // allResolved 应为 false（有待确认项）
      expect(result.allResolved).toBe(false);
    });

    it("both 漂移（featureTags + referenceImageUrl 均不一致）→ 应提示手动确认", () => {
      const input: CrossShotConsistencyInput = {
        beats: [
          makeBeat({
            id: "beat-1",
            elementIds: ["elem-1"],
            featureAnchoring: makeFeatureAnchoring("elem-1", ["黑发", "蓝眼"], "ref1.png"),
          }),
          makeBeat({
            id: "beat-2",
            elementIds: ["elem-1"],
            featureAnchoring: makeFeatureAnchoring("elem-1", ["金发", "绿眼"], "ref2.png"),
          }),
        ],
        elements: [makeElement({ id: "elem-1", name: "角色A" })],
      };

      const result = autoFixCrossShotConsistency(input);

      // 不应自动修复（因为 referenceImageUrl 也不一致）
      expect(result.appliedFixes).toHaveLength(0);

      // 应需要手动确认，kind 为 both
      expect(result.manualConfirmFixes).toHaveLength(1);
      expect(result.manualConfirmFixes[0]!.kind).toBe("both");
      expect(result.manualConfirmFixes[0]!.reason).toContain("featureTags");
      expect(result.manualConfirmFixes[0]!.reason).toContain("referenceImageUrl");
    });

    it("候选 URL 应去重", () => {
      const input: CrossShotConsistencyInput = {
        beats: [
          makeBeat({
            id: "beat-1",
            elementIds: ["elem-1"],
            featureAnchoring: makeFeatureAnchoring("elem-1", ["黑发"], "ref1.png"),
          }),
          makeBeat({
            id: "beat-2",
            elementIds: ["elem-1"],
            featureAnchoring: makeFeatureAnchoring("elem-1", ["黑发"], "ref1.png"),
          }),
          makeBeat({
            id: "beat-3",
            elementIds: ["elem-1"],
            featureAnchoring: makeFeatureAnchoring("elem-1", ["黑发"], "ref2.png"),
          }),
        ],
        elements: [makeElement({ id: "elem-1" })],
      };

      const result = autoFixCrossShotConsistency(input);

      // ref1.png 出现 2 次，ref2.png 出现 1 次 → ref1.png 是多数派
      // 但 referenceImageUrl 漂移不自动修复
      expect(result.manualConfirmFixes).toHaveLength(1);
      const candidateUrls = result.manualConfirmFixes[0]!.candidateReferenceImageUrls;
      // 去重后应只有 2 个
      expect(candidateUrls).toHaveLength(2);
      expect(candidateUrls).toContain("ref1.png");
      expect(candidateUrls).toContain("ref2.png");
    });
  });

  describe("修复后一致性检查", () => {
    it("featureTags 漂移修复后应通过一致性检查", () => {
      const input: CrossShotConsistencyInput = {
        beats: [
          makeBeat({
            id: "beat-1",
            elementIds: ["elem-1"],
            featureAnchoring: makeFeatureAnchoring("elem-1", ["黑发", "蓝眼"], "ref.png"),
          }),
          makeBeat({
            id: "beat-2",
            elementIds: ["elem-1"],
            featureAnchoring: makeFeatureAnchoring("elem-1", ["金发", "绿眼"], "ref.png"),
          }),
        ],
        elements: [makeElement({ id: "elem-1" })],
      };

      const result = autoFixCrossShotConsistency(input);

      expect(result.postFixConsistency.passed).toBe(true);
      expect(result.postFixConsistency.overallDriftScore).toBe(0);
      expect(result.postFixConsistency.recommendation).toBe("accept");
    });

    it("referenceImageUrl 漂移未修复时一致性检查仍不通过", () => {
      const input: CrossShotConsistencyInput = {
        beats: [
          makeBeat({
            id: "beat-1",
            elementIds: ["elem-1"],
            featureAnchoring: makeFeatureAnchoring("elem-1", ["黑发"], "ref1.png"),
          }),
          makeBeat({
            id: "beat-2",
            elementIds: ["elem-1"],
            featureAnchoring: makeFeatureAnchoring("elem-1", ["黑发"], "ref2.png"),
          }),
        ],
        elements: [makeElement({ id: "elem-1" })],
      };

      const result = autoFixCrossShotConsistency(input);

      // referenceImageUrl 漂移未修复，driftScore 仍为 0.2
      expect(result.postFixConsistency.overallDriftScore).toBe(0.2);
      expect(result.postFixConsistency.recommendation).toBe("adjust");
    });
  });

  describe("混合场景", () => {
    it("部分元素可自动修复，部分需手动确认", () => {
      const input: CrossShotConsistencyInput = {
        beats: [
          makeBeat({
            id: "beat-1",
            elementIds: ["elem-1", "elem-2"],
            featureAnchoring: {
              enabled: true,
              disableFrameBinding: true,
              featureConsistencyStrength: 0.8,
              characterAnchors: [
                { elementId: "elem-1", referenceImageUrl: "ref.png", featureTags: ["黑发", "蓝眼"], weight: 0.8 },
                { elementId: "elem-2", referenceImageUrl: "ref-b1.png", featureTags: ["红发"], weight: 0.8 },
              ],
            },
          }),
          makeBeat({
            id: "beat-2",
            elementIds: ["elem-1", "elem-2"],
            featureAnchoring: {
              enabled: true,
              disableFrameBinding: true,
              featureConsistencyStrength: 0.8,
              characterAnchors: [
                { elementId: "elem-1", referenceImageUrl: "ref.png", featureTags: ["金发", "绿眼"], weight: 0.8 },
                { elementId: "elem-2", referenceImageUrl: "ref-b2.png", featureTags: ["红发"], weight: 0.8 },
              ],
            },
          }),
        ],
        elements: [
          makeElement({ id: "elem-1", name: "角色A" }),
          makeElement({ id: "elem-2", name: "角色B" }),
        ],
      };

      const result = autoFixCrossShotConsistency(input);

      // elem-1: featureTags 漂移但 referenceUrl 一致 → 自动修复
      expect(result.appliedFixes).toHaveLength(1);
      expect(result.appliedFixes[0]!.elementId).toBe("elem-1");

      // elem-2: referenceUrl 漂移但 featureTags 一致 → 手动确认
      expect(result.manualConfirmFixes).toHaveLength(1);
      expect(result.manualConfirmFixes[0]!.elementId).toBe("elem-2");
    });

    it("driftAnalyses 应包含所有漂移元素的分析", () => {
      const input: CrossShotConsistencyInput = {
        beats: [
          makeBeat({
            id: "beat-1",
            elementIds: ["elem-1", "elem-2"],
            featureAnchoring: {
              enabled: true,
              disableFrameBinding: true,
              featureConsistencyStrength: 0.8,
              characterAnchors: [
                { elementId: "elem-1", referenceImageUrl: "ref.png", featureTags: ["黑发"], weight: 0.8 },
                { elementId: "elem-2", referenceImageUrl: "ref-b1.png", featureTags: ["红发"], weight: 0.8 },
              ],
            },
          }),
          makeBeat({
            id: "beat-2",
            elementIds: ["elem-1", "elem-2"],
            featureAnchoring: {
              enabled: true,
              disableFrameBinding: true,
              featureConsistencyStrength: 0.8,
              characterAnchors: [
                { elementId: "elem-1", referenceImageUrl: "ref.png", featureTags: ["金发"], weight: 0.8 },
                { elementId: "elem-2", referenceImageUrl: "ref-b2.png", featureTags: ["红发"], weight: 0.8 },
              ],
            },
          }),
        ],
        elements: [
          makeElement({ id: "elem-1", name: "角色A" }),
          makeElement({ id: "elem-2", name: "角色B" }),
        ],
      };

      const result = autoFixCrossShotConsistency(input);

      expect(result.driftAnalyses).toHaveLength(2);

      const elem1Analysis = result.driftAnalyses.find((a) => a.elementId === "elem-1")!;
      expect(elem1Analysis.kind).toBe("featureTags");
      expect(elem1Analysis.autoFixable).toBe(true);
      expect(elem1Analysis.canonicalFeatureTags).toEqual(["黑发"]);

      const elem2Analysis = result.driftAnalyses.find((a) => a.elementId === "elem-2")!;
      expect(elem2Analysis.kind).toBe("referenceImageUrl");
      expect(elem2Analysis.autoFixable).toBe(false);
    });
  });
});

describe("applyManualReferenceUrlFix", () => {
  it("应将用户选择的 URL 同步到所有分镜", () => {
    const beats: StoryBeat[] = [
      makeBeat({
        id: "beat-1",
        featureAnchoring: makeFeatureAnchoring("elem-1", ["黑发"], "ref1.png"),
      }),
      makeBeat({
        id: "beat-2",
        featureAnchoring: makeFeatureAnchoring("elem-1", ["黑发"], "ref2.png"),
      }),
    ];

    const fixedBeats = applyManualReferenceUrlFix(beats, "elem-1", "ref1.png");

    // 两个分镜的 referenceImageUrl 都应变为 ref1.png
    const anchor1 = fixedBeats[0]!.featureAnchoring!.characterAnchors[0]!;
    const anchor2 = fixedBeats[1]!.featureAnchoring!.characterAnchors[0]!;
    expect(anchor1.referenceImageUrl).toBe("ref1.png");
    expect(anchor2.referenceImageUrl).toBe("ref1.png");
  });

  it("不应修改原 beats 数组（纯函数）", () => {
    const beats: StoryBeat[] = [
      makeBeat({
        id: "beat-1",
        featureAnchoring: makeFeatureAnchoring("elem-1", ["黑发"], "ref1.png"),
      }),
      makeBeat({
        id: "beat-2",
        featureAnchoring: makeFeatureAnchoring("elem-1", ["黑发"], "ref2.png"),
      }),
    ];

    applyManualReferenceUrlFix(beats, "elem-1", "ref1.png");

    // 原 beats[1] 的 referenceImageUrl 应保持不变
    expect(beats[1]!.featureAnchoring!.characterAnchors[0]!.referenceImageUrl).toBe("ref2.png");
  });

  it("应同时处理 propAnchors 中的同元素锚点", () => {
    const beats: StoryBeat[] = [
      makeBeat({
        id: "beat-1",
        featureAnchoring: {
          enabled: true,
          disableFrameBinding: true,
          featureConsistencyStrength: 0.8,
          characterAnchors: [],
          propAnchors: [
            { elementId: "prop-1", referenceImageUrl: "ref1.png", featureTags: ["金属"], weight: 0.8 },
          ],
        },
      }),
      makeBeat({
        id: "beat-2",
        featureAnchoring: {
          enabled: true,
          disableFrameBinding: true,
          featureConsistencyStrength: 0.8,
          characterAnchors: [],
          propAnchors: [
            { elementId: "prop-1", referenceImageUrl: "ref2.png", featureTags: ["金属"], weight: 0.8 },
          ],
        },
      }),
    ];

    const fixedBeats = applyManualReferenceUrlFix(beats, "prop-1", "ref1.png");

    const prop1 = fixedBeats[0]!.featureAnchoring!.propAnchors![0]!;
    const prop2 = fixedBeats[1]!.featureAnchoring!.propAnchors![0]!;
    expect(prop1.referenceImageUrl).toBe("ref1.png");
    expect(prop2.referenceImageUrl).toBe("ref1.png");
  });

  it("手动修复后再次运行 autoFix 应通过一致性检查", () => {
    const beats: StoryBeat[] = [
      makeBeat({
        id: "beat-1",
        elementIds: ["elem-1"],
        featureAnchoring: makeFeatureAnchoring("elem-1", ["黑发"], "ref1.png"),
      }),
      makeBeat({
        id: "beat-2",
        elementIds: ["elem-1"],
        featureAnchoring: makeFeatureAnchoring("elem-1", ["黑发"], "ref2.png"),
      }),
    ];
    const elements = [makeElement({ id: "elem-1" })];

    // Step 1: 首次 autoFix 检测到 referenceImageUrl 漂移
    const firstResult = autoFixCrossShotConsistency({ beats, elements });
    expect(firstResult.manualConfirmFixes).toHaveLength(1);

    // Step 2: 用户选择 ref1.png 作为基准
    const manuallyFixedBeats = applyManualReferenceUrlFix(beats, "elem-1", "ref1.png");

    // Step 3: 再次 autoFix 应全部解决
    const secondResult = autoFixCrossShotConsistency({
      beats: manuallyFixedBeats,
      elements,
    });
    expect(secondResult.allResolved).toBe(true);
    expect(secondResult.postFixConsistency.passed).toBe(true);
    expect(secondResult.manualConfirmFixes).toHaveLength(0);
  });
});
