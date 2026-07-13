import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { StoryBeat, Character, Scene } from "@/domain/schemas";
import type { PromptEditorContext, PromptEditorResult } from "../../services";

const {
  mockGeneratePromptWithAI,
  mockBuildDefaultPrompt,
} = vi.hoisted(() => ({
  mockGeneratePromptWithAI: vi.fn(),
  mockBuildDefaultPrompt: vi.fn(),
}));

vi.mock("../../services", () => ({
  generatePromptWithAI: mockGeneratePromptWithAI,
  buildDefaultPrompt: mockBuildDefaultPrompt,
}));

import { usePromptEditor } from "../use-prompt-editor";
import type { UsePromptEditorOptions } from "../use-prompt-editor";

function makeBeat(overrides: Partial<StoryBeat> = {}): StoryBeat {
  return {
    id: "beat-1",
    sequence: 1,
    description: "A cat walking in the garden",
    duration: 5,
    characters: [],
    elementIds: [],
    characterIds: [],
    title: "Test Beat",
    content: "A cat walking in the garden",
    ...overrides,
  } as StoryBeat;
}

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: "char-1",
    name: "Test Character",
    appearance: "Orange cat",
    style: "Cartoon",
    ...overrides,
  } as Character;
}

function makeScene(overrides: Partial<Scene> = {}): Scene {
  return {
    id: "scene-1",
    name: "Garden",
    description: "A beautiful garden",
    mood: "Peaceful",
    lighting: "Natural daylight",
    ...overrides,
  } as Scene;
}

function buildOptions(overrides: Partial<UsePromptEditorOptions> = {}): UsePromptEditorOptions {
  return {
    beat: makeBeat(),
    context: "keyframe" as PromptEditorContext,
    ...overrides,
  };
}

