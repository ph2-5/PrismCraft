import { describe, it, expect } from "vitest";
import { StoryGenerationService } from "@/domain/services/story-generation-service";
import type { StoryBeat, Character, Scene } from "@/domain/schemas";

function createMockBeat(overrides: Partial<StoryBeat> = {}): StoryBeat {
  return {
    id: "beat-1",
    sequence: 1,
    description: "测试分镜描述",
    duration: 5,
    characters: [],
    elementIds: [],
    characterIds: [],
    enhancedGeneration: false,
    ...overrides,
  } as StoryBeat;
}

function createMockCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: "char-1",
    name: "测试角色",
    description: "一个测试角色",
    gender: "男",
    style: "写实",
    personality: ["勇敢"],
    appearance: {
      hairColor: "黑",
      hairStyle: "短",
      eyeColor: "棕",
      height: "180cm",
      build: "健壮",
      clothing: "盔甲",
    },
    prompt: "一个勇敢的英雄",
    ...overrides,
  } as Character;
}

function createMockScene(overrides: Partial<Scene> = {}): Scene {
  return {
    id: "scene-1",
    name: "测试场景",
    description: "一个测试场景",
    type: "室外",
    timeOfDay: "白天",
    weather: "晴朗",
    mood: "平静",
    lighting: "自然光",
    elements: [],
    colors: [],
    prompt: "一个美丽的场景",
    ...overrides,
  } as Scene;
}

