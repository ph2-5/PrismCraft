/**
 * R137: db-interface 敏感参数必须经过 sanitizeParams 脱敏
 * 回归防护: 确保数据库错误消息中的 params 经过 sanitizeParams 处理，
 *           长字符串（>100 字符）被截断，防止敏感信息（API Key、密码、
 *           长 payload）泄漏到日志或错误消息中。
 *
 * 攻击场景：数据库操作失败时，错误消息中包含完整 params。若 params 包含
 * API Key 或密码等敏感信息，这些信息会写入日志文件，可能被攻击者通过日志
 * 访问获取凭证。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BetterSqlite3Statement } from "../../db-interface";

describe("R137: db-interface 敏感参数脱敏", () => {
  it("BetterSqlite3Statement 应已导出", () => {
    expect(BetterSqlite3Statement).toBeDefined();
    expect(typeof BetterSqlite3Statement).toBe("function");
  });

  function createMockDb(throwOnRun: boolean, throwOnGet: boolean, throwOnAll: boolean) {
    const mockStmt = {
      run: throwOnRun
        ? vi.fn(() => {
            throw new Error("SQLITE_CONSTRAINT: UNIQUE constraint failed");
          })
        : vi.fn(() => ({ changes: 1, lastInsertRowid: 1 })),
      get: throwOnGet
        ? vi.fn(() => {
            throw new Error("SQLITE_ERROR: no such table");
          })
        : vi.fn(() => ({ id: "test" })),
      all: throwOnAll
        ? vi.fn(() => {
            throw new Error("SQLITE_ERROR: no such column");
          })
        : vi.fn(() => []),
    };
    const mockDb = {
      prepare: vi.fn(() => mockStmt),
    };
    return { mockDb, mockStmt };
  }

  it("run 方法抛出错误时，错误消息中的长字符串参数应被截断", () => {
    const { mockDb } = createMockDb(true, false, false);
    const longString = "A".repeat(200);
    const stmt = new BetterSqlite3Statement(
      mockDb as unknown as import("better-sqlite3").Database,
      "INSERT INTO users (api_key) VALUES (?)",
    );

    try {
      stmt.run(longString);
      expect.fail("应抛出错误");
    } catch (error) {
      const message = (error as Error).message;
      // 错误消息应包含截断标记
      expect(message).toContain("...[truncated]");
      // 不应包含完整的长字符串
      expect(message).not.toContain(longString);
      // 应包含截断后的前 100 个字符
      expect(message).toContain("A".repeat(100));
    }
  });

  it("get 方法抛出错误时，错误消息中的长字符串参数应被截断", () => {
    const { mockDb } = createMockDb(false, true, false);
    const longString = "B".repeat(150);
    const stmt = new BetterSqlite3Statement(
      mockDb as unknown as import("better-sqlite3").Database,
      "SELECT * FROM users WHERE token = ?",
    );

    try {
      stmt.get(longString);
      expect.fail("应抛出错误");
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain("...[truncated]");
      expect(message).not.toContain(longString);
    }
  });

  it("all 方法抛出错误时，错误消息中的长字符串参数应被截断", () => {
    const { mockDb } = createMockDb(false, false, true);
    const longString = "C".repeat(120);
    const stmt = new BetterSqlite3Statement(
      mockDb as unknown as import("better-sqlite3").Database,
      "SELECT * FROM users WHERE secret = ?",
    );

    try {
      stmt.all(longString);
      expect.fail("应抛出错误");
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain("...[truncated]");
      expect(message).not.toContain(longString);
    }
  });

  it("短字符串参数（<=100 字符）不应被截断", () => {
    const { mockDb } = createMockDb(true, false, false);
    const shortString = "short-api-key";
    const stmt = new BetterSqlite3Statement(
      mockDb as unknown as import("better-sqlite3").Database,
      "INSERT INTO config (key, value) VALUES (?, ?)",
    );

    try {
      stmt.run("test", shortString);
      expect.fail("应抛出错误");
    } catch (error) {
      const message = (error as Error).message;
      // 短字符串不应被截断
      expect(message).toContain(shortString);
      expect(message).not.toContain("...[truncated]");
    }
  });

  it("恰好 100 字符的字符串不应被截断", () => {
    const { mockDb } = createMockDb(true, false, false);
    const exactString = "D".repeat(100);
    const stmt = new BetterSqlite3Statement(
      mockDb as unknown as import("better-sqlite3").Database,
      "INSERT INTO data (val) VALUES (?)",
    );

    try {
      stmt.run(exactString);
      expect.fail("应抛出错误");
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain(exactString);
      expect(message).not.toContain("...[truncated]");
    }
  });

  it("101 字符的字符串应被截断", () => {
    const { mockDb } = createMockDb(true, false, false);
    const overLimitString = "E".repeat(101);
    const stmt = new BetterSqlite3Statement(
      mockDb as unknown as import("better-sqlite3").Database,
      "INSERT INTO data (val) VALUES (?)",
    );

    try {
      stmt.run(overLimitString);
      expect.fail("应抛出错误");
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain("...[truncated]");
      // 不应包含第 101 个字符
      expect(message).not.toContain(overLimitString);
      // 应包含前 100 个字符
      expect(message).toContain("E".repeat(100));
    }
  });

  it("错误消息应包含 SQL 语句", () => {
    const { mockDb } = createMockDb(true, false, false);
    const sql = "INSERT INTO users (name) VALUES (?)";
    const stmt = new BetterSqlite3Statement(
      mockDb as unknown as import("better-sqlite3").Database,
      sql,
    );

    try {
      stmt.run("test");
      expect.fail("应抛出错误");
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain("SQL:");
      expect(message).toContain(sql);
    }
  });

  it("错误消息应包含 Params 前缀", () => {
    const { mockDb } = createMockDb(true, false, false);
    const stmt = new BetterSqlite3Statement(
      mockDb as unknown as import("better-sqlite3").Database,
      "INSERT INTO users (name) VALUES (?)",
    );

    try {
      stmt.run("test");
      expect.fail("应抛出错误");
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain("Params:");
    }
  });

  it("多个参数中只有长字符串应被截断", () => {
    const { mockDb } = createMockDb(true, false, false);
    const shortParam = "short";
    const longParam = "X".repeat(200);
    const stmt = new BetterSqlite3Statement(
      mockDb as unknown as import("better-sqlite3").Database,
      "INSERT INTO data (a, b) VALUES (?, ?)",
    );

    try {
      stmt.run(shortParam, longParam);
      expect.fail("应抛出错误");
    } catch (error) {
      const message = (error as Error).message;
      // 短参数应保留
      expect(message).toContain(shortParam);
      // 长参数应被截断
      expect(message).toContain("...[truncated]");
      expect(message).not.toContain(longParam);
    }
  });
});
