import { describe, it, expect } from "vitest";
import {
  generateFirstFramePrompt,
  generateLastFramePrompt,
  generateKeyframePrompt,
  generateCharacterAnalysisPrompt,
  generateSceneAnalysisPrompt,
} from "@/modules/prompt/server-prompts/services/server-prompt-service";

describe("server-prompt-service", () => {
  describe("generateFirstFramePrompt", () => {
    it("should generate prompt with keyframePrompt only", () => {
      const result = generateFirstFramePrompt({ keyframePrompt: "A sunset scene" });
      expect(result).toContain("第一帧");
      expect(result).toContain("A sunset scene");
      expect(result).toContain("起始画面");
    });

    it("should generate prompt with actionDescription", () => {
      const result = generateFirstFramePrompt({
        keyframePrompt: "A sunset scene",
        actionDescription: "character raises hand",
      });
      expect(result).toContain("动作起始状态");
      expect(result).toContain("character raises hand");
    });

    it("should generate prompt without actionDescription", () => {
      const result = generateFirstFramePrompt({ keyframePrompt: "A sunset scene" });
      expect(result).not.toContain("动作起始状态");
    });

    it("should include quality tags", () => {
      const result = generateFirstFramePrompt({ keyframePrompt: "test" });
      expect(result).toContain("masterpiece");
      expect(result).toContain("best quality");
    });

    it("should include frame requirements", () => {
      const result = generateFirstFramePrompt({ keyframePrompt: "test" });
      expect(result).toContain("清晰展示角色起始姿态");
    });

    it("should generate prompt with all optional fields", () => {
      const result = generateFirstFramePrompt({
        keyframePrompt: "A sunset scene",
        actionDescription: "character raises hand",
        characterRef: "char-1",
        sceneRef: "scene-1",
        duration: 5,
      });
      expect(result).toContain("A sunset scene");
      expect(result).toContain("character raises hand");
    });

    it("should generate prompt with empty keyframePrompt", () => {
      const result = generateFirstFramePrompt({ keyframePrompt: "" });
      expect(result).toContain("第一帧");
      expect(result).not.toContain("基于以下预览图的风格和构图");
    });
  });

  describe("generateLastFramePrompt", () => {
    it("should generate prompt with keyframePrompt only", () => {
      const result = generateLastFramePrompt({ keyframePrompt: "A sunset scene" });
      expect(result).toContain("最后一帧");
      expect(result).toContain("A sunset scene");
      expect(result).toContain("结束画面");
    });

    it("should generate prompt with actionDescription", () => {
      const result = generateLastFramePrompt({
        keyframePrompt: "A sunset scene",
        actionDescription: "character lowers hand",
      });
      expect(result).toContain("动作结束状态");
      expect(result).toContain("character lowers hand");
    });

    it("should include duration when provided", () => {
      const result = generateLastFramePrompt({
        keyframePrompt: "A sunset scene",
        duration: 5,
      });
      expect(result).toContain("5 秒");
    });

    it("should not include duration when not provided", () => {
      const result = generateLastFramePrompt({ keyframePrompt: "A sunset scene" });
      expect(result).not.toContain("秒");
    });

    it("should include quality tags", () => {
      const result = generateLastFramePrompt({ keyframePrompt: "test" });
      expect(result).toContain("masterpiece");
    });

    it("should include frame requirements", () => {
      const result = generateLastFramePrompt({ keyframePrompt: "test" });
      expect(result).toContain("清晰展示角色结束姿态");
    });

    it("should generate prompt with all optional fields", () => {
      const result = generateLastFramePrompt({
        keyframePrompt: "A sunset scene",
        actionDescription: "character lowers hand",
        characterRef: "char-1",
        sceneRef: "scene-1",
        duration: 8,
      });
      expect(result).toContain("A sunset scene");
      expect(result).toContain("character lowers hand");
      expect(result).toContain("8 秒");
    });
  });

  describe("generateKeyframePrompt", () => {
    it("should generate prompt with content only", () => {
      const result = generateKeyframePrompt({ content: "A character standing in the rain" });
      expect(result).toContain("A character standing in the rain");
      expect(result).toContain("分镜预览图");
    });

    it("should generate prompt with shotRequirement", () => {
      const result = generateKeyframePrompt({
        content: "A character",
        shotRequirement: {
          shotType: "close-up",
          cameraAngle: "low angle",
          cameraMovement: "push in",
          action: "walking",
        },
      });
      expect(result).toContain("close-up");
      expect(result).toContain("low angle");
      expect(result).toContain("push in");
      expect(result).toContain("walking");
    });

    it("should generate prompt with partial shotRequirement", () => {
      const result = generateKeyframePrompt({
        shotRequirement: {
          shotType: "wide shot",
        },
      });
      expect(result).toContain("wide shot");
      expect(result).not.toContain("镜头角度");
      expect(result).not.toContain("运镜方式");
    });

    it("should include prevKeyframe continuity note", () => {
      const result = generateKeyframePrompt({
        content: "A scene",
        prevKeyframe: "previous-frame-url",
      });
      expect(result).toContain("视觉连贯性");
    });

    it("should not include prevKeyframe note when not provided", () => {
      const result = generateKeyframePrompt({ content: "A scene" });
      expect(result).not.toContain("视觉连贯性");
    });

    it("should include quality tags", () => {
      const result = generateKeyframePrompt({ content: "test" });
      expect(result).toContain("masterpiece");
    });

    it("should generate prompt with all fields", () => {
      const result = generateKeyframePrompt({
        content: "A dramatic scene",
        characterRef: "char-1",
        sceneRef: "scene-1",
        prevKeyframe: "prev-keyframe-url",
        shotRequirement: {
          shotType: "medium shot",
          cameraAngle: "eye level",
          cameraMovement: "tracking",
          action: "running",
        },
      });
      expect(result).toContain("A dramatic scene");
      expect(result).toContain("medium shot");
      expect(result).toContain("eye level");
      expect(result).toContain("tracking");
      expect(result).toContain("running");
      expect(result).toContain("视觉连贯性");
    });

    it("should generate prompt without content", () => {
      const result = generateKeyframePrompt({});
      expect(result).toContain("分镜预览图");
      expect(result).not.toContain("画面内容");
    });
  });

  describe("generateCharacterAnalysisPrompt", () => {
    it("should return JSON format prompt", () => {
      const result = generateCharacterAnalysisPrompt();
      expect(result).toContain("JSON");
      expect(result).toContain("name");
      expect(result).toContain("gender");
      expect(result).toContain("age");
      expect(result).toContain("style");
      expect(result).toContain("appearance");
      expect(result).toContain("hairColor");
      expect(result).toContain("clothing");
      expect(result).toContain("description");
    });

    it("should include personality field", () => {
      const result = generateCharacterAnalysisPrompt();
      expect(result).toContain("personality");
    });

    it("should always return the same prompt", () => {
      const result1 = generateCharacterAnalysisPrompt();
      const result2 = generateCharacterAnalysisPrompt();
      expect(result1).toBe(result2);
    });
  });

  describe("generateSceneAnalysisPrompt", () => {
    it("should return JSON format prompt", () => {
      const result = generateSceneAnalysisPrompt();
      expect(result).toContain("JSON");
      expect(result).toContain("name");
      expect(result).toContain("type");
      expect(result).toContain("timeOfDay");
      expect(result).toContain("weather");
      expect(result).toContain("mood");
      expect(result).toContain("elements");
      expect(result).toContain("colorPalette");
      expect(result).toContain("description");
    });

    it("should always return the same prompt", () => {
      const result1 = generateSceneAnalysisPrompt();
      const result2 = generateSceneAnalysisPrompt();
      expect(result1).toBe(result2);
    });
  });
});
