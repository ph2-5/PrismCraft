import { describe, it, expect, vi, beforeEach } from "vitest";
import type { StoryBeat, Character, Scene, StoryStyleGuide } from "@/domain/schemas";
import type { ITextProvider } from "@/domain/ports";

vi.mock("@/shared/error-logger", () => ({
  errorLogger: { warn: vi.fn(), error: vi.fn() },
}));

import { generateFramePrompts, batchGenerateFramePrompts } from "../frame-prompt-service";

const mockTextProvider: ITextProvider = {
  generateText: vi.fn(),
};

const mockBeat: StoryBeat = {
  id: "beat-1",
  sequence: 0,
  title: "开场",
  description: "主角走进房间",
  content: "主角走进房间",
  duration: 5,
  type: "scene",
  characterIds: [],
  elementIds: [],
  enhancedGeneration: false,
};

const mockCharacter: Character = {
  id: "char-1",
  name: "小明",
  description: "男主角",
  gender: "男",
  style: "写实",
  personality: ["勇敢"],
  appearance: {
    hairColor: "黑",
    hairStyle: "短发",
    eyeColor: "棕",
    height: "175cm",
    build: "健壮",
    clothing: "蓝色外套",
  },
  prompt: "",
};

const mockScene: Scene = {
  id: "scene-1",
  name: "客厅",
  description: "明亮的客厅",
  type: "室内",
  timeOfDay: "白天",
  weather: "晴",
  mood: "温馨",
  lighting: "自然光",
  elements: [],
  colors: [],
  prompt: "",
  atmosphere: "温暖",
};

