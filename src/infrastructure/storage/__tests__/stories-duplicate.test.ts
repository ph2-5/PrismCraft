import { describe, it, expect, vi, beforeEach } from "vitest";

type SqlStatement = { sql: string; params: unknown[] };

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
    // Match real toSqlValue behavior: JSON.stringify for objects/arrays, 0/1 for booleans
    toSqlValue: vi.fn((v: unknown) => {
      if (v === null || v === undefined) return null;
      if (typeof v === "boolean") return v ? 1 : 0;
      if (typeof v === "object") {
        try { return JSON.stringify(v); } catch { return null; }
      }
      return v;
    }),
    trackChange: vi.fn(),
    isElectron: vi.fn(() => true),
  };
});

vi.mock("@/shared/error-logger", () => ({
  errorLogger: { warn: vi.fn(), error: vi.fn() },
  extractErrorMessage: vi.fn((e) => (e instanceof Error ? e.message : String(e))),
}));

function makeSourceStoryRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: "source-story-1",
    title: "原始故事",
    description: "原始描述",
    genre: "drama",
    tone: "serious",
    target_duration: 120,
    keyframe_chain_valid: 1,
    style_guide_json: '{"artStyle":"anime"}',
    status: "completed",
    owner_id: 1,
    created_at: 1000,
    updated_at: 2000,
    version: 3,
    ...overrides,
  };
}

function makeBeatRow(id: string, sequence: number, overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id,
    story_id: "source-story-1",
    sequence,
    order_num: sequence,
    title: `Beat ${sequence}`,
    content: "内容",
    description: `分镜 ${sequence}`,
    duration: 5,
    type: "action",
    character_ids_json: '["c1","c2"]',
    scene_id: "sc1",
    camera: '{"distance":"medium"}',
    generation: '{"keyframeImageUrl":"http://img.png"}',
    meta: '{"elementIds":["e1"]}',
    local_video_path: "/tmp/video.mp4",
    local_keyframe_path: "/tmp/keyframe.png",
    local_first_frame_path: "/tmp/first.png",
    local_last_frame_path: "/tmp/last.png",
    created_at: 1500,
    updated_at: 1600,
    ...overrides,
  };
}

