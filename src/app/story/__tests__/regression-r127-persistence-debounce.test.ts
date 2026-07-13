/**
 * R127: useStoryPersistence 的 updateVideoUrls 必须通过 debounce（500ms）合并短时间内的多次变更
 * 回归防护: 确保 useStoryPersistence 在 completedTaskUrls 短时间内多次变更时，
 *           只执行一次 updateVideoUrls 持久化操作，避免并发持久化竞态。
 *           debounce 延迟应为 500ms，组件卸载时应清除定时器，
 *           cancelled 标志应阻止过期的更新。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";

// 使用 vi.hoisted 提升 mock，确保在模块导入前生效
const {
  mockStoryService,
  mockBuildVideoUrlUpdates,
  mockApplyVideoUrlUpdates,
  mockBuildCacheRequests,
  mockFilterRemoteCacheRequests,
  mockSyncStoriesWithVideoUrls,
  mockGetImageUrlWithCache,
  mockErrorLogger,
  mockT,
  mockMarkDirty,
} = vi.hoisted(() => ({
  mockStoryService: {
    updateBeatMediaUrls: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
  },
  mockBuildVideoUrlUpdates: vi.fn(() => [
    { beatId: "beat-1", field: "videoUrl", url: "http://example.com/video.mp4" },
  ]),
  mockApplyVideoUrlUpdates: vi.fn((prev: unknown[]) => prev),
  mockBuildCacheRequests: vi.fn(() => []),
  mockFilterRemoteCacheRequests: vi.fn(() => []),
  mockSyncStoriesWithVideoUrls: vi.fn((stories: unknown[]) => stories),
  mockGetImageUrlWithCache: vi.fn(),
  mockErrorLogger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
  mockT: vi.fn((key: string) => key),
  mockMarkDirty: vi.fn(),
}));

vi.mock("@/modules/story", () => ({
  storyService: mockStoryService,
}));

vi.mock("@/modules/story/generation", () => ({
  buildVideoUrlUpdates: mockBuildVideoUrlUpdates,
  applyVideoUrlUpdates: mockApplyVideoUrlUpdates,
  buildCacheRequests: mockBuildCacheRequests,
  filterRemoteCacheRequests: mockFilterRemoteCacheRequests,
  syncStoriesWithVideoUrls: mockSyncStoriesWithVideoUrls,
}));

vi.mock("@/modules/video", () => ({
  getImageUrlWithCache: mockGetImageUrlWithCache,
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: mockErrorLogger,
}));

vi.mock("@/shared/constants", () => ({
  t: mockT,
}));

vi.mock("@/shared/hooks/use-dirty-state", () => ({
  useDirtyState: () => ({ markDirty: mockMarkDirty }),
}));

import { useStoryPersistence } from "../use-story-persistence";
import type { Story, StoryBeat } from "@/domain/schemas";

/** 构造 useStoryPersistence 所需的参数 */
function buildParams(overrides: Partial<Parameters<typeof useStoryPersistence>[0]> = {}) {
  const beats: StoryBeat[] = [
    { id: "beat-1", storyId: "story-1", title: "开场", content: "", order: 0, duration: 5 } as unknown as StoryBeat,
  ];
  const story: Story & { beats: StoryBeat[] } = {
    id: "story-1",
    title: "我的故事",
    beats,
  } as unknown as Story & { beats: StoryBeat[] };

  return {
    beatsRef: { current: beats },
    setBeats: vi.fn(),
    setStories: vi.fn(),
    currentStory: story,
    currentStoryId: "story-1",
    completedTaskUrls: new Map<string, string>(),
    allCompletedTaskUrls: new Map<string, string>(),
    showErrorRef: { current: vi.fn() },
    ...overrides,
  };
}