describe("generateFramePrompts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应成功生成首帧和尾帧提示词", async () => {
    (mockTextProvider.generateText as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: {
        text: JSON.stringify({
          firstFramePrompt: "a boy entering a room, blue jacket, short black hair",
          lastFramePrompt: "a boy standing in the center of a bright living room",
        }),
      },
    });

    const result = await generateFramePrompts({
      beat: mockBeat,
      index: 0,
      characters: [mockCharacter],
      scenes: [mockScene],
      textProvider: mockTextProvider,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.firstFramePrompt).toContain("a boy entering a room");
      expect(result.value.lastFramePrompt).toContain("a boy standing in the center");
    }
  });

  it("应传递正确的参数给 textProvider", async () => {
    (mockTextProvider.generateText as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { text: JSON.stringify({ firstFramePrompt: "fp", lastFramePrompt: "lp" }) },
    });

    await generateFramePrompts({
      beat: mockBeat,
      index: 2,
      characters: [],
      scenes: [],
      textProvider: mockTextProvider,
    });

    expect(mockTextProvider.generateText).toHaveBeenCalledTimes(1);
    const callArgs = (mockTextProvider.generateText as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(callArgs[1]!).toEqual({ maxTokens: 600, temperature: 0.7 });
    expect(callArgs[0]!).toContain("第3镜头");
  });

  it("beat 无内容、无角色、无场景时应返回错误", async () => {
    const emptyBeat: StoryBeat = {
      ...mockBeat,
      content: "",
      description: "",
      characterIds: [],
      sceneId: undefined,
      scene: undefined,
    };

    const result = await generateFramePrompts({
      beat: emptyBeat,
      index: 0,
      characters: [],
      scenes: [],
      textProvider: mockTextProvider,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeDefined();
    }
  });

  it("LLM 返回失败时应返回错误", async () => {
    (mockTextProvider.generateText as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      error: "API 限流",
    });

    const result = await generateFramePrompts({
      beat: mockBeat,
      index: 0,
      characters: [],
      scenes: [],
      textProvider: mockTextProvider,
    });

    expect(result.ok).toBe(false);
  });

  it("LLM 返回非 JSON 格式时应回退到 beat 内容", async () => {
    (mockTextProvider.generateText as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { text: "这不是JSON格式的内容" },
    });

    const result = await generateFramePrompts({
      beat: mockBeat,
      index: 0,
      characters: [],
      scenes: [],
      textProvider: mockTextProvider,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.firstFramePrompt).toBe("主角走进房间");
      expect(result.value.lastFramePrompt).toBe("主角走进房间");
    }
  });

  it("LLM 返回无效 JSON 时应回退到 beat 内容", async () => {
    (mockTextProvider.generateText as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { text: "{invalid json" },
    });

    const result = await generateFramePrompts({
      beat: mockBeat,
      index: 0,
      characters: [],
      scenes: [],
      textProvider: mockTextProvider,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.firstFramePrompt).toBe("主角走进房间");
    }
  });

  it("LLM 返回的 JSON 缺少字段时应回退到 beat 内容", async () => {
    (mockTextProvider.generateText as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { text: JSON.stringify({ firstFramePrompt: "", lastFramePrompt: "" }) },
    });

    const result = await generateFramePrompts({
      beat: mockBeat,
      index: 0,
      characters: [],
      scenes: [],
      textProvider: mockTextProvider,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.firstFramePrompt).toBe("主角走进房间");
      expect(result.value.lastFramePrompt).toBe("主角走进房间");
    }
  });

  it("应正确处理 styleGuide", async () => {
    const styleGuide: StoryStyleGuide = {
      artStyle: "水彩风",
      moodAtmosphere: "梦幻",
      colorPalette: ["蓝", "粉"],
    };

    (mockTextProvider.generateText as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { text: JSON.stringify({ firstFramePrompt: "fp", lastFramePrompt: "lp" }) },
    });

    await generateFramePrompts({
      beat: mockBeat,
      index: 0,
      characters: [],
      scenes: [],
      styleGuide,
      textProvider: mockTextProvider,
    });

    const prompt = (mockTextProvider.generateText as ReturnType<typeof vi.fn>).mock.calls[0]![0]!;
    expect(prompt).toContain("水彩风");
    expect(prompt).toContain("梦幻");
    expect(prompt).toContain("蓝、粉");
  });

  it("应正确处理上下文信息", async () => {
    (mockTextProvider.generateText as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { text: JSON.stringify({ firstFramePrompt: "fp", lastFramePrompt: "lp" }) },
    });

    await generateFramePrompts({
      beat: mockBeat,
      index: 1,
      characters: [],
      scenes: [],
      prevBeatDescription: "上一镜头内容",
      nextBeatDescription: "下一镜头内容",
      textProvider: mockTextProvider,
    });

    const prompt = (mockTextProvider.generateText as ReturnType<typeof vi.fn>).mock.calls[0]![0]!;
    expect(prompt).toContain("上一镜头内容");
    expect(prompt).toContain("下一镜头内容");
  });

  it("应正确处理角色描述", async () => {
    const beatWithChar: StoryBeat = {
      ...mockBeat,
      characterIds: ["char-1"],
    };

    (mockTextProvider.generateText as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { text: JSON.stringify({ firstFramePrompt: "fp", lastFramePrompt: "lp" }) },
    });

    await generateFramePrompts({
      beat: beatWithChar,
      index: 0,
      characters: [mockCharacter],
      scenes: [],
      textProvider: mockTextProvider,
    });

    const prompt = (mockTextProvider.generateText as ReturnType<typeof vi.fn>).mock.calls[0]![0]!;
    expect(prompt).toContain("小明");
    expect(prompt).toContain("黑发");
    expect(prompt).toContain("穿着蓝色外套");
  });

  it("应正确处理场景描述", async () => {
    const beatWithScene: StoryBeat = {
      ...mockBeat,
      sceneId: "scene-1",
    };

    (mockTextProvider.generateText as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { text: JSON.stringify({ firstFramePrompt: "fp", lastFramePrompt: "lp" }) },
    });

    await generateFramePrompts({
      beat: beatWithScene,
      index: 0,
      characters: [],
      scenes: [mockScene],
      textProvider: mockTextProvider,
    });

    const prompt = (mockTextProvider.generateText as ReturnType<typeof vi.fn>).mock.calls[0]![0]!;
    expect(prompt).toContain("客厅");
    expect(prompt).toContain("温暖");
  });

  it("应正确处理镜头类型映射", async () => {
    const beatWithShot: StoryBeat = {
      ...mockBeat,
      shotType: "close",
    };

    (mockTextProvider.generateText as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { text: JSON.stringify({ firstFramePrompt: "fp", lastFramePrompt: "lp" }) },
    });

    await generateFramePrompts({
      beat: beatWithShot,
      index: 0,
      characters: [],
      scenes: [],
      textProvider: mockTextProvider,
    });

    const prompt = (mockTextProvider.generateText as ReturnType<typeof vi.fn>).mock.calls[0]![0]!;
    expect(prompt).toContain("近景");
  });

  it("应正确处理 camera 信息", async () => {
    const beatWithCamera: StoryBeat = {
      ...mockBeat,
      camera: {
        angle: "低角度",
        movement: "推进",
      },
    };

    (mockTextProvider.generateText as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { text: JSON.stringify({ firstFramePrompt: "fp", lastFramePrompt: "lp" }) },
    });

    await generateFramePrompts({
      beat: beatWithCamera,
      index: 0,
      characters: [],
      scenes: [],
      textProvider: mockTextProvider,
    });

    const prompt = (mockTextProvider.generateText as ReturnType<typeof vi.fn>).mock.calls[0]![0]!;
    expect(prompt).toContain("低角度");
    expect(prompt).toContain("推进");
  });

  it("beat 使用 characterIds 字段时应正确处理", async () => {
    const beatWithSingleChar: StoryBeat = {
      ...mockBeat,
      characterIds: ["char-1"],
    };

    (mockTextProvider.generateText as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { text: JSON.stringify({ firstFramePrompt: "fp", lastFramePrompt: "lp" }) },
    });

    await generateFramePrompts({
      beat: beatWithSingleChar,
      index: 0,
      characters: [mockCharacter],
      scenes: [],
      textProvider: mockTextProvider,
    });

    const prompt = (mockTextProvider.generateText as ReturnType<typeof vi.fn>).mock.calls[0]![0]!;
    expect(prompt).toContain("小明");
  });

  it("textProvider 抛出异常时应返回错误", async () => {
    (mockTextProvider.generateText as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("网络错误"),
    );

    const result = await generateFramePrompts({
      beat: mockBeat,
      index: 0,
      characters: [],
      scenes: [],
      textProvider: mockTextProvider,
    });

    expect(result.ok).toBe(false);
  });

  it("beat 使用 description 字段而非 content 时应正确处理", async () => {
    const beatWithDescOnly: StoryBeat = {
      ...mockBeat,
      content: "",
      description: "描述内容",
    };

    (mockTextProvider.generateText as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { text: "非JSON" },
    });

    const result = await generateFramePrompts({
      beat: beatWithDescOnly,
      index: 0,
      characters: [],
      scenes: [],
      textProvider: mockTextProvider,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.firstFramePrompt).toBe("描述内容");
    }
  });
});

