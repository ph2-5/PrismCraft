import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/infrastructure/di", () => {
  const imageApi = {
    analyze: vi.fn(),
  };
  return { container: { imageApi } };
});

import { checkVisualConsistency, parseConsistencyAnalysisFromStructured } from "@/modules/shot";
import type { ConsistencyCheckInput } from "@/modules/shot";
import { container } from "@/infrastructure/di";

const mockAnalyze = container.imageApi.analyze as ReturnType<typeof vi.fn>;

function makeBeat(overrides: Record<string, unknown> = {}): ConsistencyCheckInput["beat"] {
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
  } as ConsistencyCheckInput["beat"];
}

function makeElement(overrides: Record<string, unknown> = {}): ConsistencyCheckInput["elements"][number] {
  return {
    id: "elem-1",
    type: "character",
    name: "角色A",
    description: "主角",
    bindings: [],
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    ...overrides,
  } as ConsistencyCheckInput["elements"][number];
}

describe("checkVisualConsistency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("没有 generatedImageUrl 时应返回 passed:false", async () => {
    const input: ConsistencyCheckInput = {
      beat: makeBeat(),
      elements: [makeElement()],
    };

    const result = await checkVisualConsistency(input);

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value.passed).toBe(false);
    expect(result.value.overallScore).toBe(0);
    expect(result.value.recommendation).toBe("adjust");
    expect(result.value.characterScores).toHaveLength(0);
  });

  it("没有绑定元素时应返回 passed:true", async () => {
    const input: ConsistencyCheckInput = {
      beat: makeBeat(),
      elements: [makeElement({ id: "elem-2" })],
      generatedImageUrl: "https://example.com/image.png",
    };

    const result = await checkVisualConsistency(input);

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value.passed).toBe(true);
    expect(result.value.overallScore).toBe(1.0);
    expect(result.value.characterScores).toHaveLength(0);
  });

  it("绑定元素且图片分析成功时应返回解析结果", async () => {
    const beat = makeBeat({ elementIds: ["elem-1"] });
    const elements = [makeElement({ id: "elem-1", name: "角色A" })];

    mockAnalyze.mockResolvedValue({
      ok: true,
      value: {
        analysis: JSON.stringify({
          scores: [{ name: "角色A", score: 0.9, issues: [] }],
          overallScore: 0.9,
          recommendation: "accept",
        }),
      },
    });

    const result = await checkVisualConsistency({
      beat,
      elements,
      generatedImageUrl: "https://example.com/image.png",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value.passed).toBe(true);
    expect(result.value.overallScore).toBe(0.9);
    expect(result.value.characterScores).toHaveLength(1);
    expect(result.value.characterScores[0]!.elementId).toBe("elem-1");
    expect(result.value.characterScores[0]!.score).toBe(0.9);
    expect(mockAnalyze).toHaveBeenCalledWith(
      "https://example.com/image.png",
      "scene",
      expect.any(String),
    );
  });

  it("绑定元素且图片分析失败时应返回错误", async () => {
    const beat = makeBeat({ elementIds: ["elem-1"] });
    const elements = [makeElement({ id: "elem-1", name: "角色A" })];

    mockAnalyze.mockResolvedValue({
      ok: false,
      error: { code: "API_ERROR", message: "分析失败" },
    });

    const result = await checkVisualConsistency({
      beat,
      elements,
      generatedImageUrl: "https://example.com/image.png",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected error result");
    expect(result.error.code).toBe("CONSISTENCY_CHECK_FAILED");
  });

  it("绑定元素且抛出异常时应返回错误", async () => {
    const beat = makeBeat({ elementIds: ["elem-1"] });
    const elements = [makeElement({ id: "elem-1", name: "角色A" })];

    mockAnalyze.mockRejectedValue(new Error("网络错误"));

    const result = await checkVisualConsistency({
      beat,
      elements,
      generatedImageUrl: "https://example.com/image.png",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected error result");
    expect(result.error.code).toBe("CONSISTENCY_CHECK_ERROR");
  });

  it("应通过 elementBindings 匹配绑定元素", async () => {
    const beat = makeBeat({
      elementBindings: { "elem-1": { role: "主角" } },
    });
    const elements = [makeElement({ id: "elem-1", name: "角色A" })];

    mockAnalyze.mockResolvedValue({
      ok: true,
      value: {
        analysis: JSON.stringify({
          scores: [{ name: "角色A", score: 0.85, issues: ["发色略有偏差"] }],
          overallScore: 0.85,
          recommendation: "adjust",
        }),
      },
    });

    const result = await checkVisualConsistency({
      beat,
      elements,
      generatedImageUrl: "https://example.com/image.png",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value.characterScores).toHaveLength(1);
    expect(result.value.characterScores[0]!.score).toBe(0.85);
  });

  it("buildConsistencyPrompt 应包含元素描述", async () => {
    const beat = makeBeat({
      elementIds: ["elem-1"],
      elementBindings: { "elem-1": { role: "主角" } },
    });
    const elements = [makeElement({ id: "elem-1", name: "角色A", type: "character", description: "勇敢的战士" })];

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

    await checkVisualConsistency({
      beat,
      elements,
      generatedImageUrl: "https://example.com/image.png",
    });

    const prompt = mockAnalyze.mock.calls[0]![2]! as string;
    expect(prompt).toContain("角色A");
    expect(prompt).toContain("character");
    expect(prompt).toContain("主角");
  });
});

describe("parseConsistencyAnalysis (via checkVisualConsistency)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("有效 JSON 应正确解析", async () => {
    const beat = makeBeat({ elementIds: ["elem-1"] });
    const elements = [makeElement({ id: "elem-1", name: "角色A" })];

    mockAnalyze.mockResolvedValue({
      ok: true,
      value: {
        analysis: JSON.stringify({
          scores: [{ name: "角色A", score: 0.75, issues: ["服装不一致"] }],
          overallScore: 0.75,
          recommendation: "adjust",
        }),
      },
    });

    const result = await checkVisualConsistency({
      beat,
      elements,
      generatedImageUrl: "https://example.com/image.png",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value.overallScore).toBe(0.75);
    expect(result.value.passed).toBe(true);
    expect(result.value.recommendation).toBe("adjust");
    expect(result.value.characterScores[0]!.issues).toContain("服装不一致");
  });

  it("无效 JSON 应返回未通过", async () => {
    const beat = makeBeat({ elementIds: ["elem-1"] });
    const elements = [makeElement({ id: "elem-1", name: "角色A" })];

    mockAnalyze.mockResolvedValue({
      ok: true,
      value: {
        analysis: "这不是JSON格式",
      },
    });

    const result = await checkVisualConsistency({
      beat,
      elements,
      generatedImageUrl: "https://example.com/image.png",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value.passed).toBe(false);
    expect(result.value.overallScore).toBe(0.5);
    expect(result.value.recommendation).toBe("adjust");
  });

  it("缺少 JSON 对象应返回未通过", async () => {
    const beat = makeBeat({ elementIds: ["elem-1"] });
    const elements = [makeElement({ id: "elem-1", name: "角色A" })];

    mockAnalyze.mockResolvedValue({
      ok: true,
      value: {
        analysis: "no json here at all",
      },
    });

    const result = await checkVisualConsistency({
      beat,
      elements,
      generatedImageUrl: "https://example.com/image.png",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value.passed).toBe(false);
    expect(result.value.overallScore).toBe(0.5);
    expect(result.value.characterScores[0]!.score).toBe(0.5);
  });

  it("低分时应返回 passed:false 和 regenerate 建议", async () => {
    const beat = makeBeat({ elementIds: ["elem-1"] });
    const elements = [makeElement({ id: "elem-1", name: "角色A" })];

    mockAnalyze.mockResolvedValue({
      ok: true,
      value: {
        analysis: JSON.stringify({
          scores: [{ name: "角色A", score: 0.3, issues: ["严重不一致"] }],
          overallScore: 0.3,
          recommendation: "regenerate",
        }),
      },
    });

    const result = await checkVisualConsistency({
      beat,
      elements,
      generatedImageUrl: "https://example.com/image.png",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value.passed).toBe(false);
    expect(result.value.recommendation).toBe("regenerate");
  });

  it("未匹配的元素应使用默认分数", async () => {
    const beat = makeBeat({ elementIds: ["elem-1"] });
    const elements = [makeElement({ id: "elem-1", name: "角色B" })];

    mockAnalyze.mockResolvedValue({
      ok: true,
      value: {
        analysis: JSON.stringify({
          scores: [{ name: "角色C", score: 0.9, issues: [] }],
          overallScore: 0.9,
          recommendation: "accept",
        }),
      },
    });

    const result = await checkVisualConsistency({
      beat,
      elements,
      generatedImageUrl: "https://example.com/image.png",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value.characterScores[0]!.score).toBe(0.7);
  });

  it("缺少 overallScore 时应从 characterScores 计算", async () => {
    const beat = makeBeat({ elementIds: ["elem-1"] });
    const elements = [makeElement({ id: "elem-1", name: "角色A" })];

    mockAnalyze.mockResolvedValue({
      ok: true,
      value: {
        analysis: JSON.stringify({
          scores: [{ name: "角色A", score: 0.6, issues: ["轻微偏差"] }],
        }),
      },
    });

    const result = await checkVisualConsistency({
      beat,
      elements,
      generatedImageUrl: "https://example.com/image.png",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value.overallScore).toBe(0.6);
  });

  it("markdown 代码块中的 JSON 应正确解析", async () => {
    const beat = makeBeat({ elementIds: ["elem-1"] });
    const elements = [makeElement({ id: "elem-1", name: "角色A" })];

    mockAnalyze.mockResolvedValue({
      ok: true,
      value: {
        analysis: "分析结果如下：\n```json\n{\"scores\":[{\"name\":\"角色A\",\"score\":0.8,\"issues\":[]}],\"overallScore\":0.8,\"recommendation\":\"accept\"}\n```\n以上是分析。",
      },
    });

    const result = await checkVisualConsistency({
      beat,
      elements,
      generatedImageUrl: "https://example.com/image.png",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value.overallScore).toBe(0.8);
    expect(result.value.passed).toBe(true);
  });

  it("纯 JSON 文本（无代码块）应直接解析", async () => {
    const beat = makeBeat({ elementIds: ["elem-1"] });
    const elements = [makeElement({ id: "elem-1", name: "角色A" })];

    mockAnalyze.mockResolvedValue({
      ok: true,
      value: {
        analysis: JSON.stringify({
          scores: [{ name: "角色A", score: 0.85, issues: [] }],
          overallScore: 0.85,
          recommendation: "accept",
        }),
      },
    });

    const result = await checkVisualConsistency({
      beat,
      elements,
      generatedImageUrl: "https://example.com/image.png",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value.overallScore).toBe(0.85);
    expect(result.value.passed).toBe(true);
  });

  it("JSON 嵌入在文本中（无代码块）应通过正则回退解析", async () => {
    const beat = makeBeat({ elementIds: ["elem-1"] });
    const elements = [makeElement({ id: "elem-1", name: "角色A" })];

    mockAnalyze.mockResolvedValue({
      ok: true,
      value: {
        analysis: "根据分析，结果为 {\"scores\":[{\"name\":\"角色A\",\"score\":0.7,\"issues\":[\"轻微偏差\"]}],\"overallScore\":0.7,\"recommendation\":\"adjust\"} 请参考。",
      },
    });

    const result = await checkVisualConsistency({
      beat,
      elements,
      generatedImageUrl: "https://example.com/image.png",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value.overallScore).toBe(0.7);
    expect(result.value.recommendation).toBe("adjust");
  });
});

describe("checkVisualConsistency with structuredOutput", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("structuredOutput 提供时应跳过 AI 分析", async () => {
    const beat = makeBeat({ elementIds: ["elem-1"] });
    const elements = [makeElement({ id: "elem-1", name: "角色A" })];

    const result = await checkVisualConsistency({
      beat,
      elements,
      structuredOutput: {
        scores: [{ name: "角色A", score: 0.95, issues: [] }],
        overallScore: 0.95,
        recommendation: "accept",
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value.overallScore).toBe(0.95);
    expect(result.value.passed).toBe(true);
    expect(result.value.characterScores[0]!.score).toBe(0.95);
    expect(mockAnalyze).not.toHaveBeenCalled();
  });

  it("structuredOutput 和 generatedImageUrl 同时提供时应优先使用 structuredOutput", async () => {
    const beat = makeBeat({ elementIds: ["elem-1"] });
    const elements = [makeElement({ id: "elem-1", name: "角色A" })];

    const result = await checkVisualConsistency({
      beat,
      elements,
      generatedImageUrl: "https://example.com/image.png",
      structuredOutput: {
        scores: [{ name: "角色A", score: 0.88, issues: ["轻微色差"] }],
        overallScore: 0.88,
        recommendation: "adjust",
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value.overallScore).toBe(0.88);
    expect(mockAnalyze).not.toHaveBeenCalled();
  });

  it("structuredOutput 和 generatedImageUrl 都未提供时应返回 passed:false", async () => {
    const beat = makeBeat({ elementIds: ["elem-1"] });
    const elements = [makeElement({ id: "elem-1", name: "角色A" })];

    const result = await checkVisualConsistency({
      beat,
      elements,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value.passed).toBe(false);
    expect(result.value.overallScore).toBe(0);
  });
});

describe("parseConsistencyAnalysisFromStructured", () => {
  it("应将结构化数据映射为 ConsistencyCheckResult", () => {
    const elements = [makeElement({ id: "elem-1", name: "角色A" })];

    const result = parseConsistencyAnalysisFromStructured(
      {
        scores: [{ name: "角色A", score: 0.9, issues: [] }],
        overallScore: 0.9,
        recommendation: "accept",
      },
      elements as ConsistencyCheckInput["elements"],
    );

    expect(result.passed).toBe(true);
    expect(result.overallScore).toBe(0.9);
    expect(result.recommendation).toBe("accept");
    expect(result.characterScores).toHaveLength(1);
    expect(result.characterScores[0]!.elementId).toBe("elem-1");
    expect(result.characterScores[0]!.score).toBe(0.9);
  });

  it("未匹配的元素应使用默认分数", () => {
    const elements = [makeElement({ id: "elem-1", name: "角色B" })];

    const result = parseConsistencyAnalysisFromStructured(
      {
        scores: [{ name: "角色C", score: 0.9, issues: [] }],
        overallScore: 0.9,
        recommendation: "accept",
      },
      elements as ConsistencyCheckInput["elements"],
    );

    expect(result.characterScores[0]!.score).toBe(0.7);
  });

  it("缺少 overallScore 时应从 characterScores 计算", () => {
    const elements = [makeElement({ id: "elem-1", name: "角色A" })];

    const result = parseConsistencyAnalysisFromStructured(
      {
        scores: [{ name: "角色A", score: 0.6, issues: ["轻微偏差"] }],
        overallScore: undefined as unknown as number,
        recommendation: "adjust",
      },
      elements as ConsistencyCheckInput["elements"],
    );

    expect(result.overallScore).toBe(0.6);
  });
});
