import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { Story, StoryBeat } from "@/domain/schemas";

const { mockVideoTaskStorage, mockStoryService, mockErrorLogger } = vi.hoisted(() => {
  const storage = {
    deleteVideoTasksByBeatId: vi.fn(),
    deleteVideoTasksByStoryId: vi.fn(),
  };
  const service = {
    updateBeatMediaUrls: vi.fn(),
    update: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
    delete: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
    getAll: vi.fn().mockResolvedValue({ ok: true, value: [] }),
    create: vi.fn(),
  };
  const logger = {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  };
  return { mockVideoTaskStorage: storage, mockStoryService: service, mockErrorLogger: logger };
});

vi.mock("@/infrastructure/di", () => ({
  container: {
    videoTaskStorage: mockVideoTaskStorage,
  },
}));

vi.mock("@/modules/storyboard", () => ({
  storyService: mockStoryService,
  restoreVersion: vi.fn(),
  formatVersionTime: vi.fn(),
  getRecommendedTemplates: vi.fn().mockReturnValue([]),
  applyTemplate: vi.fn(),
  DEFAULT_STORY: {
    id: "",
    title: "",
    description: "",
    genre: "drama",
    tone: "neutral",
    beats: [],
    characters: [],
    scenes: [],
    elementIds: [],
    createdAt: expect.any(Number),
    updatedAt: expect.any(Number),
  },
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: mockErrorLogger,
  extractErrorMessage: vi.fn((e: unknown) => e instanceof Error ? e.message : String(e)),
}));

vi.mock("@/shared/presentation/Toast", () => ({
  useToastHelpers: vi.fn(() => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  })),
}));

vi.mock("@/shared/utils/user-facing-error", () => ({
  mapUserFacingError: vi.fn((e: unknown) => e instanceof Error ? e.message : String(e)),
}));

vi.mock("@/shared/constants", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/constants")>();
  return {
    ...actual,
    t: vi.fn((key: string) => key),
  };
});

vi.mock("@/domain/types/result", () => ({
  fromAsyncThrowable: (fn: () => Promise<unknown>) => {
    return fn().then(
      (value) => ({ ok: true as const, value }),
      (error) => ({ ok: false as const, error }),
    );
  },
  ok: <T>(value: T) => ({ ok: true as const, value }),
  err: (error: unknown) => ({ ok: false as const, error }),
  AppError: class AppError extends Error {
    constructor(public readonly code: string, message: string, _cause?: unknown) {
      super(message);
      this.name = "AppError";
    }
  },
}));

import { useStorySaver } from "@/modules/storyboard/planning";

function createDefaultProps() {
  const story: Story = {
    id: "story-1",
    title: "Test Story",
    description: "",
    genre: "drama",
    tone: "neutral",
    beats: [],
    characters: [],
    scenes: [],
    elementIds: [],
    createdAt: Math.floor(Date.now() / 1000),
    updatedAt: Math.floor(Date.now() / 1000),
  };

  return {
    stories: [story],
    setStories: vi.fn<React.Dispatch<React.SetStateAction<Story[]>>>(),
    currentStory: story,
    setCurrentStory: vi.fn(),
    beats: [] as StoryBeat[],
    setBeats: vi.fn<React.Dispatch<React.SetStateAction<StoryBeat[]>>>(),
    markClean: vi.fn(),
    markDirty: vi.fn(),
  };
}

