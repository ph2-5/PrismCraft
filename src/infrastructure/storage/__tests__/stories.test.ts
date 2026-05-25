import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSafeQuery, mockSafeRun, mockSafeTransaction } = vi.hoisted(() => ({
  mockSafeQuery: vi.fn(),
  mockSafeRun: vi.fn(),
  mockSafeTransaction: vi.fn(),
}));

vi.mock("@/infrastructure/storage/sqlite-core", () => ({
  safeQuery: mockSafeQuery,
  safeRun: mockSafeRun,
  safeTransaction: mockSafeTransaction,
}));

vi.mock(import("@/infrastructure/storage/core"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    parseRecord: vi.fn((r) => r),
    toSqlValue: vi.fn((v) => (v === undefined ? null : v)),
    trackChange: vi.fn(),
    isElectron: vi.fn(() => true),
  };
});

vi.mock("@/shared/error-logger", () => ({
  errorLogger: { warn: vi.fn(), error: vi.fn() },
  extractErrorMessage: vi.fn((e) => (e instanceof Error ? e.message : String(e))),
}));

describe("storage/stories", () => {
  let storyStorage: typeof import("../stories").storyStorage;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockSafeQuery.mockResolvedValue([]);
    mockSafeTransaction.mockResolvedValue([]);
    const mod = await import("../stories");
    storyStorage = mod.storyStorage;
  });

  function mockStoryQuery(storyRow: Record<string, unknown> | null) {
    mockSafeQuery.mockResolvedValueOnce(storyRow ? [storyRow] : []);
  }

  function mockRelations(opts: {
    characters?: Record<string, unknown>[];
    scenes?: Record<string, unknown>[];
    beats?: Record<string, unknown>[];
    elements?: Record<string, unknown>[];
  }) {
    mockSafeQuery
      .mockResolvedValueOnce(opts.characters ?? [])
      .mockResolvedValueOnce(opts.scenes ?? [])
      .mockResolvedValueOnce(opts.beats ?? [])
      .mockResolvedValueOnce(opts.elements ?? []);
  }

  describe("getStoryById beat 条件构造 - camera", () => {
    it("有 camera 容器时应构造 camera 对象", async () => {
      mockStoryQuery({ id: "s1", title: "测试故事" });
      mockRelations({
        beats: [
          {
            id: "b1",
            sequence: 0,
            camera: JSON.stringify({ angle: "low", movement: "pan", distance: "medium", speed: "slow" }),
            description: "",
            duration: 5,
          },
        ],
      });

      const result = await storyStorage.getStoryById("s1");
      expect(result).not.toBeNull();
      const beat = (result as any).beats[0];
      expect(beat.camera).toEqual({
        angle: "low",
        movement: "pan",
        distance: "medium",
        speed: "slow",
      });
    });
  });

  describe("getStoryById beat 条件构造 - keyframe", () => {
    it("有 generation 容器中 keyframeImageUrl 时应构造 keyframe 对象", async () => {
      mockStoryQuery({ id: "s1", title: "测试故事" });
      mockRelations({
        beats: [
          {
            id: "b1",
            sequence: 0,
            generation: JSON.stringify({ keyframeImageUrl: "http://img.png", keyframePrompt: "a beautiful scene" }),
            description: "",
            duration: 5,
          },
        ],
      });

      const result = await storyStorage.getStoryById("s1");
      expect(result).not.toBeNull();
      const beat = (result as any).beats[0];
      expect(beat.keyframe).toBeDefined();
      expect(beat.keyframe.imageUrl).toBe("http://img.png");
      expect(beat.keyframe.prompt).toBe("a beautiful scene");
    });
  });

  describe("getStoryById beat 条件构造 - videoGen", () => {
    it("有 generation 容器中 videoUrl 时应构造 videoGen 对象", async () => {
      mockStoryQuery({ id: "s1", title: "测试故事" });
      mockRelations({
        beats: [
          {
            id: "b1",
            sequence: 0,
            generation: JSON.stringify({ videoUrl: "http://video.mp4", videoTaskId: "task-123", videoStatus: "completed" }),
            description: "",
            duration: 5,
          },
        ],
      });

      const result = await storyStorage.getStoryById("s1");
      expect(result).not.toBeNull();
      const beat = (result as any).beats[0];
      expect(beat.videoGen).toBeDefined();
      expect(beat.videoGen.videoUrl).toBe("http://video.mp4");
      expect(beat.videoGen.taskId).toBe("task-123");
      expect(beat.videoGen.status).toBe("completed");
    });
  });

  describe("getStoryById generation_params 点分键展开", () => {
    it("点分键应展开为嵌套对象", async () => {
      mockStoryQuery({ id: "s1", title: "测试故事" });
      mockRelations({
        beats: [
          {
            id: "b1",
            sequence: 0,
            camera: '{"lens":"50mm","filter":"warm"}',
            description: "",
            duration: 5,
          },
        ],
      });

      const result = await storyStorage.getStoryById("s1");
      expect(result).not.toBeNull();
      const beat = (result as any).beats[0];
      expect(beat.camera).toBeDefined();
      expect(beat.camera.lens).toBe("50mm");
      expect(beat.camera.filter).toBe("warm");
    });
  });

  describe("getStoryById elementBindings JSON 解析", () => {
    it("binding_config 应解析为 JSON 对象", async () => {
      mockStoryQuery({ id: "s1", title: "测试故事" });
      mockRelations({
        elements: [
          { element_id: "e1", binding_config: '{"type":"character"}' },
        ],
      });

      const result = await storyStorage.getStoryById("s1");
      expect(result).not.toBeNull();
      expect((result as any).elementBindings).toEqual({
        e1: { type: "character" },
      });
    });
  });

  describe("createStory 关联表在同一事务中", () => {
    it("角色/场景/节拍/元素应在同一事务中", async () => {
      await storyStorage.createStory({
        id: "s1",
        title: "测试故事",
        characters: ["c1"],
        scenes: ["sc1"],
        beats: [{ id: "b1", description: "beat1", duration: 5, sequence: 0 }] as any,
        elementIds: ["e1"],
        elementBindings: { e1: { type: "character" } },
      } as any);

      expect(mockSafeTransaction).toHaveBeenCalledTimes(1);
      const statements = mockSafeTransaction.mock.calls[0][0];
      const sqls = statements.map((s: any) => s.sql);
      expect(sqls[0]).toContain("INSERT OR IGNORE INTO stories");
      expect(sqls.some((s: string) => s.includes("story_characters"))).toBe(true);
      expect(sqls.some((s: string) => s.includes("story_scenes"))).toBe(true);
      expect(sqls.some((s: string) => s.includes("story_beats"))).toBe(true);
      expect(sqls.some((s: string) => s.includes("story_elements"))).toBe(true);
    });
  });

  describe("updateStory beat 级联删除", () => {
    it("删除不再存在的 beat 及其关联数据", async () => {
      mockSafeTransaction.mockResolvedValueOnce([{ changes: 1 }]);

      await storyStorage.updateStory("s1", {
        beats: [{ id: "b1" }] as any,
      } as any);

      const statements = mockSafeTransaction.mock.calls[0][0];
      const sqls = statements.map((s: any) => s.sql);

      expect(
        sqls.some(
          (s: string) =>
            s.includes("DELETE FROM video_tasks") && s.includes("beat_id"),
        ),
      ).toBe(true);
      expect(
        sqls.some(
          (s: string) =>
            s.includes("DELETE FROM generation_tasks") && s.includes("beat_id"),
        ),
      ).toBe(true);
      expect(
        sqls.some(
          (s: string) =>
            s.includes("DELETE FROM media_assets") && s.includes("bound_to_type = 'beat'"),
        ),
      ).toBe(true);
      expect(
        sqls.some(
          (s: string) =>
            s.includes("DELETE FROM story_beats") && s.includes("story_id = ?"),
        ),
      ).toBe(true);
    });
  });

  describe("deleteStory 硬删除", () => {
    it("应真删除 stories 记录而非软删除", async () => {
      await storyStorage.deleteStory("s1");

      const statements = mockSafeTransaction.mock.calls[0][0];
      const sqls = statements.map((s: any) => s.sql);

      expect(
        sqls.some((s: string) => s.includes("DELETE FROM stories")),
      ).toBe(true);
      expect(
        sqls.some(
          (s: string) =>
            s.includes("UPDATE stories") && s.includes("is_deleted = 1"),
        ),
      ).toBe(false);
    });
  });

  describe("deleteStory 级联清理", () => {
    it("删除前应清理所有关联表", async () => {
      await storyStorage.deleteStory("s1");

      const statements = mockSafeTransaction.mock.calls[0][0];
      const sqls = statements.map((s: any) => s.sql);

      expect(sqls.some((s: string) => s.includes("story_characters"))).toBe(true);
      expect(sqls.some((s: string) => s.includes("story_scenes"))).toBe(true);
      expect(sqls.some((s: string) => s.includes("story_beats"))).toBe(true);
      expect(sqls.some((s: string) => s.includes("story_elements"))).toBe(true);
      expect(sqls.some((s: string) => s.includes("story_versions"))).toBe(true);
      expect(sqls.some((s: string) => s.includes("video_tasks"))).toBe(true);
      expect(sqls.some((s: string) => s.includes("collection_assets"))).toBe(true);
    });
  });

  describe("getStoryById 不存在", () => {
    it("应返回 null", async () => {
      mockSafeQuery.mockResolvedValueOnce([]);

      const result = await storyStorage.getStoryById("nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("getStoryByBeatId", () => {
    it("通过 beat ID 反查故事", async () => {
      mockSafeQuery
        .mockResolvedValueOnce([{ story_id: "s1" }])
        .mockResolvedValueOnce([{ id: "s1", title: "测试故事" }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await storyStorage.getStoryByBeatId("b1");
      expect(result).not.toBeNull();
      expect((result as any).id).toBe("s1");
    });
  });

  describe("updateStory changes=0", () => {
    it("更新不存在的故事应抛错", async () => {
      mockSafeTransaction.mockResolvedValueOnce([{ changes: 0 }]);
      mockSafeQuery.mockResolvedValueOnce([]);

      await expect(
        storyStorage.updateStory("nonexistent", { title: "test" } as any),
      ).rejects.toThrow(/not found/i);
    });
  });
});
