import { describe, it, expect } from "vitest";
import { buildStoryPlanPrompt, buildRetryPrompt } from "../../shot-generation/story-plan-prompt";
import type { Character, Scene } from "@/domain/schemas";

describe("buildStoryPlanPrompt", () => {
  const baseStory = {
    title: "测试故事",
    genre: "action",
    tone: "epic",
    targetDuration: 60,
    description: "一段测试故事描述",
  };

  describe("language: zh (默认)", () => {
    it("应生成中文输出", () => {
      const prompt = buildStoryPlanPrompt(baseStory, [], [], [], "zh");
      expect(prompt).toContain("分镜规划");
      expect(prompt).toContain("故事标题");
      expect(prompt).toContain("类型");
      expect(prompt).toContain("要求");
    });

    it("应包含故事标题", () => {
      const prompt = buildStoryPlanPrompt(baseStory, [], [], [], "zh");
      expect(prompt).toContain("测试故事");
    });

    it("应包含 JSON schema 部分", () => {
      const prompt = buildStoryPlanPrompt(baseStory, [], [], [], "zh");
      expect(prompt).toContain("JSON");
      expect(prompt).toContain("```json");
    });
  });

  describe("language: en", () => {
    it("应生成英文输出", () => {
      const prompt = buildStoryPlanPrompt(baseStory, [], [], [], "en");
      expect(prompt).toContain("storyboard plan");
      expect(prompt).toContain("Title:");
      expect(prompt).toContain("Genre:");
      expect(prompt).toContain("Requirements:");
    });

    it("应使用英文标题", () => {
      const prompt = buildStoryPlanPrompt(baseStory, [], [], [], "en");
      expect(prompt).toContain("Title: 测试故事");
      expect(prompt).toContain("Genre: action");
    });

    it("应使用英文 JSON schema 说明", () => {
      const prompt = buildStoryPlanPrompt(baseStory, [], [], [], "en");
      expect(prompt).toContain("compact JSON array format");
      expect(prompt).toContain("Shot title");
    });

    it("应使用英文要求", () => {
      const prompt = buildStoryPlanPrompt(baseStory, [], [], [], "en");
      expect(prompt).toContain("Each shot's content must be specific");
      expect(prompt).toContain("Camera parameters must match");
    });
  });

  describe("language: auto", () => {
    it("应默认为中文输出", () => {
      const prompt = buildStoryPlanPrompt(baseStory, [], [], [], "auto");
      expect(prompt).toContain("分镜规划");
      expect(prompt).toContain("要求");
    });
  });

  describe("角色和场景列表", () => {
    it("language=en 时应使用英文标签", () => {
      const characters = [{ id: "c1", name: "Hero", description: "A brave warrior" } as Character];
      const scenes = [{ id: "s1", name: "Castle", description: "An ancient castle" } as Scene];
      const prompt = buildStoryPlanPrompt(baseStory, characters, scenes, [], "en");
      expect(prompt).toContain("Characters:");
      expect(prompt).toContain("Hero");
      expect(prompt).toContain("Scenes:");
      expect(prompt).toContain("Castle");
    });

    it("language=zh 时应使用中文标签", () => {
      const characters = [{ id: "c1", name: "英雄", description: "勇敢的战士" } as Character];
      const scenes = [{ id: "s1", name: "城堡", description: "古老的城堡" } as Scene];
      const prompt = buildStoryPlanPrompt(baseStory, characters, scenes, [], "zh");
      expect(prompt).toContain("角色列表");
      expect(prompt).toContain("英雄");
      expect(prompt).toContain("场景列表");
      expect(prompt).toContain("城堡");
    });
  });
});

describe("buildRetryPrompt", () => {
  it("language=en 应生成英文修正提示", () => {
    const result = buildRetryPrompt("base prompt", ["error1", "error2"], "en");
    expect(result).toContain("Important Correction Requirements");
    expect(result).toContain("1. error1");
    expect(result).toContain("2. error2");
    expect(result).toContain("strictly conforms");
  });

  it("language=zh 应生成中文修正提示", () => {
    const result = buildRetryPrompt("基础提示", ["错误1", "错误2"], "zh");
    expect(result).toContain("重要修正要求");
    expect(result).toContain("1. 错误1");
    expect(result).toContain("2. 错误2");
    expect(result).toContain("严格符合");
  });
});
