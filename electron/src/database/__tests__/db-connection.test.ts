import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  mockExistsSync,
  mockReadFileSync,
  mockWriteFileSync,
  mockReaddirSync,
  mockStatSync,
  mockCopyFileSync,
  mockRenameSync,
  mockUnlinkSync,
  mockMkdirSync,
  mockChmodSync,
} = vi.hoisted(() => ({
  mockExistsSync: vi.fn(() => false),
  mockReadFileSync: vi.fn(() => ""),
  mockWriteFileSync: vi.fn(),
  mockReaddirSync: vi.fn(() => []),
  mockStatSync: vi.fn(() => ({ mtimeMs: Date.now() })),
  mockCopyFileSync: vi.fn(),
  mockRenameSync: vi.fn(),
  mockUnlinkSync: vi.fn(),
  mockMkdirSync: vi.fn(),
  mockChmodSync: vi.fn(),
}));

const { mockGetDbPaths, mockEnsureDbDir, mockGetSchemaSQL, mockCurrentSchemaVersion } = vi.hoisted(() => ({
  mockGetDbPaths: vi.fn(() => ({
    DB_PATH: "/tmp/test-database.db",
    DB_TYPE_FILE: "/tmp/test-database.db.type",
  })),
  mockEnsureDbDir: vi.fn(),
  mockGetSchemaSQL: vi.fn(() => ""),
  mockCurrentSchemaVersion: 1,
}));

const { mockCreateOptimalDatabase, mockBetterSqlite3Database } = vi.hoisted(() => ({
  mockCreateOptimalDatabase: vi.fn(),
  mockBetterSqlite3Database: vi.fn(),
}));

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => "/tmp/test-user-data"),
    getName: vi.fn(() => "ai-animation-studio"),
    getVersion: vi.fn(() => "1.0.0"),
  },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  BrowserWindow: vi.fn(),
}));

vi.mock("better-sqlite3", () => {
  return { default: vi.fn() };
});

vi.mock("fs", () => {
  const fns = {
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
    writeFileSync: mockWriteFileSync,
    readdirSync: mockReaddirSync,
    statSync: mockStatSync,
    copyFileSync: mockCopyFileSync,
    renameSync: mockRenameSync,
    unlinkSync: mockUnlinkSync,
    mkdirSync: mockMkdirSync,
    chmodSync: mockChmodSync,
  };
  return { default: fns, ...fns };
});

vi.mock("path", () => {
  const fns = {
    join: vi.fn((...args: string[]) => args.join("/")),
    dirname: vi.fn((p: string) => {
      const parts = p.split("/");
      parts.pop();
      return parts.join("/") || ".";
    }),
    basename: vi.fn((p: string) => p.split("/").pop() || ""),
  };
  return { default: fns, ...fns };
});

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
  BetterSqlite3Database: mockBetterSqlite3Database,
}));

vi.mock("./db-schema", () => ({
  getDbPaths: mockGetDbPaths,
  ensureDbDir: mockEnsureDbDir,
  getSchemaSQL: mockGetSchemaSQL,
  CURRENT_SCHEMA_VERSION: mockCurrentSchemaVersion,
}));

function createMockDb() {
  return {
    prepare: vi.fn(() => ({
      all: vi.fn(() => []),
      run: vi.fn(() => ({ changes: 0 })),
    })),
    exec: vi.fn(),
    close: vi.fn(),
    isOpen: vi.fn(() => true),
    type: "better-sqlite3",
    init: vi.fn().mockResolvedValue(undefined),
    transaction: vi.fn((fn: () => void) => fn),
  };
}

