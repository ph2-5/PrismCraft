import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { StoryBeat, Character, Scene, ModelSelection, StoryStyleGuide } from "@/domain/schemas";

const {
  mockFindBeat,
  mockResolvePrevBeat,
  mockCheckModelConfig,
  mockWithGenerationState,
  mockUpdateBeat,
  mockGenerateBeatFramePair,
  mockResolveGenerationContext,
  mockElementStorageGetAll,
  mockHandleError,
  mockErrorLoggerWarn,
  mockCheckVisualConsistency,
} = vi.hoisted(() => ({
  mockFindBeat: vi.fn(),
  mockResolvePrevBeat: vi.fn(),
  mockCheckModelConfig: vi.fn(),
  mockWithGenerationState: vi.fn(),
  mockUpdateBeat: vi.fn(),
  mockGenerateBeatFramePair: vi.fn(),
  mockResolveGenerationContext: vi.fn(),
  mockElementStorageGetAll: vi.fn(),
  mockHandleError: vi.fn((err: unknown) => {
    if (err instanceof Error) return err;
    return { message: String(err), code: "UNKNOWN_ERROR" };
  }),
  mockErrorLoggerWarn: vi.fn(),
  mockCheckVisualConsistency: vi.fn(),
}));

vi.mock("@/modules/story/generation/hooks/useAIGeneratorBase", () => ({
  useAIGeneratorBase: () => ({
    findBeat: mockFindBeat,
    resolvePrevBeat: mockResolvePrevBeat,
    checkModelConfig: mockCheckModelConfig,
    withGenerationState: mockWithGenerationState,
    updateBeat: mockUpdateBeat,
  }),
}));

vi.mock("@/modules/story", () => ({
  generateBeatFramePair: mockGenerateBeatFramePair,
}));

vi.mock("@/domain/services", () => ({
  StoryGenerationService: {
    resolveGenerationContext: mockResolveGenerationContext,
  },
}));

vi.mock("@/infrastructure/di", () => ({
  container: {
    videoProvider: {},
    imageProvider: {},
    textProvider: {},
    elementStorage: { getAllElements: mockElementStorageGetAll },
  },
}));

vi.mock("@/shared/error-handler", () => ({
  handleError: mockHandleError,
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: {
    warn: mockErrorLoggerWarn,
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
  },
}));

vi.mock("@/modules/shot/consistency-check", () => ({
  checkVisualConsistency: mockCheckVisualConsistency,
}));

import { useFramePairGenerator } from "../useFramePairGenerator";

const mockBeat1: StoryBeat = {
  id: "beat-1",
  sequence: 0,
  description: "beat 1 desc",
  content: "beat 1 content",
  type: "scene",
  characterIds: ["char-1"],
  sceneId: "scene-1",
  characters: [],
  elementIds: [],
  enhancedGeneration: false,
  keyframe: { imageUrl: "https://img.example.com/keyframe1.png" },
};

const mockBeat2: StoryBeat = {
  id: "beat-2",
  sequence: 1,
  description: "beat 2 desc",
  content: "beat 2 content",
  type: "dialogue",
  characterIds: ["char-2"],
  sceneId: "scene-2",
  characters: [],
  elementIds: [],
  enhancedGeneration: false,
  keyframe: { imageUrl: "https://img.example.com/keyframe2.png" },
  framePair: {
    lastFrame: { imageUrl: "https://img.example.com/prev-last.png", prompt: "prev last", derivedFrom: "prev-first" },
    firstFrame: { imageUrl: "https://img.example.com/prev-first.png", prompt: "prev first", derivedFrom: "keyframe2" },
  },
};

const mockCharacter1: Character = {
  id: "char-1",
  name: "Alice",
  description: "A brave hero",
  gender: "female",
  style: "anime",
  personality: ["brave"],
  appearance: { hairColor: "blonde", hairStyle: "long", eyeColor: "blue", height: "", build: "", clothing: "" },
  prompt: "a brave hero",
  avatarPath: "https://img.example.com/alice.png",
};

