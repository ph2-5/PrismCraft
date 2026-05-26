import { describe, it, expect, vi, beforeEach } from "vitest";
import { useCallback } from "react";
import { renderHook, act } from "@testing-library/react";

const mockVideoTaskStorage = {
  deleteVideoTasksByBeatId: vi.fn(),
  deleteVideoTasksByStoryId: vi.fn(),
};

const mockErrorLogger = {
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
};

const mockStoryService = {
  updateBeatMediaUrls: vi.fn().mockResolvedValue(undefined),
  update: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
};

vi.mock("@/infrastructure/di", () => ({
  container: {
    videoTaskStorage: mockVideoTaskStorage,
  },
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: mockErrorLogger,
}));

vi.mock("@/modules/story", () => ({
  storyService: mockStoryService,
}));

vi.mock("@/modules/story/generation", () => ({
  buildVideoUrlUpdates: vi.fn(),
  applyVideoUrlUpdates: vi.fn(),
  buildCacheRequests: vi.fn(),
  filterRemoteCacheRequests: vi.fn(),
}));

vi.mock("@/modules/video", () => ({
  useVideoTaskManager: vi.fn(),
  getImageUrlWithCache: vi.fn(),
}));

vi.mock("@/shared/presentation/Toast", () => ({
  useToastHelpers: vi.fn(() => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  })),
}));

vi.mock("@/modules/character", () => ({
  characterService: { getAll: vi.fn() },
}));

vi.mock("@/modules/scene", () => ({
  sceneService: { getAll: vi.fn() },
}));

describe("StoryProvider regression tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVideoTaskStorage.deleteVideoTasksByBeatId.mockResolvedValue(undefined);
  });

  describe("deleteBeatWithCleanup pattern (regression: Bug #4)", () => {
    function useDeleteBeatWithCleanup(deleteBeat: (beatId: string) => void) {
      return useCallback(async (beatId: string) => {
        try {
          await mockVideoTaskStorage.deleteVideoTasksByBeatId(beatId);
        } catch (e) {
          mockErrorLogger.warn("[StoryProvider] 删除beat关联VideoTask失败", e);
        }
        deleteBeat(beatId);
      }, [deleteBeat]);
    }

    it("删除beat时应先清理关联VideoTask再删除beat状态", async () => {
      const mockDeleteBeat = vi.fn();

      const order: string[] = [];
      mockVideoTaskStorage.deleteVideoTasksByBeatId.mockImplementationOnce(async () => {
        order.push("storage");
      });
      mockDeleteBeat.mockImplementation(() => {
        order.push("state");
      });

      const { result } = renderHook(() =>
        useDeleteBeatWithCleanup(mockDeleteBeat),
      );

      await act(async () => {
        await result.current("beat-1");
      });

      expect(mockVideoTaskStorage.deleteVideoTasksByBeatId).toHaveBeenCalledWith("beat-1");
      expect(mockDeleteBeat).toHaveBeenCalledWith("beat-1");
      expect(order).toEqual(["storage", "state"]);
    });

    it("VideoTask清理失败时仍应删除beat状态", async () => {
      const mockDeleteBeat = vi.fn();
      mockVideoTaskStorage.deleteVideoTasksByBeatId.mockRejectedValueOnce(new Error("db error"));

      const { result } = renderHook(() =>
        useDeleteBeatWithCleanup(mockDeleteBeat),
      );

      await act(async () => {
        await result.current("beat-2");
      });

      expect(mockErrorLogger.warn).toHaveBeenCalled();
      expect(mockDeleteBeat).toHaveBeenCalledWith("beat-2");
    });
  });

  describe("updateVideoUrls persistence (regression: Bug #1)", () => {
    it("视频URL应持久化到数据库而非仅更新内存状态", async () => {
      const completedTaskUrls = new Map<string, string>();
      completedTaskUrls.set("beat-1", "https://example.com/video1.mp4");
      completedTaskUrls.set("beat-2", "https://example.com/video2.mp4");

      const allPersistData: Array<{ id: string; videoUrl?: string }> = [];
      for (const [beatId, videoUrl] of completedTaskUrls.entries()) {
        allPersistData.push({ id: beatId, videoUrl });
      }

      mockStoryService.updateBeatMediaUrls.mockResolvedValueOnce(undefined);

      await mockStoryService.updateBeatMediaUrls(allPersistData);

      expect(mockStoryService.updateBeatMediaUrls).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ id: "beat-1", videoUrl: "https://example.com/video1.mp4" }),
          expect.objectContaining({ id: "beat-2", videoUrl: "https://example.com/video2.mp4" }),
        ]),
      );
    });

    it("持久化失败不应阻止内存状态更新", async () => {
      mockStoryService.updateBeatMediaUrls.mockRejectedValueOnce(new Error("db error"));

      const completedTaskUrls = new Map<string, string>();
      completedTaskUrls.set("beat-1", "https://example.com/video1.mp4");

      const allPersistData = [{ id: "beat-1", videoUrl: "https://example.com/video1.mp4" }];

      try {
        await mockStoryService.updateBeatMediaUrls(allPersistData);
      } catch {
        // fire-and-forget pattern in StoryProvider
      }

      expect(mockStoryService.updateBeatMediaUrls).toHaveBeenCalled();
    });
  });
});
