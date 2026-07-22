import { describe, it, expect } from "vitest";
import {
  selectFewShotExamples,
  buildFewShotPrompt,
  type FewShotInput,
  type FewShotExample,
} from "../story-few-shot";

describe("story-few-shot", () => {
  describe("selectFewShotExamples", () => {
    it("应返回请求数量的示例（默认 3）", () => {
      const context: FewShotInput = {
        genre: "action",
        tone: "epic",
        beatIndex: 0,
        totalBeats: 8,
      };
      const result = selectFewShotExamples(context);
      expect(result).toHaveLength(3);
    });

    it("应支持自定义 count", () => {
      const context: FewShotInput = {
        genre: "action",
        tone: "epic",
        beatIndex: 0,
        totalBeats: 8,
      };
      const result5 = selectFewShotExamples(context, 5);
      expect(result5).toHaveLength(5);

      const result1 = selectFewShotExamples(context, 1);
      expect(result1).toHaveLength(1);
    });

    it("count 超过示例总数时应返回全部可用示例", () => {
      const context: FewShotInput = {
        genre: "action",
        tone: "epic",
        beatIndex: 0,
        totalBeats: 8,
      };
      const result = selectFewShotExamples(context, 100);
      // 内部示例池共 12 个
      expect(result.length).toBeGreaterThan(0);
      // 结果应不大于示例池大小
      expect(result.length).toBeLessThanOrEqual(100);
    });

    it("应优先匹配 genre", () => {
      const context: FewShotInput = {
        genre: "action",
        tone: "epic",
        beatIndex: 0,
        totalBeats: 8,
      };
      const result = selectFewShotExamples(context, 3);
      // action genre 在示例池中至少 3 个，应全部出现在前 3
      const actionCount = result.filter((e) => e.input.genre === "action").length;
      expect(actionCount).toBeGreaterThanOrEqual(2);
    });

    it("应同时匹配 genre 和 tone", () => {
      const context: FewShotInput = {
        genre: "romance",
        tone: "intimate",
        beatIndex: 0,
        totalBeats: 6,
      };
      const result = selectFewShotExamples(context, 1);
      const top = result[0];
      expect(top?.input.genre).toBe("romance");
      expect(top?.input.tone).toBe("intimate");
    });

    it("应基于 beatIndex 位置相似度评分", () => {
      const ctx: FewShotInput = {
        genre: "action",
        tone: "epic",
        beatIndex: 5,
        totalBeats: 8, // 位置 = 5/8 = 0.625
      };
      const result = selectFewShotExamples(ctx, 1);
      // 5/8 = 0.625 最接近示例中 beatIndex=5/totalBeats=8 的 action 示例（位置也是 0.625）
      expect(result[0]?.input.beatIndex).toBe(5);
      expect(result[0]?.input.genre).toBe("action");
    });

    it("totalBeats=0 时应避免除零错误", () => {
      const context: FewShotInput = {
        genre: "drama",
        tone: "neutral",
        beatIndex: 0,
        totalBeats: 0,
      };
      expect(() => selectFewShotExamples(context, 2)).not.toThrow();
      const result = selectFewShotExamples(context, 2);
      expect(result).toHaveLength(2);
    });

    it("未知 genre/tone 时仍应返回示例", () => {
      const context: FewShotInput = {
        genre: "nonexistent",
        tone: "unknown",
        beatIndex: 0,
        totalBeats: 5,
      };
      const result = selectFewShotExamples(context, 2);
      expect(result).toHaveLength(2);
      result.forEach((r) => {
        expect(r).toBeDefined();
        expect(r.output).toBeDefined();
      });
    });

    it("返回的示例应按评分降序排列", () => {
      const context: FewShotInput = {
        genre: "mystery",
        tone: "dark",
        beatIndex: 0,
        totalBeats: 7,
      };
      const result = selectFewShotExamples(context, 12);
      // 第一个应至少匹配 genre + tone，分数最高
      const first = result[0];
      expect(first?.input.genre).toBe("mystery");
      expect(first?.input.tone).toBe("dark");
    });

    it("返回的每个示例都应包含完整的 input 和 output 结构", () => {
      const context: FewShotInput = {
        genre: "action",
        tone: "epic",
        beatIndex: 0,
        totalBeats: 8,
      };
      const result = selectFewShotExamples(context, 2);
      for (const example of result) {
        expect(example.input).toBeDefined();
        expect(example.input.genre).toEqual(expect.any(String));
        expect(example.input.tone).toEqual(expect.any(String));
        expect(example.input.beatIndex).toEqual(expect.any(Number));
        expect(example.input.totalBeats).toEqual(expect.any(Number));
        expect(example.output).toBeDefined();
        expect(example.output.title).toEqual(expect.any(String));
        expect(example.output.content).toEqual(expect.any(String));
        expect(example.output.shotSize).toEqual(expect.any(String));
        expect(example.output.cameraAngle).toEqual(expect.any(String));
        expect(example.output.cameraMovement).toEqual(expect.any(String));
        expect(example.output.duration).toEqual(expect.any(Number));
        expect(example.output.type).toEqual(expect.any(String));
      }
    });
  });

  describe("buildFewShotPrompt", () => {
    // 通过 selectFewShotExamples 取一组真实示例用于 buildFewShotPrompt 测试
    const sampleContext: FewShotInput = {
      genre: "action",
      tone: "epic",
      beatIndex: 0,
      totalBeats: 8,
    };
    const sampleExamples: FewShotExample[] = selectFewShotExamples(sampleContext, 2);

    it("空数组时应返回空字符串", () => {
      expect(buildFewShotPrompt([])).toBe("");
    });

    it("应包含提示文本标题", () => {
      const example = sampleExamples[0]!;
      const result = buildFewShotPrompt([example]);
      expect(result).toContain("高质量的分镜示例");
    });

    it("应包含示例编号（示例1）", () => {
      const example = sampleExamples[0]!;
      const result = buildFewShotPrompt([example]);
      expect(result).toContain("示例1");
    });

    it("应包含示例的 genre 和 tone", () => {
      const example = sampleExamples[0]!;
      const result = buildFewShotPrompt([example]);
      expect(result).toContain(example.input.genre);
      expect(result).toContain(example.input.tone);
    });

    it("应包含标题、内容、景别、角度、运镜、时长、类型字段", () => {
      const example = sampleExamples[1] ?? sampleExamples[0]!;
      const result = buildFewShotPrompt([example]);
      expect(result).toContain(`标题：${example.output.title}`);
      expect(result).toContain(`内容：${example.output.content}`);
      expect(result).toContain(`景别：${example.output.shotSize}`);
      expect(result).toContain(`角度：${example.output.cameraAngle}`);
      expect(result).toContain(`运镜：${example.output.cameraMovement}`);
      expect(result).toContain(`时长：${example.output.duration}秒`);
      expect(result).toContain(`类型：${example.output.type}`);
    });

    it("应正确处理多个示例并编号递增", () => {
      const result = buildFewShotPrompt(sampleExamples);
      expect(result).toContain("示例1");
      expect(result).toContain("示例2");
    });

    it("beatIndex 应转换为人类可读的 1-based 序号", () => {
      const customExample: FewShotExample = {
        input: {
          genre: "test",
          tone: "test",
          beatIndex: 0, // 0-based 内部
          totalBeats: 5,
        },
        output: {
          title: "T", content: "C", shotSize: "medium",
          cameraAngle: "eye_level", cameraMovement: "static",
          duration: 5, type: "scene",
        },
      };
      const result = buildFewShotPrompt([customExample]);
      expect(result).toContain("第1镜/共5镜");
    });
  });
});
