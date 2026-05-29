import { describe, it, expect } from "vitest";

const VALID_TABLE_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function sanitizeTableName(table: string): string {
  if (!VALID_TABLE_IDENTIFIER.test(table)) {
    throw new Error(`Invalid SQL table name: ${table}`);
  }
  return `"${table}"`;
}

describe("R37: Dynamic SQL table names must be validated", () => {
  it("should accept valid table names", () => {
    expect(sanitizeTableName("characters")).toBe('"characters"');
    expect(sanitizeTableName("scenes")).toBe('"scenes"');
    expect(sanitizeTableName("story_beats")).toBe('"story_beats"');
    expect(sanitizeTableName("_private_table")).toBe('"_private_table"');
    expect(sanitizeTableName("Table1")).toBe('"Table1"');
  });

  it("should reject table names with SQL injection attempts", () => {
    expect(() => sanitizeTableName("users; DROP TABLE characters;--")).toThrow(
      "Invalid SQL table name",
    );
    expect(() => sanitizeTableName("1; DROP TABLE scenes")).toThrow(
      "Invalid SQL table name",
    );
    expect(() => sanitizeTableName("table'name")).toThrow(
      "Invalid SQL table name",
    );
    expect(() => sanitizeTableName('table"name')).toThrow(
      "Invalid SQL table name",
    );
  });

  it("should reject table names starting with digits", () => {
    expect(() => sanitizeTableName("1table")).toThrow("Invalid SQL table name");
    expect(() => sanitizeTableName("123")).toThrow("Invalid SQL table name");
  });

  it("should reject table names with special characters", () => {
    expect(() => sanitizeTableName("my-table")).toThrow("Invalid SQL table name");
    expect(() => sanitizeTableName("my.table")).toThrow("Invalid SQL table name");
    expect(() => sanitizeTableName("my table")).toThrow("Invalid SQL table name");
    expect(() => sanitizeTableName("table${injection}")).toThrow(
      "Invalid SQL table name",
    );
  });

  it("should reject empty table names", () => {
    expect(() => sanitizeTableName("")).toThrow("Invalid SQL table name");
  });
});
