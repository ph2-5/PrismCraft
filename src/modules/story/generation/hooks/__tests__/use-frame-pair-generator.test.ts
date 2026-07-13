import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { StoryBeat } from "@/domain/schemas";
import { useFramePairGenerator } from "../use-frame-pair-generator";

vi.mock("@/modules/story", () => ({
  generateBeatFramePair: vi.fn().mockResolvedValue({
    firstFrameUrl: "https://cdn.com/ff.jpg",
    lastFrameUrl: "https://cdn.com/lf.jpg",
  }),
}));

vi.mock("@/modules/shot/consistency-check", () => ({
  checkVisualConsistency: vi.fn().mockResolvedValue({
    ok: true,
    value: { passed: true, overallScore: 0.9, characterScores: [] },
  }),
}));

vi.mock("@/domain/services", () => ({
  StoryGenerationService: {
    resolveGenerationContext: vi.fn().mockReturnValue({
      characterRefs: [],
      sceneRef: undefined,
      prevLastFrameUrl: undefined,
    }),
  },
}));

vi.mock("@/infrastructure/di", () => ({
  container: {
    elementStorage: { getAllElements: vi.fn().mockResolvedValue([]) },
  },
}));

vi.mock("@/shared/error-handler", () => ({
  handleError: vi.fn((e: unknown) => e instanceof Error ? e : new Error(String(e))),
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: { warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/shared/constants", () => ({
  t: vi.fn((key: string) => key),
}));

vi.mock("../use-ai-generator-base", () => ({
  useAIGeneratorBase: () => ({
    findBeat: vi.fn((id: string) => beats.find((b) => b.id === id)),
    resolvePrevBeat: vi.fn(() => null),
    checkModelConfig: vi.fn(() => true),
    withGenerationState: vi.fn((_id: string, fn: Function) => fn({ aborted: false })),
    updateBeat: vi.fn(),
  }),
}));

const mockSuccess = vi.fn();
const mockShowError = vi.fn();
const mockSetBeats = vi.fn();

let beats: StoryBeat[];

function createProps(overrides = {}) {
  return {
    beatsRef: { current: beats },
    charactersRef: { current: [] },
    scenesRef: { current: [] },
    selectedImageModel: { providerId: "p1", modelId: "m1", providerName: "Test Provider", modelName: "Test Model" },
    setBeats: mockSetBeats,
    success: mockSuccess,
    showError: mockShowError,
    ...overrides,
  };
}

describe("useFramePairGenerator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    beats = [
      {
        id: "beat-1",
        title: "Beat 1",
        content: "Content",
        sequence: 0,
        description: "",
        characterIds: [],
        elementIds: [],
        keyframe: { imageUrl: "https://cdn.com/kf.jpg", prompt: "" },
      },
    ];
  });

  it("shows error when beat has no keyframe", async () => {
    beats = [{ id: "beat-1", sequence: 0, description: "", characterIds: [], elementIds: [], title: "Beat 1", content: "Content" }];
    const { result } = renderHook(() => useFramePairGenerator(createProps()));
    await act(async () => {
      await result.current.generateFramePair("beat-1");
    });
    expect(mockShowError).toHaveBeenCalled();
  });

  it("generates frame pair when keyframe exists", async () => {
    const { result } = renderHook(() => useFramePairGenerator(createProps()));
    await act(async () => {
      await result.current.generateFramePair("beat-1");
    });
    expect(mockSuccess).toHaveBeenCalled();
  });

  it("uses getFirstFrameUrl for consistency check", async () => {
    beats = [
      {
        id: "beat-1",
        title: "Beat 1",
        content: "Content",
        sequence: 0,
        description: "",
        characterIds: [],
        elementIds: [],
        keyframe: { imageUrl: "https://cdn.com/kf.jpg", prompt: "" },
      },
    ];
    const { result } = renderHook(() => useFramePairGenerator(createProps()));
    await act(async () => {
      await result.current.generateFramePair("beat-1");
    });

    const { checkVisualConsistency } = await import("@/modules/shot/consistency-check");
    const callArgs = vi.mocked(checkVisualConsistency).mock.calls[0]?.[0];
    expect(callArgs?.generatedImageUrl).toBe("https://cdn.com/ff.jpg");
  });

  it("logs warning when consistency check fails", async () => {
    const { checkVisualConsistency } = await import("@/modules/shot/consistency-check");
    vi.mocked(checkVisualConsistency).mockResolvedValueOnce({
      ok: true,
      value: { passed: false, overallScore: 0.3, characterScores: [], recommendation: "adjust" as const },
    });

    const { result } = renderHook(() => useFramePairGenerator(createProps()));
    await act(async () => {
      await result.current.generateFramePair("beat-1");
    });

    const { errorLogger } = await import("@/shared/error-logger");
    expect(errorLogger.warn).toHaveBeenCalled();
  });

  it("catches consistency check errors gracefully", async () => {
    const { checkVisualConsistency } = await import("@/modules/shot/consistency-check");
    vi.mocked(checkVisualConsistency).mockRejectedValueOnce(new Error("vision API failed"));

    const { result } = renderHook(() => useFramePairGenerator(createProps()));
    await act(async () => {
      await result.current.generateFramePair("beat-1");
    });

    const { errorLogger } = await import("@/shared/error-logger");
    expect(errorLogger.warn).toHaveBeenCalled();
    expect(mockSuccess).toHaveBeenCalled();
  });
});
