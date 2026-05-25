import {
  sanitizeIdentifier,
  sanitizeTable,
  buildSafeUpdate,
  buildSafeDelete,
  buildSafeInsert,
} from "../sql-sanitizer";

const DDL_PATTERN = /^\s*(DROP|ALTER|CREATE|TRUNCATE|ATTACH|DETACH)\s/i;
const COMMENT_PATTERN = /\/\*[\s\S]*?\*\//g;
const LINE_COMMENT_PATTERN = /--[^\n]*/g;

function stripSqlComments(sql: string): string {
  return sql
    .replace(COMMENT_PATTERN, " ")
    .replace(LINE_COMMENT_PATTERN, " ");
}

describe("sql-sanitizer", () => {
  describe("sanitizeIdentifier", () => {
    it("should wrap valid identifier in double quotes", () => {
      expect(sanitizeIdentifier("name")).toBe('"name"');
    });

    it("should accept identifiers starting with underscore", () => {
      expect(sanitizeIdentifier("_id")).toBe('"_id"');
    });

    it("should accept identifiers with digits after first char", () => {
      expect(sanitizeIdentifier("col1")).toBe('"col1"');
    });

    it("should accept identifiers with underscores", () => {
      expect(sanitizeIdentifier("ref_image_path")).toBe('"ref_image_path"');
    });

    it("should throw for identifier starting with digit", () => {
      expect(() => sanitizeIdentifier("1col")).toThrow(
        "Invalid SQL identifier: 1col",
      );
    });

    it("should throw for identifier with spaces", () => {
      expect(() => sanitizeIdentifier("col name")).toThrow(
        "Invalid SQL identifier: col name",
      );
    });

    it("should throw for identifier with semicolon (SQL injection)", () => {
      expect(() => sanitizeIdentifier("col; DROP TABLE users")).toThrow(
        "Invalid SQL identifier",
      );
    });

    it("should throw for identifier with single quote (SQL injection)", () => {
      expect(() => sanitizeIdentifier("col'; DROP TABLE users--")).toThrow(
        "Invalid SQL identifier",
      );
    });

    it("should throw for identifier with hyphen", () => {
      expect(() => sanitizeIdentifier("col-name")).toThrow(
        "Invalid SQL identifier",
      );
    });

    it("should throw for empty string", () => {
      expect(() => sanitizeIdentifier("")).toThrow("Invalid SQL identifier");
    });

    it("should throw for identifier with special characters", () => {
      expect(() => sanitizeIdentifier("col$name")).toThrow(
        "Invalid SQL identifier",
      );
    });

    it("should throw for identifier with parentheses (SQL injection)", () => {
      expect(() => sanitizeIdentifier("col)")).toThrow(
        "Invalid SQL identifier",
      );
    });
  });

  describe("sanitizeTable", () => {
    it("should wrap valid table name in double quotes", () => {
      expect(sanitizeTable("characters")).toBe('"characters"');
    });

    it("should accept table name with underscores", () => {
      expect(sanitizeTable("character_outfits")).toBe(
        '"character_outfits"',
      );
    });

    it("should throw for table name with spaces", () => {
      expect(() => sanitizeTable("evil table")).toThrow(
        "Invalid SQL identifier",
      );
    });

    it("should throw for table name starting with digit", () => {
      expect(() => sanitizeTable("1table")).toThrow(
        "Invalid SQL identifier",
      );
    });

    it("should throw for table name with SQL injection", () => {
      expect(() => sanitizeTable("t; DROP TABLE users")).toThrow(
        "Invalid SQL identifier",
      );
    });
  });

  describe("buildSafeUpdate", () => {
    it("should build correct UPDATE statement", () => {
      const result = buildSafeUpdate(
        "characters",
        ["name", "age"],
        ["Alice", 30],
        ["id"],
        ["char-1"],
      );
      expect(result.sql).toBe(
        'UPDATE "characters" SET "name" = ?, "age" = ? WHERE "id" = ?',
      );
      expect(result.params).toEqual(["Alice", 30, "char-1"]);
    });

    it("should build UPDATE with multiple WHERE columns", () => {
      const result = buildSafeUpdate(
        "scenes",
        ["status"],
        ["active"],
        ["id", "project_id"],
        ["scene-1", "proj-1"],
      );
      expect(result.sql).toBe(
        'UPDATE "scenes" SET "status" = ? WHERE "id" = ? AND "project_id" = ?',
      );
      expect(result.params).toEqual(["active", "scene-1", "proj-1"]);
    });

    it("should default whereParams to empty array", () => {
      const result = buildSafeUpdate(
        "characters",
        ["name"],
        ["Bob"],
        ["id"],
      );
      expect(result.params).toEqual(["Bob"]);
    });

    it("should throw when column count does not match value count", () => {
      expect(() =>
        buildSafeUpdate("characters", ["name", "age"], ["Alice"], ["id"]),
      ).toThrow("Column count (2) does not match value count (1)");
    });

    it("should throw for invalid column name", () => {
      expect(() =>
        buildSafeUpdate(
          "characters",
          ["name; DROP TABLE users"],
          ["Alice"],
          ["id"],
        ),
      ).toThrow("Invalid SQL identifier");
    });

    it("should throw for invalid table name", () => {
      expect(() =>
        buildSafeUpdate("1invalid", ["name"], ["Alice"], ["id"]),
      ).toThrow("Invalid SQL identifier");
    });

    it("should throw for invalid WHERE column name", () => {
      expect(() =>
        buildSafeUpdate(
          "characters",
          ["name"],
          ["Alice"],
          ["id; DROP TABLE users"],
        ),
      ).toThrow("Invalid SQL identifier");
    });
  });

  describe("buildSafeDelete", () => {
    it("should build correct DELETE statement", () => {
      const result = buildSafeDelete("characters", ["id"], ["char-1"]);
      expect(result.sql).toBe('DELETE FROM "characters" WHERE "id" = ?');
      expect(result.params).toEqual(["char-1"]);
    });

    it("should build DELETE with multiple WHERE columns", () => {
      const result = buildSafeDelete(
        "character_outfits",
        ["character_id", "outfit_id"],
        ["char-1", "outfit-1"],
      );
      expect(result.sql).toBe(
        'DELETE FROM "character_outfits" WHERE "character_id" = ? AND "outfit_id" = ?',
      );
      expect(result.params).toEqual(["char-1", "outfit-1"]);
    });

    it("should default whereParams to empty array", () => {
      const result = buildSafeDelete("characters", ["id"]);
      expect(result.params).toEqual([]);
    });

    it("should throw for invalid table name", () => {
      expect(() => buildSafeDelete("1invalid", ["id"])).toThrow(
        "Invalid SQL identifier",
      );
    });

    it("should throw for invalid WHERE column name", () => {
      expect(() =>
        buildSafeDelete("characters", ["id; DROP TABLE users"]),
      ).toThrow("Invalid SQL identifier");
    });
  });

  describe("buildSafeInsert", () => {
    it("should build correct INSERT statement", () => {
      const result = buildSafeInsert(
        "characters",
        ["id", "name"],
        ["char-1", "Alice"],
      );
      expect(result.sql).toBe(
        'INSERT INTO "characters" ("id", "name") VALUES (?, ?)',
      );
      expect(result.params).toEqual(["char-1", "Alice"]);
    });

    it("should throw when column count does not match value count", () => {
      expect(() =>
        buildSafeInsert("characters", ["id", "name"], ["char-1"]),
      ).toThrow("Column count (2) does not match value count (1)");
    });

    it("should throw for invalid column name", () => {
      expect(() =>
        buildSafeInsert("characters", ["id; DROP"], ["char-1"]),
      ).toThrow("Invalid SQL identifier");
    });
  });

  describe("DDL detection", () => {
    it("should detect DROP statement", () => {
      expect(DDL_PATTERN.test("DROP TABLE users")).toBe(true);
    });

    it("should detect ALTER statement", () => {
      expect(DDL_PATTERN.test("ALTER TABLE users ADD COLUMN age INT")).toBe(
        true,
      );
    });

    it("should detect CREATE statement", () => {
      expect(DDL_PATTERN.test("CREATE TABLE evil (id INT)")).toBe(true);
    });

    it("should detect TRUNCATE statement", () => {
      expect(DDL_PATTERN.test("TRUNCATE TABLE users")).toBe(true);
    });

    it("should detect ATTACH statement", () => {
      expect(DDL_PATTERN.test("ATTACH DATABASE '/tmp/evil.db' AS evil")).toBe(
        true,
      );
    });

    it("should detect DETACH statement", () => {
      expect(DDL_PATTERN.test("DETACH DATABASE evil")).toBe(true);
    });

    it("should detect DDL with leading whitespace", () => {
      expect(DDL_PATTERN.test("   DROP TABLE users")).toBe(true);
    });

    it("should detect DDL case-insensitively", () => {
      expect(DDL_PATTERN.test("drop table users")).toBe(true);
      expect(DDL_PATTERN.test("Drop Table users")).toBe(true);
    });

    it("should not flag SELECT as DDL", () => {
      expect(DDL_PATTERN.test("SELECT * FROM users")).toBe(false);
    });

    it("should not flag INSERT as DDL", () => {
      expect(DDL_PATTERN.test("INSERT INTO users (id) VALUES (1)")).toBe(
        false,
      );
    });

    it("should not flag UPDATE as DDL", () => {
      expect(DDL_PATTERN.test("UPDATE users SET name = 'x'")).toBe(false);
    });

    it("should not flag DELETE as DDL", () => {
      expect(DDL_PATTERN.test("DELETE FROM users WHERE id = 1")).toBe(false);
    });
  });

  describe("SQL comment stripping", () => {
    it("should strip line comments (--)", () => {
      expect(stripSqlComments("SELECT * FROM users -- comment")).toBe(
        "SELECT * FROM users  ",
      );
    });

    it("should strip block comments (/* */)", () => {
      expect(
        stripSqlComments("SELECT * /* block comment */ FROM users"),
      ).toBe("SELECT *   FROM users");
    });

    it("should strip multi-line block comments", () => {
      expect(
        stripSqlComments("SELECT /* line1\nline2 */ * FROM users"),
      ).toBe("SELECT   * FROM users");
    });

    it("should strip both comment types", () => {
      expect(
        stripSqlComments(
          "SELECT /* block */ col -- line comment\nFROM users",
        ),
      ).toBe("SELECT   col  \nFROM users",
      );
    });

    it("should reveal DDL hidden behind line comments", () => {
      const sql = "-- comment\nDROP TABLE users";
      const stripped = stripSqlComments(sql);
      expect(DDL_PATTERN.test(stripped)).toBe(true);
    });

    it("should reveal DDL hidden behind block comments", () => {
      const sql = "/* comment */DROP TABLE users";
      const stripped = stripSqlComments(sql);
      expect(DDL_PATTERN.test(stripped)).toBe(true);
    });

    it("should not alter SQL without comments", () => {
      const sql = "SELECT * FROM users WHERE id = 1";
      expect(stripSqlComments(sql)).toBe(sql);
    });

    it("should handle SQL with comment hiding DROP", () => {
      const sql = "SELECT * FROM users; -- DROP TABLE users";
      const stripped = stripSqlComments(sql);
      expect(stripped).not.toContain("--");
    });
  });
});
