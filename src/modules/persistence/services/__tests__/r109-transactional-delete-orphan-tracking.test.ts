/**
 * R109: 事务删除孤儿文件追踪测试
 *
 * 回归规则: src/modules/persistence/services/transactional-delete.ts 中的
 * cleanupLocalFiles 和 recordOrphanFile 必须正确追踪文件删除失败的情况。
 *
 * 当文件删除失败时，应将文件路径记录到 orphan_files 表供后续清理。
 * recordOrphanFile 自身失败不应影响主流程。非本地路径（http://、data:）应被跳过。
 *
 * 测试场景:
 * 1. 文件删除成功时不应记录到 orphan_files
 * 2. 文件删除失败时应记录到 orphan_files
 * 3. recordOrphanFile 自身失败不应影响主流程
 * 4. 非 local 路径（http://、data:）应被跳过
 */
import { vi, beforeEach } from "vitest";

const {
  mockSafeQuery,
  mockSafeRun,
  mockSafeTransaction,
  mockSanitizeIdentifier,
  mockSanitizeTable,
  mockFileStorage,
} = vi.hoisted(() => ({
  mockSafeQuery: vi.fn<(sql: string, params?: unknown[]) => Promise<unknown[]>>(),
  mockSafeRun: vi.fn<(sql: string, params?: unknown[]) => Promise<unknown>>(),
  mockSafeTransaction: vi.fn<(statements: { sql: string; params: unknown[] }[]) => Promise<unknown[]>>(),
  mockSanitizeIdentifier: vi.fn<(name: string) => string>((name) => `"${name}"`),
  mockSanitizeTable: vi.fn<(table: string) => string>((table) => `"${table}"`),
  mockFileStorage: {
    deleteFile: vi.fn<(filePath: string) => Promise<boolean>>(),
  },
}));

vi.mock("@/shared/db-core", () => ({
  safeQuery: mockSafeQuery,
  safeRun: mockSafeRun,
  safeTransaction: mockSafeTransaction,
}));

vi.mock("@/shared/sql-safety", () => ({
  sanitizeIdentifier: mockSanitizeIdentifier,
  sanitizeTable: mockSanitizeTable,
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
  },
  extractErrorMessage: vi.fn((e: unknown) => (e instanceof Error ? e.message : String(e))),
}));

vi.mock("@/shared/utils/safe-json", () => ({
  safeJsonParseArray: vi.fn((raw: unknown) => {
    if (!raw) return [];
    try {
      return JSON.parse(raw as string);
    } catch {
      return [];
    }
  }),
}));

vi.mock("@/infrastructure/di", () => ({
  container: {
    fileStorage: mockFileStorage,
  },
}));

import { deleteSceneWithRefs } from "../transactional-delete";

