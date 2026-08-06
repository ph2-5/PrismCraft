/**
 * usage-repository.test.ts — cost-tracking P0 仓储测试
 *
 * 覆盖：insertUsage / insertUsageBatch / updateUsageStatus / attachUsageEntity / aggregateUsage
 * 失败语义：写库失败不 throw（返回 null/false/0），供上层静默降级（R195）
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// 提升 mock：在模块导入前注入 getDb（每次返回当前 fixture db）
let currentDb: ReturnType<typeof createDb>;
const { mockGetDb, createDb } = vi.hoisted(() => {
  function createDb() {
    const stmt = {
      run: vi.fn(() => ({ changes: 1 })),
      get: vi.fn(() => undefined),
      all: vi.fn(() => []),
    };
    return {
      prepare: vi.fn(() => stmt),
      transaction: vi.fn((fn: () => void) => fn),
    };
  }
  return {
    createDb,
    mockGetDb: vi.fn(() => currentDb),
  };
});

vi.mock("../db-connection", () => ({
  getDb: () => mockGetDb(),
}));

import { insertUsage, insertUsageBatch, updateUsageStatus, attachUsageEntity, aggregateUsage } from "../usage-repository";

describe("usage-repository", () => {
  beforeEach(() => {
    currentDb = createDb();
    vi.clearAllMocks();
  });

  const baseInput = {
    direction: "video" as const,
    providerId: "kuaishou",
    modelId: "kling-v1",
    durationSeconds: 5,
    calledAt: 1_700_000_000,
  };

  it("insertUsage 参数化插入并返回 id", () => {
    const id = insertUsage(baseInput);
    expect(id).toBeTruthy();
    expect(id).toMatch(/^[0-9a-f-]{36}$/); // uuid

    expect(currentDb.prepare).toHaveBeenCalled();
    const sql = (currentDb.prepare as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(sql).toContain("INSERT INTO usage_records");
    expect(sql).toContain('"provider_id"');
    // 参数化：SQL 无内联值
    expect(sql).not.toContain("kuaishou");
    expect(sql).not.toContain("kling-v1");
  });

  it("insertUsage 写库失败时返回 null 而非 throw（R195）", () => {
    mockGetDb.mockImplementation(() => {
      throw new Error("db locked");
    });
    expect(() => insertUsage(baseInput)).not.toThrow();
    expect(insertUsage(baseInput)).toBeNull();
    mockGetDb.mockImplementation(() => currentDb);
  });

  it("insertUsageBatch 批量插入并返回成功条数", () => {
    const inputs = [
      baseInput,
      { ...baseInput, direction: "image" as const, imageCount: 1 },
      { ...baseInput, direction: "text" as const, inputTokens: 100, outputTokens: 200 },
    ];
    const inserted = insertUsageBatch(inputs);
    expect(inserted).toBe(3);
    expect(currentDb.transaction).toHaveBeenCalled();
  });

  it("insertUsageBatch 空数组直接返回 0", () => {
    expect(insertUsageBatch([])).toBe(0);
    expect(currentDb.prepare).not.toHaveBeenCalled();
  });

  it("insertUsageBatch 中途失败不 throw，返回已插入条数", () => {
    (currentDb.prepare as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error("disk full");
    });
    expect(() => insertUsageBatch([baseInput, baseInput])).not.toThrow();
  });

  it("updateUsageStatus 带 errorMessage 时更新 status + error_message", () => {
    const ok = updateUsageStatus("usage-1", "failed", "provider 500");
    expect(ok).toBe(true);
    const sql = (currentDb.prepare as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(sql).toContain("status = ?");
    expect(sql).toContain("error_message = ?");
  });

  it("updateUsageStatus 不带 errorMessage 时仅更新 status", () => {
    expect(updateUsageStatus("usage-2", "cancelled")).toBe(true);
    const sql = (currentDb.prepare as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(sql).toContain("status = ?");
    expect(sql).not.toContain("error_message");
  });

  it("attachUsageEntity 回填 story_id/beat_id", () => {
    expect(attachUsageEntity("usage-1", "story-1", "beat-1")).toBe(true);
    const sql = (currentDb.prepare as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(sql).toContain("story_id = COALESCE(?, story_id)");
  });

  it("aggregateUsage 聚合空库返回零值", () => {
    const agg = aggregateUsage(1_700_000_000, 1_700_100_000);
    expect(agg).toEqual({ totalEstimatedCost: 0, succeededCost: 0, failedCost: 0, recordCount: 0 });
  });

  it("aggregateUsage 解析聚合行（含双口径成功/失败成本）", () => {
    (currentDb.prepare as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      get: vi.fn(() => ({ total: 12.5, succeeded: 10, failed: 2.5, count: 3 })),
    });
    const agg = aggregateUsage(0, 1_800_000_000);
    expect(agg).toEqual({ totalEstimatedCost: 12.5, succeededCost: 10, failedCost: 2.5, recordCount: 3 });
  });
});
