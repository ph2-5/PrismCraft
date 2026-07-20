/**
 * R139: validateSqlIdentifier 正则强化
 * 回归防护: 确保 validateSqlIdentifier 使用正则 ^[a-zA-Z_][a-zA-Z0-9_]*$ 校验
 *           标识符，拒绝包含特殊字符（如 ;、引号、空格、连字符）的标识符，
 *           防止 SQL 注入。
 *
 * 攻击场景：若标识符校验正则被弱化（如允许分号或引号），攻击者可通过
 * 构造恶意表名/列名注入 SQL。例如表名 `users; DROP TABLE users--` 会导致
 * SQL 注入。正则 ^[a-zA-Z_][a-zA-Z0-9_]*$ 只允许字母、数字和下划线，
 * 且必须以字母或下划线开头，可有效防止注入。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";

// 从源文件中提取 VALID_TABLE_IDENTIFIER 正则
// R139 修复：VALID_TABLE_IDENTIFIER 已从 db-connection.ts 提取到 db-schema-runner.ts，
// 因此优先从 db-schema-runner.ts 读取，若未找到则回退到 db-connection.ts（向后兼容）。
const dbSchemaRunnerContent = fs.readFileSync(
  path.resolve(__dirname, "../db-schema-runner.ts"),
  "utf-8",
);
const dbConnectionContent = fs.readFileSync(
  path.resolve(__dirname, "../db-connection.ts"),
  "utf-8",
);
const sourceContent = dbSchemaRunnerContent.includes("VALID_TABLE_IDENTIFIER")
  ? dbSchemaRunnerContent
  : dbConnectionContent;

// 提取正则字面量（如 /^[a-zA-Z_][a-zA-Z0-9_]*$/）
const regexMatch = sourceContent.match(
  /VALID_TABLE_IDENTIFIER\s*=\s*(\/(?:[^\\\/]|\\.)+\/[gimsuy]*)/,
);
if (!regexMatch) {
  throw new Error("无法从 db-schema-runner.ts 或 db-connection.ts 中提取 VALID_TABLE_IDENTIFIER 正则");
}
const regexLiteral = regexMatch[1];
const pattern = regexLiteral.slice(1, regexLiteral.lastIndexOf("/"));
const flags = regexLiteral.slice(regexLiteral.lastIndexOf("/") + 1);
const extractedRegex = new RegExp(pattern, flags);

// 提升 mock（用于 initDatabase 集成测试）
const {
  mockCreateOptimalDatabase,
  mockGetDbPaths,
  mockEnsureDbDir,
  mockGetSchemaSQL,
  mockRunMigrations,
  mockGetAllTableDefs,
} = vi.hoisted(() => ({
  mockCreateOptimalDatabase: vi.fn(),
  mockGetDbPaths: vi.fn(() => ({
    DB_PATH: "/tmp/test-r139-database.db",
    DB_TYPE_FILE: "/tmp/test-r139-database.db.type",
  })),
  mockEnsureDbDir: vi.fn(),
  mockGetSchemaSQL: vi.fn(() => ""),
  mockRunMigrations: vi.fn(),
  mockGetAllTableDefs: vi.fn(() => []),
}));

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => "/tmp/test-r139-user-data"),
    getAppPath: vi.fn(() => "/tmp/test-r139-app"),
  },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
}));

vi.mock("better-sqlite3", () => ({
  default: vi.fn(),
}));

// 不 mock fs — 测试需要真实的 fs.readFileSync 读取源文件，
// db-connection.ts 中的 fs 调用在恢复路径中使用，mocked 路径指向 /tmp/ 不会产生副作用

vi.mock("../../logging/logger", () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock("../../db-interface", () => ({
  createOptimalDatabase: mockCreateOptimalDatabase,
}));

vi.mock("../db-schema", () => ({
  getDbPaths: mockGetDbPaths,
  ensureDbDir: mockEnsureDbDir,
  getSchemaSQL: mockGetSchemaSQL,
  getAllTableDefs: mockGetAllTableDefs,
}));

vi.mock("../migrations", () => ({
  CURRENT_SCHEMA_VERSION: 1,
  runMigrations: mockRunMigrations,
}));

function createMockDb() {
  return {
    prepare: vi.fn(() => ({
      all: vi.fn(() => []),
      run: vi.fn(() => ({ changes: 0 })),
      get: vi.fn(() => ({ v: 1 })),
    })),
    exec: vi.fn(),
    close: vi.fn(),
    pragma: vi.fn(),
    transaction: vi.fn((fn: () => void) => fn),
    checkpoint: vi.fn(),
    init: vi.fn().mockResolvedValue(undefined),
  };
}

describe("R139: validateSqlIdentifier 正则强化", () => {
  describe("正则模式验证", () => {
    it("应从源文件中成功提取 VALID_TABLE_IDENTIFIER 正则", () => {
      expect(regexMatch).not.toBeNull();
      expect(extractedRegex).toBeInstanceOf(RegExp);
    });

    it("正则应以 ^ 开头，确保从头匹配", () => {
      expect(pattern).toMatch(/^\^/);
    });

    it("正则应以 $ 结尾，确保完整匹配", () => {
      expect(pattern).toMatch(/\$$/);
    });
  });

  describe("合法标识符应通过校验", () => {
    const validIdentifiers = [
      "users",
      "characters",
      "video_tasks",
      "_private",
      "_",
      "table_name",
      "TableName",
      "column1",
      "a",
      "A",
      "a1",
      "A1",
      "foo_bar_baz",
      "story_beats",
      "media_assets",
    ];

    for (const identifier of validIdentifiers) {
      it(`"${identifier}" 应通过校验`, () => {
        expect(extractedRegex.test(identifier)).toBe(true);
      });
    }
  });

  describe("非法标识符应被拒绝", () => {
    const invalidIdentifiers = [
      "1table", // 以数字开头
      "table-name", // 包含连字符
      "table; DROP", // 包含分号和空格
      'table"name', // 包含双引号
      "table'name", // 包含单引号
      "table`name", // 包含反引号
      "table name", // 包含空格
      "table.name", // 包含点号
      "table,name", // 包含逗号
      "table(name)", // 包含括号
      "table[name]", // 包含方括号
      "table{name}", // 包含花括号
      "table+name", // 包含加号
      "table=name", // 包含等号
      "table@name", // 包含 @
      "table#name", // 包含 #
      "table$name", // 包含 $
      "table%name", // 包含 %
      "table&name", // 包含 &
      "table*name", // 包含 *
      "table!name", // 包含 !
      "table|name", // 包含 |
      "table\\name", // 包含反斜杠
      "table/name", // 包含斜杠
      "table<name", // 包含 <
      "table>name", // 包含 >
      "table\nname", // 包含换行符
      "table\0name", // 包含空字符
      "", // 空字符串
      " table", // 前导空格
      "table ", // 后导空格
    ];

    for (const identifier of invalidIdentifiers) {
      it(`"${identifier.replace(/\n/g, "\\n").replace(/\0/g, "\\0")}" 应被拒绝`, () => {
        expect(extractedRegex.test(identifier)).toBe(false);
      });
    }
  });

  describe("SQL 注入尝试应被拒绝", () => {
    const injectionAttempts = [
      "users; DROP TABLE users--",
      "users; DROP TABLE users;",
      "users--",
      "users/*",
      "users*/",
      "users UNION SELECT * FROM users",
      "users; INSERT INTO admin VALUES('hacker')",
      "users' OR '1'='1",
      'users" OR "1"="1',
      "users) OR (1=1",
      "users; UPDATE users SET role='admin' WHERE 1=1--",
    ];

    for (const attempt of injectionAttempts) {
      it(`SQL 注入 "${attempt.substring(0, 40)}..." 应被拒绝`, () => {
        expect(extractedRegex.test(attempt)).toBe(false);
      });
    }
  });

  describe("initDatabase 集成测试 - 非法表名应导致初始化失败", () => {
    let dbConnection: typeof import("../db-connection");

    beforeEach(async () => {
      vi.clearAllMocks();
      vi.resetModules();
      mockGetDbPaths.mockReturnValue({
        DB_PATH: "/tmp/test-r139-database.db",
        DB_TYPE_FILE: "/tmp/test-r139-database.db.type",
      });
      mockGetSchemaSQL.mockReturnValue("");
      const mockDb = createMockDb();
      mockCreateOptimalDatabase.mockReturnValue(mockDb);
      dbConnection = await import("../db-connection");
      try {
        dbConnection.closeDatabase();
      } catch {
        // ignore
      }
    });

    it("非法表名应导致 initDatabase 抛出错误", async () => {
      // 模拟 getAllTableDefs 返回包含非法表名的表定义
      mockGetAllTableDefs.mockReturnValue([
        {
          name: "users; DROP TABLE users--",
          columns: { name: { type: "TEXT" } },
          baseColumns: true,
        },
      ]);

      await expect(dbConnection.initDatabase()).rejects.toThrow();
    });

    it("合法表名应通过校验（不因标识符校验抛出）", async () => {
      mockGetAllTableDefs.mockReturnValue([
        {
          name: "valid_table",
          columns: { name: { type: "TEXT" } },
          baseColumns: true,
        },
      ]);

      // 应成功初始化（不因标识符校验抛出）
      const db = await dbConnection.initDatabase();
      expect(db).toBeDefined();
      dbConnection.closeDatabase();
    });

    it("非法列名应导致 initDatabase 抛出错误", async () => {
      mockGetAllTableDefs.mockReturnValue([
        {
          name: "valid_table",
          columns: { "column; DROP TABLE--": { type: "TEXT" } },
          baseColumns: true,
        },
      ]);

      // 需要让 migrateSchema 认为表已存在（PRAGMA table_info 返回非空），
      // 这样才会进入列名校验流程
      const mockDb = createMockDb();
      mockDb.prepare = vi.fn((sql: string) => {
        if (sql.includes("PRAGMA table_info")) {
          return {
            all: vi.fn(() => [{ name: "existing_column" }]),
            run: vi.fn(() => ({ changes: 0 })),
            get: vi.fn(() => ({ v: 1 })),
          };
        }
        return {
          all: vi.fn(() => []),
          run: vi.fn(() => ({ changes: 0 })),
          get: vi.fn(() => ({ v: 1 })),
        };
      });
      mockCreateOptimalDatabase.mockReturnValue(mockDb);

      await expect(dbConnection.initDatabase()).rejects.toThrow();
    });
  });
});
