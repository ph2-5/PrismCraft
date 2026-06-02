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

vi.mock("@/modules/story", () => ({
  storyService: mockStoryService,
  restoreVersion: vi.fn(),
  formatVersionTime: vi.fn(),
  getRecommendedTemplates: vi.fn().mockReturnValue([]),
  applyTemplate: vi.fn(),
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

vi.mock("@/domain/types/result", () => ({
  fromAsyncThrowable: (fn: () => Promise<unknown>) => {
    return fn().then(
      (value) => ({ ok: true as const, value }),
      (error) => ({ ok: false as const, error }),
    );
  },
}));

import { useStorySaver } from "@/modules/story/planning/hooks/useStorySaver";

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
    setStories: vi.fn() as unknown as React.Dispatch<React.SetStateAction<Story[]>>,
    currentStory: story,
    setCurrentStory: vi.fn(),
    beats: [] as StoryBeat[],
    setBeats: vi.fn() as unknown as React.Dispatch<React.SetStateAction<StoryBeat[]>>,
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
});
