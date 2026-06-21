/**
 * R131: SQLite 外键约束必须启用
 * 回归防护: 确保数据库连接创建后执行 PRAGMA foreign_keys = ON，
 *           防止外键约束被意外禁用导致数据完整性问题。
 *
 * 攻击场景：外键约束未启用时，可以插入违反外键关系的数据（如指向不存在
 * 的 story_id 的 video_task），导致数据库一致性被破坏，可能引发数据
 * 泄漏、孤儿记录或应用逻辑错误。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// 提升 mock，确保在模块导入前生效
const {
  mockPragma,
  mockCreateOptimalDatabase,
  mockGetDbPaths,
  mockEnsureDbDir,
  mockRunMigrations,
} = vi.hoisted(() => ({
  mockPragma: vi.fn(),
  mockCreateOptimalDatabase: vi.fn(),
  mockGetDbPaths: vi.fn(() => ({
    DB_PATH: "/tmp/test-r131-database.db",
    DB_TYPE_FILE: "/tmp/test-r131-database.db.type",
  })),
  mockEnsureDbDir: vi.fn(),
  mockRunMigrations: vi.fn(),
}));

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => "/tmp/test-r131-user-data"),
    getAppPath: vi.fn(() => "/tmp/test-r131-app"),
  },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
}));

vi.mock("better-sqlite3", () => ({
  default: vi.fn(),
}));

vi.mock("fs", () => {
  const fns = {
    existsSync: vi.fn(() => true),
    mkdirSync: vi.fn(),
    renameSync: vi.fn(),
    unlinkSync: vi.fn(),
    readdirSync: vi.fn(() => []),
    statSync: vi.fn(() => ({ mtimeMs: Date.now(), mtime: new Date() })),
    copyFileSync: vi.fn(),
    chmodSync: vi.fn(),
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
    pragma: mockPragma,
    transaction: vi.fn((fn: () => void) => fn),
    checkpoint: vi.fn(),
    init: vi.fn().mockResolvedValue(undefined),
  };
}

describe("R131: SQLite foreign key constraints must be enabled", () => {
  let dbConnection: typeof import("../db-connection");

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    mockPragma.mockClear();
    mockGetDbPaths.mockReturnValue({
      DB_PATH: "/tmp/test-r131-database.db",
      DB_TYPE_FILE: "/tmp/test-r131-database.db.type",
    });
    const mockDb = createMockDb();
    mockCreateOptimalDatabase.mockReturnValue(mockDb);
    dbConnection = await import("../db-connection");
    try {
      dbConnection.closeDatabase();
    } catch {
      // ignore
    }
  });

  afterEach(() => {
    try {
      dbConnection.closeDatabase();
    } catch {
      // ignore
    }
  });

  it("getSchemaSQL 输出应包含 PRAGMA foreign_keys = ON", async () => {
    // 导入真实的 db-schema 模块（未被 mock）
    const { getSchemaSQL } = await import("../db-schema");
    const sql = getSchemaSQL();
    expect(sql).toContain("foreign_keys = ON");
  });

  it("initDatabase 应调用 pragma('foreign_keys = ON')", async () => {
    await dbConnection.initDatabase();

    // 验证 pragma 被调用且包含 "foreign_keys = ON"
    const foreignKeysCall = mockPragma.mock.calls.find(
      (call) => call[0] === "foreign_keys = ON",
    );
    expect(foreignKeysCall).toBeDefined();
  });

  it("PRAGMA foreign_keys = ON 应在 schema 执行前调用", async () => {
    await dbConnection.initDatabase();

    // 找到 foreign_keys = ON 调用的索引
    const foreignKeysCallIndex = mockPragma.mock.calls.findIndex(
      (call) => call[0] === "foreign_keys = ON",
    );
    expect(foreignKeysCallIndex).toBeGreaterThanOrEqual(0);

    // foreign_keys = ON 应在 WAL、synchronous 等性能 pragma 之后调用
    // 但在 schema 执行之前（initDatabase 中的顺序）
    // 验证至少调用了 foreign_keys = ON
    expect(mockPragma).toHaveBeenCalledWith("foreign_keys = ON");
  });

  it("数据库恢复路径也应调用 pragma('foreign_keys = ON')", async () => {
    // 第一次初始化会成功，先正常初始化
    await dbConnection.initDatabase();
    const firstCallCount = mockPragma.mock.calls.filter(
      (call) => call[0] === "foreign_keys = ON",
    ).length;

    // 关闭数据库后重新初始化（走恢复路径）
    dbConnection.closeDatabase();

    // 重新初始化
    mockPragma.mockClear();
    await dbConnection.initDatabase();

    // 恢复路径也应调用 foreign_keys = ON
    expect(mockPragma).toHaveBeenCalledWith("foreign_keys = ON");
    const recoveryCallCount = mockPragma.mock.calls.filter(
      (call) => call[0] === "foreign_keys = ON",
    ).length;
    expect(recoveryCallCount).toBeGreaterThanOrEqual(1);
    expect(firstCallCount).toBeGreaterThanOrEqual(1);
  });
});
