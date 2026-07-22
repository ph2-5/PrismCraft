import { describe, it, expect, vi, beforeEach } from "vitest";
import type { StorySearchOptions } from "@/domain/ports/storage-port";

type SqlStatement = { sql: string; params: unknown[] };

const { mockSafeQuery, mockSafeTransaction } = vi.hoisted(() => ({
  mockSafeQuery: vi.fn(),
  mockSafeTransaction: vi.fn(),
}));

vi.mock("@/infrastructure/storage/sqlite-core", () => ({
  safeQuery: mockSafeQuery,
  safeRun: vi.fn(),
  safeTransaction: mockSafeTransaction,
}));

vi.mock(import("@/infrastructure/storage/core"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    parseRecord: vi.fn((r) => r),
    toSqlValue: vi.fn((v: unknown) => (v === undefined ? null : v)),
    trackChange: vi.fn(),
    isElectron: vi.fn(() => true),
  };
});

vi.mock("@/shared/error-logger", () => ({
  errorLogger: { warn: vi.fn(), error: vi.fn() },
  extractErrorMessage: vi.fn((e) => (e instanceof Error ? e.message : String(e))),
}));

function makeStoryRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: "story-1",
    title: "测试故事",
    description: "测试描述",
    genre: "drama",
    tone: "serious",
    status: "in_progress",
    target_duration: 120,
    keyframe_chain_valid: 1,
    style_guide_json: null,
    owner_id: 1,
    created_at: 1000,
    updated_at: 2000,
    version: 1,
    ...overrides,
  };
}

