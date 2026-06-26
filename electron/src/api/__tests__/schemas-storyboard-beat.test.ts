/**
 * schemas.ts mirror schema 测试
 *
 * 重点测试 slStoryboardBeatSchema 中新增的 sceneId + sceneTransitions 字段，
 * 通过公共导出的 storyboardGenerate* schema 间接验证（slStoryboardBeatSchema 为内部 schema）。
 *
 * 覆盖 schema：
 * - storyboardGenerateKeyframeSchema
 * - storyboardGenerateFramePairSchema
 * - storyboardGenerateVideoSchema
 * - storyboardGenerateFullWorkflowSchema
 * - storyboardGenerateKeyframeChainSchema
 */
import { describe, it, expect } from "vitest";
import {
  storyboardGenerateKeyframeSchema,
  storyboardGenerateFramePairSchema,
  storyboardGenerateVideoSchema,
  storyboardGenerateFullWorkflowSchema,
  storyboardGenerateKeyframeChainSchema,
} from "../schemas";

const validBeat = {
  id: "beat-1",
  content: "镜头内容",
  description: "镜头描述",
  duration: 5,
  shotType: "medium",
  camera: { angle: "eye_level", movement: "static" },
  enhancedGeneration: false,
  imageGenerationPrompt: "prompt text",
  firstFramePrompt: "first prompt",
  lastFramePrompt: "last prompt",
  keyframe: { imageUrl: "http://example.com/k.png", prompt: "k prompt" },
  framePair: {
    firstFrame: { imageUrl: "http://example.com/first.png" },
    lastFrame: { imageUrl: "http://example.com/last.png" },
  },
};

const validOptions = { some: "option" };

describe("slStoryboardBeatSchema: sceneId 字段（新增）", () => {
  it("storyboardGenerateKeyframeSchema 应接受带 sceneId 的 beat", () => {
    const result = storyboardGenerateKeyframeSchema.safeParse({
      beat: { ...validBeat, sceneId: "scene-1" },
      prevBeat: validBeat,
      options: validOptions,
    });
    expect(result.success).toBe(true);
  });

  it("storyboardGenerateFramePairSchema 应接受带 sceneId 的 beat", () => {
    const result = storyboardGenerateFramePairSchema.safeParse({
      beat: { ...validBeat, sceneId: "scene-1" },
      options: validOptions,
    });
    expect(result.success).toBe(true);
  });

  it("storyboardGenerateVideoSchema 应接受带 sceneId 的 beat", () => {
    const result = storyboardGenerateVideoSchema.safeParse({
      beat: { ...validBeat, sceneId: "scene-1" },
      options: validOptions,
    });
    expect(result.success).toBe(true);
  });

  it("storyboardGenerateFullWorkflowSchema 应接受带 sceneId 的 beat", () => {
    const result = storyboardGenerateFullWorkflowSchema.safeParse({
      beat: { ...validBeat, sceneId: "scene-1" },
      prevBeat: validBeat,
      options: validOptions,
    });
    expect(result.success).toBe(true);
  });

  it("storyboardGenerateKeyframeChainSchema 应接受带 sceneId 的 beat 数组", () => {
    const result = storyboardGenerateKeyframeChainSchema.safeParse({
      beats: [{ ...validBeat, sceneId: "scene-1" }, { ...validBeat, id: "beat-2", sceneId: "scene-2" }],
      options: { providerId: "openai" },
    });
    expect(result.success).toBe(true);
  });

  it("beat 无 sceneId 字段也应通过校验（sceneId 是 optional）", () => {
    const result = storyboardGenerateKeyframeSchema.safeParse({
      beat: validBeat,
      options: validOptions,
    });
    expect(result.success).toBe(true);
  });

  it("解析成功后 sceneId 字段应被保留在结果中（passthrough）", () => {
    const result = storyboardGenerateKeyframeSchema.safeParse({
      beat: { ...validBeat, sceneId: "scene-xyz" },
      options: validOptions,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data.beat as Record<string, unknown>).sceneId).toBe("scene-xyz");
    }
  });
});

