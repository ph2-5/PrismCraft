import { describe, it, expect, vi, beforeEach } from "vitest";
import { expectOk, expectErr } from "@/__tests__/utils/result-helpers";
import type { StoryBeat, Character, Scene } from "@/domain/schemas";

vi.mock("@/infrastructure/di", () => ({
  container: {
    textProvider: { generateText: vi.fn() },
  },
}));

import {
  generatePromptWithAI,
  buildDefaultPrompt,
  type PromptEditorContext,
} from "../prompt-editor-service";
import { container } from "@/infrastructure/di";

const textProvider = container.textProvider as unknown as {
  generateText: ReturnType<typeof vi.fn>;
};

const mockBeat: StoryBeat = {
  id: "beat-1",
  sequence: 0,
  title: "分镜标题",
  description: "分镜描述",
  content: "分镜内容",
  duration: 5,
  type: "scene",
  shotType: "wide",
  camera: { angle: "low", movement: "pan" },
  characters: [],
  characterIds: [],
  enhancedGeneration: false,
  elementIds: [],
};

const mockCharacters: Character[] = [
  {
    id: "char-1",
    name: "角色A",
    description: "描述",
    gender: "未知",
    style: "写实",
    personality: [],
    appearance: {
      hairColor: "黑",
      hairStyle: "短发",
      eyeColor: "黑",
      height: "180cm",
      build: "健壮",
      clothing: "西装",
    },
    prompt: "提示词",
  },
];

const mockScenes: Scene[] = [
  {
    id: "scene-1",
    name: "场景A",
    description: "场景描述",
    type: "室内",
    timeOfDay: "白天",
    weather: "晴朗",
    mood: "平静",
    lighting: "自然光",
    elements: [],
    colors: [],
    prompt: "场景提示词",
  },
];

describe("generatePromptWithAI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应成功生成 keyframe 提示词", async () => {
    textProvider.generateText.mockResolvedValue({
      success: true,
      data: { text: "  生成的提示词  " },
    });

    const result = await generatePromptWithAI({
      context: "keyframe",
      beat: mockBeat,
    });

    expectOk(result);
    expect(result.value.prompt).toBe("生成的提示词");
    expect(result.value.context).toBe("keyframe");
  });

  it("应成功生成 firstFrame 提示词", async () => {
    textProvider.generateText.mockResolvedValue({
      success: true,
      data: { text: "首帧提示词" },
    });

    const result = await generatePromptWithAI({
      context: "firstFrame",
      beat: mockBeat,
    });

    expectOk(result);
    expect(result.value.context).toBe("firstFrame");
  });

  it("应成功生成 lastFrame 提示词", async () => {
    textProvider.generateText.mockResolvedValue({
      success: true,
      data: { text: "尾帧提示词" },
    });

    const result = await generatePromptWithAI({
      context: "lastFrame",
      beat: mockBeat,
    });

    expectOk(result);
    expect(result.value.context).toBe("lastFrame");
  });

  it("应传递用户消息", async () => {
    textProvider.generateText.mockResolvedValue({
      success: true,
      data: { text: "提示词" },
    });

    await generatePromptWithAI({
      context: "keyframe",
      beat: mockBeat,
      userMessage: "请增加光照效果",
    });

    const callArg = textProvider.generateText.mock.calls[0][0];
    expect(callArg).toContain("请增加光照效果");
  });

  it("应传递 providerId 和 modelId", async () => {
    textProvider.generateText.mockResolvedValue({
      success: true,
      data: { text: "提示词" },
    });

    await generatePromptWithAI(
      { context: "keyframe", beat: mockBeat },
      { providerId: "provider-1", modelId: "model-1" },
    );

    expect(textProvider.generateText).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        providerId: "provider-1",
        modelId: "model-1",
      }),
    );
  });

  it("AI 生成失败时应返回错误", async () => {
    textProvider.generateText.mockResolvedValue({
      success: false,
      error: "API 错误",
    });

    const result = await generatePromptWithAI({
      context: "keyframe",
      beat: mockBeat,
    });

    expectErr(result);
  });

  it("AI 返回空数据时应返回错误", async () => {
    textProvider.generateText.mockResolvedValue({
      success: true,
      data: null,
    });

    const result = await generatePromptWithAI({
      context: "keyframe",
      beat: mockBeat,
    });

    expectErr(result);
  });

  it("应传递角色和场景信息", async () => {
    textProvider.generateText.mockResolvedValue({
      success: true,
      data: { text: "提示词" },
    });

    await generatePromptWithAI({
      context: "keyframe",
      beat: { ...mockBeat, characters: ["char-1"], scene: "scene-1" },
      characters: mockCharacters,
      scenes: mockScenes,
    });

    const callArg = textProvider.generateText.mock.calls[0][0];
    expect(callArg).toContain("角色A");
    expect(callArg).toContain("场景A");
  });
});

