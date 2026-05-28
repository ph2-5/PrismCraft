import { describe, it, expect, vi, beforeEach } from "vitest";
import { expectOk, expectErr } from "@/__tests__/utils/result-helpers";
import { AppError, NotFoundError, ValidationError } from "@/domain/types";
import { DomainEvents } from "@/shared/event-types";
import type { Story } from "@/domain/schemas";

const mockSafeTransaction = vi.fn().mockResolvedValue(undefined);

vi.mock("@/infrastructure/di", () => ({
  container: {
    storyStorage: {
      getStories: vi.fn(),
      getStoryById: vi.fn(),
      getStoryByBeatId: vi.fn(),
      createStory: vi.fn(),
      updateStory: vi.fn(),
      deleteStory: vi.fn(),
    },
    eventBus: { emit: vi.fn() },
  },
}));

vi.mock("@/shared/db-core", () => ({
  safeTransaction: (...args: any[]) => mockSafeTransaction(...(args as [any])),
}));

vi.mock("@/modules/story/template", () => ({
  saveVersion: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: { warn: vi.fn(), error: vi.fn() },
}));

import { storyService } from "../story-service";
import { container } from "@/infrastructure/di";
import { saveVersion } from "@/modules/story/template";

const storage = container.storyStorage as unknown as {
  getStories: ReturnType<typeof vi.fn>;
  getStoryById: ReturnType<typeof vi.fn>;
  getStoryByBeatId: ReturnType<typeof vi.fn>;
  createStory: ReturnType<typeof vi.fn>;
  updateStory: ReturnType<typeof vi.fn>;
  deleteStory: ReturnType<typeof vi.fn>;
};

const eventBus = container.eventBus as unknown as {
  emit: ReturnType<typeof vi.fn>;
};

const mockStory: Story = {
  id: "story-1",
  title: "测试故事",
  description: "测试描述",
  characters: [],
  scenes: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
  beats: [],
  elementIds: [],
};

const validCreateInput = {
  title: "新故事",
  description: "新故事描述",
  characters: [] as string[],
  scenes: [] as string[],
  beats: [] as any[],
  elementIds: [] as string[],
};