describe("slStoryboardBeatSchema: sceneTransitions 字段（新增）", () => {
  it("应接受带完整 sceneTransitions 数组的 beat", () => {
    const result = storyboardGenerateKeyframeSchema.safeParse({
      beat: {
        ...validBeat,
        sceneId: "scene-1",
        sceneTransitions: [
          {
            sceneId: "scene-2",
            transitionType: "cut",
            description: "切换到下一场景",
          },
        ],
      },
      options: validOptions,
    });
    expect(result.success).toBe(true);
  });

  it("应接受所有合法的 transitionType: cut / dissolve / wipe / fade", () => {
    const transitionTypes = ["cut", "dissolve", "wipe", "fade"] as const;
    transitionTypes.forEach((transitionType) => {
      const result = storyboardGenerateKeyframeSchema.safeParse({
        beat: {
          ...validBeat,
          sceneTransitions: [{ sceneId: "scene-x", transitionType }],
        },
        options: validOptions,
      });
      expect(result.success).toBe(true);
    });
  });

  it("应接受 transitionType 缺失的 sceneTransitions 项（transitionType 是 optional）", () => {
    const result = storyboardGenerateKeyframeSchema.safeParse({
      beat: {
        ...validBeat,
        sceneTransitions: [{ sceneId: "scene-x" }],
      },
      options: validOptions,
    });
    expect(result.success).toBe(true);
  });

  it("应接受 description 缺失的 sceneTransitions 项（description 是 optional）", () => {
    const result = storyboardGenerateKeyframeSchema.safeParse({
      beat: {
        ...validBeat,
        sceneTransitions: [{ sceneId: "scene-x", transitionType: "cut" }],
      },
      options: validOptions,
    });
    expect(result.success).toBe(true);
  });

  it("应接受空数组 sceneTransitions: []", () => {
    const result = storyboardGenerateKeyframeSchema.safeParse({
      beat: { ...validBeat, sceneTransitions: [] },
      options: validOptions,
    });
    expect(result.success).toBe(true);
  });

  it("sceneTransitions 缺失时也应通过校验（optional）", () => {
    const result = storyboardGenerateKeyframeSchema.safeParse({
      beat: validBeat,
      options: validOptions,
    });
    expect(result.success).toBe(true);
  });

  it("sceneTransitions 项缺少 sceneId 时应校验失败（sceneId 是必填）", () => {
    const result = storyboardGenerateKeyframeSchema.safeParse({
      beat: {
        ...validBeat,
        sceneTransitions: [{ transitionType: "cut" }],
      },
      options: validOptions,
    });
    expect(result.success).toBe(false);
  });

  it("非法的 transitionType 应校验失败", () => {
    const result = storyboardGenerateKeyframeSchema.safeParse({
      beat: {
        ...validBeat,
        sceneTransitions: [{ sceneId: "scene-x", transitionType: "invalid_type" }],
      },
      options: validOptions,
    });
    expect(result.success).toBe(false);
  });

  it("sceneTransitions 解析成功后应被保留在结果中", () => {
    const transitions = [
      { sceneId: "scene-2", transitionType: "cut" as const, description: "切换" },
    ];
    const result = storyboardGenerateKeyframeSchema.safeParse({
      beat: { ...validBeat, sceneTransitions: transitions },
      options: validOptions,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      const beat = result.data.beat as Record<string, unknown>;
      expect(Array.isArray(beat.sceneTransitions)).toBe(true);
      const parsed = beat.sceneTransitions as Array<Record<string, unknown>>;
      expect(parsed[0].sceneId).toBe("scene-2");
      expect(parsed[0].transitionType).toBe("cut");
      expect(parsed[0].description).toBe("切换");
    }
  });

  it("sceneTransitions 中带额外字段时应被 passthrough 保留", () => {
    const result = storyboardGenerateKeyframeSchema.safeParse({
      beat: {
        ...validBeat,
        sceneTransitions: [
          { sceneId: "scene-x", transitionType: "cut", extra: "should be kept" },
        ],
      },
      options: validOptions,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      const beat = result.data.beat as Record<string, unknown>;
      const parsed = beat.sceneTransitions as Array<Record<string, unknown>>;
      expect(parsed[0].extra).toBe("should be kept");
    }
  });
});

describe("slStoryboardBeatSchema: 与 sceneId + sceneTransitions 共存的场景", () => {
  it("同时提供 sceneId 和 sceneTransitions 应通过校验（主场景 + 转场序列）", () => {
    const result = storyboardGenerateFullWorkflowSchema.safeParse({
      beat: {
        ...validBeat,
        sceneId: "scene-main",
        sceneTransitions: [
          { sceneId: "scene-1", transitionType: "cut" },
          { sceneId: "scene-2", transitionType: "dissolve", description: "渐变" },
          { sceneId: "scene-3", transitionType: "fade" },
        ],
      },
      prevBeat: { ...validBeat, id: "prev-beat" },
      options: validOptions,
    });
    expect(result.success).toBe(true);
  });

  it("slStoryboardBeatSchema.passthrough 应保留其他未知字段（如 enhancedGeneration）", () => {
    const result = storyboardGenerateVideoSchema.safeParse({
      beat: { ...validBeat, extraField: "extra", sceneId: "scene-1" },
      options: validOptions,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      const beat = result.data.beat as Record<string, unknown>;
      expect(beat.extraField).toBe("extra");
    }
  });
});
