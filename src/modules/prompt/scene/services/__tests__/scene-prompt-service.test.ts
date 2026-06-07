import { describe, it, expect } from "vitest";
import {
  generateSceneImagePrompt,
  generateSimpleSceneImagePrompt,
  generateScenePromptOptimization,
} from "../scene-prompt-service";
import type { Scene } from "@/domain/schemas";

function buildScene(overrides: Partial<Scene> = {}): Scene {
  return {
    id: "scene-1",
    name: "测试场景",
    description: "一个美丽的花园",
    type: "室外",
    timeOfDay: "黄昏",
    weather: "晴天",
    mood: "平静",
    lighting: "暖光",
    elements: ["花朵", "喷泉"],
    colors: ["绿色", "金色"],
    prompt: "",
    ...overrides,
  };
}

describe("scene-prompt-service", () => {
  describe("generateSceneImagePrompt", () => {
    it("应生成包含描述的场景提示词", () => {
      const scene = buildScene();
      const prompt = generateSceneImagePrompt(scene);
      expect(prompt).toContain("一个美丽的花园");
      expect(prompt).toContain("scene design");
      expect(prompt).toContain("background art");
    });

    it("应包含场景类型关键词", () => {
      const scene = buildScene({ type: "室外" });
      const prompt = generateSceneImagePrompt(scene);
      expect(prompt).toContain("exterior");
      expect(prompt).toContain("outdoor");
    });

    it("应包含情绪关键词", () => {
      const scene = buildScene({ mood: "紧张" });
      const prompt = generateSceneImagePrompt(scene);
      expect(prompt).toContain("tense");
      expect(prompt).toContain("dramatic");
    });

    it("应包含光照关键词", () => {
      const scene = buildScene({ lighting: "暖光" });
      const prompt = generateSceneImagePrompt(scene);
      expect(prompt).toContain("warm lighting");
    });

    it("应包含摄像机角度关键词", () => {
      const scene = buildScene({ camera: { angle: "俯拍" } });
      const prompt = generateSceneImagePrompt(scene);
      expect(prompt).toContain("high angle shot");
    });

    it("应包含氛围描述", () => {
      const scene = buildScene({ timeOfDay: "黄昏", weather: "晴天", mood: "平静", lighting: "暖光" });
      const prompt = generateSceneImagePrompt(scene);
      expect(prompt).toContain("黄昏");
      expect(prompt).toContain("晴天");
    });

    it("应包含视觉描述", () => {
      const scene = buildScene({ elements: ["花朵"], colors: ["绿色"] });
      const prompt = generateSceneImagePrompt(scene);
      expect(prompt).toContain("花朵");
      expect(prompt).toContain("绿色");
    });

    it("无 name 和 description 时应返回空字符串", () => {
      const scene = buildScene({ name: "", description: "" });
      const prompt = generateSceneImagePrompt(scene);
      expect(prompt).toBe("");
    });

    it("有 name 无 description 时应使用 name", () => {
      const scene = buildScene({ name: "森林", description: "" });
      const prompt = generateSceneImagePrompt(scene);
      expect(prompt).toContain("森林");
    });

    it("应包含质量标签", () => {
      const scene = buildScene();
      const prompt = generateSceneImagePrompt(scene);
      expect(prompt).toContain("masterpiece");
      expect(prompt).toContain("best quality");
    });

    it("未知场景类型不应添加类型关键词", () => {
      const scene = buildScene({ type: "未知类型" });
      const prompt = generateSceneImagePrompt(scene);
      expect(prompt).toContain("一个美丽的花园");
    });

    it("未知光照类型不应添加光照关键词映射值", () => {
      const scene = buildScene({ lighting: "未知光照" });
      const prompt = generateSceneImagePrompt(scene);
      expect(prompt).not.toContain("natural lighting");
      expect(prompt).not.toContain("warm lighting");
    });
  });

  describe("generateSimpleSceneImagePrompt", () => {
    it("应生成简化版场景提示词", () => {
      const scene = buildScene();
      const prompt = generateSimpleSceneImagePrompt(scene);
      expect(prompt).toContain("测试场景");
      expect(prompt).toContain("一个美丽的花园");
      expect(prompt).toContain("scene design");
      expect(prompt).toContain("high quality");
    });

    it("应包含类型信息", () => {
      const scene = buildScene({ type: "室内" });
      const prompt = generateSimpleSceneImagePrompt(scene);
      expect(prompt).toContain("类型：室内");
    });

    it("应包含时间信息", () => {
      const scene = buildScene({ timeOfDay: "黄昏" });
      const prompt = generateSimpleSceneImagePrompt(scene);
      expect(prompt).toContain("时间：黄昏");
    });

    it("应包含天气信息", () => {
      const scene = buildScene({ weather: "雨天" });
      const prompt = generateSimpleSceneImagePrompt(scene);
      expect(prompt).toContain("天气：雨天");
    });

    it("空场景应仍返回基础质量标签", () => {
      const scene = buildScene({
        name: "",
        description: "",
        type: "",
        timeOfDay: "",
        weather: "",
        mood: "",
        lighting: "",
        elements: [],
        colors: [],
      });
      const prompt = generateSimpleSceneImagePrompt(scene);
      expect(prompt).toContain("scene design");
      expect(prompt).toContain("high quality");
    });
  });

  describe("generateScenePromptOptimization", () => {
    it("应包含用户描述", () => {
      const result = generateScenePromptOptimization("一座古老的城堡");
      expect(result).toContain("一座古老的城堡");
    });

    it("应包含优化要求", () => {
      const result = generateScenePromptOptimization("测试描述");
      expect(result).toContain("视觉细节");
      expect(result).toContain("300字");
    });

    it("空描述仍应返回模板", () => {
      const result = generateScenePromptOptimization("");
      expect(result).toContain("场景生成描述优化");
    });
  });
});
