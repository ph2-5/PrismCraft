import { describe, it, expect } from "vitest";
import {
  buildVideoGenerationParams,
  buildQuickVideoParams,
  buildKeyframeGenerationParams,
  buildFramePairGenerationParams,
} from "../video-task-params";

describe("video-task-params", () => {
  describe("buildVideoGenerationParams", () => {
    it("应该使用预构建的 videoPrompt", () => {
      const result = buildVideoGenerationParams({
        videoPrompt: "预构建的 prompt",
        duration: 10,
      });
      expect(result.prompt).toBe("预构建的 prompt");
      expect(result.duration).toBe(10);
    });

    it("应该从 beat 生成 prompt（无预构建 prompt 时）", () => {
      const result = buildVideoGenerationParams({
        beat: {
          id: "b1",
          storyId: "s1",
          content: "角色走进教室",
          duration: 8,
        },
        duration: 8,
      });
      expect(result.prompt).toContain("角色走进教室");
      expect(result.beatId).toBe("b1");
      expect(result.storyId).toBe("s1");
      expect(result.duration).toBe(8);
    });

    it("应该添加首尾帧约束（当存在 firstFrameUrl 时）", () => {
      const result = buildVideoGenerationParams({
        videoPrompt: "基础 prompt",
        firstFrameUrl: "https://example.com/first.png",
      });
      expect(result.prompt).toContain("【首尾帧画面约束】");
      expect(result.prompt).toContain("首帧画面");
      expect(result.firstFrameUrl).toBe("https://example.com/first.png");
    });

    it("应该添加首尾帧约束（当存在 lastFrameUrl 时）", () => {
      const result = buildVideoGenerationParams({
        videoPrompt: "基础 prompt",
        lastFrameUrl: "https://example.com/last.png",
      });
      expect(result.prompt).toContain("【首尾帧画面约束】");
      expect(result.prompt).toContain("尾帧画面");
      expect(result.lastFrameUrl).toBe("https://example.com/last.png");
    });

    it("应该同时添加首尾帧约束（当 firstFrameUrl 和 lastFrameUrl 都存在时）", () => {
      const result = buildVideoGenerationParams({
        videoPrompt: "基础 prompt",
        firstFrameUrl: "https://example.com/first.png",
        lastFrameUrl: "https://example.com/last.png",
      });
      expect(result.prompt).toContain("首帧画面");
      expect(result.prompt).toContain("尾帧画面");
    });

    it("无 firstFrameUrl 和 lastFrameUrl 时不应添加帧约束", () => {
      const result = buildVideoGenerationParams({
        videoPrompt: "基础 prompt",
      });
      expect(result.prompt).not.toContain("【首尾帧画面约束】");
    });

    it("应该从 beat.framePair 中获取 firstFrameUrl", () => {
      const result = buildVideoGenerationParams({
        videoPrompt: "prompt",
        beat: {
          id: "b1",
          framePair: {
            firstFrame: { imageUrl: "https://example.com/beat-first.png" },
          },
        },
      });
      expect(result.firstFrameUrl).toBe("https://example.com/beat-first.png");
    });

    it("应该从 beat.framePair 中获取 lastFrameUrl", () => {
      const result = buildVideoGenerationParams({
        videoPrompt: "prompt",
        beat: {
          id: "b1",
          framePair: {
            lastFrame: { imageUrl: "https://example.com/beat-last.png" },
          },
        },
      });
      expect(result.lastFrameUrl).toBe("https://example.com/beat-last.png");
    });

    it("应该从 beat.firstFrameUrl/lastFrameUrl 中获取 URL（备选）", () => {
      const result = buildVideoGenerationParams({
        videoPrompt: "prompt",
        beat: {
          id: "b1",
          firstFrameUrl: "https://example.com/first.png",
          lastFrameUrl: "https://example.com/last.png",
        },
      });
      expect(result.firstFrameUrl).toBe("https://example.com/first.png");
      expect(result.lastFrameUrl).toBe("https://example.com/last.png");
    });

    it("显式传入的 firstFrameUrl 应优先于 beat.framePair", () => {
      const result = buildVideoGenerationParams({
        videoPrompt: "prompt",
        firstFrameUrl: "https://example.com/explicit.png",
        beat: {
          id: "b1",
          framePair: {
            firstFrame: { imageUrl: "https://example.com/beat.png" },
          },
        },
      });
      expect(result.firstFrameUrl).toBe("https://example.com/explicit.png");
    });

    it("duration 默认值应为 5", () => {
      const result = buildVideoGenerationParams({
        videoPrompt: "prompt",
      });
      expect(result.duration).toBe(5);
    });

    it("应该从 beat.duration 获取 duration（当未显式传入时）", () => {
      const result = buildVideoGenerationParams({
        videoPrompt: "prompt",
        beat: { id: "b1", duration: 12 },
      });
      expect(result.duration).toBe(12);
    });

    it("显式 duration 应优先于 beat.duration", () => {
      const result = buildVideoGenerationParams({
        videoPrompt: "prompt",
        duration: 7,
        beat: { id: "b1", duration: 12 },
      });
      expect(result.duration).toBe(7);
    });

    it("应该传递 providerId 和 modelId", () => {
      const result = buildVideoGenerationParams({
        videoPrompt: "prompt",
        providerId: "provider-1",
        modelId: "model-1",
      });
      expect(result.providerId).toBe("provider-1");
      expect(result.modelId).toBe("model-1");
    });
  });

  describe("buildQuickVideoParams", () => {
    it("应该使用预构建的 videoPrompt", () => {
      const result = buildQuickVideoParams({
        videoPrompt: "预构建 prompt",
        duration: 6,
      });
      expect(result.prompt).toBe("预构建 prompt");
      expect(result.duration).toBe(6);
    });

    it("应该从 prompt 生成视频 prompt", () => {
      const result = buildQuickVideoParams({
        prompt: "一只猫在奔跑",
        duration: 5,
      });
      expect(result.prompt).toContain("一只猫在奔跑");
      expect(result.prompt).toContain("[Video Content]");
    });

    it("duration 默认值应为 5", () => {
      const result = buildQuickVideoParams({
        prompt: "test",
      });
      expect(result.duration).toBe(5);
    });

    it("应该传递 referenceImage 作为 referenceImageUrl", () => {
      const result = buildQuickVideoParams({
        prompt: "test",
        referenceImage: "https://example.com/ref.png",
      });
      expect(result.referenceImageUrl).toBe("https://example.com/ref.png");
    });

    it("应该传递 providerId 和 modelId", () => {
      const result = buildQuickVideoParams({
        prompt: "test",
        providerId: "p1",
        modelId: "m1",
      });
      expect(result.providerId).toBe("p1");
      expect(result.modelId).toBe("m1");
    });

    it("应该包含风格描述", () => {
      const result = buildQuickVideoParams({
        prompt: "test",
        style: "anime",
      });
      expect(result.prompt).toContain("Japanese anime style, bright colors, smooth lines");
    });

    it("应该包含分辨率描述", () => {
      const result = buildQuickVideoParams({
        prompt: "test",
        resolution: "4K",
      });
      expect(result.prompt).toContain("4K Ultra HD resolution");
    });

    it("无 referenceImage 时 referenceImageUrl 应为 undefined", () => {
      const result = buildQuickVideoParams({
        prompt: "test",
      });
      expect(result.referenceImageUrl).toBeUndefined();
    });
  });

  describe("buildKeyframeGenerationParams", () => {
    it("应该构建关键帧生成参数", () => {
      const result = buildKeyframeGenerationParams({
        beat: {
          id: "b1",
          imageGenerationPrompt: "角色站立",
          shotType: "medium",
          camera: { angle: "eye-level", movement: "static" },
        },
      });
      expect(result.prompt).toBe("角色站立");
      expect(result.beatId).toBe("b1");
      expect(result.shotRequirement.shotType).toBe("medium");
      expect(result.shotRequirement.cameraAngle).toBe("eye-level");
      expect(result.shotRequirement.cameraMovement).toBe("static");
      expect(result.shotRequirement.action).toBe("角色站立");
    });

    it("应该从 content 获取 prompt（当无 imageGenerationPrompt 时）", () => {
      const result = buildKeyframeGenerationParams({
        beat: { id: "b1", content: "角色奔跑" },
      });
      expect(result.prompt).toBe("角色奔跑");
      expect(result.shotRequirement.action).toBe("角色奔跑");
    });

    it("应该从 description 获取 prompt（当无 imageGenerationPrompt 和 content 时）", () => {
      const result = buildKeyframeGenerationParams({
        beat: { id: "b1", description: "角色跳跃" },
      });
      expect(result.prompt).toBe("角色跳跃");
      expect(result.shotRequirement.action).toBe("角色跳跃");
    });

    it("无任何内容字段时 prompt 应为空字符串", () => {
      const result = buildKeyframeGenerationParams({
        beat: { id: "b1" },
      });
      expect(result.prompt).toBe("");
      expect(result.shotRequirement.action).toBe("");
    });

    it("应该传递 characterRef 和 sceneRef", () => {
      const result = buildKeyframeGenerationParams({
        beat: { id: "b1", content: "test" },
        characterRef: "char-ref-id",
        sceneRef: "scene-ref-id",
      });
      expect(result.characterRef).toBe("char-ref-id");
      expect(result.sceneRef).toBe("scene-ref-id");
    });

    it("应该从 prevBeat.keyframe 获取 prevKeyframe", () => {
      const result = buildKeyframeGenerationParams({
        beat: { id: "b1", content: "test" },
        prevBeat: {
          id: "b0",
          keyframe: { imageUrl: "https://example.com/prev.png" },
        },
      });
      expect(result.prevKeyframe).toBe("https://example.com/prev.png");
    });

    it("无 prevBeat 时 prevKeyframe 应为 undefined", () => {
      const result = buildKeyframeGenerationParams({
        beat: { id: "b1", content: "test" },
      });
      expect(result.prevKeyframe).toBeUndefined();
    });

    it("应该传递 providerId 和 modelId", () => {
      const result = buildKeyframeGenerationParams({
        beat: { id: "b1", content: "test" },
        providerId: "p1",
        modelId: "m1",
      });
      expect(result.providerId).toBe("p1");
      expect(result.modelId).toBe("m1");
    });
  });

  describe("buildFramePairGenerationParams", () => {
    it("应该构建首尾帧生成参数", () => {
      const result = buildFramePairGenerationParams({
        beat: {
          id: "b1",
          content: "角色行走",
          duration: 5,
          keyframe: { prompt: "关键帧描述" },
          imageGenerationPrompt: "图像 prompt",
          firstFramePrompt: "首帧 prompt",
          lastFramePrompt: "尾帧 prompt",
        },
        characterRef: "char-ref",
        sceneRef: "scene-ref",
      });
      expect(result.beatId).toBe("b1");
      expect(result.firstFrame.prompt).toBe("首帧 prompt");
      expect(result.firstFrame.keyframePrompt).toBe("关键帧描述");
      expect(result.firstFrame.actionDescription).toBe("角色行走");
      expect(result.firstFrame.characterRef).toBe("char-ref");
      expect(result.firstFrame.sceneRef).toBe("scene-ref");
      expect(result.lastFrame.prompt).toBe("尾帧 prompt");
      expect(result.lastFrame.duration).toBe(5);
    });

    it("keyframePrompt 应该从 imageGenerationPrompt 备选", () => {
      const result = buildFramePairGenerationParams({
        beat: {
          id: "b1",
          imageGenerationPrompt: "图像 prompt",
        },
      });
      expect(result.firstFrame.keyframePrompt).toBe("图像 prompt");
      expect(result.lastFrame.keyframePrompt).toBe("图像 prompt");
    });

    it("无 keyframe.prompt 和 imageGenerationPrompt 时 keyframePrompt 应为空", () => {
      const result = buildFramePairGenerationParams({
        beat: { id: "b1", content: "test" },
      });
      expect(result.firstFrame.keyframePrompt).toBe("");
    });

    it("actionDescription 应该从 content 获取", () => {
      const result = buildFramePairGenerationParams({
        beat: { id: "b1", content: "动作描述" },
      });
      expect(result.firstFrame.actionDescription).toBe("动作描述");
    });

    it("actionDescription 应该从 description 备选", () => {
      const result = buildFramePairGenerationParams({
        beat: { id: "b1", description: "描述内容" },
      });
      expect(result.firstFrame.actionDescription).toBe("描述内容");
    });

    it("无 firstFramePrompt 时 firstFrame.prompt 应为 undefined", () => {
      const result = buildFramePairGenerationParams({
        beat: { id: "b1", content: "test" },
      });
      expect(result.firstFrame.prompt).toBeUndefined();
    });

    it("无 lastFramePrompt 时 lastFrame.prompt 应为 undefined", () => {
      const result = buildFramePairGenerationParams({
        beat: { id: "b1", content: "test" },
      });
      expect(result.lastFrame.prompt).toBeUndefined();
    });

    it("无 duration 时 lastFrame.duration 应为 undefined", () => {
      const result = buildFramePairGenerationParams({
        beat: { id: "b1", content: "test" },
      });
      expect(result.lastFrame.duration).toBeUndefined();
    });

    it("应该传递 providerId 和 modelId", () => {
      const result = buildFramePairGenerationParams({
        beat: { id: "b1", content: "test" },
        providerId: "p1",
        modelId: "m1",
      });
      expect(result.providerId).toBe("p1");
      expect(result.modelId).toBe("m1");
    });
  });
});