describe("batchGenerateFramePrompts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应为所有 beats 生成帧提示词", async () => {
    (mockTextProvider.generateText as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { text: JSON.stringify({ firstFramePrompt: "fp", lastFramePrompt: "lp" }) },
    });

    const beats: StoryBeat[] = [
      { ...mockBeat, id: "beat-1", content: "内容1" },
      { ...mockBeat, id: "beat-2", content: "内容2" },
    ];

    const result = await batchGenerateFramePrompts(beats, {
      characters: [],
      scenes: [],
      textProvider: mockTextProvider,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.size).toBe(2);
      expect(result.value.has("beat-1")).toBe(true);
      expect(result.value.has("beat-2")).toBe(true);
    }
  });

  it("空 beats 列表应返回空 Map", async () => {
    const result = await batchGenerateFramePrompts([], {
      characters: [],
      scenes: [],
      textProvider: mockTextProvider,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.size).toBe(0);
    }
  });

  it("单个 beat 生成失败时应继续处理其余 beats", async () => {
    (mockTextProvider.generateText as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error("失败"))
      .mockResolvedValueOnce({
        success: true,
        data: { text: JSON.stringify({ firstFramePrompt: "fp", lastFramePrompt: "lp" }) },
      });

    const beats: StoryBeat[] = [
      { ...mockBeat, id: "beat-1", content: "内容1" },
      { ...mockBeat, id: "beat-2", content: "内容2" },
    ];

    const result = await batchGenerateFramePrompts(beats, {
      characters: [],
      scenes: [],
      textProvider: mockTextProvider,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.size).toBe(1);
      expect(result.value.has("beat-2")).toBe(true);
    }
  });

  it("应为中间 beat 传递上下文信息", async () => {
    (mockTextProvider.generateText as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { text: JSON.stringify({ firstFramePrompt: "fp", lastFramePrompt: "lp" }) },
    });

    const beats: StoryBeat[] = [
      { ...mockBeat, id: "beat-1", content: "第一幕" },
      { ...mockBeat, id: "beat-2", content: "第二幕" },
      { ...mockBeat, id: "beat-3", content: "第三幕" },
    ];

    await batchGenerateFramePrompts(beats, {
      characters: [],
      scenes: [],
      textProvider: mockTextProvider,
    });

    const secondCallPrompt = (mockTextProvider.generateText as ReturnType<typeof vi.fn>).mock.calls[1]![0]!;
    expect(secondCallPrompt).toContain("第一幕");
    expect(secondCallPrompt).toContain("第三幕");
  });

  it("第一个 beat 不应有 prevBeatDescription", async () => {
    (mockTextProvider.generateText as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { text: JSON.stringify({ firstFramePrompt: "fp", lastFramePrompt: "lp" }) },
    });

    const beats: StoryBeat[] = [
      { ...mockBeat, id: "beat-1", content: "第一幕" },
    ];

    await batchGenerateFramePrompts(beats, {
      characters: [],
      scenes: [],
      textProvider: mockTextProvider,
    });

    const prompt = (mockTextProvider.generateText as ReturnType<typeof vi.fn>).mock.calls[0]![0]!;
    expect(prompt).not.toContain("上一镜头内容");
  });
});