describe("storage/stories.searchStories & countStories", () => {
  let storyStorage: typeof import("../stories").storyStorage;

  beforeEach(async () => {
    mockSafeQuery.mockReset();
    mockSafeTransaction.mockReset();
    mockSafeQuery.mockResolvedValue([]);
    mockSafeTransaction.mockResolvedValue([]);
    const mod = await import("../stories");
    storyStorage = mod.storyStorage;
  });

  /**
   * 辅助：mock searchStories 的两次 safeQuery 调用
   * 1. SELECT * FROM stories ... → story rows
   * 2. fetchAllStoryRelations 内部的 4 个并发查询（characters/scenes/beats/elements）
   */
  function mockSearchQuery(
    storyRows: Record<string, unknown>[],
    relations: {
      characters?: Record<string, unknown>[];
      scenes?: Record<string, unknown>[];
      beats?: Record<string, unknown>[];
      elements?: Record<string, unknown>[];
    } = {},
  ) {
    mockSafeQuery.mockResolvedValueOnce(storyRows);
    // fetchAllStoryRelations 内部并发的 4 个查询
    mockSafeQuery.mockResolvedValueOnce(relations.characters ?? []);
    mockSafeQuery.mockResolvedValueOnce(relations.scenes ?? []);
    mockSafeQuery.mockResolvedValueOnce(relations.beats ?? []);
    mockSafeQuery.mockResolvedValueOnce(relations.elements ?? []);
  }

  /** 辅助：mock countStories 的单次 safeQuery 调用 */
  function mockCountQuery(count: number) {
    mockSafeQuery.mockResolvedValueOnce([{ count }]);
  }

  function getLastQuery(): SqlStatement {
    const call = mockSafeQuery.mock.calls[0];
    if (!call) throw new Error("safeQuery was not called");
    return { sql: call[0] as string, params: call[1] as unknown[] };
  }

  describe("searchStories", () => {
    describe("空查询返回全部", () => {
      it("空 options 应不添加 WHERE 条件，默认按 updated_at DESC 排序", async () => {
        mockSearchQuery([makeStoryRow()]);

        const result = await storyStorage.searchStories({});

        expect(result).toHaveLength(1);
        const { sql, params } = getLastQuery();
        expect(sql).toContain("SELECT * FROM stories");
        expect(sql).not.toContain("WHERE");
        expect(sql).toContain("ORDER BY updated_at DESC");
        expect(params).toEqual([]);
      });

      it("空 options 返回结果应附加关联数据", async () => {
        mockSearchQuery(
          [makeStoryRow({ id: "s1" })],
          {
            characters: [{ character_id: "c1", story_id: "s1" }],
            scenes: [{ scene_id: "sc1", story_id: "s1" }],
            beats: [],
            elements: [],
          },
        );

        const result = await storyStorage.searchStories<Record<string, unknown>>({});

        expect(result[0]!.characters).toEqual(["c1"]);
        expect(result[0]!.scenes).toEqual(["sc1"]);
      });

      it("无匹配结果时应返回空数组", async () => {
        mockSearchQuery([]);

        const result = await storyStorage.searchStories({});

        expect(result).toEqual([]);
      });
    });

    describe("标题匹配", () => {
      it("query 非空时应添加 title LIKE 条件", async () => {
        mockSearchQuery([makeStoryRow({ title: "星际穿越" })]);

        await storyStorage.searchStories({ query: "星际" });

        const { sql, params } = getLastQuery();
        expect(sql).toContain("WHERE");
        expect(sql).toContain("title LIKE ?");
        expect(sql).toContain("description LIKE ?");
        expect(params[0]).toBe("%星际%");
        expect(params[1]).toBe("%星际%");
      });

      it("query 应同时匹配 title 或 description", async () => {
        mockSearchQuery([makeStoryRow({ description: "星际旅行故事" })]);

        const result = await storyStorage.searchStories<Record<string, unknown>>({ query: "星际" });

        expect(result).toHaveLength(1);
      });

      it("空白 query 应被忽略（不添加 LIKE 条件）", async () => {
        mockSearchQuery([makeStoryRow()]);

        await storyStorage.searchStories({ query: "   " });

        const { sql } = getLastQuery();
        expect(sql).not.toContain("LIKE");
      });
    });

    describe("描述匹配", () => {
      it("query 应匹配 description 字段", async () => {
        mockSearchQuery([makeStoryRow({ description: "一段治愈的故事" })]);

        const result = await storyStorage.searchStories<Record<string, unknown>>({ query: "治愈" });

        const { sql, params } = getLastQuery();
        expect(sql).toContain("(title LIKE ? OR description LIKE ?)");
        expect(params[0]).toBe("%治愈%");
        expect(result).toHaveLength(1);
      });
    });

    describe("状态筛选", () => {
      it("status 非空数组时应添加 IN 条件", async () => {
        mockSearchQuery([makeStoryRow({ status: "completed" })]);

        await storyStorage.searchStories({ status: ["completed", "in_progress"] });

        const { sql, params } = getLastQuery();
        expect(sql).toContain("status IN (?, ?)");
        expect(params).toContain("completed");
        expect(params).toContain("in_progress");
      });

      it("status 空数组时应忽略条件", async () => {
        mockSearchQuery([makeStoryRow()]);

        await storyStorage.searchStories({ status: [] });

        const { sql } = getLastQuery();
        expect(sql).not.toContain("status IN");
      });
    });

    describe("题材筛选", () => {
      it("genre 非空数组时应添加 IN 条件", async () => {
        mockSearchQuery([makeStoryRow({ genre: "drama" })]);

        await storyStorage.searchStories({ genre: ["drama", "comedy"] });

        const { sql, params } = getLastQuery();
        expect(sql).toContain("genre IN (?, ?)");
        expect(params).toContain("drama");
        expect(params).toContain("comedy");
      });

      it("genre 空数组时应忽略条件", async () => {
        mockSearchQuery([makeStoryRow()]);

        await storyStorage.searchStories({ genre: [] });

        const { sql } = getLastQuery();
        expect(sql).not.toContain("genre IN");
      });
    });

    describe("基调筛选", () => {
      it("tone 非空数组时应添加 IN 条件", async () => {
        mockSearchQuery([makeStoryRow({ tone: "serious" })]);

        await storyStorage.searchStories({ tone: ["serious", "happy"] });

        const { sql, params } = getLastQuery();
        expect(sql).toContain("tone IN (?, ?)");
        expect(params).toContain("serious");
        expect(params).toContain("happy");
      });
    });

    describe("排序", () => {
      it("sortBy=createdAt 应按 created_at 排序", async () => {
        mockSearchQuery([makeStoryRow()]);

        await storyStorage.searchStories({ sortBy: "createdAt" });

        const { sql } = getLastQuery();
        expect(sql).toContain("ORDER BY created_at DESC");
      });

      it("sortBy=title 应按 title 排序", async () => {
        mockSearchQuery([makeStoryRow()]);

        await storyStorage.searchStories({ sortBy: "title" });

        const { sql } = getLastQuery();
        expect(sql).toContain("ORDER BY title DESC");
      });

      it("sortOrder=asc 应使用 ASC", async () => {
        mockSearchQuery([makeStoryRow()]);

        await storyStorage.searchStories({ sortBy: "updatedAt", sortOrder: "asc" });

        const { sql } = getLastQuery();
        expect(sql).toContain("ORDER BY updated_at ASC");
      });

      it("默认应按 updatedAt DESC 排序", async () => {
        mockSearchQuery([makeStoryRow()]);

        await storyStorage.searchStories({});

        const { sql } = getLastQuery();
        expect(sql).toContain("ORDER BY updated_at DESC");
      });
    });

    describe("分页", () => {
      it("limit 应添加 LIMIT 子句与参数", async () => {
        mockSearchQuery([makeStoryRow()]);

        await storyStorage.searchStories({ limit: 10 });

        const { sql, params } = getLastQuery();
        expect(sql).toContain("LIMIT ?");
        expect(params).toContain(10);
      });

      it("offset 应添加 OFFSET 子句与参数", async () => {
        mockSearchQuery([makeStoryRow()]);

        await storyStorage.searchStories({ limit: 10, offset: 20 });

        const { sql, params } = getLastQuery();
        expect(sql).toContain("OFFSET ?");
        expect(params).toContain(20);
      });

      it("仅提供 offset 时应自动添加 LIMIT -1", async () => {
        mockSearchQuery([makeStoryRow()]);

        await storyStorage.searchStories({ offset: 5 });

        const { sql, params } = getLastQuery();
        expect(sql).toContain("LIMIT -1");
        expect(sql).toContain("OFFSET ?");
        expect(params).toContain(5);
      });

      it("limit 与 offset 参数顺序应为 LIMIT 后 OFFSET", async () => {
        mockSearchQuery([makeStoryRow()]);

        await storyStorage.searchStories({ limit: 10, offset: 20 });

        const { sql, params } = getLastQuery();
        const limitIdx = sql.indexOf("LIMIT");
        const offsetIdx = sql.indexOf("OFFSET");
        expect(limitIdx).toBeGreaterThan(-1);
        expect(offsetIdx).toBeGreaterThan(limitIdx);
        // WHERE 无条件 → params 顺序: [limit, offset]
        expect(params).toEqual([10, 20]);
      });
    });

    describe("组合条件", () => {
      it("query + status + genre + tone + sort + 分页 应全部组合", async () => {
        mockSearchQuery([makeStoryRow()]);

        const options: StorySearchOptions = {
          query: "星际",
          status: ["completed", "in_progress"],
          genre: ["drama"],
          tone: ["serious"],
          sortBy: "createdAt",
          sortOrder: "asc",
          limit: 5,
          offset: 10,
        };

        await storyStorage.searchStories(options);

        const { sql, params } = getLastQuery();
        expect(sql).toContain("WHERE");
        expect(sql).toContain("(title LIKE ? OR description LIKE ?)");
        expect(sql).toContain("status IN (?, ?)");
        expect(sql).toContain("genre IN (?)");
        expect(sql).toContain("tone IN (?)");
        expect(sql).toContain("ORDER BY created_at ASC");
        expect(sql).toContain("LIMIT ?");
        expect(sql).toContain("OFFSET ?");

        // 参数顺序: query×2, status×2, genre×1, tone×1, limit, offset
        expect(params).toEqual([
          "%星际%", "%星际%",
          "completed", "in_progress",
          "drama",
          "serious",
          5,
          10,
        ]);
      });

      it("countStories 与 searchStories 应使用相同的 WHERE 条件", async () => {
        mockCountQuery(3);

        const options: StorySearchOptions = {
          query: "星际",
          status: ["completed"],
        };

        const count = await storyStorage.countStories(options);

        expect(count).toBe(3);
        const { sql, params } = getLastQuery();
        expect(sql).toContain("SELECT COUNT(*)");
        expect(sql).toContain("WHERE");
        expect(sql).toContain("(title LIKE ? OR description LIKE ?)");
        expect(sql).toContain("status IN (?)");
        expect(params).toEqual(["%星际%", "%星际%", "completed"]);
      });
    });
  });

  describe("countStories", () => {
    it("空 options 应返回总数且不添加 WHERE", async () => {
      mockCountQuery(42);

      const count = await storyStorage.countStories({});

      expect(count).toBe(42);
      const { sql, params } = getLastQuery();
      expect(sql).toContain("SELECT COUNT(*) as count FROM stories");
      expect(sql).not.toContain("WHERE");
      expect(params).toEqual([]);
    });

    it("无结果时应返回 0", async () => {
      mockSafeQuery.mockResolvedValueOnce([]);

      const count = await storyStorage.countStories({});

      expect(count).toBe(0);
    });

    it("count 为 NaN 时应回退为 0", async () => {
      mockSafeQuery.mockResolvedValueOnce([{ count: "not-a-number" }]);

      const count = await storyStorage.countStories({});

      expect(count).toBe(0);
    });

    it("应支持 status 过滤计数", async () => {
      mockCountQuery(5);

      const count = await storyStorage.countStories({ status: ["completed"] });

      expect(count).toBe(5);
      const { sql, params } = getLastQuery();
      expect(sql).toContain("status IN (?)");
      expect(params).toEqual(["completed"]);
    });
  });
});