describe("useStorySaver regression tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStoryService.delete.mockResolvedValue({ ok: true, value: undefined });
    mockVideoTaskStorage.deleteVideoTasksByStoryId.mockResolvedValue(undefined);
  });

  describe("performDeleteStory (regression: Bug #8)", () => {
    it("删除故事时应先清理关联VideoTask再删除故事数据", async () => {
      const props = createDefaultProps();
      const { result } = renderHook(() => useStorySaver(props));

      act(() => {
        result.current.handleDeleteStory("story-1");
      });

      const order: string[] = [];
      mockVideoTaskStorage.deleteVideoTasksByStoryId.mockImplementationOnce(async () => {
        order.push("videoTaskCleanup");
      });
      mockStoryService.delete.mockImplementationOnce(async () => {
        order.push("storyDelete");
        return { ok: true, value: undefined };
      });

      await act(async () => {
        await result.current.performDeleteStory();
      });

      expect(mockVideoTaskStorage.deleteVideoTasksByStoryId).toHaveBeenCalledWith("story-1");
      expect(mockStoryService.delete).toHaveBeenCalledWith("story-1");
      expect(order).toEqual(["videoTaskCleanup", "storyDelete"]);
    });

    it("VideoTask清理失败时仍应继续删除故事", async () => {
      const props = createDefaultProps();
      const { result } = renderHook(() => useStorySaver(props));

      act(() => {
        result.current.handleDeleteStory("story-1");
      });

      mockVideoTaskStorage.deleteVideoTasksByStoryId.mockRejectedValueOnce(new Error("db error"));

      await act(async () => {
        await result.current.performDeleteStory();
      });

      expect(mockErrorLogger.warn).toHaveBeenCalled();
      expect(mockStoryService.delete).toHaveBeenCalledWith("story-1");
    });

    it("故事删除失败时不应从状态中移除故事", async () => {
      const props = createDefaultProps();
      const mockSetStories = vi.fn();
      props.setStories = mockSetStories;

      const { result } = renderHook(() => useStorySaver(props));

      act(() => {
        result.current.handleDeleteStory("story-1");
      });

      mockStoryService.delete.mockRejectedValueOnce(new Error("db error"));

      await act(async () => {
        await result.current.performDeleteStory();
      });

      expect(mockSetStories).not.toHaveBeenCalled();
    });
  });

  describe("handleSave", () => {
    function createBeat(overrides: Partial<StoryBeat> = {}): StoryBeat {
      return {
        id: "beat-1",
        sequence: 0,
        description: "A test beat",
        duration: 5,
        elementIds: [],
        characterIds: [],
        ...overrides,
      };
    }

    function createPropsWithBeats(overrides: { storyId?: string; beats?: StoryBeat[] } = {}) {
      const props = createDefaultProps();
      const story: Story = {
        ...props.currentStory,
        id: overrides.storyId ?? "story-1",
      };
      props.currentStory = story;
      props.stories = [story];
      props.beats = overrides.beats ?? [createBeat()];
      return props;
    }

    describe("基本保存流程", () => {
      it("handleSave 更新已有故事时应调用 storyService.update 并更新状态", async () => {
        const props = createPropsWithBeats({ storyId: "story-1" });
        const mockSetStories = vi.fn();
        props.setStories = mockSetStories;
        const mockSetCurrentStory = vi.fn();
        props.setCurrentStory = mockSetCurrentStory;
        const mockMarkClean = vi.fn();
        props.markClean = mockMarkClean;

        mockStoryService.update.mockResolvedValue({ ok: true, value: undefined });

        const { result } = renderHook(() => useStorySaver(props));

        await act(async () => {
          await result.current.handleSave();
        });

        expect(mockStoryService.update).toHaveBeenCalled();
        expect(mockSetStories).toHaveBeenCalled();
        expect(mockMarkClean).toHaveBeenCalledWith("story");
        expect(result.current.saveStatus).toBe("saved");
      });

      it("handleSave 创建新故事时应调用 storyService.create 并用返回的 ID 更新状态", async () => {
        const props = createPropsWithBeats({ storyId: "" });
        const mockSetCurrentStory = vi.fn();
        props.setCurrentStory = mockSetCurrentStory;

        mockStoryService.create.mockResolvedValue({ ok: true, value: { id: "new-story-id", title: "未命名分镜" } });
        mockStoryService.getAll.mockResolvedValue({ ok: true, value: [] });

        const { result } = renderHook(() => useStorySaver(props));

        await act(async () => {
          await result.current.handleSave();
        });

        expect(mockStoryService.create).toHaveBeenCalled();
        expect(mockSetCurrentStory).toHaveBeenCalledWith(
          expect.objectContaining({ id: "new-story-id" }),
          true,
        );
      });

      it("handleSave beats 为空时应显示错误不调用 service", async () => {
        const props = createPropsWithBeats({ beats: [] });

        const { result } = renderHook(() => useStorySaver(props));

        await act(async () => {
          await result.current.handleSave();
        });

        expect(mockStoryService.update).not.toHaveBeenCalled();
        expect(mockStoryService.create).not.toHaveBeenCalled();
      });
    });

    describe("字段组合保存测试", () => {
      it("handleSave 应正确传递包含所有文本字段的 beat", async () => {
        const beat = createBeat({
          title: "标题",
          content: "内容",
          description: "描述",
          characterIds: ["角色A"],
          sceneId: "场景B",
          imageGenerationPrompt: "图片生成提示词",
          firstFramePrompt: "首帧提示词",
          lastFramePrompt: "尾帧提示词",
          transition: "转场效果",
        });
        const props = createPropsWithBeats({ beats: [beat] });

        mockStoryService.update.mockResolvedValue({ ok: true, value: undefined });

        const { result } = renderHook(() => useStorySaver(props));

        await act(async () => {
          await result.current.handleSave();
        });

        const updateCall = mockStoryService.update.mock.calls[0]!;
        const savedBeats = updateCall[1]!.beats;
        expect(savedBeats[0]).toMatchObject({
          title: "标题",
          content: "内容",
          description: "描述",
          characterIds: ["角色A"],
          sceneId: "场景B",
          imageGenerationPrompt: "图片生成提示词",
          firstFramePrompt: "首帧提示词",
          lastFramePrompt: "尾帧提示词",
          transition: "转场效果",
        });
      });

      it("handleSave 应正确传递只有必填字段的 beat", async () => {
        const beat = createBeat({
          id: "beat-min",
          sequence: 1,
          description: "最小beat",
          duration: 3,
        });
        const props = createPropsWithBeats({ beats: [beat] });

        mockStoryService.update.mockResolvedValue({ ok: true, value: undefined });

        const { result } = renderHook(() => useStorySaver(props));

        await act(async () => {
          await result.current.handleSave();
        });

        expect(mockStoryService.update).toHaveBeenCalled();
        expect(result.current.saveStatus).toBe("saved");
      });

      it("handleSave 应正确传递部分字段为空的 beat", async () => {
        const beat = createBeat({
          title: "有标题",
          content: "有内容",
          imageUrl: undefined,
        });
        const props = createPropsWithBeats({ beats: [beat] });

        mockStoryService.update.mockResolvedValue({ ok: true, value: undefined });

        const { result } = renderHook(() => useStorySaver(props));

        await act(async () => {
          await result.current.handleSave();
        });

        expect(mockStoryService.update).toHaveBeenCalled();
        expect(result.current.saveStatus).toBe("saved");
      });
    });

    describe("图片/视频字段保存测试", () => {
      it("handleSave 应正确传递包含图片上传字段的 beat", async () => {
        const beat = createBeat({
          uploadedKeyframe: "data:image/png;base64,xxx",
          uploadedFramePair: { firstFrame: "url1", lastFrame: "url2" },
          imageUrl: "https://example.com/img.jpg",
        });
        const props = createPropsWithBeats({ beats: [beat] });

        mockStoryService.update.mockResolvedValue({ ok: true, value: undefined });

        const { result } = renderHook(() => useStorySaver(props));

        await act(async () => {
          await result.current.handleSave();
        });

        const updateCall = mockStoryService.update.mock.calls[0]!;
        const savedBeats = updateCall[1]!.beats;
        expect(savedBeats[0]).toMatchObject({
          uploadedKeyframe: "data:image/png;base64,xxx",
          uploadedFramePair: { firstFrame: "url1", lastFrame: "url2" },
          imageUrl: "https://example.com/img.jpg",
        });
      });

      it("handleSave 应正确传递包含视频字段的 beat", async () => {
        const beat = createBeat({
          videoGen: {
            videoUrl: "https://example.com/video.mp4",
            taskId: "task-1",
            status: "completed",
          },
          uploadedVideo: "local-path",
          videoReferenceUrl: "https://example.com/ref.mp4",
        });
        const props = createPropsWithBeats({ beats: [beat] });

        mockStoryService.update.mockResolvedValue({ ok: true, value: undefined });

        const { result } = renderHook(() => useStorySaver(props));

        await act(async () => {
          await result.current.handleSave();
        });

        const updateCall = mockStoryService.update.mock.calls[0]!;
        const savedBeats = updateCall[1]!.beats;
        expect(savedBeats[0]).toMatchObject({
          videoGen: {
            videoUrl: "https://example.com/video.mp4",
            taskId: "task-1",
            status: "completed",
          },
          uploadedVideo: "local-path",
          videoReferenceUrl: "https://example.com/ref.mp4",
        });
      });

      it("handleSave 应正确传递包含 keyframe/framePair 生成结果的 beat", async () => {
        const beat = createBeat({
          keyframe: {
            imageUrl: "url",
            prompt: "prompt",
            generatedAt: "1234",
          },
          framePair: {
            firstFrame: { imageUrl: "url1", prompt: "p1", derivedFrom: "beat-0" },
            lastFrame: { imageUrl: "url2", prompt: "p2", derivedFrom: "beat-0" },
            generatedAt: "1234",
          },
        });
        const props = createPropsWithBeats({ beats: [beat] });

        mockStoryService.update.mockResolvedValue({ ok: true, value: undefined });

        const { result } = renderHook(() => useStorySaver(props));

        await act(async () => {
          await result.current.handleSave();
        });

        expect(mockStoryService.update).toHaveBeenCalled();
        expect(result.current.saveStatus).toBe("saved");
      });

      it("handleSave 应正确传递混合图片和视频状态的 beat", async () => {
        const beat = createBeat({
          keyframe: { imageUrl: "url", prompt: "prompt" },
          uploadedKeyframe: "data:image/png;base64,mixed",
        });
        const props = createPropsWithBeats({ beats: [beat] });

        mockStoryService.update.mockResolvedValue({ ok: true, value: undefined });

        const { result } = renderHook(() => useStorySaver(props));

        await act(async () => {
          await result.current.handleSave();
        });

        expect(mockStoryService.update).toHaveBeenCalled();
        expect(result.current.saveStatus).toBe("saved");
      });
    });

    describe("保存失败场景", () => {
      it("handleSave 保存失败时应标记脏状态并显示错误", async () => {
        const props = createPropsWithBeats();
        const mockMarkDirty = vi.fn();
        props.markDirty = mockMarkDirty;

        mockStoryService.update.mockRejectedValue(new Error("DB error"));

        const { result } = renderHook(() => useStorySaver(props));

        await act(async () => {
          await result.current.handleSave();
        });

        expect(mockMarkDirty).toHaveBeenCalledWith("story");
        expect(result.current.saveStatus).toBe("error");
      });

      it("handleSave 保存失败时不应更新 stories 状态", async () => {
        const props = createPropsWithBeats();
        const mockSetStories = vi.fn();
        props.setStories = mockSetStories;

        mockStoryService.update.mockRejectedValue(new Error("DB error"));

        const { result } = renderHook(() => useStorySaver(props));

        await act(async () => {
          await result.current.handleSave();
        });

        expect(mockSetStories).not.toHaveBeenCalled();
      });

      it("handleSave 并发保存时应跳过第二次", async () => {
        const props = createPropsWithBeats();

        let resolveFirst!: (value: unknown) => void;
        mockStoryService.update.mockImplementation(
          () => new Promise((resolve) => { resolveFirst = resolve; }),
        );

        const { result } = renderHook(() => useStorySaver(props));

        act(() => {
          result.current.handleSave();
        });

        await act(async () => {
          result.current.handleSave();
        });

        expect(mockStoryService.update).toHaveBeenCalledTimes(1);

        await act(async () => {
          resolveFirst({ ok: true, value: undefined });
        });
      });
    });
  });
});
