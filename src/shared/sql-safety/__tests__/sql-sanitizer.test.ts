import { describe, it, expect } from "vitest";
import {
  sanitizeIdentifier,
  sanitizeTable,
  buildSafeInsert,
  buildSafeUpdate,
  buildSafeDelete,
  toSqlValue,
} from "@/shared/sql-safety/sql-sanitizer";

describe("sanitizeIdentifier", () => {
  it("quotes valid identifier", () => {
    expect(sanitizeIdentifier("users")).toBe('"users"');
  });

  it("accepts identifiers starting with underscore", () => {
    expect(sanitizeIdentifier("_private")).toBe('"_private"');
  });

  it("accepts identifiers with numbers after first char", () => {
    expect(sanitizeIdentifier("table1")).toBe('"table1"');
  });

  it("accepts identifiers with underscores and numbers", () => {
    expect(sanitizeIdentifier("user_2fa_tokens")).toBe('"user_2fa_tokens"');
  });

  it("throws for identifier starting with number", () => {
    expect(() => sanitizeIdentifier("1table")).toThrow("Invalid SQL identifier");
  });

  it("throws for identifier with spaces", () => {
    expect(() => sanitizeIdentifier("user table")).toThrow("Invalid SQL identifier");
  });

  it("throws for SQL injection with semicolon", () => {
    expect(() => sanitizeIdentifier("users; DROP TABLE users")).toThrow(
      "Invalid SQL identifier",
    );
  });

  it("throws for SQL injection with comment", () => {
    expect(() => sanitizeIdentifier("1;--")).toThrow("Invalid SQL identifier");
  });

  it("throws for identifier with hyphen", () => {
    expect(() => sanitizeIdentifier("user-name")).toThrow("Invalid SQL identifier");
  });

  it("throws for empty string", () => {
    expect(() => sanitizeIdentifier("")).toThrow("Invalid SQL identifier");
  });

  it("throws for identifier with special chars", () => {
    expect(() => sanitizeIdentifier("table`name")).toThrow("Invalid SQL identifier");
  });
});

describe("sanitizeTable", () => {
  it("delegates to sanitizeIdentifier", () => {
    expect(sanitizeTable("video_tasks")).toBe('"video_tasks"');
  });

  it("throws for invalid table name", () => {
    expect(() => sanitizeTable("DROP TABLE")).toThrow("Invalid SQL identifier");
  });
});

describe("buildSafeInsert", () => {
  it("generates parameterized INSERT for single column", () => {
    const result = buildSafeInsert("users", ["name"], ["Alice"]);
    expect(result.sql).toBe('INSERT INTO "users" ("name") VALUES (?)');
    expect(result.params).toEqual(["Alice"]);
  });

  it("generates parameterized INSERT for multiple columns", () => {
    const result = buildSafeInsert("users", ["name", "age", "active"], [
      "Bob",
      30,
      true,
    ]);
    expect(result.sql).toBe(
      'INSERT INTO "users" ("name", "age", "active") VALUES (?, ?, ?)',
    );
    expect(result.params).toEqual(["Bob", 30, true]);
  });

  it("throws when column and value count mismatch", () => {
    expect(() =>
      buildSafeInsert("users", ["name", "age"], ["Alice"]),
    ).toThrow("Column count (2) does not match value count (1)");
  });

  it("throws when values exceed columns", () => {
    expect(() =>
      buildSafeInsert("users", ["name"], ["Alice", "extra"]),
    ).toThrow("Column count (1) does not match value count (2)");
  });

  it("throws for invalid table name", () => {
    expect(() =>
      buildSafeInsert("users; DROP", ["name"], ["Alice"]),
    ).toThrow("Invalid SQL identifier");
  });

  it("throws for invalid column name", () => {
    expect(() =>
      buildSafeInsert("users", ["name; DROP"], ["Alice"]),
    ).toThrow("Invalid SQL identifier");
  });
});