describe("usePromptEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBuildDefaultPrompt.mockReturnValue("default prompt from builder");
  });

  describe("initial state", () => {
    it("should initialize with default prompt from buildDefaultPrompt", () => {
      mockBuildDefaultPrompt.mockReturnValue("a beautiful garden scene");

      const { result } = renderHook(() => usePromptEditor(buildOptions()));

      expect(result.current.prompt).toBe("a beautiful garden scene");
      expect(result.current.isGenerating).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.lastAIResult).toBeNull();
      expect(result.current.hasAIPreview).toBe(false);
    });

    it("should use beat.imageGenerationPrompt for keyframe context", () => {
      const beat = makeBeat({ imageGenerationPrompt: "existing keyframe prompt" });

      const { result } = renderHook(() => usePromptEditor(
        buildOptions({ beat, context: "keyframe" }),
      ));

      expect(result.current.prompt).toBe("existing keyframe prompt");
      expect(mockBuildDefaultPrompt).not.toHaveBeenCalled();
    });

    it("should use beat.firstFramePrompt for firstFrame context", () => {
      const beat = makeBeat({ firstFramePrompt: "existing first frame prompt" });

      const { result } = renderHook(() => usePromptEditor(
        buildOptions({ beat, context: "firstFrame" }),
      ));

      expect(result.current.prompt).toBe("existing first frame prompt");
      expect(mockBuildDefaultPrompt).not.toHaveBeenCalled();
    });

    it("should use beat.lastFramePrompt for lastFrame context", () => {
      const beat = makeBeat({ lastFramePrompt: "existing last frame prompt" });

      const { result } = renderHook(() => usePromptEditor(
        buildOptions({ beat, context: "lastFrame" }),
      ));

      expect(result.current.prompt).toBe("existing last frame prompt");
      expect(mockBuildDefaultPrompt).not.toHaveBeenCalled();
    });

    it("should fall back to buildDefaultPrompt when context prompt is empty", () => {
      const beat = makeBeat({ imageGenerationPrompt: undefined });
      mockBuildDefaultPrompt.mockReturnValue("fallback prompt");

      const { result } = renderHook(() => usePromptEditor(
        buildOptions({ beat, context: "keyframe" }),
      ));

      expect(result.current.prompt).toBe("fallback prompt");
      expect(mockBuildDefaultPrompt).toHaveBeenCalled();
    });
  });

  describe("setPrompt", () => {
    it("should update prompt and clear error", () => {
      const { result } = renderHook(() => usePromptEditor(buildOptions()));

      act(() => {
        result.current.setPrompt("new prompt");
      });

      expect(result.current.prompt).toBe("new prompt");
      expect(result.current.error).toBeNull();
    });

    it("should reset hasAIPreview when prompt is manually changed", () => {
      const { result } = renderHook(() => usePromptEditor(buildOptions()));

      act(() => {
        result.current.setPrompt("manual edit");
      });

      expect(result.current.hasAIPreview).toBe(false);
    });

    it("should call onPromptChange callback", () => {
      const onPromptChange = vi.fn();
      const { result } = renderHook(() => usePromptEditor(
        buildOptions({ onPromptChange, context: "keyframe" }),
      ));

      act(() => {
        result.current.setPrompt("edited prompt");
      });

      expect(onPromptChange).toHaveBeenCalledWith("keyframe", "edited prompt");
    });
  });

  describe("resetToDefault", () => {
    it("should reset prompt to default from buildDefaultPrompt", () => {
      mockBuildDefaultPrompt.mockReturnValue("reset default prompt");

      const { result } = renderHook(() => usePromptEditor(buildOptions()));

      act(() => {
        result.current.setPrompt("modified prompt");
      });

      expect(result.current.prompt).toBe("modified prompt");

      act(() => {
        result.current.resetToDefault();
      });

      expect(result.current.prompt).toBe("reset default prompt");
    });

    it("should call onPromptChange via setPrompt", () => {
      const onPromptChange = vi.fn();
      mockBuildDefaultPrompt.mockReturnValue("reset default");

      const { result } = renderHook(() => usePromptEditor(
        buildOptions({ onPromptChange, context: "keyframe" }),
      ));

      act(() => {
        result.current.resetToDefault();
      });

      expect(onPromptChange).toHaveBeenCalledWith("keyframe", "reset default");
    });
  });

  describe("generateWithAI", () => {
    it("should generate prompt successfully", async () => {
      const aiResult: PromptEditorResult = {
        prompt: "AI generated prompt",
        context: "keyframe",
      };
      mockGeneratePromptWithAI.mockResolvedValue({ ok: true, value: aiResult });

      const { result } = renderHook(() => usePromptEditor(buildOptions()));

      let generatedPrompt: string | null = null;
      await act(async () => {
        generatedPrompt = await result.current.generateWithAI();
      });

      expect(generatedPrompt).toBe("AI generated prompt");
      expect(result.current.prompt).toBe("AI generated prompt");
      expect(result.current.isGenerating).toBe(false);
      expect(result.current.lastAIResult).toEqual(aiResult);
      expect(result.current.hasAIPreview).toBe(true);
      expect(result.current.error).toBeNull();
    });

    it("should set isGenerating to true during generation", async () => {
      let resolveGeneration: (value: unknown) => void;
      const generationPromise = new Promise((resolve) => { resolveGeneration = resolve; });
      mockGeneratePromptWithAI.mockReturnValue(generationPromise as Promise<never>);

      const { result } = renderHook(() => usePromptEditor(buildOptions()));

      act(() => {
        result.current.generateWithAI();
      });

      expect(result.current.isGenerating).toBe(true);

      resolveGeneration!({ ok: true, value: { prompt: "done", context: "keyframe" } });
      await vi.waitFor(() => {
        expect(result.current.isGenerating).toBe(false);
      });
    });

    it("should handle AI generation failure with error message", async () => {
      mockGeneratePromptWithAI.mockResolvedValue({
        ok: false,
        error: new Error("AI service unavailable"),
      });

      const { result } = renderHook(() => usePromptEditor(buildOptions()));

      let generatedPrompt: string | null = "not-null";
      await act(async () => {
        generatedPrompt = await result.current.generateWithAI();
      });

      expect(generatedPrompt).toBeNull();
      expect(result.current.isGenerating).toBe(false);
      expect(result.current.error).toBe("AI service unavailable");
      expect(result.current.hasAIPreview).toBe(false);
    });

    it("should handle AI generation failure without error message", async () => {
      mockGeneratePromptWithAI.mockResolvedValue({
        ok: false,
        error: undefined,
      });

      const { result } = renderHook(() => usePromptEditor(buildOptions()));

      await act(async () => {
        await result.current.generateWithAI();
      });

      expect(result.current.error).toBe("AI生成失败");
    });

    it("should pass userMessage to generatePromptWithAI", async () => {
      mockGeneratePromptWithAI.mockResolvedValue({
        ok: true,
        value: { prompt: "result", context: "keyframe" },
      });

      const { result } = renderHook(() => usePromptEditor(buildOptions()));

      await act(async () => {
        await result.current.generateWithAI("Make it more dramatic");
      });

      expect(mockGeneratePromptWithAI).toHaveBeenCalledWith(
        expect.objectContaining({ userMessage: "Make it more dramatic" }),
        expect.any(Object),
      );
    });

    it("should pass providerId and modelId to generatePromptWithAI", async () => {
      mockGeneratePromptWithAI.mockResolvedValue({
        ok: true,
        value: { prompt: "result", context: "keyframe" },
      });

      const { result } = renderHook(() => usePromptEditor(
        buildOptions({ providerId: "provider-1", modelId: "model-1" }),
      ));

      await act(async () => {
        await result.current.generateWithAI();
      });

      expect(mockGeneratePromptWithAI).toHaveBeenCalledWith(
        expect.any(Object),
        { providerId: "provider-1", modelId: "model-1" },
      );
    });

    it("should pass characters and scenes to generatePromptWithAI", async () => {
      const characters = [makeCharacter()];
      const scenes = [makeScene()];
      mockGeneratePromptWithAI.mockResolvedValue({
        ok: true,
        value: { prompt: "result", context: "keyframe" },
      });

      const { result } = renderHook(() => usePromptEditor(
        buildOptions({ characters, scenes }),
      ));

      await act(async () => {
        await result.current.generateWithAI();
      });

      expect(mockGeneratePromptWithAI).toHaveBeenCalledWith(
        expect.objectContaining({ characters, scenes }),
        expect.any(Object),
      );
    });

    it("should clear error on new generation attempt", async () => {
      mockGeneratePromptWithAI.mockResolvedValueOnce({
        ok: false,
        error: new Error("First failure"),
      });

      const { result } = renderHook(() => usePromptEditor(buildOptions()));

      await act(async () => {
        await result.current.generateWithAI();
      });

      expect(result.current.error).toBe("First failure");

      mockGeneratePromptWithAI.mockResolvedValueOnce({
        ok: true,
        value: { prompt: "success prompt", context: "keyframe" },
      });

      await act(async () => {
        await result.current.generateWithAI();
      });

      expect(result.current.error).toBeNull();
      expect(result.current.prompt).toBe("success prompt");
    });
  });

  describe("confirmAIPrompt", () => {
    it("should set hasAIPreview to false", async () => {
      mockGeneratePromptWithAI.mockResolvedValue({
        ok: true,
        value: { prompt: "AI prompt", context: "keyframe" },
      });

      const { result } = renderHook(() => usePromptEditor(buildOptions()));

      await act(async () => {
        await result.current.generateWithAI();
      });

      expect(result.current.hasAIPreview).toBe(true);

      act(() => {
        result.current.confirmAIPrompt();
      });

      expect(result.current.hasAIPreview).toBe(false);
    });

    it("should call onPromptChange with current prompt", async () => {
      const onPromptChange = vi.fn();
      mockGeneratePromptWithAI.mockResolvedValue({
        ok: true,
        value: { prompt: "AI prompt", context: "keyframe" },
      });

      const { result } = renderHook(() => usePromptEditor(
        buildOptions({ onPromptChange, context: "keyframe" }),
      ));

      await act(async () => {
        await result.current.generateWithAI();
      });

      act(() => {
        result.current.confirmAIPrompt();
      });

      expect(onPromptChange).toHaveBeenCalledWith("keyframe", "AI prompt");
    });

    it("should preserve prompt text after confirmation", async () => {
      mockGeneratePromptWithAI.mockResolvedValue({
        ok: true,
        value: { prompt: "confirmed prompt", context: "keyframe" },
      });

      const { result } = renderHook(() => usePromptEditor(buildOptions()));

      await act(async () => {
        await result.current.generateWithAI();
      });

      act(() => {
        result.current.confirmAIPrompt();
      });

      expect(result.current.prompt).toBe("confirmed prompt");
    });
  });

  describe("confirmAndGenerate", () => {
    it("should call onConfirmGenerate with context and prompt", async () => {
      const onConfirmGenerate = vi.fn();
      mockGeneratePromptWithAI.mockResolvedValue({
        ok: true,
        value: { prompt: "AI prompt for generation", context: "keyframe" },
      });

      const { result } = renderHook(() => usePromptEditor(
        buildOptions({ onConfirmGenerate, context: "keyframe" }),
      ));

      await act(async () => {
        await result.current.generateWithAI();
      });

      act(() => {
        result.current.confirmAndGenerate();
      });

      expect(onConfirmGenerate).toHaveBeenCalledWith("keyframe", "AI prompt for generation");
    });

    it("should not call onConfirmGenerate when callback is not provided", () => {
      const { result } = renderHook(() => usePromptEditor(buildOptions()));

      act(() => {
        result.current.confirmAndGenerate();
      });

    });
  });

  describe("discardAIPrompt", () => {
    it("should revert prompt to initial prompt", async () => {
      const beat = makeBeat({ imageGenerationPrompt: "original prompt" });
      mockGeneratePromptWithAI.mockResolvedValue({
        ok: true,
        value: { prompt: "AI prompt to discard", context: "keyframe" },
      });

      const { result } = renderHook(() => usePromptEditor(
        buildOptions({ beat, context: "keyframe" }),
      ));

      await act(async () => {
        await result.current.generateWithAI();
      });

      expect(result.current.prompt).toBe("AI prompt to discard");

      act(() => {
        result.current.discardAIPrompt();
      });

      expect(result.current.prompt).toBe("original prompt");
    });

    it("should clear hasAIPreview and lastAIResult", async () => {
      mockGeneratePromptWithAI.mockResolvedValue({
        ok: true,
        value: { prompt: "AI prompt", context: "keyframe" },
      });

      const { result } = renderHook(() => usePromptEditor(buildOptions()));

      await act(async () => {
        await result.current.generateWithAI();
      });

      expect(result.current.hasAIPreview).toBe(true);
      expect(result.current.lastAIResult).not.toBeNull();

      act(() => {
        result.current.discardAIPrompt();
      });

      expect(result.current.hasAIPreview).toBe(false);
      expect(result.current.lastAIResult).toBeNull();
    });

    it("should use buildDefaultPrompt when no existing context prompt", async () => {
      const beat = makeBeat({ imageGenerationPrompt: undefined });
      mockBuildDefaultPrompt.mockReturnValue("rebuilt default");
      mockGeneratePromptWithAI.mockResolvedValue({
        ok: true,
        value: { prompt: "AI prompt", context: "keyframe" },
      });

      const { result } = renderHook(() => usePromptEditor(
        buildOptions({ beat, context: "keyframe" }),
      ));

      await act(async () => {
        await result.current.generateWithAI();
      });

      act(() => {
        result.current.discardAIPrompt();
      });

      expect(result.current.prompt).toBe("rebuilt default");
    });
  });

  describe("clearError", () => {
    it("should clear error state", async () => {
      mockGeneratePromptWithAI.mockResolvedValue({
        ok: false,
        error: new Error("Some error"),
      });

      const { result } = renderHook(() => usePromptEditor(buildOptions()));

      await act(async () => {
        await result.current.generateWithAI();
      });

      expect(result.current.error).toBe("Some error");

      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe("edge cases", () => {
    it("should handle empty characters and scenes arrays", () => {
      const { result } = renderHook(() => usePromptEditor(
        buildOptions({ characters: [], scenes: [] }),
      ));

      expect(result.current.prompt).toBeDefined();
    });

    it("should handle undefined characters and scenes", () => {
      const { result } = renderHook(() => usePromptEditor(
        buildOptions({ characters: undefined, scenes: undefined }),
      ));

      expect(result.current.prompt).toBeDefined();
    });

    it("should handle keyframeImageUrl option", async () => {
      mockGeneratePromptWithAI.mockResolvedValue({
        ok: true,
        value: { prompt: "result", context: "keyframe" },
      });

      const { result } = renderHook(() => usePromptEditor(
        buildOptions({ keyframeImageUrl: "https://example.com/keyframe.jpg" }),
      ));

      await act(async () => {
        await result.current.generateWithAI();
      });

      expect(mockGeneratePromptWithAI).toHaveBeenCalledWith(
        expect.objectContaining({
          keyframeImageUrl: "https://example.com/keyframe.jpg",
        }),
        expect.any(Object),
      );
    });
  });
});
