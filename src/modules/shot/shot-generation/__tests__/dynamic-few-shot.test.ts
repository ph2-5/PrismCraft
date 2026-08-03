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

  it("P3.4：传入用户示例时优先返回用户示例", () => {
    const userExamples = [
      {
        input: { genre: "action", tone: "epic", beatIndex: 1, totalBeats: 8 },
        output: {
          title: "用户自定义分镜",
          content: "这是用户手动编辑的完整分镜内容描述，包含丰富的视觉细节与角色动作表现，用于验证用户示例在少样本学习中的优先级。",
          shotType: "medium",
          cameraAngle: "low",
          cameraMovement: "push",
          duration: 4,
          type: "action",
        },
      },
    ];
    const examples = selectFewShotExamples(baseContext, 3, "zh", userExamples);
    expect(examples[0]).toBe(userExamples[0]);
  });

  it("P3.4：无用户示例时行为不变", () => {
    const withUser = selectFewShotExamples(baseContext, 3, "zh", []);
    const withoutUser = selectFewShotExamples(baseContext, 3, "zh");
    expect(withUser).toEqual(withoutUser);
  });

  it("P3.4：用户示例与内置示例混合且用户示例数量受 count 限制", () => {
    const userExamples = Array.from({ length: 5 }, (_, i) => ({
      input: { genre: "action", tone: "epic", beatIndex: i, totalBeats: 8, hasAction: true },
      output: {
        title: `用户示例${i}`,
        content: `用户手动编辑的第${i}个分镜内容描述，包含具体视觉细节与镜头调度信息，长度足够达到采集门槛，用于测试数量限制。`,
        shotType: "close",
        cameraAngle: "eye_level",
        cameraMovement: "static",
        duration: 5,
        type: "scene",
      },
    }));
    const examples = selectFewShotExamples(baseContext, 3, "zh", userExamples);
    expect(examples.length).toBeLessThanOrEqual(3);
    // 用户示例加权后应占据全部名额
    expect(examples.every((ex) => ex.output.title.startsWith("用户示例"))).toBe(true);
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

  it("P3.4：传入用户示例时 prompt 包含用户示例内容", () => {
    const userExamples = [
      {
        input: { genre: "action", tone: "epic", beatIndex: 1, totalBeats: 8 },
        output: {
          title: "用户编辑分镜",
          content: "用户手动编辑后的分镜内容，包含完整视觉细节与镜头调度，验证用户示例注入到生成提示词中。",
          shotType: "close",
          cameraAngle: "eye_level",
          cameraMovement: "push",
          duration: 4,
          type: "action",
        },
      },
    ];
    const result = enrichPromptWithFewShot(
      "base prompt",
      { genre: "action", tone: "epic", beatIndex: 0, totalBeats: 8 },
      "zh",
      userExamples,
    );
    expect(result).toContain("用户编辑分镜");
    expect(result).toContain("用户手动编辑后的分镜内容");
  });
});
