/**
 * R141: db/run HTTP 路由必须在写操作后调用 scheduleSave
 * 回归防护: 确保 db/run 路由在 run() 成功后调用 scheduleSave()，
 *           与 IPC handler db:run 保持一致，防止写操作数据丢失。
 *
 * 问题场景：HTTP 路由 db/run 执行 INSERT/UPDATE/DELETE 后不触发持久化，
 *           WAL 日志虽写入但未 checkpoint 到主数据库文件，
 *           应用崩溃或异常退出时数据丢失。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockEnsureDbInitialized = vi.fn().mockResolvedValue(undefined);
const mockValidateSql = vi.fn();
const mockRun = vi.fn().mockResolvedValue({ changes: 1 });
const mockScheduleSave = vi.fn();
const mockGetDb = vi.fn();

vi.mock("../../handlers/database", () => ({
  ensureDbInitialized: mockEnsureDbInitialized,
  validateSql: mockValidateSql,
  scheduleSave: mockScheduleSave,
}));

vi.mock("../../database", () => ({
  getDb: mockGetDb,
  query: vi.fn(),
  run: mockRun,
}));

vi.mock("../../logging", () => ({
  getLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe("R141: db/run HTTP 路由必须调用 scheduleSave", () => {
  beforeEach(() => {
    mockEnsureDbInitialized.mockClear();
    mockValidateSql.mockClear();
    mockRun.mockClear();
    mockScheduleSave.mockClear();
    mockRun.mockResolvedValue({ changes: 1 });
  });

  it("db/run 成功后应调用 scheduleSave", async () => {
    const { dbRoutes } = await import("../route-groups/db-routes");
    const handler = dbRoutes["db/run"].handler;

    const result = await handler("POST", {
      sql: "INSERT INTO users (id, name) VALUES (?, ?)",
      params: ["u1", "test"],
    });

    expect(result.success).toBe(true);
    expect(mockRun).toHaveBeenCalledTimes(1);
    expect(mockScheduleSave).toHaveBeenCalledTimes(1);
  });

  it("db/run 失败时不应调用 scheduleSave", async () => {
    mockRun.mockRejectedValueOnce(new Error("SQL error"));

    const { dbRoutes } = await import("../route-groups/db-routes");
    const handler = dbRoutes["db/run"].handler;

    const result = await handler("POST", {
      sql: "INSERT INTO invalid_table VALUES (?)",
      params: ["test"],
    });

    expect(result.success).toBe(false);
    expect(mockScheduleSave).not.toHaveBeenCalled();
  });
});
