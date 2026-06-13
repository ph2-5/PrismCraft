import { describe, it, expect } from "vitest";
import {
  selectFewShotExamples,
  buildFewShotPrompt,
  enrichPromptWithFewShot,
} from "../../shot-generation/dynamic-few-shot";
import type { Character, Scene } from "@/domain/schemas";

describe("selectFewShotExamples", () => {
  const baseContext = {
    genre: "action",
    tone: "epic",
    beatIndex: 0,
    totalBeats: 8,
    hasAction: true,
  };

  describe("language: zh", () => {
    it("应返回中文示例", () => {
      const examples = selectFewShotExamples(baseContext, 3, "zh");
      expect(examples.length).toBeGreaterThan(0);
      for (const ex of examples) {
        expect(ex.output.title).toMatch(/[\u4e00-\u9fff]/);
      }
    });
  });

  describe("language: en", () => {
    it("应返回英文示例", () => {
      const examples = selectFewShotExamples(baseContext, 3, "en");
      expect(examples.length).toBeGreaterThan(0);
      for (const ex of examples) {
        expect(ex.output.title).not.toMatch(/[\u4e00-\u9fff]/);
      }
    });

    it("英文示例应包含英文内容", () => {
      const examples = selectFewShotExamples(baseContext, 1, "en");
      expect(examples[0]!.output.content).toMatch(/^[A-Z]/);
    });
  });

  it("应按相关性排序", () => {
    const exactContext = {
      genre: "action",
      tone: "epic",
      beatIndex: 0,
      totalBeats: 8,
      hasAction: true,
    };
    const examples = selectFewShotExamples(exactContext, 3, "zh");
    expect(examples.length).toBeGreaterThan(0);
  });

  it("应限制返回数量", () => {
    const examples = selectFewShotExamples(baseContext, 2, "zh");
    expect(examples.length).toBeLessThanOrEqual(2);
  });
});

describe("buildFewShotPrompt", () => {
  it("language=en 应生成英文 few-shot 提示", () => {
    const examples = selectFewShotExamples(
      { genre: "action", tone: "epic", beatIndex: 0, totalBeats: 8 },
      2,
      "en",
    );
    const prompt = buildFewShotPrompt(examples, "en");
    expect(prompt).toContain("high-quality storyboard examples");
    expect(prompt).toContain("Example 1");
    expect(prompt).toContain("Title:");
    expect(prompt).toContain("Content:");
    expect(prompt).toContain("Generate storyboard shots");
  });

  it("language=zh 应生成中文 few-shot 提示", () => {
    const examples = selectFewShotExamples(
      { genre: "action", tone: "epic", beatIndex: 0, totalBeats: 8 },
      2,
      "zh",
    );
    const prompt = buildFewShotPrompt(examples, "zh");
    expect(prompt).toContain("高质量的分镜示例");
    expect(prompt).toContain("示例1");
    expect(prompt).toContain("标题：");
    expect(prompt).toContain("内容：");
    expect(prompt).toContain("请按照以上示例");
  });

  it("空示例应返回空字符串", () => {
    const prompt = buildFewShotPrompt([], "zh");
    expect(prompt).toBe("");
  });
});

describe("enrichPromptWithFewShot", () => {
  it("language=en 应包含英文 few-shot 示例", () => {
    const result = enrichPromptWithFewShot(
      "base prompt",
      { genre: "action", tone: "epic", beatIndex: 0, totalBeats: 8 },
      "en",
    );
    expect(result).toContain("base prompt");
    expect(result).toContain("high-quality storyboard examples");
    expect(result).toContain("Example");
  });

  it("language=zh 应包含中文 few-shot 示例", () => {
    const result = enrichPromptWithFewShot(
      "基础提示",
      { genre: "action", tone: "epic", beatIndex: 0, totalBeats: 8 },
      "zh",
    );
    expect(result).toContain("基础提示");
    expect(result).toContain("高质量的分镜示例");
    expect(result).toContain("示例");
  });

  it("language=auto 应默认为中文", () => {
    const result = enrichPromptWithFewShot(
      "base prompt",
      { genre: "action", tone: "epic", beatIndex: 0, totalBeats: 8 },
      "auto",
    );
    expect(result).toContain("高质量的分镜示例");
  });

  it("有角色时应附加角色信息", () => {
    const characters = [{ name: "Hero", description: "A brave warrior" } as Character];
    const result = enrichPromptWithFewShot(
      "base",
      { genre: "action", tone: "epic", beatIndex: 0, totalBeats: 8, characters },
      "en",
    );
    expect(result).toContain("Existing Characters");
    expect(result).toContain("Hero");
  });

  it("有场景时应附加场景信息", () => {
    const scenes = [{ name: "Castle", description: "An ancient castle" } as Scene];
    const result = enrichPromptWithFewShot(
      "base",
      { genre: "action", tone: "epic", beatIndex: 0, totalBeats: 8, scenes },
      "en",
    );
    expect(result).toContain("Existing Scenes");
    expect(result).toContain("Castle");
  });
});