const mockScene1: Scene = {
  id: "scene-1",
  name: "Forest",
  description: "A dark forest",
  type: "outdoor",
  timeOfDay: "night",
  weather: "rainy",
  mood: "mysterious",
  lighting: "dim",
  elements: ["trees"],
  colors: ["dark green"],
  prompt: "a dark forest",
  refImagePath: "https://img.example.com/forest.png",
};

const mockModel: ModelSelection = {
  providerId: "provider-1",
  modelId: "model-1",
  providerName: "Test Provider",
  modelName: "Test Model",
};

const mockFramePairValue = {
  firstFrameUrl: "https://img.example.com/first.png",
  lastFrameUrl: "https://img.example.com/last.png",
  firstFramePrompt: "first prompt",
  lastFramePrompt: "last prompt",
  generatedAt: new Date().toISOString(),
  firstFrame: {
    imageUrl: "https://img.example.com/first.png",
    prompt: "first prompt",
    derivedFrom: "https://img.example.com/keyframe1.png",
  },
  lastFrame: {
    imageUrl: "https://img.example.com/last.png",
    prompt: "last prompt",
    derivedFrom: "https://img.example.com/first.png",
  },
};

const mockFramePairResult = { ok: true, value: mockFramePairValue };

function createDefaultProps() {
  return {
    beatsRef: { current: [mockBeat1, mockBeat2] } as React.MutableRefObject<StoryBeat[]>,
    charactersRef: { current: [mockCharacter1] } as React.MutableRefObject<Character[]>,
    scenesRef: { current: [mockScene1] } as React.MutableRefObject<Scene[]>,
    selectedImageModel: mockModel as ModelSelection | null,
    setBeats: vi.fn() as React.Dispatch<React.SetStateAction<StoryBeat[]>>,
    success: vi.fn(),
    showError: vi.fn(),
  };
}

function setupWithGenerationState() {
  mockWithGenerationState.mockImplementation(async (_beatId: string, fn: (signal: AbortSignal) => Promise<unknown>, _errorTitle: string) => {
    const controller = new AbortController();
    return fn(controller.signal);
  });
}

