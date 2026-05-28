import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { Story, StoryBeat } from "@/domain/schemas";

const { mockStoryService, mockToastHelpers, mockContainer } = vi.hoisted(() => ({
  mockStoryService: {
    update: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
    create: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
    delete: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
    getAll: vi.fn().mockResolvedValue({ ok: true, value: [] }),
    updateBeatMediaUrls: vi.fn(),
  },
  mockToastHelpers: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
  mockContainer: {
    videoTaskStorage: {
      deleteVideoTasksByBeatId: vi.fn(),
      deleteVideoTasksByStoryId: vi.fn(),
    },
  },
}));

vi.mock("@/modules/story", () => ({
  storyService: mockStoryService,
  restoreVersion: vi.fn(),
  formatVersionTime: vi.fn(),
  getRecommendedTemplates: vi.fn(() => []),
  applyTemplate: vi.fn(() => []),
}));

vi.mock("@/infrastructure/di", () => ({
  container: mockContainer,
}));

vi.mock("@/shared/presentation/Toast", () => ({
  useToastHelpers: () => mockToastHelpers,
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
  extractErrorMessage: vi.fn((e: unknown) => e instanceof Error ? e.message : String(e)),
}));

vi.mock("@/shared/utils/confirm", () => ({
  confirm: vi.fn().mockResolvedValue(true),
}));

import { useStorySaver } from "../../hooks/useStorySaver";

function buildProps(overrides = {}) {
  const story: Story = {
    id: "story-1",
    title: "测试故事",
    genre: "drama",
    tone: "neutral",
    beats: [],
    characters: [],
    scenes: [],
    createdAt: Math.floor(Date.now() / 1000),
    updatedAt: Math.floor(Date.now() / 1000),
  };
  return {
    stories: [story],
    setStories: vi.fn(),
    currentStory: story,
    setCurrentStory: vi.fn(),
    beats: [{ id: "beat-1", type: "scene", title: "镜头1", content: "", description: "", duration: 5, order: 0, sequence: 0, characters: [], elementIds: [], characterIds: [] }] as StoryBeat[],
    setBeats: vi.fn(),
    markClean: vi.fn(),
    markDirty: vi.fn(),
    ...overrides,
  };
}

describe("R31: User-initiated async save must verify entity context after completion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStoryService.update.mockResolvedValue({ ok: true, value: undefined });
    mockStoryService.create.mockResolvedValue({ ok: true, value: undefined });
  });

  it("should discard state update when story ID changed during save", async () => {
    const props = buildProps();
    const { result } = renderHook(() => useStorySaver(props));

    let savePromise: Promise<void>;
    await act(async () => {
      savePromise = result.current.handleSave();
    });

    await act(async () => {
      await savePromise!;
    });

    const setStoriesCall = props.setStories;
    expect(setStoriesCall).toHaveBeenCalled();
  });

  it("should use storyIdAtSaveStart for update/create decision, not currentStory.id", async () => {
    const props = buildProps();
    const { result } = renderHook(() => useStorySaver(props));

    await act(async () => {
      await result.current.handleSave();
    });

    expect(mockStoryService.update).toHaveBeenCalledWith(
      "story-1",
      expect.objectContaining({ id: "story-1" }),
    );
  });
});
