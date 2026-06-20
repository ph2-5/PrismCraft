/**
 * R125: ASA 导入必须使用 ON CONFLICT(id) DO UPDATE SET
 * 回归防护: 确保 importFromFile 各分支（characters/scenes/stories/story_beats）
 *           生成的 SQL 使用 INSERT ... ON CONFLICT(id) DO UPDATE SET，
 *           只更新导入的字段，保留未导入字段（如元数据）。
 *           不得使用 INSERT OR REPLACE（会清除未导入字段）。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock safeQuery/safeTransaction，捕获 SQL 语句以验证
vi.mock("@/shared/db-core", () => ({
  safeQuery: vi.fn(),
  safeTransaction: vi.fn(),
}));

import { safeTransaction } from "@/shared/db-core";
import { importFromFile } from "../asa-export-service";

/** 创建 JSON File 对象 */
function createJsonFile(data: unknown, name = "test.asa"): File {
  const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
  return new File([blob], name);
}

/** 提取 safeTransaction 收到的所有 SQL 语句 */
function getCapturedSqlStatements(): string[] {
  const calls = (safeTransaction as ReturnType<typeof vi.fn>).mock.calls;
  const statements: Array<{ sql: string; params: unknown[] }> = calls[0]?.[0] ?? [];
  return statements.map((s) => s.sql);
}

const baseCharacter = {
  id: "char-1",
  name: "小明",
  description: "男主角",
  ref_image_path: null,
  avatar_path: null,
  thumbnail_path: null,
  preview_path: null,
  generated_image: null,
  created_at: "2025-01-01T00:00:00.000Z",
  updated_at: "2025-01-01T00:00:00.000Z",
};

const baseScene = {
  id: "scene-1",
  name: "客厅",
  description: "明亮的客厅",
  ref_image_path: null,
  generated_image: null,
  created_at: "2025-01-01T00:00:00.000Z",
  updated_at: "2025-01-01T00:00:00.000Z",
};

const baseStory = {
  id: "story-1",
  title: "我的故事",
  description: "一个故事",
  created_at: "2025-01-01T00:00:00.000Z",
  updated_at: "2025-01-01T00:00:00.000Z",
};

const baseBeat = {
  id: "beat-1",
  story_id: "story-1",
  title: "开场",
  content: "主角登场",
  order: 0,
  duration: 5,
  created_at: "2025-01-01T00:00:00.000Z",
};

describe("R125: ASA 导入必须使用 ON CONFLICT(id) DO UPDATE SET", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (safeTransaction as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  });

  it("characters 导入 SQL 应包含 ON CONFLICT(id) DO UPDATE SET", async () => {
    const file = createJsonFile({
      format: "asa-characters",
      version: 1,
      exportedAt: "2025-01-01T00:00:00.000Z",
      characters: [baseCharacter],
      outfits: [],
    });

    const result = await importFromFile(file);
    expect(result.ok).toBe(true);

    const sqls = getCapturedSqlStatements();
    // 至少有一条 characters 表的插入语句
    const characterSql = sqls.find((s) => s.includes("INSERT INTO characters"));
    expect(characterSql).toBeDefined();
    // 必须使用 ON CONFLICT(id) DO UPDATE SET
    expect(characterSql).toMatch(/ON CONFLICT\(id\) DO UPDATE SET/i);
  });

  it("characters 导入 SQL 不应包含 INSERT OR REPLACE", async () => {
    const file = createJsonFile({
      format: "asa-characters",
      version: 1,
      exportedAt: "2025-01-01T00:00:00.000Z",
      characters: [baseCharacter],
      outfits: [],
    });

    const result = await importFromFile(file);
    expect(result.ok).toBe(true);

    const sqls = getCapturedSqlStatements();
    const characterSql = sqls.find((s) => s.includes("INSERT INTO characters"));
    expect(characterSql).toBeDefined();
    // 不得使用 INSERT OR REPLACE（会清除未导入字段）
    expect(characterSql).not.toMatch(/INSERT OR REPLACE/i);
  });

  it("scenes 导入 SQL 应包含 ON CONFLICT(id) DO UPDATE SET", async () => {
    const file = createJsonFile({
      format: "asa-scenes",
      version: 1,
      exportedAt: "2025-01-01T00:00:00.000Z",
      scenes: [baseScene],
    });

    const result = await importFromFile(file);
    expect(result.ok).toBe(true);

    const sqls = getCapturedSqlStatements();
    const sceneSql = sqls.find((s) => s.includes("INSERT INTO scenes"));
    expect(sceneSql).toBeDefined();
    expect(sceneSql).toMatch(/ON CONFLICT\(id\) DO UPDATE SET/i);
  });

  it("stories 导入 SQL 应包含 ON CONFLICT(id) DO UPDATE SET", async () => {
    const file = createJsonFile({
      format: "asa-storyboards",
      version: 1,
      exportedAt: "2025-01-01T00:00:00.000Z",
      storyboards: [baseStory],
      beats: [],
    });

    const result = await importFromFile(file);
    expect(result.ok).toBe(true);

    const sqls = getCapturedSqlStatements();
    const storySql = sqls.find((s) => s.includes("INSERT INTO stories"));
    expect(storySql).toBeDefined();
    expect(storySql).toMatch(/ON CONFLICT\(id\) DO UPDATE SET/i);
  });

  it("story_beats 导入 SQL 应包含 ON CONFLICT(id) DO UPDATE SET", async () => {
    const file = createJsonFile({
      format: "asa-storyboards",
      version: 1,
      exportedAt: "2025-01-01T00:00:00.000Z",
      storyboards: [baseStory],
      beats: [baseBeat],
    });

    const result = await importFromFile(file);
    expect(result.ok).toBe(true);

    const sqls = getCapturedSqlStatements();
    const beatSql = sqls.find((s) => s.includes("INSERT INTO story_beats"));
    expect(beatSql).toBeDefined();
    expect(beatSql).toMatch(/ON CONFLICT\(id\) DO UPDATE SET/i);
  });
});