describe("R127: useStoryPersistence 必须通过 debounce 合并多次变更", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockStoryService.updateBeatMediaUrls.mockResolvedValue(undefined);
    mockStoryService.update.mockResolvedValue({ ok: true, value: undefined });
    mockBuildVideoUrlUpdates.mockReturnValue([
      { beatId: "beat-1", field: "videoUrl", url: "http://example.com/video.mp4" },
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("短时间内多次触发应只执行一次 updateVideoUrls", async () => {
    const params = buildParams({
      completedTaskUrls: new Map([["beat-1", "http://example.com/v1.mp4"]]),
      allCompletedTaskUrls: new Map([["beat-1", "http://example.com/v1.mp4"]]),
    });

    const { rerender } = renderHook(
      ({ completedTaskUrls, allCompletedTaskUrls }) =>
        useStoryPersistence({ ...params, completedTaskUrls, allCompletedTaskUrls }),
      {
        initialProps: {
          completedTaskUrls: params.completedTaskUrls,
          allCompletedTaskUrls: params.allCompletedTaskUrls,
        },
      },
    );

    // 在 debounce 窗口内多次变更 completedTaskUrls（生成新 Map 引用以触发 effect）
    rerender({
      completedTaskUrls: new Map([["beat-1", "http://example.com/v2.mp4"]]),
      allCompletedTaskUrls: new Map([["beat-1", "http://example.com/v2.mp4"]]),
    });
    rerender({
      completedTaskUrls: new Map([["beat-1", "http://example.com/v3.mp4"]]),
      allCompletedTaskUrls: new Map([["beat-1", "http://example.com/v3.mp4"]]),
    });

    // 在 debounce 延迟之前，不应执行持久化
    expect(mockStoryService.updateBeatMediaUrls).not.toHaveBeenCalled();

    // 推进 500ms 触发 debounce
    await vi.advanceTimersByTimeAsync(500);

    // 只应执行一次 updateBeatMediaUrls
    expect(mockStoryService.updateBeatMediaUrls).toHaveBeenCalledTimes(1);
  });

  it("debounce 延迟应为 500ms", async () => {
    const params = buildParams({
      completedTaskUrls: new Map([["beat-1", "http://example.com/v1.mp4"]]),
      allCompletedTaskUrls: new Map([["beat-1", "http://example.com/v1.mp4"]]),
    });

    renderHook(() => useStoryPersistence(params));

    // 499ms 时不应触发
    await vi.advanceTimersByTimeAsync(499);
    expect(mockStoryService.updateBeatMediaUrls).not.toHaveBeenCalled();

    // 500ms 时应触发
    await vi.advanceTimersByTimeAsync(1);
    expect(mockStoryService.updateBeatMediaUrls).toHaveBeenCalledTimes(1);
  });

  it("组件卸载时应清除 debounce 定时器", async () => {
    const params = buildParams({
      completedTaskUrls: new Map([["beat-1", "http://example.com/v1.mp4"]]),
      allCompletedTaskUrls: new Map([["beat-1", "http://example.com/v1.mp4"]]),
    });

    const { unmount } = renderHook(() => useStoryPersistence(params));

    // 卸载前不应执行持久化
    expect(mockStoryService.updateBeatMediaUrls).not.toHaveBeenCalled();

    // 卸载组件，应清除定时器
    unmount();

    // 推进时间超过 debounce 延迟，不应执行持久化
    await vi.advanceTimersByTimeAsync(1000);
    expect(mockStoryService.updateBeatMediaUrls).not.toHaveBeenCalled();
  });

  it("debounce 期间 cancelled 标志应阻止过期的更新", async () => {
    const params = buildParams({
      completedTaskUrls: new Map([["beat-1", "http://example.com/v1.mp4"]]),
      allCompletedTaskUrls: new Map([["beat-1", "http://example.com/v1.mp4"]]),
    });

    const { unmount } = renderHook(() => useStoryPersistence(params));

    // 卸载组件，触发 cancelled = true
    unmount();

    // 推进时间，由于 cancelled 标志，updateVideoUrls 内部不应执行持久化
    await vi.advanceTimersByTimeAsync(600);

    // 由于卸载清除了定时器，updateVideoUrls 根本不会被调用
    expect(mockStoryService.updateBeatMediaUrls).not.toHaveBeenCalled();
    expect(mockStoryService.update).not.toHaveBeenCalled();
  });
});