describe("buildDefaultPrompt", () => {
  it("keyframe 上下文有角色和场景时应生成增强提示词", () => {
    const result = buildDefaultPrompt({
      context: "keyframe",
      beat: mockBeat,
      characters: mockCharacters,
      scenes: mockScenes,
    });

    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("keyframe 上下文有场景但角色为空时应生成简单提示词", () => {
    const result = buildDefaultPrompt({
      context: "keyframe",
      beat: mockBeat,
      characters: [],
      scenes: mockScenes,
    });

    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("keyframe 上下文没有角色和场景时应使用基础提示词", () => {
    const result = buildDefaultPrompt({
      context: "keyframe",
      beat: mockBeat,
    });

    expect(result).toContain("分镜内容");
    expect(result).toContain("wide shot");
    expect(result).toContain("low angle");
  });

  it("firstFrame 上下文有角色和场景时应生成首帧提示词", () => {
    const result = buildDefaultPrompt({
      context: "firstFrame",
      beat: mockBeat,
      characters: mockCharacters,
      scenes: mockScenes,
    });

    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("lastFrame 上下文有角色和场景时应生成尾帧提示词", () => {
    const result = buildDefaultPrompt({
      context: "lastFrame",
      beat: mockBeat,
      characters: mockCharacters,
      scenes: mockScenes,
    });

    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("firstFrame 上下文没有角色和场景时应使用基础英文提示词", () => {
    const result = buildDefaultPrompt({
      context: "firstFrame",
      beat: mockBeat,
    });

    expect(result).toContain("first frame of animation video");
    expect(result).toContain("starting position");
  });

  it("lastFrame 上下文没有角色和场景时应使用基础英文提示词", () => {
    const result = buildDefaultPrompt({
      context: "lastFrame",
      beat: mockBeat,
    });

    expect(result).toContain("last frame of animation video");
    expect(result).toContain("ending position");
  });

  it("beat 有 keyframe prompt 时首尾帧应包含风格参考", () => {
    const beatWithKeyframe = {
      ...mockBeat,
      keyframe: { imageUrl: "test.jpg", prompt: "风格参考提示词" },
    };

    const result = buildDefaultPrompt({
      context: "firstFrame",
      beat: beatWithKeyframe,
    });

    expect(result).toContain("style reference: 风格参考提示词");
  });

  it("beat 有 promptLayers 时首尾帧应包含核心元素和风格氛围", () => {
    const beatWithLayers = {
      ...mockBeat,
      promptLayers: {
        coreElements: "核心元素描述",
        cameraAction: "镜头动作",
        styleAtmosphere: "风格氛围描述",
      },
    };

    const result = buildDefaultPrompt({
      context: "firstFrame",
      beat: beatWithLayers,
      characters: mockCharacters,
      scenes: mockScenes,
    });

    expect(result).toContain("核心元素：核心元素描述");
    expect(result).toContain("风格氛围：风格氛围描述");
  });

  it("未知上下文应返回 beat 内容", () => {
    const result = buildDefaultPrompt({
      context: "unknown" as unknown as PromptEditorContext,
      beat: mockBeat,
    });

    expect(result).toBe("分镜内容");
  });

  it("keyframe 上下文 beat 无 content 时应使用 description", () => {
    const beatNoContent = { ...mockBeat, content: undefined, description: "备用描述" };

    const result = buildDefaultPrompt({
      context: "keyframe",
      beat: beatNoContent,
    });

    expect(result).toContain("备用描述");
  });

  it("firstFrame 上下文有 keyframe prompt 时应包含风格参考", () => {
    const beatWithKeyframe = {
      ...mockBeat,
      keyframe: { imageUrl: "test.jpg", prompt: "预览图提示词" },
    };

    const result = buildDefaultPrompt({
      context: "firstFrame",
      beat: beatWithKeyframe,
    });

    expect(result).toContain("style reference: 预览图提示词");
  });
});
