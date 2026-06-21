/**
 * R143: validateSql 表名白名单双引号绕过防护
 * 回归防护: 确保 validateSql 正确处理双引号包裹的表名，防止攻击者
 *           通过双引号绕过表名白名单校验。
 *
 * 攻击场景：若表名提取正则不处理双引号，`SELECT * FROM "secret_table"`
 *           可能无法匹配 `FROM\s+([a-zA-Z_][a-zA-Z0-9_]*)` 正则，
 *           导致非白名单表被放行。修复后正则使用 `"?` 兼容双引号，
 *           双引号包裹的非白名单表也应被拒绝。
 *
 * 注意：`users` 和 `characters` 都在 ALLOWED_TABLES 白名单中，
 *      因此使用 `secret_table`（不在白名单）验证拒绝行为。
 *      `sqlite_master` 被 DANGEROUS_PATTERNS 拦截。
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

import { validateSql } from "../database";

describe("R143: validateSql 表名白名单双引号绕过防护", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("非白名单表名应被拒绝（无论是否带双引号）", () => {
    it('SELECT * FROM "secret_table" 应被拒绝（双引号包裹的非白名单表名）', () => {
      expect(() => validateSql('SELECT * FROM "secret_table"')).toThrow(
        /not in the allowed list/i,
      );
    });

    it("SELECT * FROM secret_table 应被拒绝（无引号的非白名单表名）", () => {
      expect(() => validateSql("SELECT * FROM secret_table")).toThrow(
        /not in the allowed list/i,
      );
    });

    it('INSERT INTO "secret_table" VALUES (...) 应被拒绝', () => {
      expect(() =>
        validateSql('INSERT INTO "secret_table" (id) VALUES (1)'),
      ).toThrow(/not in the allowed list/i);
    });

    it('UPDATE "secret_table" SET ... 应被拒绝', () => {
      expect(() =>
        validateSql('UPDATE "secret_table" SET name = "x" WHERE id = 1'),
      ).toThrow(/not in the allowed list/i);
    });
  });

  describe("白名单表名应通过（无论是否带双引号）", () => {
    it('SELECT * FROM "characters" 应通过（双引号包裹的白名单表名）', () => {
      expect(() => validateSql('SELECT * FROM "characters"')).not.toThrow();
    });

    it("SELECT * FROM characters 应通过（无引号的白名单表名）", () => {
      expect(() => validateSql("SELECT * FROM characters")).not.toThrow();
    });

    it('SELECT * FROM "users" 应通过（双引号包裹的白名单表名）', () => {
      expect(() => validateSql('SELECT * FROM "users"')).not.toThrow();
    });

    it("SELECT * FROM users 应通过（无引号的白名单表名）", () => {
      expect(() => validateSql("SELECT * FROM users")).not.toThrow();
    });
  });

  describe("系统表应被拒绝（无论是否带双引号）", () => {
    it("SELECT * FROM sqlite_master 应被拒绝（系统表）", () => {
      expect(() => validateSql("SELECT * FROM sqlite_master")).toThrow(
        /Dangerous|not allowed/i,
      );
    });

    it('SELECT * FROM "sqlite_master" 应被拒绝（双引号系统表）', () => {
      expect(() => validateSql('SELECT * FROM "sqlite_master"')).toThrow(
        /Dangerous|not allowed/i,
      );
    });

    it("SELECT * FROM sqlite_sequence 应被拒绝", () => {
      expect(() => validateSql("SELECT * FROM sqlite_sequence")).toThrow(
        /Dangerous|not allowed/i,
      );
    });
  });

  describe("双引号绕过攻击场景", () => {
    it('DELETE FROM "secret_table" 应被拒绝', () => {
      expect(() =>
        validateSql('DELETE FROM "secret_table" WHERE id = 1'),
      ).toThrow(/not in the allowed list/i);
    });

    it('SELECT * FROM characters JOIN "secret_table" 应被拒绝', () => {
      expect(() =>
        validateSql('SELECT * FROM characters JOIN "secret_table"'),
      ).toThrow(/not in the allowed list/i);
    });

    it("双引号包裹的白名单表名与无引号应一致放行", () => {
      const quoted = validateSql('SELECT * FROM "characters"');
      const unquoted = validateSql("SELECT * FROM characters");
      expect(quoted).toBe(true);
      expect(unquoted).toBe(true);
    });
  });
});
