/**
 * P1-12 测试覆盖 — infrastructure/storage/novel-projects
 *
 * 覆盖 P1-10 修复的原子 DELETE 逻辑：
 * - cleanExpiredProjects 使用单条 DELETE（而非 SELECT + DELETE）
 * - WHERE 条件正确：is_deleted=1 OR story_id IS NOT NULL，且 updated_at < cutoff
 * - 返回值：受影响行数（result.changes）
 *
 * 同时覆盖其他 CRUD 操作：
 * - getAllProjects：按 updated_at 降序
 * - getProjectById：未找到返回 null
 * - createProject：JSON 序列化 state
 * - updateProject：仅更新提供的字段
 * - deleteProject：软删除（is_deleted=1, deleted_at=now）
 * - hardDeleteProject：物理删除
 * - rowToProject：JSON 损坏时回退到空对象
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSafeQuery, mockSafeRun } = vi.hoisted(() => ({
  mockSafeQuery: vi.fn(),
  mockSafeRun: vi.fn(),
}));

vi.mock("@/infrastructure/storage/sqlite-core", () => ({
  safeQuery: mockSafeQuery,
  safeRun: mockSafeRun,
}));

describe("storage/novel-projects", () => {
  let novelProjectStorage: typeof import("../novel-projects").novelProjectStorage;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockSafeQuery.mockResolvedValue([]);
    mockSafeRun.mockResolvedValue({ changes: 0 });
    const mod = await import("../novel-projects");
    novelProjectStorage = mod.novelProjectStorage;
  });

  function makeRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
    return {
      id: "p1",
      title: "测试项目",
      raw_text: "原文内容",
      pipeline_state_json: JSON.stringify({ stage: "content_import" }),
      story_id: null,
      owner_id: 1,
      created_at: 1000,
      updated_at: 2000,
      is_deleted: 0,
      deleted_at: null,
      version: 1,
      sync_id: null,
      ...overrides,
    };
  }

  describe("getAllProjects", () => {
    it("查询未删除的项目（is_deleted=0），按 updated_at 降序", async () => {
      mockSafeQuery.mockResolvedValueOnce([
        makeRow({ id: "p1", title: "项目1" }),
        makeRow({ id: "p2", title: "项目2" }),
      ]);

      const result = await novelProjectStorage.getAllProjects();

      expect(mockSafeQuery).toHaveBeenCalledWith(
        "SELECT * FROM novel_projects WHERE is_deleted = 0 ORDER BY updated_at DESC",
      );
      expect(result).toHaveLength(2);
      expect(result[0]!.id).toBe("p1");
      expect(result[0]!.title).toBe("项目1");
      expect(result[0]!.state).toEqual({ stage: "content_import" });
      expect(result[0]!.createdAt).toBe(1000000); // 1000 * 1000
      expect(result[0]!.updatedAt).toBe(2000000);
    });

    it("无项目时返回空数组", async () => {
      mockSafeQuery.mockResolvedValueOnce([]);
      const result = await novelProjectStorage.getAllProjects();
      expect(result).toEqual([]);
    });
  });

  describe("getProjectById", () => {
    it("找到项目时返回 NovelProjectRecord", async () => {
      mockSafeQuery.mockResolvedValueOnce([makeRow({ id: "p1" })]);

      const result = await novelProjectStorage.getProjectById("p1");

      expect(mockSafeQuery).toHaveBeenCalledWith(
        "SELECT * FROM novel_projects WHERE id = ? AND is_deleted = 0",
        ["p1"],
      );
      expect(result).not.toBeNull();
      expect(result!.id).toBe("p1");
    });

    it("未找到项目时返回 null", async () => {
      mockSafeQuery.mockResolvedValueOnce([]);

      const result = await novelProjectStorage.getProjectById("nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("rowToProject — JSON 损坏回退", () => {
    it("pipeline_state_json 为损坏 JSON 时回退到空对象", async () => {
      mockSafeQuery.mockResolvedValueOnce([
        makeRow({ pipeline_state_json: "{not valid json" }),
      ]);

      const result = await novelProjectStorage.getProjectById("p1");

      expect(result).not.toBeNull();
      expect(result!.state).toEqual({});
    });

    it("pipeline_state_json 为 null 时回退到空对象", async () => {
      mockSafeQuery.mockResolvedValueOnce([
        makeRow({ pipeline_state_json: null }),
      ]);

      const result = await novelProjectStorage.getProjectById("p1");

      expect(result).not.toBeNull();
      expect(result!.state).toEqual({});
    });

    it("title 为 null 时回退到空字符串", async () => {
      mockSafeQuery.mockResolvedValueOnce([makeRow({ title: null })]);

      const result = await novelProjectStorage.getProjectById("p1");

      expect(result).not.toBeNull();
      expect(result!.title).toBe("");
    });

    it("raw_text 为 null 时回退到空字符串", async () => {
      mockSafeQuery.mockResolvedValueOnce([makeRow({ raw_text: null })]);

      const result = await novelProjectStorage.getProjectById("p1");

      expect(result).not.toBeNull();
      expect(result!.rawText).toBe("");
    });
  });

  describe("createProject", () => {
    it("正确序列化 state 并插入", async () => {
      await novelProjectStorage.createProject({
        id: "p1",
        title: "新项目",
        rawText: "原文",
        state: { stage: "project_init", step: 1 },
      });

      expect(mockSafeRun).toHaveBeenCalledTimes(1);
      const [sql, params] = mockSafeRun.mock.calls[0]!;
      expect(sql).toContain("INSERT INTO novel_projects");
      expect(params[0]).toBe("p1");
      expect(params[1]).toBe("新项目");
      expect(params[2]).toBe("原文");
      expect(params[3]).toBe(JSON.stringify({ stage: "project_init", step: 1 }));
      expect(params[4]).toBeNull(); // story_id
    });

    it("rawText 未提供时使用空字符串", async () => {
      await novelProjectStorage.createProject({
        id: "p1",
        title: "新项目",
        state: {},
      });

      const params = mockSafeRun.mock.calls[0]![1] as unknown[];
      expect(params[2]).toBe("");
    });

    it("storyId 提供时传入", async () => {
      await novelProjectStorage.createProject({
        id: "p1",
        title: "新项目",
        state: {},
        storyId: "story1",
      });

      const params = mockSafeRun.mock.calls[0]![1] as unknown[];
      expect(params[4]).toBe("story1");
    });
  });

  describe("updateProject", () => {
    it("仅更新 title", async () => {
      await novelProjectStorage.updateProject("p1", { title: "新标题" });

      const [sql, params] = mockSafeRun.mock.calls[0]!;
      expect(sql).toContain("title = ?");
      expect(sql).not.toContain("raw_text =");
      expect(sql).not.toContain("pipeline_state_json =");
      expect(params[0]).toBe("新标题");
      expect(params[params.length - 1]).toBe("p1");
    });

    it("仅更新 state（JSON 序列化）", async () => {
      await novelProjectStorage.updateProject("p1", { state: { stage: "review" } });

      const [sql, params] = mockSafeRun.mock.calls[0]!;
      expect(sql).toContain("pipeline_state_json = ?");
      expect(params[0]).toBe(JSON.stringify({ stage: "review" }));
    });

    it("更新多个字段", async () => {
      await novelProjectStorage.updateProject("p1", {
        title: "新标题",
        rawText: "新原文",
        storyId: "story1",
      });

      const [sql] = mockSafeRun.mock.calls[0]!;
      expect(sql).toContain("title = ?");
      expect(sql).toContain("raw_text = ?");
      expect(sql).toContain("story_id = ?");
    });

    it("空 patch（无字段）时不调用 safeRun", async () => {
      await novelProjectStorage.updateProject("p1", {});

      expect(mockSafeRun).not.toHaveBeenCalled();
    });

    it("storyId 显式设为 null", async () => {
      await novelProjectStorage.updateProject("p1", { storyId: null });

      const [sql, params] = mockSafeRun.mock.calls[0]!;
      expect(sql).toContain("story_id = ?");
      expect(params[0]).toBeNull();
    });

    it("P2-7: 更新时 SQL 包含 version = version + 1", async () => {
      await novelProjectStorage.updateProject("p1", { title: "新标题" });

      const [sql] = mockSafeRun.mock.calls[0]!;
      expect(sql).toContain("version = version + 1");
    });

    it("P2-7: 仅更新 state 时也递增 version", async () => {
      await novelProjectStorage.updateProject("p1", { state: { stage: "review" } });

      const [sql] = mockSafeRun.mock.calls[0]!;
      expect(sql).toContain("version = version + 1");
    });

    it("P2-7: 更新多字段时 version 仅递增一次", async () => {
      await novelProjectStorage.updateProject("p1", {
        title: "新标题",
        rawText: "新原文",
        state: { stage: "review" },
        storyId: "story1",
      });

      const [sql] = mockSafeRun.mock.calls[0]!;
      // 只出现一次 version = version + 1
      const matches = sql.match(/version = version \+ 1/g);
      expect(matches).toHaveLength(1);
    });

    it("P2-7: 空 patch 时仍不调用 safeRun（version 不递增）", async () => {
      await novelProjectStorage.updateProject("p1", {});

      expect(mockSafeRun).not.toHaveBeenCalled();
    });
  });

  describe("deleteProject (软删除)", () => {
    it("设置 is_deleted=1, deleted_at, updated_at", async () => {
      await novelProjectStorage.deleteProject("p1");

      const [sql, params] = mockSafeRun.mock.calls[0]!;
      expect(sql).toContain("is_deleted = 1");
      expect(sql).toContain("deleted_at = ?");
      expect(sql).toContain("updated_at = ?");
      expect(params[params.length - 1]).toBe("p1");
    });
  });

  describe("hardDeleteProject (物理删除)", () => {
    it("执行 DELETE 语句", async () => {
      await novelProjectStorage.hardDeleteProject("p1");

      const [sql, params] = mockSafeRun.mock.calls[0]!;
      expect(sql).toBe("DELETE FROM novel_projects WHERE id = ?");
      expect(params[0]).toBe("p1");
    });
  });

  describe("cleanExpiredProjects (P1-10: 原子 DELETE)", () => {
    it("P1-10: 使用单条原子 DELETE（而非 SELECT + DELETE 两步）", async () => {
      mockSafeRun.mockResolvedValueOnce({ changes: 5 });

      await novelProjectStorage.cleanExpiredProjects();

      // 只调用一次 safeRun（DELETE），没有 safeQuery（SELECT）
      expect(mockSafeRun).toHaveBeenCalledTimes(1);
      expect(mockSafeQuery).not.toHaveBeenCalled();

      const [sql, params] = mockSafeRun.mock.calls[0]!;
      // 验证 SQL 是 DELETE 而非 SELECT
      expect(sql).toMatch(/^DELETE FROM novel_projects/);
      // 验证 WHERE 条件包含 is_deleted 和 story_id 和 updated_at
      expect(sql).toContain("is_deleted = 1");
      expect(sql).toContain("story_id IS NOT NULL");
      expect(sql).toContain("updated_at < ?");
      // 验证 OR 分组（用括号）
      expect(sql).toMatch(/\(is_deleted = 1 OR story_id IS NOT NULL\)/);
      // 验证参数：cutoff 时间戳（秒）
      expect(params).toHaveLength(1);
      expect(typeof params[0]).toBe("string");
    });

    it("返回受影响行数", async () => {
      mockSafeRun.mockResolvedValueOnce({ changes: 5 });

      const result = await novelProjectStorage.cleanExpiredProjects();

      expect(result).toBe(5);
    });

    it("无过期项目时返回 0", async () => {
      mockSafeRun.mockResolvedValueOnce({ changes: 0 });

      const result = await novelProjectStorage.cleanExpiredProjects();

      expect(result).toBe(0);
    });

    it("safeRun 返回 undefined 时返回 0（fallback）", async () => {
      mockSafeRun.mockResolvedValueOnce({} as never);

      const result = await novelProjectStorage.cleanExpiredProjects();

      expect(result).toBe(0);
    });

    it("自定义 maxAgeMs 时正确计算 cutoff", async () => {
      mockSafeRun.mockResolvedValueOnce({ changes: 0 });

      const customMaxAge = 7 * 24 * 60 * 60 * 1000; // 7 天
      const before = Math.floor((Date.now() - customMaxAge) / 1000);
      await novelProjectStorage.cleanExpiredProjects(customMaxAge);
      const after = Math.floor((Date.now() - customMaxAge) / 1000);

      const params = mockSafeRun.mock.calls[0]![1] as unknown[];
      const cutoff = Number(params[0]);
      expect(cutoff).toBeGreaterThanOrEqual(before);
      expect(cutoff).toBeLessThanOrEqual(after);
    });

    it("默认 maxAgeMs = 30 天", async () => {
      mockSafeRun.mockResolvedValueOnce({ changes: 0 });

      const defaultMaxAge = 30 * 24 * 60 * 60 * 1000;
      const before = Math.floor((Date.now() - defaultMaxAge) / 1000);
      await novelProjectStorage.cleanExpiredProjects();
      const after = Math.floor((Date.now() - defaultMaxAge) / 1000);

      const params = mockSafeRun.mock.calls[0]![1] as unknown[];
      const cutoff = Number(params[0]);
      expect(cutoff).toBeGreaterThanOrEqual(before);
      expect(cutoff).toBeLessThanOrEqual(after);
    });
  });
});
