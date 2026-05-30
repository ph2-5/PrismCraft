import { safeQuery, safeTransaction } from "./sqlite-core";
import { parseRecordWithTable, toSqlValue, trackChange } from "./core";
import { errorLogger } from "@/shared/error-logger";
import type { Story } from "@/domain/schemas";
import { buildBeatInsert } from "./stories/beat-transformer";
import { fetchStoryRelations, fetchAllStoryRelations } from "./stories/relations";

function asRecord(obj: unknown): Record<string, unknown> {
  return (obj && typeof obj === "object" ? obj : {}) as Record<string, unknown>;
}

function parseStory(record: Record<string, unknown>): Record<string, unknown> {
  const parsed = parseRecordWithTable(record, "stories");
  const fieldMap: Record<string, string> = {
    target_duration: "targetDuration",
    created_at: "createdAt",
    updated_at: "updatedAt",
    keyframe_chain_valid: "keyframeChainValid",
  };
  for (const [snakeKey, camelKey] of Object.entries(fieldMap)) {
    if (parsed[snakeKey] !== undefined) {
      parsed[camelKey] = parsed[snakeKey];
      delete parsed[snakeKey];
    }
  }
  if (parsed.style_guide_json) {
    try {
      parsed.styleGuide = typeof parsed.style_guide_json === "string"
        ? JSON.parse(parsed.style_guide_json)
        : parsed.style_guide_json;
    } catch (e) {
      errorLogger.warn("[StoryStorage] styleGuide JSON 解析失败", e);
      parsed.styleGuide = undefined;
    }
    delete parsed.style_guide_json;
  }
  return parsed;
}

