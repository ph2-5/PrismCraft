import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { StoryBeat } from "@/domain/schemas";
import { useVideoGenerator } from "../use-video-generator";

vi.mock("@/modules/prompt", () => ({
  generateSingleBeatPrompt: vi.fn().mockReturnValue("base prompt"),
}));

vi.mock("@/domain/services", () => ({
  StoryGenerationService: {
    resolveGenerationContext: vi.fn().mockReturnValue({
      characterRefs: [],
      sceneRef: undefined,
      prevVideoUrl: undefined,
    }),
    buildVideoPrompt: vi.fn().mockReturnValue("enhanced prompt"),
  },
}));

vi.mock("@/infrastructure/di", () => ({
  container: {
    elementStorage: { getAllElements: vi.fn().mockResolvedValue([]) },
  },
}));

vi.mock("@/shared/model-capabilities", () => ({
  getEffectiveVideoParams: vi.fn().mockImplementation((params: {
    modelId: string;
    prompt: string;
    firstFrameUrl?: string;
    lastFrameUrl?: string;
    characterRefs?: string[];
    sceneRef?: string;
  }) => ({
    modelId: params.modelId,
    prompt: params.prompt,
    firstFrameUrl: params.firstFrameUrl,
    lastFrameUrl: params.lastFrameUrl,
    characterRefs: params.characterRefs,
    sceneRef: params.sceneRef,
    promptLanguage: "auto",
    supportsReferenceVideo: false,
  })),
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
  }),
}));

vi.mock("../services/storyboard-generation-service", () => ({
  determineVideoGenerationMode: vi.fn().mockReturnValue("first_frame_anchor"),
}));

const mockSuccess = vi.fn();
const mockShowError = vi.fn();
const mockCreateTask = vi.fn().mockResolvedValue({ id: "task-1" });

let beats: StoryBeat[];

function createProps(overrides = {}) {
  return {
    beatsRef: { current: beats },
    charactersRef: { current: [] },
    scenesRef: { current: [] },
    currentStory: { id: "story-1", title: "Test", description: "", characters: [], scenes: [], beats: [], createdAt: 0, updatedAt: 0, isDeleted: false, deletedAt: null, version: 1, syncId: "", ownerId: "", elementIds: [] },
    selectedVideoModel: { providerId: "p1", modelId: "m1", providerName: "Test Provider", modelName: "Test Model" },
    createTask: mockCreateTask,
    success: mockSuccess,
    showError: mockShowError,
    ...overrides,
  };
}

describe("useVideoGenerator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    beats = [
      {
        id: "beat-1",
        title: "Beat 1",
        content: "Content",
        sequence: 1,
        description: "",
        characterIds: [],
        elementIds: [],
        framePair: {
          firstFrameUrl: "https://cdn.com/ff.jpg",
          lastFrameUrl: "https://cdn.com/lf.jpg",
        },
      },
    ];
  });

  it("shows error when beat not found", async () => {
    const { result } = renderHook(() => useVideoGenerator(createProps()));
    await act(async () => {
      await result.current.generateVideoNew("non-existent");
    });
    expect(mockShowError).toHaveBeenCalled();
  });

  it("shows error when framePair has no firstFrameUrl or firstFrame.imageUrl", async () => {
    beats = [{ id: "beat-1", title: "Beat 1", content: "Content", sequence: 0, description: "", characterIds: [], elementIds: [], framePair: {} }];
    const { result } = renderHook(() => useVideoGenerator(createProps()));
    await act(async () => {
      await result.current.generateVideoNew("beat-1");
    });
    expect(mockShowError).toHaveBeenCalled();
  });

  it("creates task with firstFrameUrl from top-level field", async () => {
    const { result } = renderHook(() => useVideoGenerator(createProps()));
    await act(async () => {
      await result.current.generateVideoNew("beat-1");
    });
    expect(mockCreateTask).toHaveBeenCalledWith(
      expect.any(String),
      undefined,
      expect.objectContaining({
        firstFrameUrl: "https://cdn.com/ff.jpg",
        lastFrameUrl: "https://cdn.com/lf.jpg",
      }),
    );
  });

  it("creates task with firstFrame.imageUrl fallback when firstFrameUrl is absent", async () => {
    beats = [
      {
        id: "beat-1",
        title: "Beat 1",
        content: "Content",
        sequence: 1,
        description: "",
        characterIds: [],
        elementIds: [],
        framePair: {
          firstFrame: { imageUrl: "https://cdn.com/nested-ff.jpg", prompt: "", derivedFrom: "" },
          lastFrame: { imageUrl: "https://cdn.com/nested-lf.jpg", prompt: "", derivedFrom: "" },
        },
      },
    ];
    const { result } = renderHook(() => useVideoGenerator(createProps()));
    await act(async () => {
      await result.current.generateVideoNew("beat-1");
    });
    expect(mockCreateTask).toHaveBeenCalledWith(
      expect.any(String),
      undefined,
      expect.objectContaining({
        firstFrameUrl: "https://cdn.com/nested-ff.jpg",
        lastFrameUrl: "https://cdn.com/nested-lf.jpg",
      }),
    );
  });

  it("shows error when createTask returns null", async () => {
    mockCreateTask.mockResolvedValueOnce(null);
    const { result } = renderHook(() => useVideoGenerator(createProps()));
    await act(async () => {
      await result.current.generateVideoNew("beat-1");
    });
    expect(mockShowError).toHaveBeenCalled();
  });

  it("calls success when task is created", async () => {
    const { result } = renderHook(() => useVideoGenerator(createProps()));
    await act(async () => {
      await result.current.generateVideoNew("beat-1");
    });
    expect(mockSuccess).toHaveBeenCalled();
  });
});