describe("StoryGenerationService", () => {
  describe("resolveGenerationContext", () => {
    it("应解析角色引用", () => {
      const beat = createMockBeat({ characterIds: ["char-1"] });
      const characters = [
        createMockCharacter({ id: "char-1", name: "英雄", avatarPath: "http://example.com/hero-avatar.png" }),
      ];
      const result = StoryGenerationService.resolveGenerationContext({
        beat,
        prevBeat: null,
        characters,
        scenes: [],
        elements: [],
      });
      expect(result.characterRef).toBe("http://example.com/hero-avatar.png");
    });

    it("应解析场景引用", () => {
      const beat = createMockBeat({ sceneId: "scene-1" });
      const scenes = [createMockScene({ id: "scene-1", name: "森林", refImagePath: "http://example.com/forest-ref.png" })];
      const result = StoryGenerationService.resolveGenerationContext({
        beat,
        prevBeat: null,
        characters: [],
        scenes,
        elements: [],
      });
      expect(result.sceneRef).toBe("http://example.com/forest-ref.png");
    });

    it("应从前一个分镜获取引用信息", () => {
      const beat = createMockBeat();
      const prevBeat = createMockBeat({
        keyframe: { imageUrl: "keyframe-url" },
        framePair: {
          firstFrame: { imageUrl: "first-url", prompt: "", derivedFrom: "" },
          lastFrame: { imageUrl: "last-url", prompt: "", derivedFrom: "" },
        },
        videoGen: { videoUrl: "video-url" },
      } as Partial<StoryBeat>);
      const result = StoryGenerationService.resolveGenerationContext({
        beat,
        prevBeat,
        characters: [],
        scenes: [],
        elements: [],
      });
      expect(result.prevKeyframeUrl).toBe("keyframe-url");
      expect(result.prevLastFrameUrl).toBe("last-url");
      expect(result.prevVideoUrl).toBe("video-url");
    });

    it("无前一个分镜时引用信息应为 undefined", () => {
      const beat = createMockBeat();
      const result = StoryGenerationService.resolveGenerationContext({
        beat,
        prevBeat: null,
        characters: [],
        scenes: [],
        elements: [],
      });
      expect(result.prevKeyframeUrl).toBeUndefined();
      expect(result.prevLastFrameUrl).toBeUndefined();
      expect(result.prevVideoUrl).toBeUndefined();
    });

    it("角色ID不匹配时 characterRef 应为 undefined", () => {
      const beat = createMockBeat({ characterIds: ["non-existent"] });
      const characters = [createMockCharacter({ id: "char-1" })];
      const result = StoryGenerationService.resolveGenerationContext({
        beat,
        prevBeat: null,
        characters,
        scenes: [],
        elements: [],
      });
      expect(result.characterRef).toBeUndefined();
    });

    it("角色无可用图片时 characterRef 应为 undefined", () => {
      const beat = createMockBeat({ characterIds: ["char-1"] });
      const characters = [
        createMockCharacter({ id: "char-1", avatarPath: undefined, generatedImage: undefined, refImagePath: undefined }),
      ];
      const result = StoryGenerationService.resolveGenerationContext({
        beat,
        prevBeat: null,
        characters,
        scenes: [],
        elements: [],
      });
      expect(result.characterRef).toBeUndefined();
    });

    it("场景ID不匹配时 sceneRef 应为 undefined", () => {
      const beat = createMockBeat({ sceneId: "non-existent" });
      const scenes = [createMockScene({ id: "scene-1" })];
      const result = StoryGenerationService.resolveGenerationContext({
        beat,
        prevBeat: null,
        characters: [],
        scenes,
        elements: [],
      });
      expect(result.sceneRef).toBeUndefined();
    });

    it("场景无可用图片时 sceneRef 应为 undefined", () => {
      const beat = createMockBeat({ sceneId: "scene-1" });
      const scenes = [
        createMockScene({
          id: "scene-1",
          refImagePath: undefined,
          scenePath: undefined,
          generatedImage: undefined,
          imageUrl: undefined,
        }),
      ];
      const result = StoryGenerationService.resolveGenerationContext({
        beat,
        prevBeat: null,
        characters: [],
        scenes,
        elements: [],
      });
      expect(result.sceneRef).toBeUndefined();
    });

    it("beat 使用 scene 字段而非 sceneId 时也能解析场景", () => {
      const beat = createMockBeat({ scene: "scene-1", sceneId: undefined });
      const scenes = [createMockScene({ id: "scene-1", name: "森林", imageUrl: "http://example.com/forest.png" })];
      const result = StoryGenerationService.resolveGenerationContext({
        beat,
        prevBeat: null,
        characters: [],
        scenes,
        elements: [],
      });
      expect(result.sceneRef).toBe("http://example.com/forest.png");
    });

    it("多个角色时优先使用第一个有图片的角色", () => {
      const beat = createMockBeat({ characterIds: ["char-1", "char-2"] });
      const characters = [
        createMockCharacter({ id: "char-1", avatarPath: "http://example.com/avatar-1.png" }),
        createMockCharacter({ id: "char-2", avatarPath: "http://example.com/avatar-2.png" }),
      ];
      const result = StoryGenerationService.resolveGenerationContext({
        beat,
        prevBeat: null,
        characters,
        scenes: [],
        elements: [],
      });
      expect(result.characterRef).toBe("http://example.com/avatar-1.png");
    });
  });

  describe("buildVideoPrompt", () => {
    it("无首尾帧时返回原始提示词", () => {
      const beat = createMockBeat();
      const result = StoryGenerationService.buildVideoPrompt(beat, "基础提示词");
      expect(result).toBe("基础提示词");
    });

    it("有首帧提示时应添加画面约束", () => {
      const beat = createMockBeat({
        framePair: {
          firstFrame: { imageUrl: "url", prompt: "首帧描述", derivedFrom: "" },
          lastFrame: { imageUrl: "url", prompt: "", derivedFrom: "" },
        },
      } as Partial<StoryBeat>);
      const result = StoryGenerationService.buildVideoPrompt(beat, "基础提示词");
      expect(result).toContain("首帧画面：首帧描述");
      expect(result).toContain("视觉连贯性");
    });

    it("有首尾帧提示时应同时包含两者", () => {
      const beat = createMockBeat({
        framePair: {
          firstFrame: { imageUrl: "url", prompt: "首帧描述", derivedFrom: "" },
          lastFrame: { imageUrl: "url", prompt: "尾帧描述", derivedFrom: "" },
        },
      } as Partial<StoryBeat>);
      const result = StoryGenerationService.buildVideoPrompt(beat, "基础提示词");
      expect(result).toContain("首帧画面：首帧描述");
      expect(result).toContain("尾帧画面：尾帧描述");
    });

    it("仅有尾帧提示时应包含尾帧约束", () => {
      const beat = createMockBeat({
        framePair: {
          firstFrame: { imageUrl: "url", prompt: "", derivedFrom: "" },
          lastFrame: { imageUrl: "url", prompt: "尾帧描述", derivedFrom: "" },
        },
      } as Partial<StoryBeat>);
      const result = StoryGenerationService.buildVideoPrompt(beat, "基础提示词");
      expect(result).toContain("尾帧画面：尾帧描述");
      expect(result).not.toContain("首帧画面");
    });

    it("首帧有 imageUrl 但无 prompt 时不添加帧约束", () => {
      const beat = createMockBeat({
        framePair: {
          firstFrame: { imageUrl: "url", prompt: "", derivedFrom: "" },
          lastFrame: { imageUrl: "url", prompt: "", derivedFrom: "" },
        },
      } as Partial<StoryBeat>);
      const result = StoryGenerationService.buildVideoPrompt(beat, "基础提示词");
      expect(result).toBe("基础提示词");
    });
  });

  describe("validateGenerationPrereqs", () => {
    it("keyframe 生成只需要 beat id", () => {
      const beat = createMockBeat({ id: "beat-1" });
      const result = StoryGenerationService.validateGenerationPrereqs(beat, "keyframe");
      expect(result.ok).toBe(true);
    });

    it("keyframe 生成缺少 beat id 应失败", () => {
      const beat = createMockBeat({ id: "" });
      const result = StoryGenerationService.validateGenerationPrereqs(beat, "keyframe");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe("分镜不存在");
      }
    });

    it("framePair 生成需要预览图", () => {
      const beat = createMockBeat({ keyframe: { imageUrl: "url" } } as Partial<StoryBeat>);
      const result = StoryGenerationService.validateGenerationPrereqs(beat, "framePair");
      expect(result.ok).toBe(true);
    });

    it("framePair 生成缺少预览图应失败", () => {
      const beat = createMockBeat();
      const result = StoryGenerationService.validateGenerationPrereqs(beat, "framePair");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe("生成首尾帧前必须先生成预览图");
      }
    });

    it("video 生成需要首帧图片", () => {
      const beat = createMockBeat({
        framePair: {
          firstFrame: { imageUrl: "url", prompt: "", derivedFrom: "" },
          lastFrame: { imageUrl: "url2", prompt: "", derivedFrom: "" },
        },
      } as Partial<StoryBeat>);
      const result = StoryGenerationService.validateGenerationPrereqs(beat, "video");
      expect(result.ok).toBe(true);
    });

    it("video 生成缺少首帧应失败", () => {
      const beat = createMockBeat();
      const result = StoryGenerationService.validateGenerationPrereqs(beat, "video");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe("生成视频前必须先生成首尾帧");
      }
    });

    it("framePair keyframe imageUrl 为空字符串应失败", () => {
      const beat = createMockBeat({ keyframe: { imageUrl: "" } } as Partial<StoryBeat>);
      const result = StoryGenerationService.validateGenerationPrereqs(beat, "framePair");
      expect(result.ok).toBe(false);
    });

    it("video firstFrame imageUrl 为空字符串应失败", () => {
      const beat = createMockBeat({
        framePair: {
          firstFrame: { imageUrl: "", prompt: "", derivedFrom: "" },
        },
      } as Partial<StoryBeat>);
      const result = StoryGenerationService.validateGenerationPrereqs(beat, "video");
      expect(result.ok).toBe(false);
    });
  });

  describe("buildChainReference", () => {
    it("第一个分镜应返回 null 前驱", () => {
      const beats = [createMockBeat({ id: "beat-1" })];
      const result = StoryGenerationService.buildChainReference(beats, "beat-1");
      expect(result.prevBeat).toBeNull();
    });

    it("第二个分镜应返回第一个作为前驱", () => {
      const beats = [
        createMockBeat({ id: "beat-1" }),
        createMockBeat({ id: "beat-2" }),
      ];
      const result = StoryGenerationService.buildChainReference(beats, "beat-2");
      expect(result.prevBeat).not.toBeNull();
      expect(result.prevBeat!.id).toBe("beat-1");
    });

    it("不存在的 beatId 应返回 null 前驱", () => {
      const beats = [createMockBeat({ id: "beat-1" })];
      const result = StoryGenerationService.buildChainReference(beats, "non-existent");
      expect(result.prevBeat).toBeNull();
    });

    it("第三个分镜应返回第二个作为前驱", () => {
      const beats = [
        createMockBeat({ id: "beat-1" }),
        createMockBeat({ id: "beat-2" }),
        createMockBeat({ id: "beat-3" }),
      ];
      const result = StoryGenerationService.buildChainReference(beats, "beat-3");
      expect(result.prevBeat).not.toBeNull();
      expect(result.prevBeat!.id).toBe("beat-2");
    });

    it("空数组应返回 null 前驱", () => {
      const result = StoryGenerationService.buildChainReference([], "beat-1");
      expect(result.prevBeat).toBeNull();
    });
  });
});