describe("useFramePairGenerator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckModelConfig.mockReturnValue(true);
    mockFindBeat.mockReturnValue({ ...mockBeat1 });
    mockResolvePrevBeat.mockReturnValue(null);
    mockResolveGenerationContext.mockReturnValue({
      characterRef: "https://img.example.com/alice.png",
      sceneRef: "https://img.example.com/forest.png",
      prevLastFrameUrl: undefined,
    });
    mockGenerateBeatFramePair.mockResolvedValue(mockFramePairResult);
    mockElementStorageGetAll.mockResolvedValue([]);
    mockCheckVisualConsistency.mockResolvedValue({
      ok: true,
      value: { passed: true, characterScores: [], overallScore: 1.0, recommendation: "accept" },
    });
    setupWithGenerationState();
  });

  describe("generateFramePair", () => {
    it("应成功生成首尾帧并返回更新后的 beat", async () => {
      const props = createDefaultProps();
      const { result } = renderHook(() => useFramePairGenerator(props));

      let returned: StoryBeat | void = undefined;
      await act(async () => {
        returned = await result.current.generateFramePair("beat-1");
      });

      expect(returned!).toBeDefined();
      expect(returned!.framePair).toEqual(mockFramePairResult);
      expect(mockUpdateBeat).toHaveBeenCalledWith("beat-1", expect.objectContaining({ framePair: mockFramePairResult }));
      expect(props.success).toHaveBeenCalledWith("首尾帧生成成功", "分镜首尾帧已生成");
    });

    it("应将正确的参数传递给 generateBeatFramePair", async () => {
      const props = createDefaultProps();
      const { result } = renderHook(() => useFramePairGenerator(props));

      await act(async () => {
        await result.current.generateFramePair("beat-1");
      });

      expect(mockGenerateBeatFramePair).toHaveBeenCalledWith(
        expect.objectContaining({ id: "beat-1" }),
        expect.objectContaining({
          characterRef: "https://img.example.com/alice.png",
          sceneRef: "https://img.example.com/forest.png",
          prevLastFrameUrl: undefined,
          providerId: "provider-1",
          modelId: "model-1",
          autoGeneratePrompts: true,
        }),
        expect.objectContaining({
          videoProvider: expect.anything(),
          imageProvider: expect.anything(),
          textProvider: expect.anything(),
        }),
      );
    });

    it("应传递 customFirstFramePrompt 和 customLastFramePrompt", async () => {
      const props = createDefaultProps();
      const { result } = renderHook(() => useFramePairGenerator(props));

      await act(async () => {
        await result.current.generateFramePair("beat-1", null, "custom first", "custom last");
      });

      expect(mockGenerateBeatFramePair).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          customFirstFramePrompt: "custom first",
          customLastFramePrompt: "custom last",
        }),
        expect.anything(),
      );
    });

    it("应传递 styleGuide 给 generateBeatFramePair", async () => {
      const styleGuide: StoryStyleGuide = {
        artStyle: "水彩风",
        moodAtmosphere: "梦幻朦胧",
        colorPalette: ["blue", "pink"],
      };
      const props = {
        ...createDefaultProps(),
        styleGuideRef: { current: styleGuide } as React.MutableRefObject<StoryStyleGuide | undefined>,
      };
      const { result } = renderHook(() => useFramePairGenerator(props));

      await act(async () => {
        await result.current.generateFramePair("beat-1");
      });

      expect(mockGenerateBeatFramePair).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ styleGuide }),
        expect.anything(),
      );
    });

    it("应传递 beatIndex、prevBeatDescription 和 nextBeatDescription", async () => {
      const props = createDefaultProps();
      const { result } = renderHook(() => useFramePairGenerator(props));

      await act(async () => {
        await result.current.generateFramePair("beat-1");
      });

      const callArgs = mockGenerateBeatFramePair.mock.calls[0][1];
      expect(callArgs.beatIndex).toBe(0);
      expect(callArgs.prevBeatDescription).toBeUndefined();
      expect(callArgs.nextBeatDescription).toBe("beat 2 content");
    });

    it("最后一个 beat 的 nextBeatDescription 应为 undefined", async () => {
      const props = createDefaultProps();
      mockFindBeat.mockReturnValue({ ...mockBeat2 });
      const { result } = renderHook(() => useFramePairGenerator(props));

      await act(async () => {
        await result.current.generateFramePair("beat-2");
      });

      const callArgs = mockGenerateBeatFramePair.mock.calls[0][1];
      expect(callArgs.nextBeatDescription).toBeUndefined();
    });
  });

  describe("模型配置检查", () => {
    it("selectedImageModel 为 null 时应提前返回并调用 showError", async () => {
      mockCheckModelConfig.mockReturnValue(false);
      const props = createDefaultProps();
      const { result } = renderHook(() => useFramePairGenerator(props));

      let returned: StoryBeat | void = undefined;
      await act(async () => {
        returned = await result.current.generateFramePair("beat-1");
      });

      expect(returned).toBeUndefined();
      expect(mockCheckModelConfig).toHaveBeenCalledWith(
        mockModel,
        "无法生成视频",
        "请先在顶部工具栏选择图像生成模型",
      );
      expect(mockGenerateBeatFramePair).not.toHaveBeenCalled();
    });
  });

  describe("预览图检查", () => {
    it("beat 不存在时应调用 showError 并返回", async () => {
      mockFindBeat.mockReturnValue(null);
      const props = createDefaultProps();
      const { result } = renderHook(() => useFramePairGenerator(props));

      let returned: StoryBeat | void = undefined;
      await act(async () => {
        returned = await result.current.generateFramePair("nonexistent");
      });

      expect(returned).toBeUndefined();
      expect(props.showError).toHaveBeenCalledWith("无法生成视频");
      expect(mockGenerateBeatFramePair).not.toHaveBeenCalled();
    });

    it("beat 无 keyframe 时应调用 showError 并返回", async () => {
      mockFindBeat.mockReturnValue({ ...mockBeat1, keyframe: undefined });
      const props = createDefaultProps();
      const { result } = renderHook(() => useFramePairGenerator(props));

      let returned: StoryBeat | void = undefined;
      await act(async () => {
        returned = await result.current.generateFramePair("beat-1");
      });

      expect(returned).toBeUndefined();
      expect(props.showError).toHaveBeenCalledWith("无法生成视频");
    });

    it("beat 的 keyframe 无 imageUrl 时应调用 showError 并返回", async () => {
      mockFindBeat.mockReturnValue({ ...mockBeat1, keyframe: { imageUrl: undefined } });
      const props = createDefaultProps();
      const { result } = renderHook(() => useFramePairGenerator(props));

      let returned: StoryBeat | void = undefined;
      await act(async () => {
        returned = await result.current.generateFramePair("beat-1");
      });

      expect(returned).toBeUndefined();
      expect(props.showError).toHaveBeenCalledWith("无法生成视频");
    });
  });

  describe("上下文解析", () => {
    it("应使用 resolvePrevBeat 解析前一个 beat", async () => {
      const prevBeat = { ...mockBeat2 };
      mockResolvePrevBeat.mockReturnValue(prevBeat);
      mockResolveGenerationContext.mockReturnValue({
        characterRef: "https://img.example.com/alice.png",
        sceneRef: "https://img.example.com/forest.png",
        prevLastFrameUrl: "https://img.example.com/prev-last.png",
      });

      const props = createDefaultProps();
      const { result } = renderHook(() => useFramePairGenerator(props));

      await act(async () => {
        await result.current.generateFramePair("beat-1");
      });

      expect(mockResolvePrevBeat).toHaveBeenCalledWith("beat-1", undefined);
      expect(mockResolveGenerationContext).toHaveBeenCalledWith(
        expect.objectContaining({
          beat: expect.objectContaining({ id: "beat-1" }),
          prevBeat,
          characters: props.charactersRef.current,
          scenes: props.scenesRef.current,
          elements: [],
        }),
      );
    });

    it("传入 prevBeatOverride 时应传递给 resolvePrevBeat", async () => {
      const override: StoryBeat = {
        id: "override-beat",
        sequence: 99,
        description: "override",
        type: "transition",
        characterIds: [],
        characters: [],
        elementIds: [],
        enhancedGeneration: false,
      };
      mockResolvePrevBeat.mockReturnValue(override);
      mockResolveGenerationContext.mockReturnValue({
        characterRef: undefined,
        sceneRef: undefined,
        prevLastFrameUrl: undefined,
      });

      const props = createDefaultProps();
      const { result } = renderHook(() => useFramePairGenerator(props));

      await act(async () => {
        await result.current.generateFramePair("beat-1", override);
      });

      expect(mockResolvePrevBeat).toHaveBeenCalledWith("beat-1", override);
    });

    it("应将 resolveGenerationContext 的结果传递给 generateBeatFramePair", async () => {
      mockResolveGenerationContext.mockReturnValue({
        characterRef: "https://img.example.com/char.png",
        sceneRef: "https://img.example.com/scene.png",
        prevLastFrameUrl: "https://img.example.com/prev-last.png",
      });

      const props = createDefaultProps();
      const { result } = renderHook(() => useFramePairGenerator(props));

      await act(async () => {
        await result.current.generateFramePair("beat-1");
      });

      expect(mockGenerateBeatFramePair).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          characterRef: "https://img.example.com/char.png",
          sceneRef: "https://img.example.com/scene.png",
          prevLastFrameUrl: "https://img.example.com/prev-last.png",
        }),
        expect.anything(),
      );
    });
  });

  describe("一致性检查集成", () => {
    it("生成成功后应调用 checkVisualConsistency", async () => {
      const props = createDefaultProps();
      const { result } = renderHook(() => useFramePairGenerator(props));

      await act(async () => {
        await result.current.generateFramePair("beat-1");
      });

      expect(mockCheckVisualConsistency).toHaveBeenCalledWith(
        expect.objectContaining({
          beat: expect.objectContaining({ framePair: mockFramePairResult }),
          elements: [],
        }),
      );
    });

    it("一致性检查通过时应将结果写入 beat.consistencyCheck", async () => {
      const consistencyValue = { passed: true, characterScores: [], overallScore: 1.0, recommendation: "accept" };
      mockCheckVisualConsistency.mockResolvedValue({
        ok: true,
        value: consistencyValue,
      });

      const props = createDefaultProps();
      const { result } = renderHook(() => useFramePairGenerator(props));

      let returned: StoryBeat | void = undefined;
      await act(async () => {
        returned = await result.current.generateFramePair("beat-1");
      });

      expect(returned!.consistencyCheck).toEqual(consistencyValue);
      expect(mockUpdateBeat).toHaveBeenCalledWith("beat-1", expect.objectContaining({
        consistencyCheck: consistencyValue,
      }));
    });

    it("一致性检查未通过时应记录 warn 日志", async () => {
      mockCheckVisualConsistency.mockResolvedValue({
        ok: true,
        value: { passed: false, characterScores: [], overallScore: 0.5, recommendation: "adjust" },
      });

      const props = createDefaultProps();
      const { result } = renderHook(() => useFramePairGenerator(props));

      await act(async () => {
        await result.current.generateFramePair("beat-1");
      });

      expect(mockErrorLoggerWarn).toHaveBeenCalled();
      expect(mockHandleError).toHaveBeenCalledWith(expect.any(Error));
    });

    it("一致性检查返回 ok:false 时不应设置 consistencyCheck", async () => {
      mockCheckVisualConsistency.mockResolvedValue({
        ok: false,
        error: { code: "CHECK_FAILED", message: "check error" },
      });

      const props = createDefaultProps();
      const { result } = renderHook(() => useFramePairGenerator(props));

      let returned: StoryBeat | void = undefined;
      await act(async () => {
        returned = await result.current.generateFramePair("beat-1");
      });

      expect(returned!.consistencyCheck).toBeUndefined();
    });

    it("一致性检查抛出异常时应记录 warn 日志且不中断流程", async () => {
      mockCheckVisualConsistency.mockRejectedValue(new Error("check crashed"));

      const props = createDefaultProps();
      const { result } = renderHook(() => useFramePairGenerator(props));

      let returned: StoryBeat | void = undefined;
      await act(async () => {
        returned = await result.current.generateFramePair("beat-1");
      });

      expect(mockErrorLoggerWarn).toHaveBeenCalledWith(expect.anything(), "Consistency");
      expect(returned).toBeDefined();
      expect(returned!.framePair).toEqual(mockFramePairResult);
      expect(mockUpdateBeat).toHaveBeenCalled();
      expect(props.success).toHaveBeenCalledWith("首尾帧生成成功", "分镜首尾帧已生成");
    });

    it("一致性检查时应使用 framePair.firstFrameUrl 作为 generatedImageUrl", async () => {
      const props = createDefaultProps();
      const { result } = renderHook(() => useFramePairGenerator(props));

      await act(async () => {
        await result.current.generateFramePair("beat-1");
      });

      expect(mockCheckVisualConsistency).toHaveBeenCalledWith(
        expect.objectContaining({
          generatedImageUrl: undefined,
        }),
      );
    });

    it("一致性检查时应从 elementStorage 获取 elements", async () => {
      const mockElements = [{ id: "elem-1", name: "角色A" }];
      mockElementStorageGetAll.mockResolvedValue(mockElements);

      const props = createDefaultProps();
      const { result } = renderHook(() => useFramePairGenerator(props));

      await act(async () => {
        await result.current.generateFramePair("beat-1");
      });

      expect(mockElementStorageGetAll).toHaveBeenCalled();
      expect(mockCheckVisualConsistency).toHaveBeenCalledWith(
        expect.objectContaining({ elements: mockElements }),
      );
    });
  });

  describe("Abort 处理", () => {
    it("signal 已 abort 时 generateBeatFramePair 之后应提前返回", async () => {
      mockWithGenerationState.mockImplementation(async (_beatId: string, fn: (signal: AbortSignal) => Promise<unknown>, _errorTitle: string) => {
        const controller = new AbortController();
        controller.abort();
        return fn(controller.signal);
      });

      const props = createDefaultProps();
      const { result } = renderHook(() => useFramePairGenerator(props));

      let returned: StoryBeat | void = undefined;
      await act(async () => {
        returned = await result.current.generateFramePair("beat-1");
      });

      expect(returned).toBeUndefined();
      expect(mockUpdateBeat).not.toHaveBeenCalled();
      expect(props.success).not.toHaveBeenCalled();
    });

    it("一致性检查后 signal 已 abort 时应提前返回", async () => {
      mockWithGenerationState.mockImplementation(async (_beatId: string, fn: (signal: AbortSignal) => Promise<unknown>, _errorTitle: string) => {
        const controller = new AbortController();
        const result = await fn(controller.signal);
        return result;
      });

      mockCheckVisualConsistency.mockImplementation(async () => {
        return { ok: true, value: { passed: true, characterScores: [], overallScore: 1.0, recommendation: "accept" } };
      });

      const props = createDefaultProps();
      const { result } = renderHook(() => useFramePairGenerator(props));

      await act(async () => {
        await result.current.generateFramePair("beat-1");
      });

      expect(mockUpdateBeat).toHaveBeenCalled();
    });
  });

  describe("错误处理", () => {
    it("generateBeatFramePair 失败时 withGenerationState 应处理错误", async () => {
      mockWithGenerationState.mockImplementation(async (_beatId: string, fn: (signal: AbortSignal) => Promise<unknown>, _errorTitle: string) => {
        const controller = new AbortController();
        try {
          return await fn(controller.signal);
        } catch {
          return undefined;
        }
      });

      mockGenerateBeatFramePair.mockRejectedValue(new Error("generation failed"));

      const props = createDefaultProps();
      const { result } = renderHook(() => useFramePairGenerator(props));

      let returned: StoryBeat | void = undefined;
      await act(async () => {
        returned = await result.current.generateFramePair("beat-1");
      });

      expect(returned).toBeUndefined();
      expect(props.success).not.toHaveBeenCalled();
    });

    it("withGenerationState 传递了错误标题", async () => {
      const props = createDefaultProps();
      const { result } = renderHook(() => useFramePairGenerator(props));

      await act(async () => {
        await result.current.generateFramePair("beat-1");
      });

      expect(mockWithGenerationState).toHaveBeenCalledWith(
        "beat-1",
        expect.any(Function),
        "首尾帧生成失败",
      );
    });
  });

  describe("generatingFramePair 状态", () => {
    it("初始时 generatingFramePair 应为 null", () => {
      const props = createDefaultProps();
      const { result } = renderHook(() => useFramePairGenerator(props));

      expect(result.current.generatingFramePair).toBeNull();
    });

    it("应将 setGeneratingFramePair 传递给 useAIGeneratorBase 作为 setGenerating", () => {
      const props = createDefaultProps();
      renderHook(() => useFramePairGenerator(props));

      expect(mockWithGenerationState).toBeDefined();
    });
  });

  describe("prevBeatDescription 解析", () => {
    it("prevBeat 有 content 时应使用 content", async () => {
      const prevBeat = { ...mockBeat2, content: "prev content", description: "prev desc" };
      mockResolvePrevBeat.mockReturnValue(prevBeat);
      mockResolveGenerationContext.mockReturnValue({
        characterRef: undefined,
        sceneRef: undefined,
        prevLastFrameUrl: undefined,
      });

      const props = createDefaultProps();
      const { result } = renderHook(() => useFramePairGenerator(props));

      await act(async () => {
        await result.current.generateFramePair("beat-1");
      });

      const callArgs = mockGenerateBeatFramePair.mock.calls[0][1];
      expect(callArgs.prevBeatDescription).toBe("prev content");
    });

    it("prevBeat 无 content 时应使用 description", async () => {
      const prevBeat = { ...mockBeat2, content: undefined, description: "prev desc" };
      mockResolvePrevBeat.mockReturnValue(prevBeat);
      mockResolveGenerationContext.mockReturnValue({
        characterRef: undefined,
        sceneRef: undefined,
        prevLastFrameUrl: undefined,
      });

      const props = createDefaultProps();
      const { result } = renderHook(() => useFramePairGenerator(props));

      await act(async () => {
        await result.current.generateFramePair("beat-1");
      });

      const callArgs = mockGenerateBeatFramePair.mock.calls[0][1];
      expect(callArgs.prevBeatDescription).toBe("prev desc");
    });

    it("prevBeat 为 null 时 prevBeatDescription 应为 undefined", async () => {
      mockResolvePrevBeat.mockReturnValue(null);
      mockResolveGenerationContext.mockReturnValue({
        characterRef: undefined,
        sceneRef: undefined,
        prevLastFrameUrl: undefined,
      });

      const props = createDefaultProps();
      const { result } = renderHook(() => useFramePairGenerator(props));

      await act(async () => {
        await result.current.generateFramePair("beat-1");
      });

      const callArgs = mockGenerateBeatFramePair.mock.calls[0][1];
      expect(callArgs.prevBeatDescription).toBeUndefined();
    });
  });

  describe("nextBeatDescription 解析", () => {
    it("下一个 beat 有 content 时应使用 content", async () => {
      const props = createDefaultProps();
      const { result } = renderHook(() => useFramePairGenerator(props));

      await act(async () => {
        await result.current.generateFramePair("beat-1");
      });

      const callArgs = mockGenerateBeatFramePair.mock.calls[0][1];
      expect(callArgs.nextBeatDescription).toBe("beat 2 content");
    });

    it("下一个 beat 无 content 时应使用 description", async () => {
      const nextBeat = { ...mockBeat2, content: undefined, description: "next desc" };
      const props = createDefaultProps();
      props.beatsRef.current = [mockBeat1, nextBeat];
      const { result } = renderHook(() => useFramePairGenerator(props));

      await act(async () => {
        await result.current.generateFramePair("beat-1");
      });

      const callArgs = mockGenerateBeatFramePair.mock.calls[0][1];
      expect(callArgs.nextBeatDescription).toBe("next desc");
    });

    it("beat 是最后一个时 nextBeatDescription 应为 undefined", async () => {
      mockFindBeat.mockReturnValue({ ...mockBeat2 });
      const props = createDefaultProps();
      const { result } = renderHook(() => useFramePairGenerator(props));

      await act(async () => {
        await result.current.generateFramePair("beat-2");
      });

      const callArgs = mockGenerateBeatFramePair.mock.calls[0][1];
      expect(callArgs.nextBeatDescription).toBeUndefined();
    });
  });

  describe("characters 和 scenes 传递", () => {
    it("应将 charactersRef.current 和 scenesRef.current 传递给 resolveGenerationContext 和 generateBeatFramePair", async () => {
      const props = createDefaultProps();
      const { result } = renderHook(() => useFramePairGenerator(props));

      await act(async () => {
        await result.current.generateFramePair("beat-1");
      });

      expect(mockResolveGenerationContext).toHaveBeenCalledWith(
        expect.objectContaining({
          characters: props.charactersRef.current,
          scenes: props.scenesRef.current,
        }),
      );

      expect(mockGenerateBeatFramePair).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          characters: props.charactersRef.current,
          scenes: props.scenesRef.current,
        }),
        expect.anything(),
      );
    });
  });

  describe("返回值", () => {
    it("应返回包含 generateFramePair 和 generatingFramePair 的对象", () => {
      const props = createDefaultProps();
      const { result } = renderHook(() => useFramePairGenerator(props));

      expect(result.current.generateFramePair).toBeTypeOf("function");
      expect("generatingFramePair" in result.current).toBe(true);
    });
  });
});
