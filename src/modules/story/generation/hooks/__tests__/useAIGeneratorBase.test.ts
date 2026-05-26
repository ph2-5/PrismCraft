import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { StoryBeat, Character, Scene, ModelSelection } from "@/domain/schemas";

vi.mock("@/modules/story", () => ({
  resolveCharacterRef: vi.fn(),
  resolveSceneRef: vi.fn(),
}));

vi.mock("@/shared/error-handler", () => ({
  getErrorMessage: vi.fn().mockReturnValue("mocked error message"),
}));

import { resolveCharacterRef, resolveSceneRef } from "@/modules/story";
import { getErrorMessage } from "@/shared/error-handler";
import { useAIGeneratorBase } from "../useAIGeneratorBase";

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

const mockCharacter2: Character = {
  id: "char-2",
  name: "Bob",
  description: "A wise mentor",
  gender: "male",
  style: "realistic",
  personality: ["wise"],
  appearance: {
    hairColor: "gray",
    hairStyle: "short",
    eyeColor: "brown",
    height: "",
    build: "",
    clothing: "",
  },
  prompt: "a wise mentor",
  generatedImage: "https://img.example.com/bob.png",
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

const mockScene2: Scene = {
  id: "scene-2",
  name: "Castle",
  description: "An ancient castle",
  type: "indoor",
  timeOfDay: "day",
  weather: "sunny",
  mood: "grand",
  lighting: "bright",
  elements: ["stones"],
  colors: ["gray"],
  prompt: "an ancient castle",
  scenePath: "/path/to/castle.png",
};

function createDefaultProps() {
  return {
    beatsRef: { current: [mockBeat1, mockBeat2] } as React.MutableRefObject<StoryBeat[]>,
    charactersRef: { current: [mockCharacter1, mockCharacter2] } as React.MutableRefObject<Character[]>,
    scenesRef: { current: [mockScene1, mockScene2] } as React.MutableRefObject<Scene[]>,
    setBeats: vi.fn() as unknown as React.Dispatch<React.SetStateAction<StoryBeat[]>>,
    setGenerating: vi.fn() as unknown as React.Dispatch<React.SetStateAction<string | null>>,
    success: vi.fn(),
    showError: vi.fn(),
    showConfirm: vi.fn().mockResolvedValue(true),
  };
}

describe("useAIGeneratorBase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (resolveCharacterRef as ReturnType<typeof vi.fn>).mockReturnValue(undefined);
    (resolveSceneRef as ReturnType<typeof vi.fn>).mockReturnValue(undefined);
  });

  describe("findBeat", () => {
    it("应返回匹配 id 的 beat", () => {
      const props = createDefaultProps();
      const { result } = renderHook(() => useAIGeneratorBase(props));

      const beat = result.current.findBeat("beat-1");
      expect(beat).toEqual(mockBeat1);
    });

    it("id 不存在时应返回 null", () => {
      const props = createDefaultProps();
      const { result } = renderHook(() => useAIGeneratorBase(props));

      const beat = result.current.findBeat("nonexistent");
      expect(beat).toBeNull();
    });

    it("应读取 beatsRef.current 的最新值", () => {
      const props = createDefaultProps();
      const { result } = renderHook(() => useAIGeneratorBase(props));

      const newBeat: StoryBeat = {
        id: "beat-new",
        sequence: 2,
        description: "new beat",
        type: "action",
        characterIds: [],
        characters: [],
        elementIds: [],
        enhancedGeneration: false,
      };
      props.beatsRef.current = [mockBeat1, mockBeat2, newBeat];

      const beat = result.current.findBeat("beat-new");
      expect(beat).toEqual(newBeat);
    });
  });

  describe("resolvePrevBeat", () => {
    it("应返回前一个 beat", () => {
      const props = createDefaultProps();
      const { result } = renderHook(() => useAIGeneratorBase(props));

      const prev = result.current.resolvePrevBeat("beat-2");
      expect(prev).toEqual(mockBeat1);
    });

    it("第一个 beat 应返回 null", () => {
      const props = createDefaultProps();
      const { result } = renderHook(() => useAIGeneratorBase(props));

      const prev = result.current.resolvePrevBeat("beat-1");
      expect(prev).toBeNull();
    });

    it("beat 不存在时应返回 null", () => {
      const props = createDefaultProps();
      const { result } = renderHook(() => useAIGeneratorBase(props));

      const prev = result.current.resolvePrevBeat("nonexistent");
      expect(prev).toBeNull();
    });

    it("传入 prevBeatOverride 时应直接返回该值", () => {
      const props = createDefaultProps();
      const { result } = renderHook(() => useAIGeneratorBase(props));

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
      const prev = result.current.resolvePrevBeat("beat-2", override);
      expect(prev).toEqual(override);
    });

    it("传入 prevBeatOverride 为 null 时应返回 null", () => {
      const props = createDefaultProps();
      const { result } = renderHook(() => useAIGeneratorBase(props));

      const prev = result.current.resolvePrevBeat("beat-2", null);
      expect(prev).toBeNull();
    });

    it("不传 prevBeatOverride 时应从 beatsRef 解析", () => {
      const props = createDefaultProps();
      const { result } = renderHook(() => useAIGeneratorBase(props));

      const prev = result.current.resolvePrevBeat("beat-2", undefined);
      expect(prev).toEqual(mockBeat1);
    });
  });

  describe("resolveRefs", () => {
    it("应解析 characterRef 和 sceneRef", () => {
      (resolveCharacterRef as ReturnType<typeof vi.fn>).mockReturnValue("https://img.example.com/alice.png");
      (resolveSceneRef as ReturnType<typeof vi.fn>).mockReturnValue("https://img.example.com/forest.png");

      const props = createDefaultProps();
      const { result } = renderHook(() => useAIGeneratorBase(props));

      const refs = result.current.resolveRefs(mockBeat1);
      expect(refs.characterRef).toBe("https://img.example.com/alice.png");
      expect(refs.sceneRef).toBe("https://img.example.com/forest.png");
      expect(refs.prevBeat).toBeNull();
    });

    it("应将 prevBeat 传递到结果中", () => {
      (resolveCharacterRef as ReturnType<typeof vi.fn>).mockReturnValue(undefined);
      (resolveSceneRef as ReturnType<typeof vi.fn>).mockReturnValue(undefined);

      const props = createDefaultProps();
      const { result } = renderHook(() => useAIGeneratorBase(props));

      const refs = result.current.resolveRefs(mockBeat2, mockBeat1);
      expect(refs.prevBeat).toEqual(mockBeat1);
    });

    it("prevBeat 为 undefined 时应返回 null", () => {
      (resolveCharacterRef as ReturnType<typeof vi.fn>).mockReturnValue(undefined);
      (resolveSceneRef as ReturnType<typeof vi.fn>).mockReturnValue(undefined);

      const props = createDefaultProps();
      const { result } = renderHook(() => useAIGeneratorBase(props));

      const refs = result.current.resolveRefs(mockBeat1);
      expect(refs.prevBeat).toBeNull();
    });

    it("beat.characterIds 为空时应返回 undefined characterRef", () => {
      (resolveSceneRef as ReturnType<typeof vi.fn>).mockReturnValue(undefined);

      const props = createDefaultProps();
      const { result } = renderHook(() => useAIGeneratorBase(props));

      const beatNoChars: StoryBeat = {
        ...mockBeat1,
        characterIds: [],
      };
      const refs = result.current.resolveRefs(beatNoChars);
      expect(refs.characterRef).toBeUndefined();
      expect(resolveCharacterRef).not.toHaveBeenCalled();
    });

    it("characterIds 对应的角色不存在时应返回 undefined characterRef", () => {
      const props = createDefaultProps();
      const { result } = renderHook(() => useAIGeneratorBase(props));

      const beatMissingChar: StoryBeat = {
        ...mockBeat1,
        characterIds: ["nonexistent-char"],
      };
      const refs = result.current.resolveRefs(beatMissingChar);
      expect(refs.characterRef).toBeUndefined();
    });

    it("resolveCharacterRef 返回 undefined 时 characterRef 应为 undefined", () => {
      (resolveCharacterRef as ReturnType<typeof vi.fn>).mockReturnValue(undefined);

      const props = createDefaultProps();
      const { result } = renderHook(() => useAIGeneratorBase(props));

      const refs = result.current.resolveRefs(mockBeat1);
      expect(refs.characterRef).toBeUndefined();
    });

    it("多个 characterIds 时应取第一个有效 characterRef", () => {
      (resolveCharacterRef as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce(undefined)
        .mockReturnValueOnce("https://img.example.com/bob.png");

      const props = createDefaultProps();
      const { result } = renderHook(() => useAIGeneratorBase(props));

      const beatMultiChar: StoryBeat = {
        ...mockBeat1,
        characterIds: ["char-1", "char-2"],
      };
      const refs = result.current.resolveRefs(beatMultiChar);
      expect(refs.characterRef).toBe("https://img.example.com/bob.png");
    });

    it("beat 无 sceneId 和 scene 时应返回 undefined sceneRef", () => {
      const props = createDefaultProps();
      const { result } = renderHook(() => useAIGeneratorBase(props));

      const beatNoScene: StoryBeat = {
        ...mockBeat1,
        sceneId: undefined,
        scene: undefined,
      };
      const refs = result.current.resolveRefs(beatNoScene);
      expect(refs.sceneRef).toBeUndefined();
      expect(resolveSceneRef).not.toHaveBeenCalled();
    });

    it("应优先使用 beat.sceneId，其次使用 beat.scene", () => {
      (resolveSceneRef as ReturnType<typeof vi.fn>).mockReturnValue("https://img.example.com/scene.png");

      const props = createDefaultProps();
      const { result } = renderHook(() => useAIGeneratorBase(props));

      const beatWithBoth: StoryBeat = {
        ...mockBeat1,
        sceneId: "scene-1",
        scene: "scene-2",
      };
      result.current.resolveRefs(beatWithBoth);
      expect(resolveSceneRef).toHaveBeenCalledWith(
        expect.objectContaining({ id: "scene-1" }),
      );
    });

    it("sceneId 对应的场景不存在时应返回 undefined sceneRef", () => {
      const props = createDefaultProps();
      const { result } = renderHook(() => useAIGeneratorBase(props));

      const beatBadScene: StoryBeat = {
        ...mockBeat1,
        sceneId: "nonexistent-scene",
      };
      const refs = result.current.resolveRefs(beatBadScene);
      expect(refs.sceneRef).toBeUndefined();
    });

    it("应使用 beat.scene 作为 fallback 查找场景", () => {
      (resolveSceneRef as ReturnType<typeof vi.fn>).mockReturnValue("/path/to/castle.png");

      const props = createDefaultProps();
      const { result } = renderHook(() => useAIGeneratorBase(props));

      const beatSceneFallback: StoryBeat = {
        ...mockBeat1,
        sceneId: undefined,
        scene: "scene-2",
      };
      const refs = result.current.resolveRefs(beatSceneFallback);
      expect(refs.sceneRef).toBe("/path/to/castle.png");
      expect(resolveSceneRef).toHaveBeenCalledWith(
        expect.objectContaining({ id: "scene-2" }),
      );
    });
  });

  describe("checkModelConfig", () => {
    it("有效 model 应返回 true", () => {
      const props = createDefaultProps();
      const { result } = renderHook(() => useAIGeneratorBase(props));

      const model: ModelSelection = {
        providerId: "provider-1",
        modelId: "model-1",
        providerName: "Test Provider",
        modelName: "Test Model",
      };
      const valid = result.current.checkModelConfig(model, "Error", "No model");
      expect(valid).toBe(true);
      expect(props.showError).not.toHaveBeenCalled();
    });

    it("null model 应返回 false 并调用 showError", () => {
      const props = createDefaultProps();
      const { result } = renderHook(() => useAIGeneratorBase(props));

      const valid = result.current.checkModelConfig(null, "配置错误", "请选择模型");
      expect(valid).toBe(false);
      expect(props.showError).toHaveBeenCalledWith("配置错误", "请选择模型");
    });

    it("缺少 providerId 应返回 false", () => {
      const props = createDefaultProps();
      const { result } = renderHook(() => useAIGeneratorBase(props));

      const model = {
        providerId: "",
        modelId: "model-1",
        providerName: "Test",
        modelName: "Test",
      } as ModelSelection;
      const valid = result.current.checkModelConfig(model, "Error", "No provider");
      expect(valid).toBe(false);
      expect(props.showError).toHaveBeenCalledWith("Error", "No provider");
    });

    it("缺少 modelId 应返回 false", () => {
      const props = createDefaultProps();
      const { result } = renderHook(() => useAIGeneratorBase(props));

      const model = {
        providerId: "provider-1",
        modelId: "",
        providerName: "Test",
        modelName: "Test",
      } as ModelSelection;
      const valid = result.current.checkModelConfig(model, "Error", "No model id");
      expect(valid).toBe(false);
    });
  });

  describe("withGenerationState", () => {
    it("应设置 generating 状态并在完成后清除", async () => {
      const props = createDefaultProps();
      const { result } = renderHook(() => useAIGeneratorBase(props));

      const fn = vi.fn().mockResolvedValue("result");
      await act(async () => {
        const res = await result.current.withGenerationState("beat-1", fn, "Error");
        expect(res).toBe("result");
      });

      expect(props.setGenerating).toHaveBeenCalledWith("beat-1");
      expect(props.setGenerating).toHaveBeenCalledWith(null);
      expect(fn).toHaveBeenCalled();
    });

    it("应将 AbortSignal 传递给回调函数", async () => {
      const props = createDefaultProps();
      const { result } = renderHook(() => useAIGeneratorBase(props));

      const fn = vi.fn().mockResolvedValue(undefined);
      await act(async () => {
        await result.current.withGenerationState("beat-1", fn, "Error");
      });

      expect(fn).toHaveBeenCalledWith(expect.any(AbortSignal));
    });

    it("回调抛出错误时应调用 showError", async () => {
      const props = createDefaultProps();
      const { result } = renderHook(() => useAIGeneratorBase(props));

      const fn = vi.fn().mockRejectedValue(new Error("generation failed"));
      await act(async () => {
        await result.current.withGenerationState("beat-1", fn, "生成失败");
      });

      expect(getErrorMessage).toHaveBeenCalled();
      expect(props.showError).toHaveBeenCalledWith("生成失败", "mocked error message");
      expect(props.setGenerating).toHaveBeenCalledWith(null);
    });

    it("同一 beatId 重复调用时应返回已有 Promise 而非 abort (regression: Bug #7)", async () => {
      const props = createDefaultProps();
      const { result } = renderHook(() => useAIGeneratorBase(props));

      let firstResolve: ((value: string) => void) | null = null;
      const firstFn = vi.fn().mockImplementation((_signal: AbortSignal) => {
        return new Promise<string>((resolve) => {
          firstResolve = resolve;
        });
      });

      const secondFn = vi.fn().mockResolvedValue("second result");

      let firstResult: string | void | undefined;
      let secondResult: string | void | undefined;

      await act(async () => {
        const p1 = result.current.withGenerationState("beat-1", firstFn, "Error");
        const p2 = result.current.withGenerationState("beat-1", secondFn, "Error");

        expect(secondFn).not.toHaveBeenCalled();

        firstResolve!("first result");

        firstResult = await p1;
        secondResult = await p2;
      });

      expect(firstResult).toBe("first result");
      expect(secondResult).toBe("first result");
      expect(firstFn).toHaveBeenCalledTimes(1);
      expect(secondFn).not.toHaveBeenCalled();
    });

    it("Promise dedup 完成后再次调用应发起新请求 (regression: Bug #7)", async () => {
      const props = createDefaultProps();
      const { result } = renderHook(() => useAIGeneratorBase(props));

      const firstFn = vi.fn().mockResolvedValue("first");
      const secondFn = vi.fn().mockResolvedValue("second");

      await act(async () => {
        await result.current.withGenerationState("beat-1", firstFn, "Error");
      });

      await act(async () => {
        const res = await result.current.withGenerationState("beat-1", secondFn, "Error");
        expect(res).toBe("second");
      });

      expect(firstFn).toHaveBeenCalledTimes(1);
      expect(secondFn).toHaveBeenCalledTimes(1);
    });

    it("abort 后回调结果应被忽略", async () => {
      const props = createDefaultProps();
      const { result } = renderHook(() => useAIGeneratorBase(props));

      const fn = vi.fn().mockImplementation((signal: AbortSignal) => {
        return new Promise<string>((resolve) => {
          setTimeout(() => {
            if (signal.aborted) return;
            resolve("should not return");
          }, 100);
        });
      });

      act(() => {
        result.current.abortGeneration("beat-1");
      });

      await act(async () => {
        const res = await result.current.withGenerationState("beat-1", fn, "Error");
      });

      expect(fn).toHaveBeenCalled();
    });

    it("abort 后不应调用 setGenerating(null)", async () => {
      const props = createDefaultProps();
      const { result } = renderHook(() => useAIGeneratorBase(props));

      let rejectFn: ((err: Error) => void) | null = null;
      const fn = vi.fn().mockImplementation((signal: AbortSignal) => {
        return new Promise((_resolve, reject) => {
          rejectFn = reject;
        });
      });

      const promise = act(async () => {
        await result.current.withGenerationState("beat-1", fn, "Error");
      });

      act(() => {
        result.current.abortGeneration("beat-1");
      });

      if (rejectFn) {
        await act(async () => {
          (rejectFn as any)(new Error("aborted"));
        });
      }

      await promise;

      const generatingCalls = (props.setGenerating as any).mock.calls.filter(
        (call: unknown[]) => call[0] === null,
      );
      expect(generatingCalls.length).toBe(0);
    });

    it("回调成功但 signal 已 abort 时不应返回结果", async () => {
      const props = createDefaultProps();
      const { result } = renderHook(() => useAIGeneratorBase(props));

      let resolveFn: ((value: string) => void) | null = null;
      const fn = vi.fn().mockImplementation((signal: AbortSignal) => {
        return new Promise<string>((resolve) => {
          resolveFn = resolve;
        });
      });

      let hookResult: string | void | undefined;
      const promise = act(async () => {
        hookResult = await result.current.withGenerationState("beat-1", fn, "Error");
      });

      act(() => {
        result.current.abortGeneration("beat-1");
      });

      if (resolveFn) {
        await act(async () => {
          resolveFn!("late result");
        });
      }

      await promise;
      expect(hookResult).toBeUndefined();
    });
  });

  describe("abortGeneration", () => {
    it("指定 beatId 时应 abort 该 controller", async () => {
      const props = createDefaultProps();
      const { result } = renderHook(() => useAIGeneratorBase(props));

      let capturedSignal: AbortSignal | null = null;
      const fn = vi.fn().mockImplementation((signal: AbortSignal) => {
        capturedSignal = signal;
        return new Promise(() => {});
      });

      act(() => {
        result.current.withGenerationState("beat-1", fn, "Error");
      });

      expect(capturedSignal).not.toBeNull();
      expect(capturedSignal!.aborted).toBe(false);

      act(() => {
        result.current.abortGeneration("beat-1");
      });

      expect(capturedSignal!.aborted).toBe(true);
    });

    it("不指定 beatId 时应 abort 所有 controller", async () => {
      const props = createDefaultProps();
      const { result } = renderHook(() => useAIGeneratorBase(props));

      const signals: AbortSignal[] = [];
      const createFn = () => vi.fn().mockImplementation((signal: AbortSignal) => {
        signals.push(signal);
        return new Promise(() => {});
      });

      act(() => {
        result.current.withGenerationState("beat-1", createFn(), "Error");
      });
      act(() => {
        result.current.withGenerationState("beat-2", createFn(), "Error");
      });

      expect(signals.length).toBe(2);
      expect(signals.every((s) => !s.aborted)).toBe(true);

      act(() => {
        result.current.abortGeneration();
      });

      expect(signals.every((s) => s.aborted)).toBe(true);
    });

    it("abort 不存在的 beatId 应无副作用", () => {
      const props = createDefaultProps();
      const { result } = renderHook(() => useAIGeneratorBase(props));

      expect(() => {
        result.current.abortGeneration("nonexistent");
      }).not.toThrow();
    });
  });

  describe("updateBeat", () => {
    it("应调用 setBeats 更新指定 beat", () => {
      const props = createDefaultProps();
      const { result } = renderHook(() => useAIGeneratorBase(props));

      act(() => {
        result.current.updateBeat("beat-1", { description: "updated desc" });
      });

      expect(props.setBeats).toHaveBeenCalled();
      const updater = (props.setBeats as any).mock.calls[0][0] as (prev: StoryBeat[]) => StoryBeat[];
      const updated = updater([mockBeat1, mockBeat2]);
      expect(updated[0].description).toBe("updated desc");
      expect(updated[1].description).toBe("beat 2 desc");
    });

    it("setBeats 未提供时不应执行任何操作", () => {
      const props = createDefaultProps();
      delete (props as Record<string, unknown>).setBeats;
      const { result } = renderHook(() => useAIGeneratorBase(props));

      expect(() => {
        result.current.updateBeat("beat-1", { description: "test" });
      }).not.toThrow();
    });

    it("应合并更新而非替换整个 beat", () => {
      const props = createDefaultProps();
      const { result } = renderHook(() => useAIGeneratorBase(props));

      act(() => {
        result.current.updateBeat("beat-1", { description: "new desc" });
      });

      const updater = (props.setBeats as any).mock.calls[0][0] as (prev: StoryBeat[]) => StoryBeat[];
      const updated = updater([mockBeat1, mockBeat2]);
      expect(updated[0].id).toBe("beat-1");
      expect(updated[0].sequence).toBe(0);
      expect(updated[0].description).toBe("new desc");
    });
  });

  describe("unmount cleanup", () => {
    it("卸载时应 abort 所有活跃的 controller", () => {
      const props = createDefaultProps();
      const { result, unmount } = renderHook(() => useAIGeneratorBase(props));

      const signals: AbortSignal[] = [];
      const createFn = () => vi.fn().mockImplementation((signal: AbortSignal) => {
        signals.push(signal);
        return new Promise(() => {});
      });

      act(() => {
        result.current.withGenerationState("beat-1", createFn(), "Error");
      });
      act(() => {
        result.current.withGenerationState("beat-2", createFn(), "Error");
      });

      expect(signals.every((s) => !s.aborted)).toBe(true);

      unmount();

      expect(signals.every((s) => s.aborted)).toBe(true);
    });
  });
});
