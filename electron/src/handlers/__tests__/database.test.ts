import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockInitDatabase,
  mockGetDb,
  mockGetDbType,
  mockSaveDatabase,
  mockQuery,
  mockRun,
  mockExec,
  mockMigrateToBetterSqlite3,
  mockCloseDatabase,
} = vi.hoisted(() => ({
  mockInitDatabase: vi.fn().mockResolvedValue({}),
  mockGetDb: vi.fn(),
  mockGetDbType: vi.fn().mockReturnValue("better-sqlite3"),
  mockSaveDatabase: vi.fn(),
  mockQuery: vi.fn().mockResolvedValue([]),
  mockRun: vi.fn().mockResolvedValue({ changes: 0 }),
  mockExec: vi.fn().mockResolvedValue(undefined),
  mockMigrateToBetterSqlite3: vi.fn().mockResolvedValue({ success: true }),
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
  migrateToBetterSqlite3: mockMigrateToBetterSqlite3,
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

import { setupDatabaseHandlers } from "../database";

interface IpcHandlerResult {
  success: boolean;
  data?: unknown;
  error?: string;
  dbType?: string;
}

function extractHandlers(): Map<string, (...args: unknown[]) => Promise<IpcHandlerResult>> {
  const handlers = new Map<string, (...args: unknown[]) => Promise<IpcHandlerResult>>();
  mockIpcMainHandle.mockImplementation(((channel: string, handler: (...args: unknown[]) => Promise<IpcHandlerResult>) => {
    handlers.set(channel, handler);
  }) as any);
  setupDatabaseHandlers();
  return handlers;
}

describe("database IPC handler - validateSql", () => {
  let handlers: Map<string, (...args: unknown[]) => Promise<IpcHandlerResult>>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockInitDatabase.mockResolvedValue({});
    handlers = extractHandlers();
  });

  describe("db:query", () => {
    it("应返回查询结果", async () => {
      const mockRows = [{ id: 1, name: "角色A" }];
      mockQuery.mockResolvedValue(mockRows);

      const handler = handlers.get("db:query")!;
      const result = await handler({}, "SELECT * FROM characters");

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockRows);
    });

    it("应拦截包含 DROP 的 SQL", async () => {
      const handler = handlers.get("db:query")!;
      const result = await handler({}, "DROP TABLE characters");

      expect(result.success).toBe(false);
      expect(result.error).toContain("not allowed");
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it("应拦截 ALTER TABLE ADD COLUMN", async () => {
      mockRun.mockResolvedValue({ changes: 0 });

      const handler = handlers.get("db:run")!;
      const result = await handler({}, "ALTER TABLE characters ADD COLUMN test_col TEXT");

      expect(result.success).toBe(false);
      expect(result.error).toContain("not allowed");
    });

    it("应拦截多语句 SQL 注入（分号分隔）", async () => {
      const handler = handlers.get("db:query")!;
      const result = await handler({}, "SELECT 1; DROP TABLE characters");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Dangerous");
    });

    it("应拦截 SQL 注释（--）", async () => {
      const handler = handlers.get("db:query")!;
      const result = await handler({}, "SELECT * FROM characters -- comment");

      expect(result.success).toBe(false);
      expect(result.error).toContain("comment");
    });

    it("应拦截 SQL 注释（/* */）", async () => {
      const handler = handlers.get("db:query")!;
      const result = await handler({}, "SELECT * FROM characters /* block comment */");

      expect(result.success).toBe(false);
    });

    it("应拦截不在白名单中的表名", async () => {
      const handler = handlers.get("db:query")!;
      const result = await handler({}, "SELECT * FROM evil_table");

      expect(result.success).toBe(false);
      expect(result.error).toContain("not in the allowed list");
    });

    it("应允许白名单中的表名", async () => {
      mockQuery.mockResolvedValue([]);
      const handler = handlers.get("db:query")!;
      const result = await handler({}, "SELECT * FROM characters");

      expect(result.success).toBe(true);
    });

    it("应拦截空 SQL", async () => {
      const handler = handlers.get("db:query")!;
      const result = await handler({}, "");

      expect(result.success).toBe(false);
    });

    it("应拦截非字符串 SQL", async () => {
      const handler = handlers.get("db:query")!;
      const result = await handler({}, 123);

      expect(result.success).toBe(false);
    });
  });

  describe("db:run", () => {
    it("应返回 changes 数量", async () => {
      mockRun.mockResolvedValue({ changes: 1 });

      const handler = handlers.get("db:run")!;
      const result = await handler({}, "UPDATE characters SET name = ? WHERE id = ?", ["新名称", 1]);

      expect(result.success).toBe(true);
      expect((result.data as any).changes).toBe(1);
    });

    it("应拦截不在白名单中的表名", async () => {
      const handler = handlers.get("db:run")!;
      const result = await handler({}, "INSERT INTO evil_table (col) VALUES (?)", ["hack"]);

      expect(result.success).toBe(false);
      expect(result.error).toContain("not in the allowed list");
    });

    it("应拦截 CREATE TABLE IF NOT EXISTS", async () => {
      const handler = handlers.get("db:run")!;
      const result = await handler({}, "CREATE TABLE IF NOT EXISTS test_col (id INTEGER PRIMARY KEY)");

      expect(result.success).toBe(false);
      expect(result.error).toContain("not allowed");
    });
  });

  describe("db:transaction", () => {
    it("事务中任一语句包含 DDL 应整体拒绝", async () => {
      const handler = handlers.get("db:transaction")!;
      const stmts = [
        { sql: "INSERT INTO characters (name) VALUES (?)", params: ["角色A"] },
        { sql: "DROP TABLE scenes", params: [] },
      ];
      const result = await handler({}, stmts);

      expect(result.success).toBe(false);
    });

    it("事务中所有语句安全时应执行", async () => {
      const mockStmt = {
        all: vi.fn().mockReturnValue([]),
        run: vi.fn().mockReturnValue({ changes: 1 }),
      };
      const mockDb = {
        exec: vi.fn(),
        prepare: vi.fn().mockReturnValue(mockStmt),
        transaction: vi.fn().mockImplementation((fn: () => unknown[]) => fn),
      };
      mockGetDb.mockReturnValue(mockDb);

      const handler = handlers.get("db:transaction")!;
      const stmts = [
        { sql: "INSERT INTO characters (name) VALUES (?)", params: ["角色A"] },
        { sql: "INSERT INTO scenes (name) VALUES (?)", params: ["场景A"] },
      ];
      const result = await handler({}, stmts);

      expect(result.success).toBe(true);
    });
  });

  describe("db:init", () => {
    it("应返回数据库类型", async () => {
      mockInitDatabase.mockResolvedValue({});
      mockGetDbType.mockReturnValue("better-sqlite3");

      const handler = handlers.get("db:init")!;
      const result = await handler({});

      expect(result.success).toBe(true);
      expect(result.dbType).toBe("better-sqlite3");
    });

    it("初始化失败时 handler 应捕获异常并返回错误结构", async () => {
      mockInitDatabase.mockRejectedValueOnce(new Error("初始化失败"));
      mockGetDbType.mockReturnValue("");

      const freshHandlers = extractHandlers();
      const handler = freshHandlers.get("db:init")!;
      const result = await handler({});

      expect(result).toHaveProperty("success");
      if (!result.success) {
        expect(result.error).toContain("初始化失败");
      }
    });
  });

  describe("db:save", () => {
    it("应调用 saveDatabase", async () => {
      const handler = handlers.get("db:save")!;
      const result = await handler({});

      expect(result.success).toBe(true);
      expect(mockSaveDatabase).toHaveBeenCalled();
    });
  });

  describe("db:close", () => {
    it("应调用 closeDatabase", async () => {
      const handler = handlers.get("db:close")!;
      const result = await handler({});

      expect(result.success).toBe(true);
      expect(mockCloseDatabase).toHaveBeenCalled();
    });
  });

  describe("db:batch-insert", () => {
    it("应拒绝无效表名", async () => {
      const handler = handlers.get("db:batch-insert")!;
      const result = await handler({}, "evil_table", ["col1"], [{ col1: "val" }]);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid table name");
    });

    it("应拒绝无效列名", async () => {
      const handler = handlers.get("db:batch-insert")!;
      const result = await handler({}, "characters", ["1invalid"], [{ "1invalid": "val" }]);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid column names");
    });
  });

  describe("db:type", () => {
    it("应返回数据库类型", async () => {
      const initHandler = handlers.get("db:init")!;
      await initHandler({});

      mockGetDbType.mockReturnValue("better-sqlite3");
      const handler = handlers.get("db:type")!;
      const result = await handler({});

      expect(result.success).toBe(true);
      expect((result.data as any).type).toBe("better-sqlite3");
    });
  });
});
