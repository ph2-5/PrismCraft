/**
 * visual-consistency-checker.test.ts — VLM 视觉一致性质检器单测（quality-gate P1）
 *
 * 覆盖：正常解析 / 无法解析低分 / VLM 调用失败 ok:false / 无生成图 / payload 结构
 */
import { describe, it, expect, vi } from "vitest";
import { createVisualConsistencyCheckerFactory } from "../visual-consistency-checker";
import type { QualityCheckInput } from "@/shared-logic/quality-gate";

function makeInput(overrides: Partial<QualityCheckInput> = {}): QualityCheckInput {
  return {
    kind: "character_consistency",
    generated: { imageUrl: "https://example.com/generated.png" },
    references: [{ imageUrl: "https://example.com/ref.png", role: "character" }],
    featureAnchors: { enabled: true },
    provenance: { providerId: "kuaishou", modelId: "kling-v1" },
    ...overrides,
  };
}

describe("vlm.visual-consistency checker", () => {
  it("正常解析 VLM 分数并输出 payload（供旧 API 映射）", async () => {
    const checker = createVisualConsistencyCheckerFactory()();
    const analyzeImage = vi.fn(async () => ({
      ok: true,
      text: JSON.stringify({
        scores: [{ name: "角色A", score: 0.75, issues: ["服装不一致"] }],
        overallScore: 0.75,
        recommendation: "adjust",
      }),
    }));

    const result = await checker.run(makeInput(), { analyzeImage });

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.category).toBe("vlm");
    expect(result.verdict).toBe("pass"); // 0.75 >= 0.6
    expect(result.score).toBe(0.75);
    const payload = result.payload as { scores: Array<{ name: string; score: number }>; overallScore: number; recommendation: string };
    expect(payload.scores[0]!.name).toBe("角色A");
    expect(payload.scores[0]!.score).toBe(0.75);
    expect(payload.recommendation).toBe("adjust");
  });

  it("VLM 返回无法解析 → 低分项（非 err，保留 unparseable 语义）", async () => {
    const checker = createVisualConsistencyCheckerFactory()();
    const analyzeImage = vi.fn(async () => ({ ok: true, text: "完全不是JSON" }));

    const result = await checker.run(makeInput(), { analyzeImage });
    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.score).toBe(0.5);
    expect(result.verdict).toBe("fail");
    expect(result.evidence).toContain("无法解析");
  });

  it("VLM 调用失败 → ok:false（保持旧失败语义）", async () => {
    const checker = createVisualConsistencyCheckerFactory()();
    const analyzeImage = vi.fn(async () => ({ ok: false, error: "network down" }));

    const result = await checker.run(makeInput(), { analyzeImage });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("should fail");
    expect(result.error).toContain("network down");
  });

  it("无生成图 → ok:false", async () => {
    const checker = createVisualConsistencyCheckerFactory()();
    const result = await checker.run(makeInput({ generated: {} }), {});
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("should fail");
    expect(result.error).toContain("无生成图");
  });

  it("analyzeImage 未注入 → ok:false（降级链可跳过）", async () => {
    const checker = createVisualConsistencyCheckerFactory()();
    const result = await checker.run(makeInput(), {});
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("should fail");
    expect(result.error).toContain("analyzeImage");
  });

  it("prompt 包含参考图 URL 与特征锚定信息", async () => {
    const checker = createVisualConsistencyCheckerFactory()();
    const analyzeImage = vi.fn(async () => ({
      ok: true,
      text: JSON.stringify({ scores: [], overallScore: 1, recommendation: "accept" }),
    }));
    await checker.run(makeInput(), { analyzeImage });

    const prompt = analyzeImage.mock.calls[0]![1] as string;
    expect(prompt).toContain("https://example.com/ref.png");
    expect(prompt).toContain("参考图");
  });
});