describe("storage/stories.duplicateStory", () => {
  let storyStorage: typeof import("../stories").storyStorage;

  beforeEach(async () => {
    // mockReset() clears mockResolvedValue/mockResolvedValueOnce queue to prevent cross-test pollution
    mockSafeQuery.mockReset();
    mockSafeRun.mockReset();
    mockSafeTransaction.mockReset();
    mockSafeQuery.mockResolvedValue([]);
    mockSafeTransaction.mockResolvedValue([]);
    const mod = await import("../stories");
    storyStorage = mod.storyStorage;
  });

  /** Mock getStoryById: story row + 4 relation queries (characters, scenes, beats, elements). */
  function mockGetStoryById(opts: {
    storyRow?: Record<string, unknown> | null;
    characters?: Record<string, unknown>[];
    scenes?: Record<string, unknown>[];
    beats?: Record<string, unknown>[];
    elements?: Record<string, unknown>[];
  }) {
    // 1. story row
    if (opts.storyRow === null) {
      mockSafeQuery.mockResolvedValueOnce([]);
    } else {
      mockSafeQuery.mockResolvedValueOnce([opts.storyRow ?? makeSourceStoryRow()]);
    }
    // 2-5. fetchStoryRelations (parallel, consumed in Promise.all array order)
    mockSafeQuery.mockResolvedValueOnce(opts.characters ?? []);
    mockSafeQuery.mockResolvedValueOnce(opts.scenes ?? []);
    mockSafeQuery.mockResolvedValueOnce(opts.beats ?? []);
    mockSafeQuery.mockResolvedValueOnce(opts.elements ?? []);
  }

  describe("正常复制", () => {
    it("应在单个事务中复制 stories 及所有关联表", async () => {
      mockGetStoryById({
        beats: [makeBeatRow("b1", 0), makeBeatRow("b2", 1)],
        characters: [{ character_id: "c1", display_order: 0 }],
        scenes: [{ scene_id: "sc1", display_order: 0 }],
        elements: [{ element_id: "e1", binding_config: '{"role":"prop"}' }],
      });

      await storyStorage.duplicateStory("source-story-1", "副本故事");

      expect(mockSafeTransaction).toHaveBeenCalledTimes(1);
      const statements = mockSafeTransaction.mock.calls[0]![0]! as SqlStatement[];
      const sqls = statements.map((s) => s.sql);

      // stories INSERT
      expect(sqls.some((s) => s.includes("INSERT OR IGNORE INTO stories"))).toBe(true);
      // story_beats INSERT
      expect(sqls.some((s) => s.includes("INSERT") && s.includes("story_beats"))).toBe(true);
      // story_characters INSERT
      expect(sqls.some((s) => s.includes("story_characters"))).toBe(true);
      // story_scenes INSERT
      expect(sqls.some((s) => s.includes("story_scenes"))).toBe(true);
      // story_elements INSERT
      expect(sqls.some((s) => s.includes("story_elements"))).toBe(true);
    });

    it("不应复制 story_versions / video_tasks / media_assets", async () => {
      mockGetStoryById({
        beats: [makeBeatRow("b1", 0)],
      });

      await storyStorage.duplicateStory("source-story-1", "副本故事");

      const statements = mockSafeTransaction.mock.calls[0]![0]! as SqlStatement[];
      const sqls = statements.map((s) => s.sql);

      expect(sqls.some((s) => s.includes("story_versions"))).toBe(false);
      expect(sqls.some((s) => s.includes("video_tasks"))).toBe(false);
      expect(sqls.some((s) => s.includes("media_assets"))).toBe(false);
    });
  });

  describe("源 Story 不存在", () => {
    it("应抛出错误", async () => {
      mockGetStoryById({ storyRow: null });

      await expect(
        storyStorage.duplicateStory("nonexistent", "副本"),
      ).rejects.toThrow(/not found/i);
    });

    it("不应执行任何写事务", async () => {
      mockGetStoryById({ storyRow: null });

      await expect(
        storyStorage.duplicateStory("nonexistent", "副本"),
      ).rejects.toThrow();

      expect(mockSafeTransaction).not.toHaveBeenCalled();
    });
  });

  describe("复制后 beats 数量一致", () => {
    it("源有 3 个 beat 时应生成 3 个 beat INSERT", async () => {
      mockGetStoryById({
        beats: [
          makeBeatRow("b1", 0),
          makeBeatRow("b2", 1),
          makeBeatRow("b3", 2),
        ],
      });

      await storyStorage.duplicateStory("source-story-1", "副本故事");

      const statements = mockSafeTransaction.mock.calls[0]![0]! as SqlStatement[];
      const beatInserts = statements.filter(
        (s) => s.sql.includes("INSERT") && s.sql.includes("story_beats"),
      );
      expect(beatInserts.length).toBe(3);
    });
  });

  describe("复制后 status 为 draft", () => {
    it("新 stories INSERT 的 status 参数应为 'draft'", async () => {
      mockGetStoryById({
        storyRow: makeSourceStoryRow({ status: "completed" }),
        beats: [makeBeatRow("b1", 0)],
      });

      await storyStorage.duplicateStory("source-story-1", "副本故事");

      const statements = mockSafeTransaction.mock.calls[0]![0]! as SqlStatement[];
      const storyInsert = statements.find(
        (s) => s.sql.includes("INSERT OR IGNORE INTO stories"),
      );
      expect(storyInsert).toBeDefined();
      // status 是 INSERT 语句中的第 9 个参数（按 VALUES 顺序）
      // VALUES: id, title, description, genre, tone, target_duration, keyframe_chain_valid, style_guide_json, status, ...
      expect(storyInsert!.params[8]).toBe("draft");
    });

    it("即使源 status 为 completed，新 story 也应为 draft", async () => {
      mockGetStoryById({
        storyRow: makeSourceStoryRow({ status: "completed" }),
        beats: [],
      });

      const newId = await storyStorage.duplicateStory("source-story-1", "副本故事");

      const statements = mockSafeTransaction.mock.calls[0]![0]! as SqlStatement[];
      const storyInsert = statements.find(
        (s) => s.sql.includes("INSERT OR IGNORE INTO stories"),
      );
      expect(storyInsert!.params[8]).toBe("draft");
      expect(newId).not.toBe("source-story-1");
    });
  });

  describe("复制后 ID 不同", () => {
    it("返回的新 story ID 应与源 ID 不同", async () => {
      mockGetStoryById({
        beats: [makeBeatRow("b1", 0)],
      });

      const newId = await storyStorage.duplicateStory("source-story-1", "副本故事");

      expect(newId).not.toBe("source-story-1");
      expect(typeof newId).toBe("string");
      expect(newId.length).toBeGreaterThan(0);
    });

    it("新 beat 的 story_id 应为新 story ID", async () => {
      mockGetStoryById({
        beats: [makeBeatRow("b1", 0)],
      });

      const newId = await storyStorage.duplicateStory("source-story-1", "副本故事");

      const statements = mockSafeTransaction.mock.calls[0]![0]! as SqlStatement[];
      const beatInsert = statements.find(
        (s) => s.sql.includes("INSERT") && s.sql.includes("story_beats"),
      );
      expect(beatInsert).toBeDefined();
      // story_id is the 2nd param in beat INSERT
      expect(beatInsert!.params[1]).toBe(newId);
    });

    it("新 beat 的 ID 应与源 beat ID 不同", async () => {
      mockGetStoryById({
        beats: [makeBeatRow("original-beat-id", 0)],
      });

      await storyStorage.duplicateStory("source-story-1", "副本故事");

      const statements = mockSafeTransaction.mock.calls[0]![0]! as SqlStatement[];
      const beatInsert = statements.find(
        (s) => s.sql.includes("INSERT") && s.sql.includes("story_beats"),
      );
      expect(beatInsert).toBeDefined();
      // beat id is the 1st param
      expect(beatInsert!.params[0]).not.toBe("original-beat-id");
    });
  });

  describe("新标题设置", () => {
    it("新 stories INSERT 的 title 参数应为传入的 newTitle", async () => {
      mockGetStoryById({
        beats: [],
      });

      await storyStorage.duplicateStory("source-story-1", "我的副本标题");

      const statements = mockSafeTransaction.mock.calls[0]![0]! as SqlStatement[];
      const storyInsert = statements.find(
        (s) => s.sql.includes("INSERT OR IGNORE INTO stories"),
      );
      expect(storyInsert).toBeDefined();
      // title is the 2nd param
      expect(storyInsert!.params[1]).toBe("我的副本标题");
    });
  });

  describe("保留源字段", () => {
    it("应保留 genre/tone/target_duration/style_guide_json", async () => {
      mockGetStoryById({
        storyRow: makeSourceStoryRow({
          genre: "comedy",
          tone: "light",
          target_duration: 60,
          style_guide_json: '{"artStyle":"watercolor"}',
        }),
        beats: [],
      });

      await storyStorage.duplicateStory("source-story-1", "副本");

      const statements = mockSafeTransaction.mock.calls[0]![0]! as SqlStatement[];
      const storyInsert = statements.find(
        (s) => s.sql.includes("INSERT OR IGNORE INTO stories"),
      )!;
      // genre=3rd, tone=4th, target_duration=5th, style_guide_json=8th
      expect(storyInsert.params[3]).toBe("comedy");
      expect(storyInsert.params[4]).toBe("light");
      expect(storyInsert.params[5]).toBe(60);
      expect(storyInsert.params[7]).toBe('{"artStyle":"watercolor"}');
    });

    it("beat 应保留 sequence/description/character_ids_json/scene_id", async () => {
      mockGetStoryById({
        beats: [makeBeatRow("b1", 5, {
          description: "特殊描述",
          character_ids_json: '["c3"]',
          scene_id: "sc9",
        })],
      });

      await storyStorage.duplicateStory("source-story-1", "副本");

      const statements = mockSafeTransaction.mock.calls[0]![0]! as SqlStatement[];
      const beatInsert = statements.find(
        (s) => s.sql.includes("INSERT") && s.sql.includes("story_beats"),
      )!;
      // sequence is 3rd param, description is 7th, character_ids_json is 10th, scene_id is 11th
      expect(beatInsert.params[2]).toBe(5);
      expect(beatInsert.params[6]).toBe("特殊描述");
      expect(beatInsert.params[9]).toBe('["c3"]');
      expect(beatInsert.params[10]).toBe("sc9");
    });
  });
});
