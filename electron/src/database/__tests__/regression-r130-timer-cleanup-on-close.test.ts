/**
 * R130: 定时器必须在关闭时清理
 * 回归防护: 确保 closeDatabase 清理所有定时器
 *           （backupStartupTimer、softDeleteStartupTimer、backupInterval、softDeleteCleanupInterval），
 *           防止进程关闭后定时器仍触发。
 *           同时确保 startScheduledBackup 和 startSoftDeleteCleanup 重复调用不创建多个定时器。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// 提升 mock，确保在模块导入前生效
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
  mockGetDbPaths,
  mockEnsureDbDir,
  mockGetSchemaSQL,
  mockCreateOptimalDatabase,
  mockRunMigrations,
} = vi.hoisted(() => ({
  mockExistsSync: vi.fn(() => false),
  mockReadFileSync: vi.fn(() => ""),
  mockWriteFileSync: vi.fn(),
  mockReaddirSync: vi.fn(() => []),
  mockStatSync: vi.fn(() => ({ mtimeMs: Date.now(), mtime: new Date() })),
  mockCopyFileSync: vi.fn(),
  mockRenameSync: vi.fn(),
  mockUnlinkSync: vi.fn(),
  mockMkdirSync: vi.fn(),
  mockGetDbPaths: vi.fn(() => ({
    DB_PATH: "/tmp/test-database.db",
    DB_TYPE_FILE: "/tmp/test-database.db.type",
  })),
  mockEnsureDbDir: vi.fn(),
  mockGetSchemaSQL: vi.fn(() => ""),
  mockCreateOptimalDatabase: vi.fn(),
  mockRunMigrations: vi.fn(),
}));

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => "/tmp/test-user-data"),
    getName: vi.fn(() => "ai-animation-studio"),
    getVersion: vi.fn(() => "1.0.0"),
  },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
}));

vi.mock("better-sqlite3", () => ({
  default: vi.fn(),
}));

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

vi.mock("./db-schema", () => ({
  getDbPaths: mockGetDbPaths,
  ensureDbDir: mockEnsureDbDir,
  getSchemaSQL: mockGetSchemaSQL,
  getAllTableDefs: vi.fn(() => []),
}));

vi.mock("./migrations", () => ({
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
    isOpen: vi.fn(() => true),
    type: "better-sqlite3",
    init: vi.fn().mockResolvedValue(undefined),
    transaction: vi.fn((fn: () => void) => fn),
    pragma: vi.fn(),
    checkpoint: vi.fn(),
    backup: vi.fn(() => ({ close: vi.fn() })),
  };
}

describe("R130: 定时器必须在关闭时清理", () => {
  let dbConnection: typeof import("../db-connection");
  let setTimeoutSpy: ReturnType<typeof vi.spyOn>;
  let clearTimeoutSpy: ReturnType<typeof vi.spyOn>;
  let setIntervalSpy: ReturnType<typeof vi.spyOn>;
  let clearIntervalSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    mockExistsSync.mockReturnValue(false);
    mockGetDbPaths.mockReturnValue({
      DB_PATH: "/tmp/test-database.db",
      DB_TYPE_FILE: "/tmp/test-database.db.type",
    });
    mockGetSchemaSQL.mockReturnValue("");

    const mockDb = createMockDb();
    mockCreateOptimalDatabase.mockReturnValue(mockDb);

    // 使用真实定时器但通过 spy 跟踪调用
    // 使用 0 延迟避免阻塞测试
    setTimeoutSpy = vi.spyOn(global, "setTimeout").mockImplementation(((_cb: () => void) => {
      // 不实际执行，只返回假 ID 以便跟踪
      return 1 as unknown as NodeJS.Timeout;
    }) as typeof setTimeout);
    clearTimeoutSpy = vi.spyOn(global, "clearTimeout").mockImplementation((() => {
      // no-op
    }) as typeof clearTimeout);
    setIntervalSpy = vi.spyOn(global, "setInterval").mockImplementation(((_cb: () => void) => {
      // 不实际执行，只返回假 ID 以便跟踪
      return 2 as unknown as NodeJS.Timeout;
    }) as typeof setInterval);
    clearIntervalSpy = vi.spyOn(global, "clearInterval").mockImplementation((() => {
      // no-op
    }) as typeof clearInterval);

    dbConnection = await import("../db-connection");
    try {
      dbConnection.closeDatabase();
    } catch {
      // 忽略未初始化时的关闭错误
    }
  });

  afterEach(() => {
    try {
      dbConnection.closeDatabase();
    } catch {
      // 忽略
    }
    setTimeoutSpy.mockRestore();
    clearTimeoutSpy.mockRestore();
    setIntervalSpy.mockRestore();
    clearIntervalSpy.mockRestore();
  });

  it("closeDatabase 应清除 backupStartupTimer", async () => {
    await dbConnection.initDatabase();

    // initDatabase 调用 startScheduledBackup 和 startSoftDeleteCleanup，
    // 各创建一个 setTimeout（backupStartupTimer 和 softDeleteStartupTimer）
    const setTimeoutCallsBeforeClose = setTimeoutSpy.mock.calls.length;
    expect(setTimeoutCallsBeforeClose).toBeGreaterThanOrEqual(2);

    dbConnection.closeDatabase();

    // closeDatabase 应调用 clearTimeout 清除 startup timers
    expect(clearTimeoutSpy).toHaveBeenCalled();
    // 至少清除 2 个 startup timer
    expect(clearTimeoutSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("closeDatabase 应清除 softDeleteStartupTimer", async () => {
    await dbConnection.initDatabase();

    // 记录 close 前的 clearTimeout 调用次数
    const clearTimeoutCallsBefore = clearTimeoutSpy.mock.calls.length;

    dbConnection.closeDatabase();

    // close 后 clearTimeout 调用次数应增加（清除 softDeleteStartupTimer）
    expect(clearTimeoutSpy.mock.calls.length).toBeGreaterThan(clearTimeoutCallsBefore);
  });

  it("closeDatabase 应清除 backupInterval", async () => {
    await dbConnection.initDatabase();

    // 手动触发 backupStartupTimer 回调以创建 backupInterval
    // 找到 startScheduledBackup 的 setTimeout 回调（第一个 setTimeout 调用）
    const setTimeoutCalls = setTimeoutSpy.mock.calls;
    expect(setTimeoutCalls.length).toBeGreaterThanOrEqual(2);

    // 触发所有 setTimeout 回调以创建 interval timers
    for (const call of setTimeoutCalls) {
      const callback = call[0] as (() => void) | undefined;
      if (typeof callback === "function") {
        callback();
      }
    }

    // 现在 setInterval 应被调用（创建 backupInterval 和 softDeleteCleanupInterval）
    expect(setIntervalSpy.mock.calls.length).toBeGreaterThanOrEqual(2);

    // 记录 close 前的 clearInterval 调用次数
    const clearIntervalCallsBefore = clearIntervalSpy.mock.calls.length;

    dbConnection.closeDatabase();

    // close 后 clearInterval 应被调用以清除 interval timers
    expect(clearIntervalSpy.mock.calls.length).toBeGreaterThan(clearIntervalCallsBefore);
  });

  it("closeDatabase 应清除 softDeleteCleanupInterval", async () => {
    await dbConnection.initDatabase();

    // 触发所有 setTimeout 回调以创建 interval timers
    const setTimeoutCalls = setTimeoutSpy.mock.calls;
    for (const call of setTimeoutCalls) {
      const callback = call[0] as (() => void) | undefined;
      if (typeof callback === "function") {
        callback();
      }
    }

    // 记录 close 前的 clearInterval 调用次数
    const clearIntervalCallsBefore = clearIntervalSpy.mock.calls.length;

    dbConnection.closeDatabase();

    // close 后 clearInterval 应被调用至少 2 次（清除 backupInterval 和 softDeleteCleanupInterval）
    expect(clearIntervalSpy.mock.calls.length - clearIntervalCallsBefore).toBeGreaterThanOrEqual(2);
  });

  it("startScheduledBackup 重复调用不应创建多个定时器", async () => {
    await dbConnection.initDatabase();

    // 记录第一次 initDatabase 后的 setTimeout 调用次数
    const setTimeoutCallsAfterInit = setTimeoutSpy.mock.calls.length;

    // 再次调用 initDatabase（应因 initDbPromise 守卫而直接返回，不创建新定时器）
    await dbConnection.initDatabase();

    // setTimeout 调用次数不应增加
    expect(setTimeoutSpy.mock.calls.length).toBe(setTimeoutCallsAfterInit);
  });

  it("startSoftDeleteCleanup 重复调用不应创建多个定时器", async () => {
    await dbConnection.initDatabase();

    const setTimeoutCallsAfterInit = setTimeoutSpy.mock.calls.length;
    const setIntervalCallsAfterInit = setIntervalSpy.mock.calls.length;

    // 再次调用 initDatabase（应因 initDbPromise 守卫而直接返回）
    await dbConnection.initDatabase();

    // 定时器调用次数不应增加
    expect(setTimeoutSpy.mock.calls.length).toBe(setTimeoutCallsAfterInit);
    expect(setIntervalSpy.mock.calls.length).toBe(setIntervalCallsAfterInit);
  });
});
