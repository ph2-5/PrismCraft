/**
 * R145: CTE/RETURNING 脱敏防护
 * 回归防护: 确保 isSensitiveQuery 正确识别 CTE（WITH ... SELECT）和
 *           RETURNING 子句的查询，并对访问敏感表的查询结果进行脱敏。
 *
 * 攻击场景：若 isSensitiveQuery 仅检查简单 SELECT，攻击者可通过
 *           `WITH x AS (SELECT * FROM sessions) SELECT * FROM x`
 *           或 `UPDATE sessions SET ... RETURNING key, value` 绕过脱敏，
 *           读取敏感表数据（如 sessions、error_logs、sync_conflict_backup）。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockInitDatabase,
  mockGetDb,
  mockGetDbType,
  mockSaveDatabase,
  mockQuery,
  mockRun,
  mockExec,
  mockCloseDatabase,
} = vi.hoisted(() => ({
  mockInitDatabase: vi.fn().mockResolvedValue({}),
  mockGetDb: vi.fn(),
  mockGetDbType: vi.fn().mockReturnValue("better-sqlite3"),
  mockSaveDatabase: vi.fn(),
  mockQuery: vi.fn().mockResolvedValue([]),
  mockRun: vi.fn().mockResolvedValue({ changes: 0 }),
  mockExec: vi.fn().mockResolvedValue(undefined),
  mockCloseDatabase: vi.fn(),
}));

vi.mock("../../database", () => ({
  initDatabase: mockInitDatabase,
  getDb: mockGetDb,
  getDbType: mockGetDbType,
  saveDatabase: mockSaveDatabase,
  query: mockQuery,
  run: mockRun,
  exec: mockExec,
  closeDatabase: mockCloseDatabase,
}));

const { mockIpcMainHandle } = vi.hoisted(() => ({
  mockIpcMainHandle: vi.fn(),
}));

vi.mock("electron", () => ({
  ipcMain: {
    handle: mockIpcMainHandle,
  },
}));

import { isSensitiveQuery } from "../database";

describe("R145: CTE/RETURNING 脱敏防护", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("isSensitiveQuery - CTE 查询", () => {
    it("WITH x AS (SELECT * FROM sessions) SELECT * FROM x 应识别为敏感查询", () => {
      const sql =
        "WITH x AS (SELECT * FROM sessions) SELECT * FROM x";
      expect(isSensitiveQuery(sql)).toBe(true);
    });

    it("WITH cte AS (SELECT * FROM error_logs) SELECT * FROM cte 应识别为敏感查询", () => {
      const sql =
        "WITH cte AS (SELECT * FROM error_logs) SELECT * FROM cte";
      expect(isSensitiveQuery(sql)).toBe(true);
    });

    it("WITH cte AS (SELECT * FROM sync_conflict_backup) SELECT * FROM cte 应识别为敏感查询", () => {
      const sql =
        "WITH cte AS (SELECT * FROM sync_conflict_backup) SELECT * FROM cte";
      expect(isSensitiveQuery(sql)).toBe(true);
    });
  });

  describe("isSensitiveQuery - RETURNING 子句", () => {
    it("UPDATE sessions SET value='' RETURNING key, value 应识别为敏感查询", () => {
      const sql = "UPDATE sessions SET value='' RETURNING key, value";
      expect(isSensitiveQuery(sql)).toBe(true);
    });

    it("INSERT INTO error_logs VALUES (...) RETURNING * 应识别为敏感查询", () => {
      const sql =
        "INSERT INTO error_logs (message) VALUES ('test') RETURNING *";
      expect(isSensitiveQuery(sql)).toBe(true);
    });

    it("UPDATE sync_conflict_backup SET data='' RETURNING id 应识别为敏感查询", () => {
      const sql =
        "UPDATE sync_conflict_backup SET data='' RETURNING id";
      expect(isSensitiveQuery(sql)).toBe(true);
    });
  });

  describe("isSensitiveQuery - 普通 SELECT 敏感表", () => {
    it("SELECT * FROM sessions 应识别为敏感查询", () => {
      expect(isSensitiveQuery("SELECT * FROM sessions")).toBe(true);
    });

    it("SELECT * FROM error_logs 应识别为敏感查询", () => {
      expect(isSensitiveQuery("SELECT * FROM error_logs")).toBe(true);
    });

    it("SELECT * FROM sync_conflict_backup 应识别为敏感查询", () => {
      expect(isSensitiveQuery("SELECT * FROM sync_conflict_backup")).toBe(true);
    });
  });

  describe("isSensitiveQuery - 非敏感查询", () => {
    it("SELECT * FROM characters 不应识别为敏感查询", () => {
      expect(isSensitiveQuery("SELECT * FROM characters")).toBe(false);
    });

    it("SELECT * FROM scenes 不应识别为敏感查询", () => {
      expect(isSensitiveQuery("SELECT * FROM scenes")).toBe(false);
    });

    it("UPDATE characters SET name='x' 不应识别为敏感查询（无 RETURNING）", () => {
      expect(isSensitiveQuery("UPDATE characters SET name='x'")).toBe(false);
    });

    it("INSERT INTO characters (name) VALUES ('x') 不应识别为敏感查询（无 RETURNING）", () => {
      expect(
        isSensitiveQuery("INSERT INTO characters (name) VALUES ('x')"),
      ).toBe(false);
    });
  });

  describe("isSensitiveQuery - 双引号包裹的敏感表", () => {
    it('SELECT * FROM "sessions" 应识别为敏感查询', () => {
      expect(isSensitiveQuery('SELECT * FROM "sessions"')).toBe(true);
    });

    it('UPDATE "sessions" SET value=\'\' RETURNING key 应识别为敏感查询', () => {
      const sql = 'UPDATE "sessions" SET value=\'\' RETURNING key';
      expect(isSensitiveQuery(sql)).toBe(true);
    });
  });

  describe("isSensitiveQuery - 非读取类查询带 RETURNING", () => {
    it("UPDATE characters SET name='x' RETURNING * 不应识别为敏感查询（非敏感表）", () => {
      const sql = "UPDATE characters SET name='x' RETURNING *";
      expect(isSensitiveQuery(sql)).toBe(false);
    });

    it("DELETE FROM characters RETURNING * 不应识别为敏感查询（非敏感表）", () => {
      const sql = "DELETE FROM characters RETURNING *";
      expect(isSensitiveQuery(sql)).toBe(false);
    });
  });
});