export const storyStorage = {
  async getStories<T = Story>(): Promise<T[]> {
    const result = await safeQuery<Record<string, unknown>>(
      "SELECT * FROM stories ORDER BY updated_at DESC",
    );
    const relationsMap = await fetchAllStoryRelations();
    return result.map((row) => {
      const parsed = parseStory(row);
      const storyId = parsed.id as string;
      const relations = relationsMap.get(storyId) || {
        characters: [],
        scenes: [],
        beats: [],
        elementIds: [],
        elementBindings: {},
      };
      return { ...parsed, ...relations } as T;
    });
  },

  async getStoryById<T = Story>(id: string): Promise<T | null> {
    const result = await safeQuery<Record<string, unknown>>(
      "SELECT * FROM stories WHERE id = ?",
      [id],
    );
    if (result.length === 0) return null;
    const parsed = parseStory(result[0]);
    const relations = await fetchStoryRelations(id);
    return { ...parsed, ...relations } as T;
  },

  async getStoryByBeatId(beatId: string): Promise<Story | null> {
    const beatRows = await safeQuery<{ story_id: string }>(
      "SELECT story_id FROM story_beats WHERE id = ?",
      [beatId],
    );
    if (beatRows.length === 0) return null;
    const storyId = beatRows[0].story_id;
    return storyStorage.getStoryById(storyId);
  },

  async createStory(story: Partial<Story>): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    const id =
      story.id ||
      `story_${crypto.randomUUID()}`;

    const statements: { sql: string; params: unknown[] }[] = [];
    statements.push({
      sql: `INSERT OR IGNORE INTO stories (id, title, description, genre, tone, target_duration, keyframe_chain_valid, style_guide_json, owner_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        id,
        story.title || "",
        story.description || null,
        story.genre || null,
        story.tone || null,
        story.targetDuration || null,
        story.keyframeChainValid ? 1 : 0,
        story.styleGuide ? JSON.stringify(story.styleGuide) : null,
        1,
        story.createdAt || now,
        now,
      ],
    });

    if (
      story.characters &&
      Array.isArray(story.characters) &&
      story.characters.length > 0
    ) {
      for (let i = 0; i < story.characters.length; i++) {
        statements.push({
          sql: `INSERT OR IGNORE INTO story_characters (story_id, character_id, display_order) VALUES (?, ?, ?)`,
          params: [id, story.characters[i], i],
        });
      }
    }
    if (
      story.scenes &&
      Array.isArray(story.scenes) &&
      story.scenes.length > 0
    ) {
      for (let i = 0; i < story.scenes.length; i++) {
        statements.push({
          sql: `INSERT OR IGNORE INTO story_scenes (story_id, scene_id, display_order) VALUES (?, ?, ?)`,
          params: [id, story.scenes[i], i],
        });
      }
    }
    if (story.beats && Array.isArray(story.beats) && story.beats.length > 0) {
      for (let i = 0; i < story.beats.length; i++) {
        const beat = asRecord(story.beats[i]);
        const beatId = (beat.id as string) || `beat_${id}_${i}_${Date.now()}`;
        statements.push(buildBeatInsert(beatId, id, i, beat, now));
      }
    }
    if (
      story.elementIds &&
      Array.isArray(story.elementIds) &&
      story.elementIds.length > 0
    ) {
      for (const elId of story.elementIds) {
        const binding = story.elementBindings?.[elId as string];
        statements.push({
          sql: `INSERT OR IGNORE INTO story_elements (story_id, element_id, binding_config) VALUES (?, ?, ?)`,
          params: [id, elId, binding ? JSON.stringify(binding) : null],
        });
      }
    }

    await safeTransaction(statements).catch((e) => {
      errorLogger.error(
        { code: "STORY_CREATE_TX", message: `Transaction failed. Statement count: ${statements.length}`, cause: e },
        "storyStorage.createStory",
      );
      throw e;
    });

    try {
      await trackChange("story", id, "insert");
    } catch (e) { errorLogger.warn("[Storage] trackChange failed for story:insert", e); }
  },

  async updateStory(id: string, story: Partial<Story>): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    const sets: string[] = [];
    const values: unknown[] = [];
    const fieldMap: Record<string, string> = {
      title: "title",
      description: "description",
      genre: "genre",
      tone: "tone",
      targetDuration: "target_duration",
      keyframeChainValid: "keyframe_chain_valid",
    };
    for (const [jsKey, sqlKey] of Object.entries(fieldMap)) {
      if (story[jsKey as keyof Story] !== undefined) {
        sets.push(`${sqlKey} = ?`);
        values.push(toSqlValue(story[jsKey as keyof Story]));
      }
    }
    if (story.styleGuide !== undefined) {
      sets.push("style_guide_json = ?");
      values.push(story.styleGuide ? JSON.stringify(story.styleGuide) : null);
    }
    sets.push("updated_at = ?");
    values.push(now);
    values.push(id);
    const allStatements: { sql: string; params: unknown[] }[] = [
      {
        sql: `UPDATE stories SET ${sets.join(", ")} WHERE id = ?`,
        params: values,
      },
    ];

    if (story.characters !== undefined && Array.isArray(story.characters)) {
      allStatements.push({
        sql: "DELETE FROM story_characters WHERE story_id = ?",
        params: [id],
      });
      for (let i = 0; i < story.characters.length; i++) {
        allStatements.push({
          sql: "INSERT OR IGNORE INTO story_characters (story_id, character_id, display_order) VALUES (?, ?, ?)",
          params: [id, story.characters[i], i],
        });
      }
    }
    if (story.scenes !== undefined && Array.isArray(story.scenes)) {
      allStatements.push({
        sql: "DELETE FROM story_scenes WHERE story_id = ?",
        params: [id],
      });
      for (let i = 0; i < story.scenes.length; i++) {
        allStatements.push({
          sql: "INSERT OR IGNORE INTO story_scenes (story_id, scene_id, display_order) VALUES (?, ?, ?)",
          params: [id, story.scenes[i], i],
        });
      }
    }
    if (story.elementIds !== undefined && Array.isArray(story.elementIds)) {
      allStatements.push({
        sql: "DELETE FROM story_elements WHERE story_id = ?",
        params: [id],
      });
      for (const elId of story.elementIds) {
        const binding = story.elementBindings?.[elId as string];
        allStatements.push({
          sql: "INSERT OR IGNORE INTO story_elements (story_id, element_id, binding_config) VALUES (?, ?, ?)",
          params: [id, elId, binding ? JSON.stringify(binding) : null],
        });
      }
    }
    if (story.beats !== undefined && Array.isArray(story.beats)) {
      const newBeatIds = new Set(
        story.beats
          .map((b) => asRecord(b).id as string)
          .filter(Boolean),
      );
      const existingBeats = await safeQuery<{ id: string }>(
        "SELECT id FROM story_beats WHERE story_id = ?",
        [id],
      );
      const removedBeatIds = existingBeats
        .map((r) => r.id)
        .filter((bid) => !newBeatIds.has(bid));

      for (const removedId of removedBeatIds) {
        allStatements.push(
          { sql: "DELETE FROM video_tasks WHERE beat_id = ?", params: [removedId] },
          { sql: "DELETE FROM generation_tasks WHERE beat_id = ?", params: [removedId] },
          { sql: "DELETE FROM media_assets WHERE bound_to_type = 'beat' AND bound_to_id = ?", params: [removedId] },
          { sql: "DELETE FROM story_beats WHERE id = ?", params: [removedId] },
        );
      }

      const beatNow = Math.floor(Date.now() / 1000);
      for (let i = 0; i < story.beats.length; i++) {
        const beat = asRecord(story.beats[i]);
        const beatId = (beat.id as string) || `beat_${id}_${i}_${Date.now()}`;
        allStatements.push(buildBeatInsert(beatId, id, i, beat, beatNow));
      }
    }
    const results = await safeTransaction(allStatements).catch((e) => {
      errorLogger.error(
        { code: "STORY_UPDATE_TX", message: `Transaction failed. Statement count: ${allStatements.length}`, cause: e },
        "storyStorage.updateStory",
      );
      throw e;
    });

    const updateResult = results[0] as { changes?: number } | undefined;
    if (!updateResult || updateResult.changes === 0) {
      const existing = await safeQuery<{ id: string }>(
        "SELECT id FROM stories WHERE id = ?",
        [id],
      );
      if (existing.length === 0) {
        throw new Error(`Story not found for update: id="${id}"`);
      }
    }

    try {
      await trackChange("story", id, "update");
    } catch (e) { errorLogger.warn("[Storage] trackChange failed for story:update", e); }
  },

  async deleteStory(id: string): Promise<void> {
    await safeTransaction([
      {
        sql: "DELETE FROM story_characters WHERE story_id = ?",
        params: [id],
      },
      {
        sql: "DELETE FROM story_scenes WHERE story_id = ?",
        params: [id],
      },
      {
        sql: "DELETE FROM story_beats WHERE story_id = ?",
        params: [id],
      },
      {
        sql: "DELETE FROM story_elements WHERE story_id = ?",
        params: [id],
      },
      {
        sql: "DELETE FROM story_versions WHERE story_id = ?",
        params: [id],
      },
      {
        sql: "DELETE FROM video_tasks WHERE story_id = ?",
        params: [id],
      },
      {
        sql: "DELETE FROM collection_assets WHERE asset_id = ? AND asset_type = 'story'",
        params: [id],
      },
      { sql: "DELETE FROM stories WHERE id = ?", params: [id] },
    ]);
    try {
      await trackChange("story", id, "delete");
    } catch (e) { errorLogger.warn("[Storage] trackChange failed for story:delete", e); }
  },
};