describe("R109: 事务删除孤儿文件追踪", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSafeRun.mockReset();
    mockSafeTransaction.mockResolvedValue([]);
    mockSafeQuery.mockResolvedValue([]);
    mockSafeRun.mockResolvedValue(undefined);
    mockFileStorage.deleteFile.mockResolvedValue(true);
  });

  it("文件删除成功时不应记录到 orphan_files", async () => {
    // 第一次 safeQuery: beatRows（空数组，不触发 cancelActiveTasksForBeats）
    mockSafeQuery.mockResolvedValueOnce([]);
    // 第二次 safeQuery: sceneRows
    mockSafeQuery.mockResolvedValueOnce([
      {
        ref_image_path: "/local/ref.png",
        generated_image: "/local/gen.png",
      },
    ]);

    const result = await deleteSceneWithRefs("scene-1");

    expect(result.ok).toBe(true);
    expect(mockFileStorage.deleteFile).toHaveBeenCalledTimes(2);
    // 验证没有 INSERT INTO orphan_files 调用
    const orphanInserts = mockSafeRun.mock.calls.filter(
      (call: unknown[]) => typeof call[0] === "string" && (call[0] as string).includes("INSERT INTO orphan_files"),
    );
    expect(orphanInserts).toHaveLength(0);
  });

  it("文件删除失败时应记录到 orphan_files", async () => {
    mockSafeQuery.mockResolvedValueOnce([]);
    mockSafeQuery.mockResolvedValueOnce([
      {
        ref_image_path: "/local/ref.png",
        generated_image: "/local/gen.png",
      },
    ]);
    mockFileStorage.deleteFile.mockRejectedValue(new Error("Permission denied"));

    const result = await deleteSceneWithRefs("scene-1");

    expect(result.ok).toBe(true);
    // 验证每个删除失败的文件都记录到 orphan_files
    const orphanInserts = mockSafeRun.mock.calls.filter(
      (call: unknown[]) => typeof call[0] === "string" && (call[0] as string).includes("INSERT INTO orphan_files"),
    );
    expect(orphanInserts).toHaveLength(2);
    // 验证记录的内容包含正确的文件路径和失败原因
    expect(orphanInserts[0]![1]).toContain("/local/ref.png");
    expect(orphanInserts[1]![1]).toContain("/local/gen.png");
  });

  it("recordOrphanFile 自身失败不应影响主流程", async () => {
    mockSafeQuery.mockResolvedValueOnce([]);
    mockSafeQuery.mockResolvedValueOnce([
      {
        ref_image_path: "/local/ref.png",
        generated_image: "/local/gen.png",
      },
    ]);
    mockFileStorage.deleteFile.mockRejectedValue(new Error("Delete failed"));
    // 让 INSERT INTO orphan_files 失败，但 CREATE TABLE 成功
    mockSafeRun.mockImplementation((sql: string) => {
      if (sql.includes("INSERT INTO orphan_files")) {
        return Promise.reject(new Error("DB write failed"));
      }
      return Promise.resolve(undefined);
    });

    const result = await deleteSceneWithRefs("scene-1");

    // 主流程应仍然成功
    expect(result.ok).toBe(true);
    // 确实尝试了记录 orphan
    const orphanInserts = mockSafeRun.mock.calls.filter(
      (call: unknown[]) => typeof call[0] === "string" && (call[0] as string).includes("INSERT INTO orphan_files"),
    );
    expect(orphanInserts.length).toBeGreaterThan(0);
  });

  it("非 local 路径（http://、data:）应被跳过", async () => {
    mockSafeQuery.mockResolvedValueOnce([
      {
        ref_image_path: "http://example.com/ref.png",
        generated_image: "data:image/png;base64,abc123",
      },
    ]);

    const result = await deleteSceneWithRefs("scene-1");

    expect(result.ok).toBe(true);
    // 非本地路径不应调用 deleteFile
    expect(mockFileStorage.deleteFile).not.toHaveBeenCalled();
    // 也不应记录到 orphan_files
    const orphanInserts = mockSafeRun.mock.calls.filter(
      (call: unknown[]) => typeof call[0] === "string" && (call[0] as string).includes("INSERT INTO orphan_files"),
    );
    expect(orphanInserts).toHaveLength(0);
  });

  it("https:// 和 vcache:// 路径也应被跳过", async () => {
    mockSafeQuery.mockResolvedValueOnce([
      {
        ref_image_path: "https://cdn.example.com/ref.png",
        generated_image: "vcache://task-123",
      },
    ]);

    const result = await deleteSceneWithRefs("scene-2");

    expect(result.ok).toBe(true);
    expect(mockFileStorage.deleteFile).not.toHaveBeenCalled();
  });

  it("部分文件删除失败时只记录失败的文件", async () => {
    mockSafeQuery.mockResolvedValueOnce([]);
    mockSafeQuery.mockResolvedValueOnce([
      {
        ref_image_path: "/local/ref.png",
        generated_image: "/local/gen.png",
      },
    ]);
    // 第一个文件删除成功，第二个失败
    mockFileStorage.deleteFile
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new Error("Disk full"));

    const result = await deleteSceneWithRefs("scene-3");

    expect(result.ok).toBe(true);
    expect(mockFileStorage.deleteFile).toHaveBeenCalledTimes(2);
    // 只有失败的文件记录到 orphan_files
    const orphanInserts = mockSafeRun.mock.calls.filter(
      (call: unknown[]) => typeof call[0] === "string" && (call[0] as string).includes("INSERT INTO orphan_files"),
    );
    expect(orphanInserts).toHaveLength(1);
    expect(orphanInserts[0]![1]).toContain("/local/gen.png");
  });
});
