import { safeQuery, safeRun } from "./sqlite-core";
import { parseRecordWithTable, toSqlValue, trackChange } from "./core";
import { errorLogger } from "@/shared/error-logger";
import type { StoryVersion } from "@/domain/schemas";

export const versionStorage = {
  async getStoryVersions<T = StoryVersion>(
    storyId: string,
  ): Promise<T[]> {
    const result = await safeQuery<Record<string, unknown>>(
      "SELECT * FROM story_versions WHERE story_id = ? ORDER BY timestamp DESC",
      [storyId],
    );
    return result.map((r) => parseRecordWithTable(r, "story_versions")) as T[];
  },

  async createStoryVersion(version: Partial<StoryVersion> & { storyId: string; beats: StoryVersion["beats"] }): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    const id =
      version.id ||
      `ver_${crypto.randomUUID()}`;
    await safeRun(
      `INSERT OR IGNORE INTO story_versions (id, story_id, timestamp, beats_json, title, description, genre, tone, target_duration, characters_json, scenes_json, change_summary, auto_saved, owner_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        version.storyId,
        version.timestamp || Math.floor(Date.now() / 1000),
        toSqlValue(version.beats),
        version.title || null,
        version.description || null,
        version.genre || null,
        version.tone || null,
        version.targetDuration || null,
        toSqlValue(version.characters),
        toSqlValue(version.scenes),
        version.changeSummary || null,
        version.autoSaved ? 1 : 0,
        1,
        now,
        now,
      ],
    );
    try {
      await trackChange("story_version", id, "insert");
    } catch (e) { errorLogger.warn("[Storage] trackChange failed for story_version:insert", e); }
  },

  async deleteStoryVersion(versionId: string): Promise<void> {
    await safeRun("DELETE FROM story_versions WHERE id = ?", [versionId]);
    try {
      await trackChange("story_version", versionId, "delete");
    } catch (e) { errorLogger.warn("[Storage] trackChange failed for story_version:delete", e); }
  },

  async deleteOldStoryVersions(
    storyId: string,
    keepCount: number,
  ): Promise<void> {
    const versions = await safeQuery<{ id: string }>(
      "SELECT id FROM story_versions WHERE story_id = ? ORDER BY timestamp DESC",
      [storyId],
    );
    if (versions.length > keepCount) {
      const idsToDelete = versions.slice(keepCount).map((v) => v.id);
      const placeholders = idsToDelete.map(() => "?").join(",");
      await safeRun(
        `DELETE FROM story_versions WHERE id IN (${placeholders})`,
        idsToDelete,
      );
      for (const id of idsToDelete) {
        try {
          await trackChange("story_version", id, "delete");
        } catch (e) { errorLogger.warn("[Storage] trackChange failed for story_version:deleteOld", e); }
      }
    }
  },
};
