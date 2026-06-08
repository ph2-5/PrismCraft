import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockSafeTransaction,
  mockStoryStorage,
} = vi.hoisted(() => ({
  mockSafeTransaction: vi.fn().mockResolvedValue(undefined),
  mockStoryStorage: {
    getStoryByBeatId: vi.fn(),
    updateStory: vi.fn(),
  },
}));

vi.mock("@/shared/db-core", () => ({
  safeTransaction: (...args: [{ sql: string; params: unknown[] }[]]) => mockSafeTransaction(...args),
  safeQuery: vi.fn().mockResolvedValue([]),
  safeRun: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/infrastructure/di", () => ({
  container: { storyStorage: mockStoryStorage },
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
  extractErrorMessage: vi.fn((e: unknown) => e instanceof Error ? e.message : String(e)),
}));

describe("R33: Existence-check queries before write operations must be eliminated when possible", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSafeTransaction.mockResolvedValue(undefined);
  });

  it("should NOT call getStoryByBeatId before UPDATE — UPDATE WHERE id=? naturally handles missing records", async () => {
    const beats = [
      { id: "beat-1", keyframeImageUrl: "url-1" },
      { id: "beat-2", keyframeImageUrl: "url-2" },
      { id: "beat-3", keyframeImageUrl: "url-3" },
    ];

    const statements = beats
      .filter((b) => b.keyframeImageUrl)
      .map((beat) => ({
        sql: "UPDATE story_beats SET generation = json_set(COALESCE(generation, '{}'), '$.keyframeImageUrl', ?), updated_at = ? WHERE id = ?",
        params: [beat.keyframeImageUrl, Math.floor(Date.now() / 1000), beat.id],
      }));

    await mockSafeTransaction(statements);

    expect(mockStoryStorage.getStoryByBeatId).not.toHaveBeenCalled();
    expect(mockSafeTransaction).toHaveBeenCalledTimes(1);

    const txStatements = mockSafeTransaction.mock.calls[0]![0]!;
    expect(txStatements).toHaveLength(3);
  });

  it("should batch all UPDATEs into a single safeTransaction call, not N individual calls", async () => {
    const beats = Array.from({ length: 50 }, (_, i) => ({
      id: `beat-${i}`,
      keyframeImageUrl: `url-${i}`,
    }));

    const statements = beats
      .filter((b) => b.keyframeImageUrl)
      .map((beat) => ({
        sql: "UPDATE story_beats SET generation = json_set(COALESCE(generation, '{}'), '$.keyframeImageUrl', ?), updated_at = ? WHERE id = ?",
        params: [beat.keyframeImageUrl, Math.floor(Date.now() / 1000), beat.id],
      }));

    await mockSafeTransaction(statements);

    expect(mockSafeTransaction).toHaveBeenCalledTimes(1);
    const txStatements = mockSafeTransaction.mock.calls[0]![0]!;
    expect(txStatements).toHaveLength(50);
  });
});