describe("buildSafeUpdate", () => {
  it("generates parameterized UPDATE with WHERE", () => {
    const result = buildSafeUpdate(
      "users",
      ["name"],
      ["Alice"],
      ["id"],
      [1],
    );
    expect(result.sql).toBe('UPDATE "users" SET "name" = ? WHERE "id" = ?');
    expect(result.params).toEqual(["Alice", 1]);
  });

  it("generates parameterized UPDATE with multiple SET columns", () => {
    const result = buildSafeUpdate(
      "users",
      ["name", "age"],
      ["Bob", 25],
      ["id"],
      [2],
    );
    expect(result.sql).toBe(
      'UPDATE "users" SET "name" = ?, "age" = ? WHERE "id" = ?',
    );
    expect(result.params).toEqual(["Bob", 25, 2]);
  });

  it("generates parameterized UPDATE with multiple WHERE columns", () => {
    const result = buildSafeUpdate(
      "users",
      ["status"],
      ["active"],
      ["id", "org_id"],
      [1, 100],
    );
    expect(result.sql).toBe(
      'UPDATE "users" SET "status" = ? WHERE "id" = ? AND "org_id" = ?',
    );
    expect(result.params).toEqual(["active", 1, 100]);
  });

  it("defaults whereParams to empty array", () => {
    const result = buildSafeUpdate("users", ["name"], ["Alice"], ["id"]);
    expect(result.sql).toBe('UPDATE "users" SET "name" = ? WHERE "id" = ?');
    expect(result.params).toEqual(["Alice"]);
  });

  it("throws when column and value count mismatch", () => {
    expect(() =>
      buildSafeUpdate("users", ["name", "age"], ["Alice"], ["id"], [1]),
    ).toThrow("Column count (2) does not match value count (1)");
  });

  it("throws for invalid table name", () => {
    expect(() =>
      buildSafeUpdate("1invalid", ["name"], ["Alice"], ["id"], [1]),
    ).toThrow("Invalid SQL identifier");
  });

  it("throws for invalid column name in SET", () => {
    expect(() =>
      buildSafeUpdate("users", ["name; DROP"], ["Alice"], ["id"], [1]),
    ).toThrow("Invalid SQL identifier");
  });

  it("throws for invalid column name in WHERE", () => {
    expect(() =>
      buildSafeUpdate("users", ["name"], ["Alice"], ["id; DROP"], [1]),
    ).toThrow("Invalid SQL identifier");
  });
});

describe("buildSafeDelete", () => {
  it("generates parameterized DELETE with single WHERE column", () => {
    const result = buildSafeDelete("users", ["id"], [1]);
    expect(result.sql).toBe('DELETE FROM "users" WHERE "id" = ?');
    expect(result.params).toEqual([1]);
  });

  it("generates parameterized DELETE with multiple WHERE columns", () => {
    const result = buildSafeDelete("users", ["id", "org_id"], [1, 100]);
    expect(result.sql).toBe(
      'DELETE FROM "users" WHERE "id" = ? AND "org_id" = ?',
    );
    expect(result.params).toEqual([1, 100]);
  });

  it("defaults whereParams to empty array", () => {
    const result = buildSafeDelete("users", ["id"]);
    expect(result.sql).toBe('DELETE FROM "users" WHERE "id" = ?');
    expect(result.params).toEqual([]);
  });

  it("throws for invalid table name", () => {
    expect(() =>
      buildSafeDelete("DROP TABLE", ["id"], [1]),
    ).toThrow("Invalid SQL identifier");
  });

  it("throws for invalid WHERE column name", () => {
    expect(() =>
      buildSafeDelete("users", ["1;--"], [1]),
    ).toThrow("Invalid SQL identifier");
  });
});

describe("toSqlValue", () => {
  it("converts null to null", () => {
    expect(toSqlValue(null)).toBeNull();
  });

  it("converts undefined to null", () => {
    expect(toSqlValue(undefined)).toBeNull();
  });

  it("converts Date to unix timestamp", () => {
    const date = new Date("2024-01-01T00:00:00Z");
    const expected = Math.floor(date.getTime() / 1000);
    expect(toSqlValue(date)).toBe(expected);
  });

  it("converts Date with milliseconds to truncated unix timestamp", () => {
    const date = new Date(1704067200500);
    expect(toSqlValue(date)).toBe(1704067200);
  });

  it("converts bigint to number", () => {
    expect(toSqlValue(BigInt(9007199254740991))).toBe(9007199254740991);
  });

  it("converts bigint zero to number zero", () => {
    expect(toSqlValue(BigInt(0))).toBe(0);
  });

  it("converts boolean true to 1", () => {
    expect(toSqlValue(true)).toBe(1);
  });

  it("converts boolean false to 0", () => {
    expect(toSqlValue(false)).toBe(0);
  });

  it("converts plain object to JSON string", () => {
    const obj = { key: "value", num: 42 };
    expect(toSqlValue(obj)).toBe('{"key":"value","num":42}');
  });

  it("converts array to JSON string", () => {
    const arr = [1, 2, 3];
    expect(toSqlValue(arr)).toBe("[1,2,3]");
  });

  it("converts nested object to JSON string", () => {
    const obj = { a: { b: "c" } };
    expect(toSqlValue(obj)).toBe('{"a":{"b":"c"}}');
  });

  it("passes string through unchanged", () => {
    expect(toSqlValue("hello")).toBe("hello");
  });

  it("passes number through unchanged", () => {
    expect(toSqlValue(42)).toBe(42);
  });

  it("passes zero through unchanged", () => {
    expect(toSqlValue(0)).toBe(0);
  });

  it("passes negative number through unchanged", () => {
    expect(toSqlValue(-1)).toBe(-1);
  });

  it("passes float through unchanged", () => {
    expect(toSqlValue(3.14)).toBe(3.14);
  });

  it("converts object with circular reference to null", () => {
    const obj: Record<string, unknown> = {};
    obj.self = obj;
    expect(toSqlValue(obj)).toBeNull();
  });
});
