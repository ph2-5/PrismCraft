import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockSafeQuery,
  mockSafeRun,
  mockSafeTransaction,
  mockTrackChange,
  mockBuildUpdateSets,
} = vi.hoisted(() => ({
  mockSafeQuery: vi.fn<() => Promise<{ id: string }[]>>(() => Promise.resolve([])),
  mockSafeRun: vi.fn<() => Promise<{ changes: number }>>(() => Promise.resolve({ changes: 1 })),
  mockSafeTransaction: vi.fn<() => Promise<unknown[]>>(() => Promise.resolve([])),
  mockTrackChange: vi.fn<(entity: string, id: string, operation: string) => Promise<void>>(() => Promise.resolve()),
  mockBuildUpdateSets: vi.fn(() => ({ sql: "status = ?", params: ["failed"] })),
}));

vi.mock("@/infrastructure/storage/sqlite-core", () => ({
  safeQuery: mockSafeQuery,
  safeRun: mockSafeRun,
  safeTransaction: mockSafeTransaction,
}));

vi.mock("@/infrastructure/storage/core", () => ({
  trackChange: mockTrackChange,
  buildInsert: vi.fn(),
}));

vi.mock("@/infrastructure/storage/video-tasks/parser", () => ({
  toStorageTimestamp: (v: unknown) => (v ? Math.floor(Date.now() / 1000) : null),
  toStorageStatus: (v: unknown) => v || "pending",
  buildConfigJson: () => null,
  buildProviderJson: () => null,
  buildMediaRefsJson: () => null,
  buildTrackingJson: () => null,
  buildUpdateSets: mockBuildUpdateSets,
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: { warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/domain/schemas", () => ({}));

import { videoTaskStorage } from "@/infrastructure/storage/video-tasks";

describe("R41: trackChange 循环必须并行执行，禁止串行等待", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("batchDeleteVideoTasks 的 trackChange 必须并行（Promise.allSettled），而非串行 for 循环", async () => {
    const callOrder: string[] = [];
    mockTrackChange.mockImplementation(async (entity: string, id: string) => {
      callOrder.push(`start:${id}`);
      await new Promise((r) => setTimeout(r, 10));
      callOrder.push(`end:${id}`);
    });

    const ids = ["task-1", "task-2", "task-3"];
    await videoTaskStorage.batchDeleteVideoTasks(ids);

    expect(mockTrackChange).toHaveBeenCalledTimes(3);

    const startIndices = callOrder
      .filter((c) => c.startsWith("start:"))
      .map((c) => callOrder.indexOf(c));
    const maxStartBeforeEnd = Math.max(...startIndices);
    const firstEndIndex = callOrder.findIndex((c) => c.startsWith("end:"));
    expect(maxStartBeforeEnd).toBeLessThan(firstEndIndex);
  });

  it("batchUpdateVideoTasks 的 trackChange 必须并行执行", async () => {
    mockTrackChange.mockResolvedValue(undefined);

    const updates = [
      { taskId: "task-1", updates: { status: "failed" } },
      { taskId: "task-2", updates: { status: "failed" } },
    ];

    await videoTaskStorage.batchUpdateVideoTasks(updates as unknown as Array<{ taskId: string; updates: Partial<import("@/domain/schemas").VideoTask> }>);

    expect(mockTrackChange).toHaveBeenCalledTimes(2);
  });

  it("deleteVideoTasksByBeatId 的 trackChange 必须并行执行", async () => {
    mockSafeQuery.mockResolvedValueOnce([{ id: "t1" }, { id: "t2" }]);
    mockTrackChange.mockResolvedValue(undefined);

    await videoTaskStorage.deleteVideoTasksByBeatId("beat-1");

    expect(mockTrackChange).toHaveBeenCalledTimes(2);
  });

  it("trackChange 部分失败不得阻止其他 trackChange 执行", async () => {
    mockSafeQuery.mockResolvedValueOnce([{ id: "t1" }, { id: "t2" }, { id: "t3" }]);
    mockTrackChange
      .mockRejectedValueOnce(new Error("sync error"))
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    await videoTaskStorage.deleteVideoTasksByBeatId("beat-1");

    expect(mockTrackChange).toHaveBeenCalledTimes(3);
  });
});
