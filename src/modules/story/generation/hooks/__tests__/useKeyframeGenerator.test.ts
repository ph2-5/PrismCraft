import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { StoryBeat, Character, Scene, StoryStyleGuide, ModelSelection, StoryBeatKeyframe } from "@/domain/schemas";
import { t } from "@/shared/constants";

vi.mock("@/modules/story", () => ({
  generateBeatKeyframe: vi.fn(),
}));

vi.mock("@/domain/services", () => ({
  StoryGenerationService: {
    resolveGenerationContext: vi.fn(),
  },
}));

vi.mock("@/infrastructure/di", () => ({
  container: {
    videoProvider: {},
    imageProvider: {},
    textProvider: {},
  },
}));

vi.mock("@/shared/utils/confirm", () => ({
  confirm: vi.fn(),
}));

vi.mock("../useAIGeneratorBase", () => ({
  useAIGeneratorBase: vi.fn(),
}));

import { generateBeatKeyframe } from "@/modules/story";
import { StoryGenerationService } from "@/domain/services";
import { container } from "@/infrastructure/di";
import { confirm } from "@/shared/utils/confirm";
import { useAIGeneratorBase } from "../useAIGeneratorBase";
import { useKeyframeGenerator } from "../useKeyframeGenerator";

const mockKeyframe: StoryBeatKeyframe = {
  imageUrl: "https://img.example.com/keyframe.png",
  prompt: "a brave hero in a dark forest",
  generatedAt: "2026-05-25T00:00:00.000Z",
  source: "ai",
};

const mockBeat1: StoryBeat = {
  id: "beat-1",
  sequence: 0,
  description: "beat 1 desc",
  type: "scene",
  characterIds: ["char-1"],
  sceneId: "scene-1",
  characters: [],
  elementIds: [],
  enhancedGeneration: false,
};

const mockBeat2: StoryBeat = {
  id: "beat-2",
  sequence: 1,
  description: "beat 2 desc",
  type: "dialogue",
  characterIds: ["char-2"],
  sceneId: "scene-2",
  characters: [],
  elementIds: [],
  enhancedGeneration: false,
};

const mockBeatNoBinding: StoryBeat = {
  id: "beat-no-binding",
  sequence: 2,
  description: "no binding beat",
  type: "action",
  characterIds: [],
  sceneId: undefined,
  scene: undefined,
  characters: [],
  elementIds: [],
  enhancedGeneration: false,
};

