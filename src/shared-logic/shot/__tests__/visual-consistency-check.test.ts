import { describe, it, expect, vi } from "vitest";
import {
  buildConsistencyPrompt,
  parseConsistencyAnalysis,
  checkVisualConsistency,
  checkBeatElementConsistency,
  type Element,
} from "../visual-consistency-check";

describe("visual-consistency-check", () => {
  describe("buildConsistencyPrompt", () => {
    it("应该构建包含元素名称和类型的基础 prompt", () => {
      const element: Element = {
        id: "e1",
        name: "小明",
        type: "character",
      };
      const prompt = buildConsistencyPrompt(element);
      expect(prompt).toContain("元素名称：小明");
      expect(prompt).toContain("元素类型：角色");
      expect(prompt).toContain("0-100分");
      expect(prompt).toContain("```json");
    });

    it("type 为 prop 时应显示'道具'", () => {
      const prompt = buildConsistencyPrompt({
        id: "e1",
        name: "宝剑",
        type: "prop",
      });
      expect(prompt).toContain("元素类型：道具");
    });

    it("type 为其他值时应显示'特效'", () => {
      const prompt = buildConsistencyPrompt({
        id: "e1",
        name: "火焰",
        type: "effect",
      });
      expect(prompt).toContain("元素类型：特效");
    });

    it("应该包含元素描述（当存在时）", () => {
      const prompt = buildConsistencyPrompt({
        id: "e1",
        name: "小明",
        type: "character",
        description: "一个勇敢的少年",
      });
      expect(prompt).toContain("元素描述：一个勇敢的少年");
    });

    it("应该包含关键特征标签", () => {
      const prompt = buildConsistencyPrompt({
        id: "e1",
        name: "小明",
        type: "character",
        featureAnchor: { featureTags: ["黑发", "蓝眼"] },
      });
      expect(prompt).toContain("关键特征：黑发、蓝眼");
    });

    it("角色类型应包含外观特征", () => {
      const prompt = buildConsistencyPrompt({
        id: "e1",
        name: "小明",
        type: "character",
        characterConfig: {
          appearance: {
            hairColor: "黑",
            hairStyle: "短发",
            eyeColor: "蓝",
            clothing: "校服",
          },
        },
      });
      expect(prompt).toContain("黑发色");
      expect(prompt).toContain("短发发型");
      expect(prompt).toContain("蓝眼睛");
      expect(prompt).toContain("穿着校服");
    });

    it("应该包含 JSON 输出格式说明", () => {
      const prompt = buildConsistencyPrompt({
        id: "e1",
        name: "test",
        type: "character",
      });
      expect(prompt).toContain('"totalScore"');
      expect(prompt).toContain('"appearance"');
      expect(prompt).toContain('"issues"');
    });
  });

  describe("parseConsistencyAnalysis", () => {
    it("应该正确解析 JSON 格式的分析结果", () => {
      const analysis = JSON.stringify({
        totalScore: 85,
        appearance: { score: 80, comment: "good" },
        color: { score: 70, comment: "ok" },
        style: { score: 75, comment: "fine" },
        issues: ["小问题1", "小问题2"],
      });
      const result = parseConsistencyAnalysis(analysis, {
        id: "e1",
        name: "test",
      });
      expect(result.score).toBe(0.85);
      expect(result.passed).toBe(true);
      expect(result.issues).toEqual(["小问题1", "小问题2"]);
    });

    it("高分无问题时应通过", () => {
      const analysis = JSON.stringify({
        totalScore: 90,
        appearance: { score: 80 },
        color: { score: 80 },
        style: { score: 80 },
        issues: [],
      });
      const result = parseConsistencyAnalysis(analysis, {
        id: "e1",
        name: "test",
      });
      expect(result.score).toBe(0.9);
      expect(result.passed).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it("低分时应不通过", () => {
      const analysis = JSON.stringify({
        totalScore: 50,
        issues: ["问题1"],
      });
      const result = parseConsistencyAnalysis(analysis, {
        id: "e1",
        name: "test",
      });
      expect(result.score).toBe(0.5);
      expect(result.passed).toBe(false);
    });

    it("issues 超过 2 个时应不通过", () => {
      const analysis = JSON.stringify({
        totalScore: 90,
        issues: ["问题1", "问题2", "问题3"],
      });
      const result = parseConsistencyAnalysis(analysis, {
        id: "e1",
        name: "test",
      });
      expect(result.passed).toBe(false);
    });

    it("issues 长度小于等于 3 的字符串应被过滤", () => {
      const analysis = JSON.stringify({
        totalScore: 90,
        issues: ["ab", "abc", "abcd"],
      });
      const result = parseConsistencyAnalysis(analysis, {
        id: "e1",
        name: "test",
      });
      // "ab" 和 "abc" 长度 <= 3 应被过滤
      expect(result.issues).toEqual(["abcd"]);
    });

    it("无 issues 但子分数低于 60 时应自动生成问题", () => {
      const analysis = JSON.stringify({
        totalScore: 90,
        appearance: { score: 50 },
        color: { score: 50 },
        style: { score: 50 },
        issues: [],
      });
      const result = parseConsistencyAnalysis(analysis, {
        id: "e1",
        name: "test",
      });
      expect(result.issues).toContain("外观特征与参考图差异较大");
      expect(result.issues).toContain("颜色配色与参考图不一致");
      expect(result.issues).toContain("整体风格与参考图不匹配");
    });

    it("totalScore 超过 100 时应被截断为 100", () => {
      const analysis = JSON.stringify({
        totalScore: 150,
        issues: [],
      });
      const result = parseConsistencyAnalysis(analysis, {
        id: "e1",
        name: "test",
      });
      expect(result.score).toBe(1);
    });

    it("totalScore 为负数时应被截断为 0", () => {
      const analysis = JSON.stringify({
        totalScore: -20,
        issues: [],
      });
      const result = parseConsistencyAnalysis(analysis, {
        id: "e1",
        name: "test",
      });
      expect(result.score).toBe(0);
    });

    it("应该回退到正则解析（无 JSON 时）", () => {
      const analysis = `总分：80
外观一致性：70
颜色一致性：75
风格一致性：85
问题列表：
- 角色发型不一致
- 服装颜色差异`;
      const result = parseConsistencyAnalysis(analysis, {
        id: "e1",
        name: "test",
      });
      expect(result.score).toBe(0.8);
      expect(result.issues).toContain("角色发型不一致");
      expect(result.issues).toContain("服装颜色差异");
    });

    it("正则解析无总分时应默认 0.5", () => {
      const analysis = "无总分信息";
      const result = parseConsistencyAnalysis(analysis, {
        id: "e1",
        name: "test",
      });
      expect(result.score).toBe(0.5);
    });

    it("JSON 解析失败但包含 JSON 片段时应尝试解析", () => {
      const analysis = `分析结果如下：
      {"totalScore": 70, "issues": ["测试问题"]}
      其他内容`;
      const result = parseConsistencyAnalysis(analysis, {
        id: "e1",
        name: "test",
      });
      expect(result.score).toBe(0.7);
    });
  });

  describe("checkVisualConsistency", () => {
    it("缺少生成图时应返回失败", async () => {
      const apiGateway = {
        analyzeImage: vi.fn(),
      };
      const result = await checkVisualConsistency(apiGateway, {
        referenceImageUrl: "https://example.com/ref.png",
        element: { id: "e1", name: "test", type: "character" },
      });
      expect(result.score).toBe(0);
      expect(result.passed).toBe(false);
      expect(result.issues).toContain("缺少生成结果或参考图");
      expect(apiGateway.analyzeImage).not.toHaveBeenCalled();
    });

    it("缺少参考图时应返回失败", async () => {
      const apiGateway = {
        analyzeImage: vi.fn(),
      };
      const result = await checkVisualConsistency(apiGateway, {
        generatedImageUrl: "https://example.com/gen.png",
        element: { id: "e1", name: "test", type: "character" },
      });
      expect(result.score).toBe(0);
      expect(result.passed).toBe(false);
      expect(result.issues).toContain("缺少生成结果或参考图");
    });

    it("API 调用失败时应返回失败", async () => {
      const apiGateway = {
        analyzeImage: vi.fn().mockResolvedValue({
          success: false,
          error: "API错误",
        }),
      };
      const result = await checkVisualConsistency(apiGateway, {
        generatedImageUrl: "https://example.com/gen.png",
        referenceImageUrl: "https://example.com/ref.png",
        element: { id: "e1", name: "test", type: "character" },
      });
      expect(result.score).toBe(0);
      expect(result.passed).toBe(false);
      expect(result.issues[0]).toContain("视觉分析失败");
    });

    it("API 调用成功时应返回解析后的结果", async () => {
      const apiGateway = {
        analyzeImage: vi.fn().mockResolvedValue({
          success: true,
          data: {
            analysis: JSON.stringify({
              totalScore: 85,
              appearance: { score: 80 },
              color: { score: 80 },
              style: { score: 80 },
              issues: [],
            }),
          },
        }),
      };
      const result = await checkVisualConsistency(apiGateway, {
        generatedImageUrl: "https://example.com/gen.png",
        referenceImageUrl: "https://example.com/ref.png",
        element: { id: "e1", name: "test", type: "character" },
      });
      expect(result.score).toBe(0.85);
      expect(result.passed).toBe(true);
    });

    it("API 抛出异常时应捕获并返回失败", async () => {
      const apiGateway = {
        analyzeImage: vi.fn().mockRejectedValue(new Error("网络错误")),
      };
      const result = await checkVisualConsistency(apiGateway, {
        generatedImageUrl: "https://example.com/gen.png",
        referenceImageUrl: "https://example.com/ref.png",
        element: { id: "e1", name: "test", type: "character" },
      });
      expect(result.score).toBe(0);
      expect(result.passed).toBe(false);
      expect(result.issues[0]).toContain("检查过程异常");
      expect(result.issues[0]).toContain("网络错误");
    });

    it("非角色类型应使用 scene 作为 category", async () => {
      const apiGateway = {
        analyzeImage: vi.fn().mockResolvedValue({
          success: true,
          data: { analysis: JSON.stringify({ totalScore: 80, issues: [] }) },
        }),
      };
      await checkVisualConsistency(apiGateway, {
        generatedImageUrl: "https://example.com/gen.png",
        referenceImageUrl: "https://example.com/ref.png",
        element: { id: "e1", name: "test", type: "prop" },
      });
      expect(apiGateway.analyzeImage).toHaveBeenCalledWith(
        expect.objectContaining({ category: "scene" }),
      );
    });
  });

  describe("checkBeatElementConsistency", () => {
    it("beat 无 elementIds 时应直接通过", async () => {
      const apiGateway = { analyzeImage: vi.fn() };
      const result = await checkBeatElementConsistency(apiGateway, {
        beat: { id: "b1" },
        elements: [],
        getGeneratedImageUrl: () => undefined,
      });
      expect(result.passed).toBe(true);
      expect(result.overallScore).toBe(1);
      expect(result.recommendation).toBe("accept");
      expect(apiGateway.analyzeImage).not.toHaveBeenCalled();
    });

    it("beat.elementIds 为空数组时应直接通过", async () => {
      const apiGateway = { analyzeImage: vi.fn() };
      const result = await checkBeatElementConsistency(apiGateway, {
        beat: { id: "b1", elementIds: [] },
        elements: [],
        getGeneratedImageUrl: () => undefined,
      });
      expect(result.passed).toBe(true);
      expect(result.overallScore).toBe(1);
    });

    it("元素未在库中找到时应记录问题", async () => {
      const apiGateway = { analyzeImage: vi.fn() };
      const result = await checkBeatElementConsistency(apiGateway, {
        beat: { id: "b1", elementIds: ["missing"] },
        elements: [],
        getGeneratedImageUrl: () => undefined,
      });
      expect(result.passed).toBe(false);
      expect(result.overallScore).toBe(0);
      expect(result.recommendation).toBe("regenerate");
      expect(result.characterScores[0]!.elementName).toBe("未知元素");
      expect(result.characterScores[0]!.issues).toContain("元素未在库中找到");
    });

    it("缺少生成图或参考图时应记录问题", async () => {
      const apiGateway = { analyzeImage: vi.fn() };
      const result = await checkBeatElementConsistency(apiGateway, {
        beat: { id: "b1", elementIds: ["e1"] },
        elements: [{ id: "e1", name: "元素A", type: "character" }],
        getGeneratedImageUrl: () => undefined,
      });
      expect(result.passed).toBe(false);
      expect(result.characterScores[0]!.issues).toContain("缺少生成结果图");
      expect(result.characterScores[0]!.issues).toContain("缺少参考图");
    });

    it("所有元素检查通过时应返回 accept 推荐", async () => {
      const apiGateway = {
        analyzeImage: vi.fn().mockResolvedValue({
          success: true,
          data: {
            analysis: JSON.stringify({
              totalScore: 90,
              appearance: { score: 80 },
              color: { score: 80 },
              style: { score: 80 },
              issues: [],
            }),
          },
        }),
      };
      const result = await checkBeatElementConsistency(apiGateway, {
        beat: { id: "b1", elementIds: ["e1"] },
        elements: [
          {
            id: "e1",
            name: "元素A",
            type: "character",
            bindings: [{ type: "image", url: "https://example.com/ref.png" }],
          },
        ],
        getGeneratedImageUrl: () => "https://example.com/gen.png",
      });
      expect(result.overallScore).toBe(0.9);
      expect(result.passed).toBe(true);
      expect(result.recommendation).toBe("accept");
    });

    it("分数在 0.6-0.85 之间应返回 adjust 推荐", async () => {
      const apiGateway = {
        analyzeImage: vi.fn().mockResolvedValue({
          success: true,
          data: {
            analysis: JSON.stringify({
              totalScore: 70,
              issues: [],
            }),
          },
        }),
      };
      const result = await checkBeatElementConsistency(apiGateway, {
        beat: { id: "b1", elementIds: ["e1"] },
        elements: [
          {
            id: "e1",
            name: "元素A",
            type: "character",
            bindings: [{ type: "image", url: "https://example.com/ref.png" }],
          },
        ],
        getGeneratedImageUrl: () => "https://example.com/gen.png",
      });
      expect(result.overallScore).toBe(0.7);
      expect(result.recommendation).toBe("adjust");
    });
  });
});
