/**
 * R138: schema-builder 标识符必须用双引号包裹
 * 回归防护: 确保 generateTableSQL 和 generateJunctionTableSQL 生成的 SQL 中
 *           表名和列名用双引号包裹，防止 SQL 注入。
 *
 * 攻击场景：若表名/列名未用引号包裹，攻击者可通过精心构造的表名（如
 * `users; DROP TABLE users--`）注入恶意 SQL。双引号是 SQLite 的标准标识符
 * 引用方式，可有效防止此类攻击。
 */
import { describe, it, expect } from "vitest";
import {
  generateTableSQL,
  generateJunctionTableSQL,
  type TableDef,
  type ColumnDef,
} from "../schema-builder";

describe("R138: schema-builder 标识符必须用双引号包裹", () => {
  it("generateTableSQL 应已导出", () => {
    expect(generateTableSQL).toBeDefined();
    expect(typeof generateTableSQL).toBe("function");
  });

  it("generateJunctionTableSQL 应已导出", () => {
    expect(generateJunctionTableSQL).toBeDefined();
    expect(typeof generateJunctionTableSQL).toBe("function");
  });

  it("generateTableSQL 应在 CREATE TABLE 中用双引号包裹表名", () => {
    const def: TableDef = {
      name: "test_table",
      columns: {
        name: { type: "TEXT" },
      },
    };
    const sql = generateTableSQL(def);
    expect(sql).toContain('"test_table"');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "test_table"');
  });

  it("generateTableSQL 应用双引号包裹列名", () => {
    const def: TableDef = {
      name: "test_table",
      columns: {
        user_name: { type: "TEXT" },
        email_address: { type: "TEXT" },
      },
    };
    const sql = generateTableSQL(def);
    expect(sql).toContain('"user_name"');
    expect(sql).toContain('"email_address"');
  });

  it("generateTableSQL 应用双引号包裹 id 列", () => {
    const def: TableDef = {
      name: "test_table",
      columns: {
        name: { type: "TEXT" },
      },
    };
    const sql = generateTableSQL(def);
    // id 列是自动添加的，也应被引号包裹
    expect(sql).toContain('"id"');
  });

  it("generateTableSQL 应在 INDEX 语句中用双引号包裹表名和列名", () => {
    const def: TableDef = {
      name: "test_table",
      columns: {
        ref_id: { type: "TEXT", ref: "other_table(id)" },
      },
    };
    const sql = generateTableSQL(def);
    // INDEX 语句应包含引号包裹的表名和列名
    expect(sql).toContain('ON "test_table"("ref_id")');
  });

  it("generateTableSQL 应在 CHECK 约束中用双引号包裹列名", () => {
    const def: TableDef = {
      name: "test_table",
      columns: {
        status: { type: "TEXT", check: "IN ('active', 'inactive')" },
      },
    };
    const sql = generateTableSQL(def);
    expect(sql).toContain('CHECK("status"');
  });

  it("generateTableSQL 应在 REFERENCES 中用双引号包裹引用表和列", () => {
    const def: TableDef = {
      name: "test_table",
      columns: {
        story_id: { type: "TEXT", ref: "stories(id)" },
      },
    };
    const sql = generateTableSQL(def);
    expect(sql).toContain('REFERENCES "stories"("id")');
  });

  it("generateJunctionTableSQL 应用双引号包裹表名和列名", () => {
    const columns: Record<string, ColumnDef> = {
      story_id: { type: "TEXT", notNull: true, ref: "stories(id)" },
      character_id: { type: "TEXT", notNull: true, ref: "characters(id)" },
    };
    const sql = generateJunctionTableSQL(
      "story_characters",
      columns,
      ["story_id", "character_id"],
    );
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "story_characters"');
    expect(sql).toContain('"story_id"');
    expect(sql).toContain('"character_id"');
    expect(sql).toContain('PRIMARY KEY("story_id", "character_id")');
  });

  it("generateJunctionTableSQL 应在 REFERENCES 中用双引号包裹引用表和列", () => {
    const columns: Record<string, ColumnDef> = {
      story_id: { type: "TEXT", notNull: true, ref: "stories(id)" },
    };
    const sql = generateJunctionTableSQL("junction", columns, ["story_id"]);
    expect(sql).toContain('REFERENCES "stories"("id")');
  });

  it("generateJunctionTableSQL 应在 INDEX 语句中用双引号包裹表名和列名", () => {
    const columns: Record<string, ColumnDef> = {
      story_id: { type: "TEXT", notNull: true, ref: "stories(id)" },
    };
    const sql = generateJunctionTableSQL("junction", columns, ["story_id"]);
    expect(sql).toContain('ON "junction"("story_id")');
  });

  it("生成的 SQL 不应包含未引号包裹的表名（防注入）", () => {
    const def: TableDef = {
      name: "my_table",
      columns: {
        col1: { type: "TEXT" },
      },
    };
    const sql = generateTableSQL(def);
    // 不应存在未引号包裹的 my_table（如 `TABLE my_table` 而非 `TABLE "my_table"`）
    expect(sql).not.toMatch(/TABLE\s+my_table\b/);
    expect(sql).not.toMatch(/INDEX[^"]*\s+my_table\b/);
  });
});