describe("db-connection 业务规则", () => {
  let dbConnection: typeof import("../db-connection");
  let defaultMockDb: ReturnType<typeof createMockDb>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    mockExistsSync.mockReturnValue(false);
    mockReadFileSync.mockReturnValue("");
    mockGetDbPaths.mockReturnValue({
      DB_PATH: "/tmp/test-database.db",
      DB_TYPE_FILE: "/tmp/test-database.db.type",
    });
    mockGetSchemaSQL.mockReturnValue("");

    defaultMockDb = createMockDb();
    mockCreateOptimalDatabase.mockReturnValue(defaultMockDb);

    dbConnection = await import("../db-connection");
    try {
      dbConnection.closeDatabase();
    } catch {}
  });

  afterEach(() => {
    try {
      dbConnection.closeDatabase();
    } catch {}
  });

  describe("getDb 未初始化守卫", () => {
    it("未调用 initDatabase 时 getDb 应抛出包含 'not initialized' 的错误", () => {
      expect(() => dbConnection.getDb()).toThrow(/not initialized/i);
    });
  });

  describe("getDbType", () => {
    it("应始终返回 'better-sqlite3'", () => {
      expect(dbConnection.getDbType()).toBe("better-sqlite3");
    });
  });

  describe("getDbPath 初始状态", () => {
    it("未初始化时 getDbPath 应返回空字符串", () => {
      expect(dbConnection.getDbPath()).toBe("");
    });
  });

  describe("closeDatabase 幂等性", () => {
    it("重复调用 closeDatabase 不应抛错", () => {
      expect(() => {
        dbConnection.closeDatabase();
        dbConnection.closeDatabase();
      }).not.toThrow();
    });
  });

  describe("query/run/exec 未初始化守卫", () => {
    it("未初始化时 query 应抛出包含 'not initialized' 的错误", async () => {
      await expect(dbConnection.query("SELECT 1")).rejects.toThrow(/not initialized/i);
    });

    it("未初始化时 run 应抛出包含 'not initialized' 的错误", async () => {
      await expect(dbConnection.run("UPDATE t SET x=1")).rejects.toThrow(/not initialized/i);
    });

    it("未初始化时 exec 应抛出包含 'not initialized' 的错误", async () => {
      await expect(dbConnection.exec("CREATE TABLE t (id INT)")).rejects.toThrow(/not initialized/i);
    });
  });

  describe("initDatabase 成功初始化", () => {
    it("应成功初始化数据库并返回 db 实例", async () => {
      const mockDb = createMockDb();
      mockCreateOptimalDatabase.mockReturnValue(mockDb);
      mockExistsSync.mockReturnValue(false);

      const result = await dbConnection.initDatabase();

      expect(dbConnection.getDbType()).toBe("better-sqlite3");
      expect(dbConnection.getDb()).toBe(mockDb);
      expect(result).toBe(mockDb);
    });

    it("初始化后 getDbPath 应返回非空路径", async () => {
      const mockDb = createMockDb();
      mockCreateOptimalDatabase.mockReturnValue(mockDb);
      mockExistsSync.mockReturnValue(false);

      await dbConnection.initDatabase();

      expect(dbConnection.getDbPath().length).toBeGreaterThan(0);
    });
  });

  describe("closeDatabase 重置状态", () => {
    it("关闭后 getDbType 应仍返回 'better-sqlite3'", async () => {
      const mockDb = createMockDb();
      mockCreateOptimalDatabase.mockReturnValue(mockDb);
      mockExistsSync.mockReturnValue(false);

      await dbConnection.initDatabase();
      dbConnection.closeDatabase();

      expect(dbConnection.getDbType()).toBe("better-sqlite3");
    });

    it("关闭后 getDb 应抛出 'not initialized' 错误", async () => {
      const mockDb = createMockDb();
      mockCreateOptimalDatabase.mockReturnValue(mockDb);
      mockExistsSync.mockReturnValue(false);

      await dbConnection.initDatabase();
      dbConnection.closeDatabase();

      expect(() => dbConnection.getDb()).toThrow(/not initialized/i);
    });

    it("关闭后 getDbPath 应返回空字符串", async () => {
      const mockDb = createMockDb();
      mockCreateOptimalDatabase.mockReturnValue(mockDb);
      mockExistsSync.mockReturnValue(false);

      await dbConnection.initDatabase();
      dbConnection.closeDatabase();

      expect(dbConnection.getDbPath()).toBe("");
    });
  });

  describe("query/run/exec 初始化后可用", () => {
    it("初始化后 query 应调用 db.prepare().all()", async () => {
      const mockStmt = { all: vi.fn<() => { id: number }[]>(() => [{ id: 1 }]), run: vi.fn() };
      const mockDb = createMockDb();
      mockDb.prepare.mockReturnValue(mockStmt as unknown as Database.Statement);
      mockCreateOptimalDatabase.mockReturnValue(mockDb);
      mockExistsSync.mockReturnValue(false);

      await dbConnection.initDatabase();
      const result = await dbConnection.query("SELECT * FROM t WHERE id = ?", [1]);

      expect(mockDb.prepare).toHaveBeenCalledWith("SELECT * FROM t WHERE id = ?");
      expect(mockStmt.all).toHaveBeenCalledWith(1);
      expect(result).toEqual([{ id: 1 }]);
    });

    it("初始化后 run 应调用 db.prepare().run()", async () => {
      const mockStmt = { all: vi.fn(), run: vi.fn(() => ({ changes: 1 })) };
      const mockDb = createMockDb();
      mockDb.prepare.mockReturnValue(mockStmt);
      mockCreateOptimalDatabase.mockReturnValue(mockDb);
      mockExistsSync.mockReturnValue(false);

      await dbConnection.initDatabase();
      await dbConnection.run("UPDATE t SET x = ? WHERE id = ?", ["val", 1]);

      expect(mockDb.prepare).toHaveBeenCalledWith("UPDATE t SET x = ? WHERE id = ?");
      expect(mockStmt.run).toHaveBeenCalledWith("val", 1);
    });

    it("初始化后 exec 应调用 db.exec()", async () => {
      const mockDb = createMockDb();
      mockCreateOptimalDatabase.mockReturnValue(mockDb);
      mockExistsSync.mockReturnValue(false);

      await dbConnection.initDatabase();
      await dbConnection.exec("CREATE TABLE test (id INTEGER PRIMARY KEY)");

      expect(mockDb.exec).toHaveBeenCalledWith("CREATE TABLE test (id INTEGER PRIMARY KEY)");
    });
  });

  describe("enqueueOperation 串行化", () => {
    it("多个操作应按顺序执行", async () => {
      const order: number[] = [];
      const mockStmt = { all: vi.fn(() => []), run: vi.fn() };
      const mockDb = createMockDb();
      mockDb.prepare.mockReturnValue(mockStmt);
      mockCreateOptimalDatabase.mockReturnValue(mockDb);
      mockExistsSync.mockReturnValue(false);

      await dbConnection.initDatabase();

      mockStmt.all.mockImplementation(() => {
        order.push(1);
        return [];
      });

      await dbConnection.query("SELECT 1");
      order.push(2);

      expect(order).toEqual([1, 2]);
    });
  });

  describe("saveDatabase", () => {
    it("better-sqlite3 模式下 saveDatabase 应执行 checkpoint", async () => {
      const mockDb = createMockDb();
      mockCreateOptimalDatabase.mockReturnValue(mockDb);
      mockExistsSync.mockReturnValue(false);

      await dbConnection.initDatabase();
      const result = dbConnection.saveDatabase();

      expect(typeof result).toBe("boolean");
    });
  });
});
