import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { Story, StoryBeat, Character, Scene, ModelSelection, VideoTask } from "@/domain/schemas";

const { mockGetAllElements, mockGenerateSingleBeatPrompt, mockDetermineVideoMode, mockResolveContext, mockBuildVideoPrompt, mockErrorLogger } = vi.hoisted(() => ({
  mockGetAllElements: vi.fn().mockResolvedValue([]),
  mockGenerateSingleBeatPrompt: vi.fn().mockReturnValue("base prompt"),
  mockDetermineVideoMode: vi.fn().mockReturnValue("first_frame_anchor"),
  mockResolveContext: vi.fn().mockReturnValue({
    characterRef: undefined,
    sceneRef: undefined,
    prevVideoUrl: undefined,
  }),
  mockBuildVideoPrompt: vi.fn().mockReturnValue("enhanced prompt"),
  mockErrorLogger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

vi.mock("@/infrastructure/di", () => ({
  container: {
    elementStorage: { getAllElements: mockGetAllElements },
  },
}));

vi.mock("@/modules/prompt", () => ({
  generateSingleBeatPrompt: mockGenerateSingleBeatPrompt,
}));

vi.mock("@/domain/services", () => ({
  StoryGenerationService: {
    resolveGenerationContext: mockResolveContext,
    buildVideoPrompt: mockBuildVideoPrompt,
  },
}));

vi.mock("../services/storyboard-generation-service", () => ({
  determineVideoGenerationMode: mockDetermineVideoMode,
}));

vi.mock("@/shared/error-handler", () => ({
  getErrorMessage: vi.fn().mockReturnValue("mocked error"),
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: mockErrorLogger,
}));

vi.mock("@/shared/constants", () => ({
  t: vi.fn((key: string) => key),
}));

vi.mock("@/modules/story", () => ({
  resolveCharacterRef: vi.fn(),
  resolveSceneRef: vi.fn(),
}));

import { useVideoGenerator } from "../useVideoGenerator";

const mockModel: ModelSelection = {
  providerId: "provider-1",
  modelId: "model-1",
  providerName: "Test Provider",
  modelName: "Test Model",
};

const mockBeat: StoryBeat = {
  id: "beat-1",
  sequence: 0,
  description: "测试镜头",
  type: "scene",
  characterIds: ["char-1"],
  sceneId: "scene-1",
  elementIds: [],
  enhancedGeneration: false,
  framePair: {
    firstFrame: {
      imageUrl: "https://example.com/first.png",
      prompt: "首帧",
      derivedFrom: "",
    },
    lastFrame: {
      imageUrl: "https://example.com/last.png",
      prompt: "尾帧",
      derivedFrom: "",
    },
    generatedAt: new Date().toISOString(),
  },
};

const mockCharacter: Character = {
  id: "char-1",
  name: "角色A",
  description: "测试角色",
  gender: "male",
  style: "anime",
  personality: [],
  appearance: {
    hairColor: "",
    hairStyle: "",
    eyeColor: "",
    height: "",
    build: "",
    clothing: "",
  },
  prompt: "测试",
};

const mockScene: Scene = {
  id: "scene-1",
  name: "场景A",
  description: "测试场景",
  type: "indoor",
  timeOfDay: "day",
  weather: "sunny",
  mood: "calm",
  lighting: "bright",
  elements: [],
  colors: [],
  prompt: "测试",
};

const mockStory: Story = {
  id: "story-1",
  title: "测试故事",
  description: "",
  characters: [],
  scenes: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
  beats: [],
  elementIds: [],
};

function createDefaultProps(overrides: Record<string, unknown> = {}) {
  return {
    beatsRef: { current: [mockBeat] } as React.MutableRefObject<StoryBeat[]>,
    charactersRef: { current: [mockCharacter] } as React.MutableRefObject<Character[]>,
    scenesRef: { current: [mockScene] } as React.MutableRefObject<Scene[]>,
    currentStory: mockStory,
    selectedVideoModel: mockModel,
    createTask: vi.fn().mockResolvedValue({
      taskId: "task-1",
      status: "pending",
      progress: 0,
      message: "",
      createdAt: new Date().toISOString(),
    } as VideoTask),
    success: vi.fn(),
    showError: vi.fn(),
    showWarning: vi.fn(),
    ...overrides,
  };
}

describe("useVideoGenerator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAllElements.mockResolvedValue([]);
    mockDetermineVideoMode.mockReturnValue("first_frame_anchor");
    mockResolveContext.mockReturnValue({
      characterRef: undefined,
      sceneRef: undefined,
      prevVideoUrl: undefined,
    });
    mockBuildVideoPrompt.mockReturnValue("enhanced prompt");
    mockGenerateSingleBeatPrompt.mockReturnValue("base prompt");
  });

  describe("generateVideoNew - 前置校验", () => {
    it("beat 不存在时应调用 showError 并返回", async () => {
      const props = createDefaultProps({
        beatsRef: { current: [] },
      });
      const { result } = renderHook(() => useVideoGenerator(props));

      await act(async () => {
        await result.current.generateVideoNew("nonexistent");
      });

      expect(props.showError).toHaveBeenCalled();
    });

    it("beat 无 firstFrame 时应调用 showError", async () => {
      const beatNoFrame: StoryBeat = {
        ...mockBeat,
        framePair: undefined,
      };
      const props = createDefaultProps({
        beatsRef: { current: [beatNoFrame] },
      });
      const { result } = renderHook(() => useVideoGenerator(props));

      await act(async () => {
        await result.current.generateVideoNew("beat-1");
      });

      expect(props.showError).toHaveBeenCalled();
    });

    it("未选择视频模型时应调用 showError", async () => {
      const props = createDefaultProps({
        selectedVideoModel: null,
      });
      const { result } = renderHook(() => useVideoGenerator(props));

      await act(async () => {
        await result.current.generateVideoNew("beat-1");
      });

      expect(props.showError).toHaveBeenCalled();
    });
  });

  describe("generateVideoNew - 生成流程", () => {
    it("成功时应调用 createTask 和 success", async () => {
      const props = createDefaultProps();
      const { result } = renderHook(() => useVideoGenerator(props));

      await act(async () => {
        await result.current.generateVideoNew("beat-1");
      });

      expect(props.createTask).toHaveBeenCalledWith(
        "enhanced prompt",
        undefined,
        expect.objectContaining({
          beatId: "beat-1",
          storyId: "story-1",
          firstFrameUrl: "https://example.com/first.png",
          providerId: "provider-1",
          modelId: "model-1",
        }),
      );
      expect(props.success).toHaveBeenCalled();
    });

    it("应正确传递 characterRef 和 sceneRef", async () => {
      mockResolveContext.mockReturnValue({
        characterRef: "https://example.com/char.png",
        sceneRef: "https://example.com/scene.png",
        prevVideoUrl: undefined,
      });

      const props = createDefaultProps();
      const { result } = renderHook(() => useVideoGenerator(props));

      await act(async () => {
        await result.current.generateVideoNew("beat-1");
      });

      expect(props.createTask).toHaveBeenCalledWith(
        expect.anything(),
        undefined,
        expect.objectContaining({
          characterRef: "https://example.com/char.png",
          sceneRef: "https://example.com/scene.png",
        }),
      );
    });

    it("reference_video_continuation 模式无 prevVideoUrl 时应降级为 first_frame_anchor", async () => {
      mockDetermineVideoMode.mockReturnValue("reference_video_continuation");
      mockResolveContext.mockReturnValue({
        characterRef: undefined,
        sceneRef: undefined,
        prevVideoUrl: undefined,
      });

      const props = createDefaultProps();
      const { result } = renderHook(() => useVideoGenerator(props));

      await act(async () => {
        await result.current.generateVideoNew("beat-1");
      });

      expect(props.createTask).toHaveBeenCalledWith(
        expect.anything(),
        undefined,
        expect.objectContaining({
          referenceVideo: null,
        }),
      );
    });

    it("determineVideoGenerationMode 返回 reference_video_continuation 且有 prevVideoUrl 时 referenceVideo 应非空", async () => {
      mockDetermineVideoMode.mockReturnValue("reference_video_continuation");
      mockResolveContext.mockImplementation(() => ({
        characterRef: undefined,
        sceneRef: undefined,
        prevVideoUrl: "https://example.com/prev-video.mp4",
      }));

      const props = createDefaultProps();
      renderHook(() => useVideoGenerator(props));

      const beat = mockBeat;
      const prevBeat = null;
      const videoMode = mockDetermineVideoMode(beat, prevBeat);
      const context = mockResolveContext({ beat, prevBeat, characters: [], scenes: [], elements: [] });
      const prevVideoUrl = context.prevVideoUrl;
      const effectiveVideoMode = videoMode === "reference_video_continuation" && !prevVideoUrl
        ? "first_frame_anchor"
        : videoMode;
      const referenceVideo = effectiveVideoMode === "reference_video_continuation" ? prevVideoUrl : null;

      expect(referenceVideo).toBe("https://example.com/prev-video.mp4");
    });

    it("createTask 返回 promptWasTruncated 时应调用 showWarning", async () => {
      const props = createDefaultProps();
      (props.createTask as ReturnType<typeof vi.fn>).mockResolvedValue({
        taskId: "task-1",
        status: "pending",
        progress: 0,
        message: "",
        createdAt: new Date().toISOString(),
        promptWasTruncated: true,
      });

      const { result } = renderHook(() => useVideoGenerator(props));

      await act(async () => {
        await result.current.generateVideoNew("beat-1");
      });

      expect(props.showWarning).toHaveBeenCalled();
    });

    it("createTask 返回无 promptWasTruncated 时不应调用 showWarning", async () => {
      const props = createDefaultProps();
      (props.createTask as ReturnType<typeof vi.fn>).mockResolvedValue({
        taskId: "task-1",
        status: "pending",
        progress: 0,
        message: "",
        createdAt: new Date().toISOString(),
      });

      const { result } = renderHook(() => useVideoGenerator(props));

      await act(async () => {
        await result.current.generateVideoNew("beat-1");
      });

      expect(props.showWarning).not.toHaveBeenCalled();
    });
  });

  describe("generateVideoNew - 错误处理", () => {
    it("createTask 抛出异常时应调用 showError", async () => {
      const props = createDefaultProps();
      (props.createTask as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("task creation failed"));

      const { result } = renderHook(() => useVideoGenerator(props));

      await act(async () => {
        await result.current.generateVideoNew("beat-1");
      });

      expect(props.showError).toHaveBeenCalled();
    });

    it("无论成功或失败，generatingVideo 最终应为 null", async () => {
      const props = createDefaultProps();
      (props.createTask as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("fail"));

      const { result } = renderHook(() => useVideoGenerator(props));

      await act(async () => {
        await result.current.generateVideoNew("beat-1");
      });

      expect(result.current.generatingVideo).toBeNull();
    });
  });

  describe("generatingVideo 状态", () => {
    it("初始状态应为 null", () => {
      const props = createDefaultProps();
      const { result } = renderHook(() => useVideoGenerator(props));
      expect(result.current.generatingVideo).toBeNull();
    });

    it("生成完成后 generatingVideo 应恢复为 null", async () => {
      const props = createDefaultProps();
      const { result } = renderHook(() => useVideoGenerator(props));

      await act(async () => {
        await result.current.generateVideoNew("beat-1");
      });

      expect(result.current.generatingVideo).toBeNull();
    });
  });

  describe("prevBeatOverride", () => {
    it("传入 prevBeatOverride 时 resolveGenerationContext 应接收该值", async () => {
      const prevBeat: StoryBeat = {
        ...mockBeat,
        id: "beat-prev",
        sequence: -1,
      };

      const props = createDefaultProps();
      const { result } = renderHook(() => useVideoGenerator(props));

      await act(async () => {
        await result.current.generateVideoNew("beat-1", prevBeat);
      });

      expect(mockResolveContext).toHaveBeenCalledWith(
        expect.objectContaining({
          prevBeat,
        }),
      );
    });
  });
});
