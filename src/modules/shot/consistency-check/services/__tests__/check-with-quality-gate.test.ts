/**
 * check-with-quality-gate.test.ts — 新 API checkWithQualityGate 测试（quality-gate P1）
 *
 * 覆盖：全量报告（rule + vlm 多 checker）/ 降级链 / 失败不 throw（R192）
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/infrastructure/di", () => {
  const imageApi = { analyze: vi.fn() };
  return { container: { imageApi } };
});

import { checkWithQualityGate } from "../consistency-check-service";
import { container } from "@/infrastructure/di";
import type { ConsistencyCheckInput } from "../consistency-check-service";

const mockAnalyze = container.imageApi.analyze as ReturnType<typeof vi.fn>;

function makeBeat(): ConsistencyCheckInput["beat"] {
  return {
    id: "beat-1",
    sequence: 1,
    description: "A scene",
    duration: 5,
    characters: [],
    elementIds: ["elem-1"],
    characterIds: [],
    elementBindings: {},
    enhancedGeneration: false,
    featureAnchoring: { enabled: true, characterAnchors: [{ elementId: "elem-1", weight: 1, featureTags: ["红发"] }] },
  } as unknown as ConsistencyCheckInput["beat"];
}

function makeElement(): ConsistencyCheckInput["elements"][number] {
  return {
    id: "elem-1",
    type: "character",
    name: "角色A",
    description: "主角",
    bindings: [{ type: "image", url: "https://example.com/ref.png" }],
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
  } as ConsistencyCheckInput["elements"][number];
}

describe("checkWithQualityGate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("返回全量报告：rule + vlm 多 checker 明细 + standardsUsed", async () => {
    mockAnalyze.mockResolvedValue({
      ok: true,
      value: {
        analysis: JSON.stringify({
          scores: [{ name: "角色A", score: 0.8, issues: [] }],
          overallScore: 0.8,
          recommendation: "accept",
        }),
      },
    });

    const result = await checkWithQualityGate({
      beat: makeBeat(),
      elements: [makeElement()],
      generatedImageUrl: "https://example.com/generated.png",
      providerId: "kuaishou",
      modelId: "kling-v1",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value.providerId).toBe("kuaishou");
    expect(result.value.modelId).toBe("kling-v1");
    // 至少含 vlm + rule 两类 checker
    expect(result.value.items.some((i) => i.category === "vlm")).toBe(true);
    expect(result.value.items.some((i) => i.category === "rule")).toBe(true);
    expect(result.value.standardsUsed.character_consistency).toBe("vlm");
  });

  it("VLM 失败时报告含 ok:false 项且整体不 throw（R192）", async () => {
    mockAnalyze.mockResolvedValue({ ok: false, error: "provider 500" });

    const result = await checkWithQualityGate({
      beat: makeBeat(),
      elements: [makeElement()],
      generatedImageUrl: "https://example.com/generated.png",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value.items.some((i) => !i.ok)).toBe(true);
  });

  it("analyze 抛异常时也不 throw（降级为 ok:false 项）", async () => {
    mockAnalyze.mockRejectedValue(new Error("boom"));

    const result = await checkWithQualityGate({
      beat: makeBeat(),
      elements: [makeElement()],
      generatedImageUrl: "https://example.com/generated.png",
    });

    expect(result.ok).toBe(true);
  });
});
