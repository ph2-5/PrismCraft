import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockSafeQuery,
  mockSafeRun,
  mockSafeTransaction,
} = vi.hoisted(() => ({
  mockSafeQuery: vi.fn<(sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>>(() => Promise.resolve([])),
  mockSafeRun: vi.fn<(sql: string, params?: unknown[]) => Promise<{ changes: number }>>(() => Promise.resolve({ changes: 1 })),
  mockSafeTransaction: vi.fn<(statements: { sql: string; params: unknown[] }[]) => Promise<unknown[]>>(() => Promise.resolve([])),
}));

vi.mock("@/infrastructure/storage/sqlite-core", () => ({
  safeQuery: mockSafeQuery,
  safeRun: mockSafeRun,
  safeTransaction: mockSafeTransaction,
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: { warn: vi.fn(), error: vi.fn() },
}));

import { imageCacheStorage } from "@/infrastructure/storage/image-cache";

describe("R40: 图片缓存访问更新必须延迟批量，禁止读后立即写", () => {
  beforeEach(async () => {
    await imageCacheStorage.flushPendingAccessUpdates();
    vi.clearAllMocks();
  });

  it("getCachedImageFile 读取后不得立即 safeRun 更新 last_accessed_at", async () => {
    mockSafeQuery.mockResolvedValueOnce([{
      file_path: "/cache/img.png",
      mime_type: "image/png",
      file_size: 1024,
      width: 100,
      height: 100,
      cached_at: 1000,
    }]);

    await imageCacheStorage.getCachedImageFile("https://example.com/img.png");

    expect(mockSafeQuery).toHaveBeenCalledTimes(1);
    expect(mockSafeRun).not.toHaveBeenCalled();
    expect(mockSafeTransaction).not.toHaveBeenCalled();
  });

  it("flushPendingAccessUpdates 必须批量合并所有待更新的 last_accessed_at", async () => {
    mockSafeQuery
      .mockResolvedValueOnce([{
        file_path: "/cache/img1.png",
        mime_type: "image/png",
        file_size: 1024,
        width: 100,
        height: 100,
        cached_at: 1000,
      }])
      .mockResolvedValueOnce([{
        file_path: "/cache/img2.png",
        mime_type: "image/png",
        file_size: 2048,
        width: 200,
        height: 200,
        cached_at: 2000,
      }]);

    await imageCacheStorage.getCachedImageFile("https://example.com/img1.png");
    await imageCacheStorage.getCachedImageFile("https://example.com/img2.png");

    expect(mockSafeTransaction).not.toHaveBeenCalled();

    await imageCacheStorage.flushPendingAccessUpdates();

    expect(mockSafeTransaction).toHaveBeenCalledTimes(1);
    const stmts = mockSafeTransaction.mock.calls[0]![0]!;
    expect(stmts.length).toBe(2);
    expect(stmts[0]!.sql).toContain("last_accessed_at");
    expect(stmts[1]!.sql).toContain("last_accessed_at");
  });

  it("多次读取同一 URL 只产生一条 UPDATE 语句", async () => {
    mockSafeQuery.mockResolvedValue([{
      file_path: "/cache/img3.png",
      mime_type: "image/png",
      file_size: 1024,
      width: 100,
      height: 100,
      cached_at: 1000,
    }]);

    await imageCacheStorage.getCachedImageFile("https://example.com/img3.png");
    await imageCacheStorage.getCachedImageFile("https://example.com/img3.png");
    await imageCacheStorage.getCachedImageFile("https://example.com/img3.png");

    await imageCacheStorage.flushPendingAccessUpdates();

    expect(mockSafeTransaction).toHaveBeenCalledTimes(1);
    const stmts = mockSafeTransaction.mock.calls[0]![0]!;
    expect(stmts.length).toBe(1);
  });

  it("无待更新时 flush 不触发 IPC 调用", async () => {
    await imageCacheStorage.flushPendingAccessUpdates();

    expect(mockSafeTransaction).not.toHaveBeenCalled();
    expect(mockSafeRun).not.toHaveBeenCalled();
    expect(mockSafeQuery).not.toHaveBeenCalled();
  });
});