const mockCharacter1: Character = {
  id: "char-1",
  name: "Alice",
  description: "A brave hero",
  gender: "female",
  style: "anime",
  personality: ["brave"],
  appearance: {
    hairColor: "blonde",
    hairStyle: "long",
    eyeColor: "blue",
    height: "",
    build: "",
    clothing: "",
  },
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

const mockStyleGuide: StoryStyleGuide = {
  artStyle: "anime",
  moodAtmosphere: "mysterious",
  colorPalette: ["dark green", "black"],
};

let mockFindBeat: ReturnType<typeof vi.fn>;
let mockResolvePrevBeat: ReturnType<typeof vi.fn>;
let mockCheckModelConfig: ReturnType<typeof vi.fn>;
let mockWithGenerationState: ReturnType<typeof vi.fn>;
let mockUpdateBeat: ReturnType<typeof vi.fn>;

function setupBaseMock(overrides?: Partial<{
  findBeat: ReturnType<typeof vi.fn>;
  resolvePrevBeat: ReturnType<typeof vi.fn>;
  checkModelConfig: ReturnType<typeof vi.fn>;
  withGenerationState: ReturnType<typeof vi.fn>;
  updateBeat: ReturnType<typeof vi.fn>;
}>) {
  mockFindBeat = overrides?.findBeat ?? vi.fn().mockReturnValue(mockBeat1);
  mockResolvePrevBeat = overrides?.resolvePrevBeat ?? vi.fn().mockReturnValue(null);
  mockCheckModelConfig = overrides?.checkModelConfig ?? vi.fn().mockReturnValue(true);
  mockWithGenerationState = overrides?.withGenerationState ?? vi.fn();
  mockUpdateBeat = overrides?.updateBeat ?? vi.fn();

  (useAIGeneratorBase as ReturnType<typeof vi.fn>).mockReturnValue({
    findBeat: mockFindBeat,
    resolvePrevBeat: mockResolvePrevBeat,
    checkModelConfig: mockCheckModelConfig,
    withGenerationState: mockWithGenerationState,
    updateBeat: mockUpdateBeat,
  });
}

function createDefaultProps() {
  return {
    beatsRef: { current: [mockBeat1, mockBeat2] } as React.MutableRefObject<StoryBeat[]>,
    charactersRef: { current: [mockCharacter1] } as React.MutableRefObject<Character[]>,
    scenesRef: { current: [mockScene1] } as React.MutableRefObject<Scene[]>,
    styleGuideRef: { current: mockStyleGuide } as React.MutableRefObject<StoryStyleGuide | undefined>,
    selectedImageModel: mockModel as ModelSelection | null,
    setBeats: vi.fn() as React.Dispatch<React.SetStateAction<StoryBeat[]>>,
    success: vi.fn(),
    showError: vi.fn(),
    showConfirm: vi.fn().mockResolvedValue(true),
  };
}

describe("useKeyframeGenerator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupBaseMock();
  });

  describe("generateKeyframe", () => {
    it("模型未配置时应提前返回", async () => {
      mockCheckModelConfig.mockReturnValue(false);
      const props = createDefaultProps();
      const { result } = renderHook(() => useKeyframeGenerator(props));

      let ret: StoryBeat | void = undefined;
      await act(async () => {
        ret = await result.current.generateKeyframe("beat-1");
      });

      expect(ret).toBeUndefined();
      expect(mockCheckModelConfig).toHaveBeenCalledWith(
        mockModel,
        "无法生成预览图",
        "请先在顶部工具栏选择图像生成模型",
      );
      expect(mockWithGenerationState).not.toHaveBeenCalled();
    });

    it("模型为 null 时应提前返回", async () => {
      mockCheckModelConfig.mockReturnValue(false);
      const props = createDefaultProps();
      props.selectedImageModel = null;
      const { result } = renderHook(() => useKeyframeGenerator(props));

      await act(async () => {
        const ret = await result.current.generateKeyframe("beat-1");
        expect(ret).toBeUndefined();
      });

      expect(mockCheckModelConfig).toHaveBeenCalledWith(
        null,
        "无法生成预览图",
        "请先在顶部工具栏选择图像生成模型",
      );
    });

    it("beat 不存在时应提前返回", async () => {
      mockFindBeat.mockReturnValue(null);
      const props = createDefaultProps();
      const { result } = renderHook(() => useKeyframeGenerator(props));

      await act(async () => {
        const ret = await result.current.generateKeyframe("nonexistent");
        expect(ret).toBeUndefined();
      });

      expect(mockWithGenerationState).not.toHaveBeenCalled();
    });

    it("未绑定角色和场景时应弹出确认对话框（使用 showConfirm prop）", async () => {
      mockFindBeat.mockReturnValue(mockBeatNoBinding);
      const props = createDefaultProps();
      props.showConfirm = vi.fn().mockResolvedValue(false);
      const { result } = renderHook(() => useKeyframeGenerator(props));

      await act(async () => {
        const ret = await result.current.generateKeyframe("beat-no-binding");
        expect(ret).toBeUndefined();
      });

      expect(props.showConfirm).toHaveBeenCalledWith(
        "未绑定角色或场景",
        expect.stringContaining("未绑定角色或场景"),
      );
      expect(mockWithGenerationState).not.toHaveBeenCalled();
    });

    it("未绑定角色和场景且 showConfirm 未提供时应使用 confirm 工具函数", async () => {
      mockFindBeat.mockReturnValue(mockBeatNoBinding);
      (confirm as ReturnType<typeof vi.fn>).mockResolvedValue(false);
      const props = createDefaultProps();
      delete (props as Record<string, unknown>).showConfirm;
      const { result } = renderHook(() => useKeyframeGenerator(props));

      await act(async () => {
        const ret = await result.current.generateKeyframe("beat-no-binding");
        expect(ret).toBeUndefined();
      });

      expect(confirm).toHaveBeenCalledWith(
        expect.stringContaining("未绑定角色或场景"),
        "未绑定角色或场景",
      );
      expect(mockWithGenerationState).not.toHaveBeenCalled();
    });

    it("未绑定角色和场景但用户确认后应继续生成", async () => {
      mockFindBeat.mockReturnValue(mockBeatNoBinding);
      const props = createDefaultProps();
      props.showConfirm = vi.fn().mockResolvedValue(true);

      mockWithGenerationState.mockImplementation(async (_beatId: string, fn: (signal: AbortSignal) => Promise<unknown>) => {
        return fn(new AbortController().signal);
      });

      (StoryGenerationService.resolveGenerationContext as ReturnType<typeof vi.fn>).mockReturnValue({
        characterRef: undefined,
        sceneRef: undefined,
      });

      (generateBeatKeyframe as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        value: mockKeyframe,
      });

      const { result } = renderHook(() => useKeyframeGenerator(props));

      await act(async () => {
        await result.current.generateKeyframe("beat-no-binding");
      });

      expect(props.showConfirm).toHaveBeenCalled();
      expect(mockWithGenerationState).toHaveBeenCalled();
    });

    it("有角色绑定时不应弹出确认对话框", async () => {
      const props = createDefaultProps();
      props.showConfirm = vi.fn();

      mockWithGenerationState.mockImplementation(async (_beatId: string, fn: (signal: AbortSignal) => Promise<unknown>) => {
        return fn(new AbortController().signal);
      });

      (StoryGenerationService.resolveGenerationContext as ReturnType<typeof vi.fn>).mockReturnValue({
        characterRef: "https://img.example.com/alice.png",
        sceneRef: "https://img.example.com/forest.png",
      });

      (generateBeatKeyframe as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        value: mockKeyframe,
      });

      const { result } = renderHook(() => useKeyframeGenerator(props));

      await act(async () => {
        await result.current.generateKeyframe("beat-1");
      });

      expect(props.showConfirm).not.toHaveBeenCalled();
      expect(confirm).not.toHaveBeenCalled();
    });

    it("有场景绑定时不应弹出确认对话框", async () => {
      const beatWithSceneOnly: StoryBeat = {
        ...mockBeat1,
        characterIds: [],
        sceneId: "scene-1",
      };
      mockFindBeat.mockReturnValue(beatWithSceneOnly);

      const props = createDefaultProps();
      props.showConfirm = vi.fn();

      mockWithGenerationState.mockImplementation(async (_beatId: string, fn: (signal: AbortSignal) => Promise<unknown>) => {
        return fn(new AbortController().signal);
      });

      (StoryGenerationService.resolveGenerationContext as ReturnType<typeof vi.fn>).mockReturnValue({
        characterRef: undefined,
        sceneRef: "https://img.example.com/forest.png",
      });

      (generateBeatKeyframe as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        value: mockKeyframe,
      });

      const { result } = renderHook(() => useKeyframeGenerator(props));

      await act(async () => {
        await result.current.generateKeyframe("beat-1");
      });

      expect(props.showConfirm).not.toHaveBeenCalled();
    });

    it("有 beat.scene 绑定时不应弹出确认对话框", async () => {
      const beatWithSceneField: StoryBeat = {
        ...mockBeat1,
        characterIds: [],
        sceneId: undefined,
        scene: "scene-1",
      };
      mockFindBeat.mockReturnValue(beatWithSceneField);

      const props = createDefaultProps();
      props.showConfirm = vi.fn();

      mockWithGenerationState.mockImplementation(async (_beatId: string, fn: (signal: AbortSignal) => Promise<unknown>) => {
        return fn(new AbortController().signal);
      });

      (StoryGenerationService.resolveGenerationContext as ReturnType<typeof vi.fn>).mockReturnValue({
        characterRef: undefined,
        sceneRef: "https://img.example.com/forest.png",
      });

      (generateBeatKeyframe as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        value: mockKeyframe,
      });

      const { result } = renderHook(() => useKeyframeGenerator(props));

      await act(async () => {
        await result.current.generateKeyframe("beat-1");
      });

      expect(props.showConfirm).not.toHaveBeenCalled();
    });

    it("应通过 StoryGenerationService.resolveGenerationContext 解析引用", async () => {
      const props = createDefaultProps();

      mockWithGenerationState.mockImplementation(async (_beatId: string, fn: (signal: AbortSignal) => Promise<unknown>) => {
        return fn(new AbortController().signal);
      });

      (StoryGenerationService.resolveGenerationContext as ReturnType<typeof vi.fn>).mockReturnValue({
        characterRef: "https://img.example.com/alice.png",
        sceneRef: "https://img.example.com/forest.png",
      });

      (generateBeatKeyframe as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        value: mockKeyframe,
      });

      const { result } = renderHook(() => useKeyframeGenerator(props));

      await act(async () => {
        await result.current.generateKeyframe("beat-1");
      });

      expect(StoryGenerationService.resolveGenerationContext).toHaveBeenCalledWith({
        beat: mockBeat1,
        prevBeat: null,
        characters: props.charactersRef.current,
        scenes: props.scenesRef.current,
        elements: [],
      });
    });

    it("应使用 resolvePrevBeat 解析前一个 beat 并传入 resolveGenerationContext", async () => {
      const prevBeat = mockBeat2;
      mockResolvePrevBeat.mockReturnValue(prevBeat);

      const props = createDefaultProps();

      mockWithGenerationState.mockImplementation(async (_beatId: string, fn: (signal: AbortSignal) => Promise<unknown>) => {
        return fn(new AbortController().signal);
      });

      (StoryGenerationService.resolveGenerationContext as ReturnType<typeof vi.fn>).mockReturnValue({
        characterRef: "https://img.example.com/alice.png",
        sceneRef: "https://img.example.com/forest.png",
      });

      (generateBeatKeyframe as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        value: mockKeyframe,
      });

      const { result } = renderHook(() => useKeyframeGenerator(props));

      await act(async () => {
        await result.current.generateKeyframe("beat-1");
      });

      expect(mockResolvePrevBeat).toHaveBeenCalledWith("beat-1", undefined);
      expect(StoryGenerationService.resolveGenerationContext).toHaveBeenCalledWith(
        expect.objectContaining({ prevBeat }),
      );
    });

    it("应传入 prevBeatOverride 到 resolvePrevBeat", async () => {
      const overrideBeat = mockBeat2;
      mockResolvePrevBeat.mockReturnValue(overrideBeat);

      const props = createDefaultProps();

      mockWithGenerationState.mockImplementation(async (_beatId: string, fn: (signal: AbortSignal) => Promise<unknown>) => {
        return fn(new AbortController().signal);
      });

      (StoryGenerationService.resolveGenerationContext as ReturnType<typeof vi.fn>).mockReturnValue({
        characterRef: undefined,
        sceneRef: undefined,
      });

      (generateBeatKeyframe as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        value: mockKeyframe,
      });

      const { result } = renderHook(() => useKeyframeGenerator(props));

      await act(async () => {
        await result.current.generateKeyframe("beat-1", overrideBeat);
      });

      expect(mockResolvePrevBeat).toHaveBeenCalledWith("beat-1", overrideBeat);
    });

    it("应使用正确的参数调用 generateBeatKeyframe", async () => {
      const props = createDefaultProps();

      mockWithGenerationState.mockImplementation(async (_beatId: string, fn: (signal: AbortSignal) => Promise<unknown>) => {
        return fn(new AbortController().signal);
      });

      (StoryGenerationService.resolveGenerationContext as ReturnType<typeof vi.fn>).mockReturnValue({
        characterRef: "https://img.example.com/alice.png",
        sceneRef: "https://img.example.com/forest.png",
      });

      (generateBeatKeyframe as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        value: mockKeyframe,
      });

      const { result } = renderHook(() => useKeyframeGenerator(props));

      await act(async () => {
        await result.current.generateKeyframe("beat-1");
      });

      expect(generateBeatKeyframe).toHaveBeenCalledWith(
        mockBeat1,
        null,
        expect.objectContaining({
          characterRef: "https://img.example.com/alice.png",
          sceneRef: "https://img.example.com/forest.png",
          providerId: "provider-1",
          modelId: "model-1",
          characters: props.charactersRef.current,
          scenes: props.scenesRef.current,
          styleGuide: mockStyleGuide,
        }),
        expect.objectContaining({
          videoProvider: container.videoProvider,
          imageProvider: container.imageProvider,
          textProvider: container.textProvider,
        }),
      );
    });

    it("应传入 customPrompt 到 generateBeatKeyframe", async () => {
      const props = createDefaultProps();

      mockWithGenerationState.mockImplementation(async (_beatId: string, fn: (signal: AbortSignal) => Promise<unknown>) => {
        return fn(new AbortController().signal);
      });

      (StoryGenerationService.resolveGenerationContext as ReturnType<typeof vi.fn>).mockReturnValue({
        characterRef: undefined,
        sceneRef: undefined,
      });

      (generateBeatKeyframe as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        value: mockKeyframe,
      });

      const { result } = renderHook(() => useKeyframeGenerator(props));

      await act(async () => {
        await result.current.generateKeyframe("beat-1", undefined, "custom prompt text");
      });

      expect(generateBeatKeyframe).toHaveBeenCalledWith(
        mockBeat1,
        null,
        expect.objectContaining({
          customPrompt: "custom prompt text",
        }),
        expect.any(Object),
      );
    });

    it("styleGuideRef 未提供时不应传入 styleGuide", async () => {
      const props = createDefaultProps();
      delete (props as Record<string, unknown>).styleGuideRef;

      mockWithGenerationState.mockImplementation(async (_beatId: string, fn: (signal: AbortSignal) => Promise<unknown>) => {
        return fn(new AbortController().signal);
      });

      (StoryGenerationService.resolveGenerationContext as ReturnType<typeof vi.fn>).mockReturnValue({
        characterRef: undefined,
        sceneRef: undefined,
      });

      (generateBeatKeyframe as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        value: mockKeyframe,
      });

      const { result } = renderHook(() => useKeyframeGenerator(props));

      await act(async () => {
        await result.current.generateKeyframe("beat-1");
      });

      expect(generateBeatKeyframe).toHaveBeenCalledWith(
        mockBeat1,
        null,
        expect.objectContaining({
          styleGuide: undefined,
        }),
        expect.any(Object),
      );
    });

    it("生成成功后应更新 beat 并调用 success", async () => {
      const props = createDefaultProps();

      mockWithGenerationState.mockImplementation(async (_beatId: string, fn: (signal: AbortSignal) => Promise<unknown>) => {
        return fn(new AbortController().signal);
      });

      (StoryGenerationService.resolveGenerationContext as ReturnType<typeof vi.fn>).mockReturnValue({
        characterRef: "https://img.example.com/alice.png",
        sceneRef: "https://img.example.com/forest.png",
      });

      const keyframeResult = { ok: true, value: mockKeyframe };
      (generateBeatKeyframe as ReturnType<typeof vi.fn>).mockResolvedValue(keyframeResult);

      const { result } = renderHook(() => useKeyframeGenerator(props));

      let ret: StoryBeat | void = undefined;
      await act(async () => {
        ret = await result.current.generateKeyframe("beat-1");
      });

      expect(mockUpdateBeat).toHaveBeenCalledWith("beat-1", {
        ...mockBeat1,
        keyframe: mockKeyframe,
      });
      expect(props.success).toHaveBeenCalledWith(t("success.generated"), t("success.keyframeGeneratedDesc"));
      expect(ret).toEqual({
        ...mockBeat1,
        keyframe: mockKeyframe,
      });
    });

    it("signal 被 abort 后应提前返回不更新 beat", async () => {
      const props = createDefaultProps();
      const abortedController = new AbortController();
      abortedController.abort();

      mockWithGenerationState.mockImplementation(async (_beatId: string, fn: (signal: AbortSignal) => Promise<unknown>) => {
        return fn(abortedController.signal);
      });

      (StoryGenerationService.resolveGenerationContext as ReturnType<typeof vi.fn>).mockReturnValue({
        characterRef: "https://img.example.com/alice.png",
        sceneRef: "https://img.example.com/forest.png",
      });

      (generateBeatKeyframe as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        value: mockKeyframe,
      });

      const { result } = renderHook(() => useKeyframeGenerator(props));

      let ret: StoryBeat | void = undefined;
      await act(async () => {
        ret = await result.current.generateKeyframe("beat-1");
      });

      expect(mockUpdateBeat).not.toHaveBeenCalled();
      expect(props.success).not.toHaveBeenCalled();
      expect(ret).toBeUndefined();
    });

    it("withGenerationState 应传入正确的 beatId 和错误标题", async () => {
      const props = createDefaultProps();

      mockWithGenerationState.mockImplementation(async (_beatId: string, fn: (signal: AbortSignal) => Promise<unknown>) => {
        return fn(new AbortController().signal);
      });

      (StoryGenerationService.resolveGenerationContext as ReturnType<typeof vi.fn>).mockReturnValue({
        characterRef: undefined,
        sceneRef: undefined,
      });

      (generateBeatKeyframe as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        value: mockKeyframe,
      });

      const { result } = renderHook(() => useKeyframeGenerator(props));

      await act(async () => {
        await result.current.generateKeyframe("beat-1");
      });

      expect(mockWithGenerationState).toHaveBeenCalledWith(
        "beat-1",
        expect.any(Function),
        "预览图生成失败",
      );
    });

    it("generateBeatKeyframe 抛出错误时应由 withGenerationState 处理", async () => {
      const props = createDefaultProps();

      mockWithGenerationState.mockImplementation(async (_beatId: string, fn: (signal: AbortSignal) => Promise<unknown>, errorTitle: string) => {
        try {
          return await fn(new AbortController().signal);
        } catch {
          props.showError(errorTitle, "generation failed");
        }
      });

      (StoryGenerationService.resolveGenerationContext as ReturnType<typeof vi.fn>).mockReturnValue({
        characterRef: undefined,
        sceneRef: undefined,
      });

      (generateBeatKeyframe as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("generation failed"));

      const { result } = renderHook(() => useKeyframeGenerator(props));

      await act(async () => {
        await result.current.generateKeyframe("beat-1");
      });

      expect(props.showError).toHaveBeenCalledWith("预览图生成失败", "generation failed");
      expect(mockUpdateBeat).not.toHaveBeenCalled();
      expect(props.success).not.toHaveBeenCalled();
    });

    it("generateBeatKeyframe 返回失败结果时应抛出错误", async () => {
      const props = createDefaultProps();

      mockWithGenerationState.mockImplementation(async (_beatId: string, fn: (signal: AbortSignal) => Promise<unknown>, errorTitle: string) => {
        try {
          return await fn(new AbortController().signal);
        } catch {
          props.showError(errorTitle, "预览图生成失败");
        }
      });

      (StoryGenerationService.resolveGenerationContext as ReturnType<typeof vi.fn>).mockReturnValue({
        characterRef: undefined,
        sceneRef: undefined,
      });

      (generateBeatKeyframe as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("预览图生成失败"));

      const { result } = renderHook(() => useKeyframeGenerator(props));

      await act(async () => {
        await result.current.generateKeyframe("beat-1");
      });

      expect(props.showError).toHaveBeenCalled();
      expect(mockUpdateBeat).not.toHaveBeenCalled();
    });
  });

  describe("regenerateKeyframe", () => {
    it("应委托调用 generateKeyframe", async () => {
      const props = createDefaultProps();

      mockWithGenerationState.mockImplementation(async (_beatId: string, fn: (signal: AbortSignal) => Promise<unknown>) => {
        return fn(new AbortController().signal);
      });

      (StoryGenerationService.resolveGenerationContext as ReturnType<typeof vi.fn>).mockReturnValue({
        characterRef: "https://img.example.com/alice.png",
        sceneRef: "https://img.example.com/forest.png",
      });

      (generateBeatKeyframe as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        value: mockKeyframe,
      });

      const { result } = renderHook(() => useKeyframeGenerator(props));

      await act(async () => {
        await result.current.regenerateKeyframe("beat-1");
      });

      expect(generateBeatKeyframe).toHaveBeenCalledWith(
        mockBeat1,
        null,
        expect.any(Object),
        expect.any(Object),
      );
      expect(mockUpdateBeat).toHaveBeenCalled();
      expect(props.success).toHaveBeenCalledWith(t("success.generated"), t("success.keyframeGeneratedDesc"));
    });
  });

  describe("generatingKeyframe state", () => {
    it("初始值应为 null", () => {
      const props = createDefaultProps();
      const { result } = renderHook(() => useKeyframeGenerator(props));

      expect(result.current.generatingKeyframe).toBeNull();
    });

    it("setGeneratingKeyframe 应更新状态", () => {
      const props = createDefaultProps();
      const { result } = renderHook(() => useKeyframeGenerator(props));

      act(() => {
        result.current.setGeneratingKeyframe("beat-1");
      });

      expect(result.current.generatingKeyframe).toBe("beat-1");

      act(() => {
        result.current.setGeneratingKeyframe(null);
      });

      expect(result.current.generatingKeyframe).toBeNull();
    });
  });
});