describe("storyService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (crypto as any).randomUUID = (crypto as any).randomUUID || (() => "mock-uuid-12345678");
  });

  describe("getAll", () => {
    it("应返回所有故事", async () => {
      const stories = [mockStory, { ...mockStory, id: "story-2" }];
      storage.getStories.mockResolvedValue(stories);

      const result = await storyService.getAll();

      expectOk(result);
      expect(result.value).toHaveLength(2);
    });

    it("存储失败时应返回 AppError", async () => {
      storage.getStories.mockRejectedValue(new Error("DB locked"));

      const result = await storyService.getAll();

      expectErr(result);
      expect(result.error).toBeInstanceOf(AppError);
    });
  });

  describe("getById", () => {
    it("应返回指定故事", async () => {
      storage.getStoryById.mockResolvedValue(mockStory);

      const result = await storyService.getById("story-1");

      expectOk(result);
      expect(result.value.id).toBe("story-1");
    });

    it("故事不存在时应返回 NotFoundError", async () => {
      storage.getStoryById.mockResolvedValue(null);

      const result = await storyService.getById("nonexistent");

      expectErr(result);
      expect(result.error).toBeInstanceOf(NotFoundError);
    });

    it("存储异常时应返回 AppError", async () => {
      storage.getStoryById.mockRejectedValue(new Error("DB error"));

      const result = await storyService.getById("story-1");

      expectErr(result);
      expect(result.error).toBeInstanceOf(AppError);
    });
  });

  describe("create", () => {
    it("应成功创建故事并触发 STORY_CREATED 事件", async () => {
      storage.createStory.mockResolvedValue(undefined);
      storage.getStoryById.mockResolvedValue({ ...mockStory, title: "新故事" });

      const result = await storyService.create(validCreateInput);

      expectOk(result);
      expect(result.value.title).toBe("新故事");
      expect(storage.createStory).toHaveBeenCalled();
      expect(eventBus.emit).toHaveBeenCalledWith(
        DomainEvents.STORY_CREATED,
        expect.objectContaining({ storyTitle: "新故事" }),
      );
    });

    it("无效输入时应返回 ValidationError", async () => {
      const result = await storyService.create({
        ...validCreateInput,
        title: "",
      });

      expectErr(result);
      expect(result.error).toBeInstanceOf(ValidationError);
      expect(storage.createStory).not.toHaveBeenCalled();
    });

    it("创建后读取失败时应返回 NotFoundError", async () => {
      storage.createStory.mockResolvedValue(undefined);
      storage.getStoryById.mockResolvedValue(null);

      const result = await storyService.create(validCreateInput);

      expectErr(result);
      expect(result.error).toBeInstanceOf(NotFoundError);
    });

    it("存储失败时应返回 AppError", async () => {
      storage.createStory.mockRejectedValue(new Error("写入失败"));

      const result = await storyService.create(validCreateInput);

      expectErr(result);
      expect(result.error).toBeInstanceOf(AppError);
    });
  });

  describe("update", () => {
    it("应成功更新故事并触发 STORY_UPDATED 事件", async () => {
      storage.updateStory.mockResolvedValue(undefined);

      const result = await storyService.update("story-1", { id: "story-1", title: "更新标题" });

      expectOk(result);
      expect(storage.updateStory).toHaveBeenCalledWith(
        "story-1",
        expect.objectContaining({ title: "更新标题" }),
      );
      expect(eventBus.emit).toHaveBeenCalledWith(
        DomainEvents.STORY_UPDATED,
        expect.objectContaining({ id: "story-1", storyTitle: "更新标题" }),
      );
    });

    it("故事不存在时 updateStory 应抛出错误", async () => {
      storage.updateStory.mockRejectedValue(new Error("Story not found for update: id=\"nonexistent\""));

      const result = await storyService.update("nonexistent", { id: "nonexistent", title: "更新标题" });

      expectErr(result);
      expect(result.error).toBeInstanceOf(AppError);
    });

    it("存储失败时应返回 AppError", async () => {
      storage.updateStory.mockRejectedValue(new Error("更新失败"));

      const result = await storyService.update("story-1", { id: "story-1", title: "更新标题" });

      expectErr(result);
      expect(result.error).toBeInstanceOf(AppError);
    });
  });

  describe("delete", () => {
    it("应成功删除故事并触发 STORY_DELETED 事件", async () => {
      storage.getStoryById.mockResolvedValue(mockStory);
      storage.deleteStory.mockResolvedValue(undefined);

      const result = await storyService.delete("story-1");

      expectOk(result);
      expect(storage.deleteStory).toHaveBeenCalledWith("story-1");
      expect(eventBus.emit).toHaveBeenCalledWith(
        DomainEvents.STORY_DELETED,
        expect.objectContaining({ id: "story-1", storyTitle: "测试故事" }),
      );
    });

    it("删除前应调用 saveVersion 进行备份", async () => {
      storage.getStoryById.mockResolvedValue(mockStory);
      storage.deleteStory.mockResolvedValue(undefined);

      await storyService.delete("story-1");

      expect(saveVersion).toHaveBeenCalledWith(
        mockStory,
        mockStory.beats,
        "删除前的备份",
        false,
      );
    });

    it("故事不存在时应返回 NotFoundError", async () => {
      storage.getStoryById.mockResolvedValue(null);

      const result = await storyService.delete("nonexistent");

      expectErr(result);
      expect(result.error).toBeInstanceOf(NotFoundError);
      expect(storage.deleteStory).not.toHaveBeenCalled();
    });

    it("存储失败时应返回 AppError", async () => {
      storage.getStoryById.mockResolvedValue(mockStory);
      storage.deleteStory.mockRejectedValue(new Error("删除失败"));

      const result = await storyService.delete("story-1");

      expectErr(result);
      expect(result.error).toBeInstanceOf(AppError);
    });
  });

  describe("count", () => {
    it("应返回故事数量", async () => {
      storage.getStories.mockResolvedValue([mockStory, mockStory, mockStory]);

      const result = await storyService.count();

      expectOk(result);
      expect(result.value).toBe(3);
    });

    it("没有故事时应返回 0", async () => {
      storage.getStories.mockResolvedValue([]);

      const result = await storyService.count();

      expectOk(result);
      expect(result.value).toBe(0);
    });

    it("存储失败时应返回 AppError", async () => {
      storage.getStories.mockRejectedValue(new Error("DB error"));

      const result = await storyService.count();

      expectErr(result);
      expect(result.error).toBeInstanceOf(AppError);
    });
  });

  describe("getByBeatId", () => {
    it("应通过 beatId 找到对应故事", async () => {
      storage.getStoryByBeatId.mockResolvedValue(mockStory);

      const result = await storyService.getByBeatId("beat-1");

      expectOk(result);
      expect(result.value.id).toBe("story-1");
    });

    it("beat 不存在时应返回 NotFoundError", async () => {
      storage.getStoryByBeatId.mockResolvedValue(null);

      const result = await storyService.getByBeatId("nonexistent");

      expectErr(result);
      expect(result.error).toBeInstanceOf(NotFoundError);
    });

    it("存储异常时应返回 AppError", async () => {
      storage.getStoryByBeatId.mockRejectedValue(new Error("DB error"));

      const result = await storyService.getByBeatId("beat-1");

      expectErr(result);
      expect(result.error).toBeInstanceOf(AppError);
    });
  });

  describe("updateBeatMediaUrls", () => {
    beforeEach(() => {
      mockSafeTransaction.mockResolvedValue(undefined);
    });

    it("应更新 keyframe imageUrl", async () => {
      await storyService.updateBeatMediaUrls([
        { id: "beat-1", keyframeImageUrl: "new-keyframe.jpg" },
      ]);

      expect(mockSafeTransaction).toHaveBeenCalled();
      const statements = mockSafeTransaction.mock.calls[0][0] as { sql: string; params: unknown[] }[];
      expect(statements[0].sql).toContain("keyframeImageUrl");
      expect(statements[0].params).toContain("new-keyframe.jpg");
    });

    it("应更新 firstFrame 和 lastFrame imageUrl", async () => {
      await storyService.updateBeatMediaUrls([
        {
          id: "beat-1",
          firstFrameImageUrl: "new-first.jpg",
          lastFrameImageUrl: "new-last.jpg",
        },
      ]);

      expect(mockSafeTransaction).toHaveBeenCalled();
      const statements = mockSafeTransaction.mock.calls[0][0] as { sql: string; params: unknown[] }[];
      expect(statements[0].sql).toContain("firstFrameUrl");
      expect(statements[0].sql).toContain("lastFrameUrl");
      expect(statements[0].params).toContain("new-first.jpg");
      expect(statements[0].params).toContain("new-last.jpg");
    });

    it("应更新 videoUrl", async () => {
      await storyService.updateBeatMediaUrls([
        { id: "beat-1", videoUrl: "new-video.mp4" },
      ]);

      expect(mockSafeTransaction).toHaveBeenCalled();
      const statements = mockSafeTransaction.mock.calls[0][0] as { sql: string; params: unknown[] }[];
      expect(statements[0].sql).toContain("videoUrl");
      expect(statements[0].params).toContain("new-video.mp4");
    });

    it("beat 不存在时 UPDATE 影响 0 行，不报错", async () => {
      await storyService.updateBeatMediaUrls([
        { id: "nonexistent", keyframeImageUrl: "new.jpg" },
      ]);

      expect(mockSafeTransaction).toHaveBeenCalled();
    });

    it("safeTransaction 失败时不应抛出错误", async () => {
      mockSafeTransaction.mockRejectedValue(new Error("Transaction failed"));

      await expect(
        storyService.updateBeatMediaUrls([
          { id: "beat-1", keyframeImageUrl: "new.jpg" },
        ]),
      ).resolves.toBeUndefined();
    });
  });
});
