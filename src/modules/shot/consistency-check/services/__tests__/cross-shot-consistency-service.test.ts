import { describe, it, expect } from "vitest";
import { checkCrossShotConsistency } from "../cross-shot-consistency-service";
import type { CrossShotConsistencyInput } from "../cross-shot-consistency-service";
import type { StoryBeat, StoryElement } from "@/domain/schemas";

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

describe("checkCrossShotConsistency", () => {
  it("单个分镜无漂移 → passed: true", () => {
    const input: CrossShotConsistencyInput = {
      beats: [makeBeat({ id: "beat-1", elementIds: ["elem-1"] })],
      elements: [makeElement({ id: "elem-1", name: "角色A" })],
    };

    const result = checkCrossShotConsistency(input);

    expect(result.passed).toBe(true);
    expect(result.overallDriftScore).toBe(0);
    expect(result.recommendation).toBe("accept");
    expect(result.elementDriftReports).toHaveLength(0);
  });

  it("同一角色在两个分镜中 featureTags 一致 → driftScore: 0", () => {
    const input: CrossShotConsistencyInput = {
      beats: [
        makeBeat({
          id: "beat-1",
          elementIds: ["elem-1"],
          featureAnchoring: {
            enabled: true,
            disableFrameBinding: true,
            featureConsistencyStrength: 0.8,
            characterAnchors: [
              { elementId: "elem-1", referenceImageUrl: "ref.png", featureTags: ["黑发", "蓝眼"], weight: 0.8 },
            ],
          },
        }),
        makeBeat({
          id: "beat-2",
          elementIds: ["elem-1"],
          featureAnchoring: {
            enabled: true,
            disableFrameBinding: true,
            featureConsistencyStrength: 0.8,
            characterAnchors: [
              { elementId: "elem-1", referenceImageUrl: "ref.png", featureTags: ["黑发", "蓝眼"], weight: 0.8 },
            ],
          },
        }),
      ],
      elements: [makeElement({ id: "elem-1", name: "角色A" })],
    };

    const result = checkCrossShotConsistency(input);

    expect(result.passed).toBe(true);
    expect(result.overallDriftScore).toBe(0);
    expect(result.recommendation).toBe("accept");
    expect(result.elementDriftReports).toHaveLength(1);
    expect(result.elementDriftReports[0]!.driftScore).toBe(0);
    expect(result.elementDriftReports[0]!.issues).toHaveLength(0);
  });

  it("同一角色在两个分镜中 featureTags 不一致 → driftScore > 0", () => {
    const input: CrossShotConsistencyInput = {
      beats: [
        makeBeat({
          id: "beat-1",
          elementIds: ["elem-1"],
          featureAnchoring: {
            enabled: true,
            disableFrameBinding: true,
            featureConsistencyStrength: 0.8,
            characterAnchors: [
              { elementId: "elem-1", referenceImageUrl: "ref.png", featureTags: ["黑发", "蓝眼"], weight: 0.8 },
            ],
          },
        }),
        makeBeat({
          id: "beat-2",
          elementIds: ["elem-1"],
          featureAnchoring: {
            enabled: true,
            disableFrameBinding: true,
            featureConsistencyStrength: 0.8,
            characterAnchors: [
              { elementId: "elem-1", referenceImageUrl: "ref.png", featureTags: ["金发", "绿眼"], weight: 0.8 },
            ],
          },
        }),
      ],
      elements: [makeElement({ id: "elem-1", name: "角色A" })],
    };

    const result = checkCrossShotConsistency(input);

    expect(result.passed).toBe(false);
    expect(result.overallDriftScore).toBe(0.3);
    expect(result.recommendation).toBe("adjust");
    expect(result.elementDriftReports[0]!.driftScore).toBe(0.3);
    expect(result.elementDriftReports[0]!.issues.length).toBeGreaterThan(0);
  });

  it("同一角色在两个分镜中 referenceImageUrl 不一致 → driftScore > 0", () => {
    const input: CrossShotConsistencyInput = {
      beats: [
        makeBeat({
          id: "beat-1",
          elementIds: ["elem-1"],
          featureAnchoring: {
            enabled: true,
            disableFrameBinding: true,
            featureConsistencyStrength: 0.8,
            characterAnchors: [
              { elementId: "elem-1", referenceImageUrl: "ref1.png", featureTags: ["黑发", "蓝眼"], weight: 0.8 },
            ],
          },
        }),
        makeBeat({
          id: "beat-2",
          elementIds: ["elem-1"],
          featureAnchoring: {
            enabled: true,
            disableFrameBinding: true,
            featureConsistencyStrength: 0.8,
            characterAnchors: [
              { elementId: "elem-1", referenceImageUrl: "ref2.png", featureTags: ["黑发", "蓝眼"], weight: 0.8 },
            ],
          },
        }),
      ],
      elements: [makeElement({ id: "elem-1", name: "角色A" })],
    };

    const result = checkCrossShotConsistency(input);

    // driftScore 0.2 < 0.3 threshold → passed is true, but recommendation is "adjust" (>= 0.2)
    expect(result.passed).toBe(true);
    expect(result.overallDriftScore).toBe(0.2);
    expect(result.recommendation).toBe("adjust");
    expect(result.elementDriftReports[0]!.driftScore).toBe(0.2);
    expect(result.elementDriftReports[0]!.issues.length).toBeGreaterThan(0);
  });

  it("混合场景：部分角色一致，部分漂移", () => {
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
              { elementId: "elem-2", referenceImageUrl: "ref-b.png", featureTags: ["红发"], weight: 0.8 },
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
              { elementId: "elem-1", referenceImageUrl: "ref.png", featureTags: ["黑发", "蓝眼"], weight: 0.8 },
              { elementId: "elem-2", referenceImageUrl: "ref-b.png", featureTags: ["金发"], weight: 0.8 },
            ],
          },
        }),
      ],
      elements: [
        makeElement({ id: "elem-1", name: "角色A" }),
        makeElement({ id: "elem-2", name: "角色B" }),
      ],
    };

    const result = checkCrossShotConsistency(input);

    // elem-1 consistent, elem-2 has feature drift (0.3)
    expect(result.overallDriftScore).toBe(0.15);
    expect(result.passed).toBe(true);
    expect(result.recommendation).toBe("accept");
    expect(result.elementDriftReports).toHaveLength(2);

    const elem1Report = result.elementDriftReports.find((r) => r.elementId === "elem-1")!;
    const elem2Report = result.elementDriftReports.find((r) => r.elementId === "elem-2")!;
    expect(elem1Report.driftScore).toBe(0);
    expect(elem2Report.driftScore).toBe(0.3);
  });

  it("featureTags 和 referenceImageUrl 都不一致 → driftScore: 0.5", () => {
    const input: CrossShotConsistencyInput = {
      beats: [
        makeBeat({
          id: "beat-1",
          elementIds: ["elem-1"],
          featureAnchoring: {
            enabled: true,
            disableFrameBinding: true,
            featureConsistencyStrength: 0.8,
            characterAnchors: [
              { elementId: "elem-1", referenceImageUrl: "ref1.png", featureTags: ["黑发", "蓝眼"], weight: 0.8 },
            ],
          },
        }),
        makeBeat({
          id: "beat-2",
          elementIds: ["elem-1"],
          featureAnchoring: {
            enabled: true,
            disableFrameBinding: true,
            featureConsistencyStrength: 0.8,
            characterAnchors: [
              { elementId: "elem-1", referenceImageUrl: "ref2.png", featureTags: ["金发", "绿眼"], weight: 0.8 },
            ],
          },
        }),
      ],
      elements: [makeElement({ id: "elem-1", name: "角色A" })],
    };

    const result = checkCrossShotConsistency(input);

    expect(result.elementDriftReports[0]!.driftScore).toBe(0.5);
    expect(result.passed).toBe(false);
    expect(result.recommendation).toBe("adjust");
  });

  it("通过 elementBindings 匹配元素也应检测漂移", () => {
    const input: CrossShotConsistencyInput = {
      beats: [
        makeBeat({
          id: "beat-1",
          elementBindings: { "elem-1": { role: "主角" } },
          featureAnchoring: {
            enabled: true,
            disableFrameBinding: true,
            featureConsistencyStrength: 0.8,
            characterAnchors: [
              { elementId: "elem-1", referenceImageUrl: "ref.png", featureTags: ["黑发"], weight: 0.8 },
            ],
          },
        }),
        makeBeat({
          id: "beat-2",
          elementBindings: { "elem-1": { role: "主角" } },
          featureAnchoring: {
            enabled: true,
            disableFrameBinding: true,
            featureConsistencyStrength: 0.8,
            characterAnchors: [
              { elementId: "elem-1", referenceImageUrl: "ref.png", featureTags: ["金发"], weight: 0.8 },
            ],
          },
        }),
      ],
      elements: [makeElement({ id: "elem-1", name: "角色A" })],
    };

    const result = checkCrossShotConsistency(input);

    expect(result.elementDriftReports).toHaveLength(1);
    expect(result.elementDriftReports[0]!.driftScore).toBe(0.3);
  });

  it("featureAnchoring 未启用时不应检测漂移", () => {
    const input: CrossShotConsistencyInput = {
      beats: [
        makeBeat({ id: "beat-1", elementIds: ["elem-1"] }),
        makeBeat({ id: "beat-2", elementIds: ["elem-1"] }),
      ],
      elements: [makeElement({ id: "elem-1", name: "角色A" })],
    };

    const result = checkCrossShotConsistency(input);

    // Element appears in 2 beats but no featureAnchoring enabled → no snapshots → driftScore 0
    expect(result.elementDriftReports).toHaveLength(1);
    expect(result.elementDriftReports[0]!.driftScore).toBe(0);
    expect(result.passed).toBe(true);
  });

  it("propAnchors 也应被检测", () => {
    const input: CrossShotConsistencyInput = {
      beats: [
        makeBeat({
          id: "beat-1",
          elementIds: ["elem-1"],
          featureAnchoring: {
            enabled: true,
            disableFrameBinding: true,
            featureConsistencyStrength: 0.8,
            characterAnchors: [],
            propAnchors: [
              { elementId: "elem-1", referenceImageUrl: "ref.png", featureTags: ["木质", "棕色"], weight: 0.8 },
            ],
          },
        }),
        makeBeat({
          id: "beat-2",
          elementIds: ["elem-1"],
          featureAnchoring: {
            enabled: true,
            disableFrameBinding: true,
            featureConsistencyStrength: 0.8,
            characterAnchors: [],
            propAnchors: [
              { elementId: "elem-1", referenceImageUrl: "ref.png", featureTags: ["金属", "银色"], weight: 0.8 },
            ],
          },
        }),
      ],
      elements: [makeElement({ id: "elem-1", name: "道具A", type: "prop" })],
    };

    const result = checkCrossShotConsistency(input);

    expect(result.elementDriftReports[0]!.driftScore).toBe(0.3);
  });
});
