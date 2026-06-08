import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Story, StoryBeat } from "@/domain/schemas";

type SqlStatement = { sql: string; params: unknown[] };

vi.mock("@/infrastructure/storage/sqlite-core", () => ({
  safeQuery: vi.fn(),
  safeRun: vi.fn(),
  safeTransaction: vi.fn(),
}));

vi.mock("@/infrastructure/storage/core", () => ({
  parseRecordWithTable: vi.fn(),
  toSqlValue: vi.fn((v) => v),
  trackChange: vi.fn(),
}));

import { safeQuery, safeTransaction } from "@/infrastructure/storage/sqlite-core";
import { storyStorage } from "../stories";

const mockSafeQuery = vi.mocked(safeQuery);
const mockSafeTransaction = vi.mocked(safeTransaction);

describe("R45: Entity Update Must Not Delete Unrelated Associated Data", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSafeQuery.mockResolvedValue([]);
    mockSafeTransaction.mockResolvedValue([{ changes: 1 }]);
  });

  it("updateStory must NOT delete video_tasks for beats that still exist", async () => {
    mockSafeQuery.mockResolvedValueOnce([{ id: "b1" }, { id: "b2" }]);

    await storyStorage.updateStory("s1", {
      beats: [{ id: "b1" }, { id: "b2" }] as unknown as StoryBeat[],
    } as unknown as Partial<Story>);

    const statements = mockSafeTransaction.mock.calls[0]![0]! as SqlStatement[];
    const sqls = statements.map((s) => s.sql);

    expect(
      sqls.some((s: string) => s.includes("DELETE FROM video_tasks")),
    ).toBe(false);
  });

  it("updateStory must NOT delete generation_tasks for beats that still exist", async () => {
    mockSafeQuery.mockResolvedValueOnce([{ id: "b1" }, { id: "b2" }]);

    await storyStorage.updateStory("s1", {
      beats: [{ id: "b1" }, { id: "b2" }] as unknown as StoryBeat[],
    } as unknown as Partial<Story>);

    const statements = mockSafeTransaction.mock.calls[0]![0]! as SqlStatement[];
    const sqls = statements.map((s) => s.sql);

    expect(
      sqls.some((s: string) => s.includes("DELETE FROM generation_tasks")),
    ).toBe(false);
  });

  it("updateStory must NOT delete media_assets for beats that still exist", async () => {
    mockSafeQuery.mockResolvedValueOnce([{ id: "b1" }, { id: "b2" }]);

    await storyStorage.updateStory("s1", {
      beats: [{ id: "b1" }, { id: "b2" }] as unknown as StoryBeat[],
    } as unknown as Partial<Story>);

    const statements = mockSafeTransaction.mock.calls[0]![0]! as SqlStatement[];
    const sqls = statements.map((s) => s.sql);

    expect(
      sqls.some((s: string) => s.includes("DELETE FROM media_assets")),
    ).toBe(false);
  });

  it("updateStory must NOT delete story_beats for beats that still exist", async () => {
    mockSafeQuery.mockResolvedValueOnce([{ id: "b1" }, { id: "b2" }]);

    await storyStorage.updateStory("s1", {
      beats: [{ id: "b1" }, { id: "b2" }] as unknown as StoryBeat[],
    } as unknown as Partial<Story>);

    const statements = mockSafeTransaction.mock.calls[0]![0]! as SqlStatement[];
    const sqls = statements.map((s) => s.sql);

    expect(
      sqls.some((s: string) => s.includes("DELETE FROM story_beats")),
    ).toBe(false);
  });

  it("updateStory MUST delete associated data only for removed beats", async () => {
    mockSafeQuery.mockResolvedValueOnce([{ id: "b1" }, { id: "b2" }, { id: "b3" }]);

    await storyStorage.updateStory("s1", {
      beats: [{ id: "b1" }] as unknown as StoryBeat[],
    } as unknown as Partial<Story>);

    const statements = mockSafeTransaction.mock.calls[0]![0]! as SqlStatement[];
    const deleteVideoTasks = statements.filter(
      (s) => s.sql === "DELETE FROM video_tasks WHERE beat_id = ?",
    );
    const deleteGenTasks = statements.filter(
      (s) => s.sql === "DELETE FROM generation_tasks WHERE beat_id = ?",
    );
    const deleteMediaAssets = statements.filter(
      (s) => s.sql === "DELETE FROM media_assets WHERE bound_to_type = 'beat' AND bound_to_id = ?",
    );
    const deleteBeats = statements.filter(
      (s) => s.sql === "DELETE FROM story_beats WHERE id = ?",
    );

    const removedIds = ["b2", "b3"];
    for (const removedId of removedIds) {
      expect(deleteVideoTasks.some((s) => s.params[0] === removedId)).toBe(true);
      expect(deleteGenTasks.some((s) => s.params[0] === removedId)).toBe(true);
      expect(deleteMediaAssets.some((s) => s.params[0] === removedId)).toBe(true);
      expect(deleteBeats.some((s) => s.params[0] === removedId)).toBe(true);
    }

    const retainedIds = ["b1"];
    for (const retainedId of retainedIds) {
      expect(deleteVideoTasks.some((s) => s.params[0] === retainedId)).toBe(false);
      expect(deleteGenTasks.some((s) => s.params[0] === retainedId)).toBe(false);
      expect(deleteMediaAssets.some((s) => s.params[0] === retainedId)).toBe(false);
      expect(deleteBeats.some((s) => s.params[0] === retainedId)).toBe(false);
    }
  });

  it("updateStory must NOT use blanket DELETE for entire story's video_tasks", async () => {
    mockSafeQuery.mockResolvedValueOnce([{ id: "b1" }]);

    await storyStorage.updateStory("s1", {
      beats: [{ id: "b1" }] as unknown as StoryBeat[],
    } as unknown as Partial<Story>);

    const statements = mockSafeTransaction.mock.calls[0]![0]! as SqlStatement[];
    const sqls = statements.map((s) => s.sql);

    expect(
      sqls.some(
        (s: string) =>
          s.includes("DELETE FROM video_tasks") &&
          s.includes("story_id"),
      ),
    ).toBe(false);
  });
});
