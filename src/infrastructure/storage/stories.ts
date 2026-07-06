import { safeQuery, safeTransaction } from "./sqlite-core";
import { parseRecordWithTable, toSqlValue, trackChange } from "./core";
import { errorLogger } from "@/shared/error-logger";
import { VersionConflictError } from "@/shared/errors/version-conflict";
import type { Story } from "@/domain/schemas";
import { buildBeatInsert } from "./stories/beat-transformer";
import { fetchStoryRelations, fetchAllStoryRelations } from "./stories/relations";

function asRecord(obj: unknown): Record<string, unknown> {
  return (obj && typeof obj === "object" ? obj : {}) as Record<string, unknown>;
}

type Statement = { sql: string; params: unknown[] };

function isNonEmptyArray(value: unknown): value is unknown[] {
  return Array.isArray(value) && value.length > 0;
}

function buildCharacterLinkStatements(storyId: string, characters: unknown[]): Statement[] {
  return characters.map((charId, i) => ({
    sql: "INSERT OR IGNORE INTO story_characters (story_id, character_id, display_order) VALUES (?, ?, ?)",
    params: [storyId, charId, i],
  }));
}

function buildSceneLinkStatements(storyId: string, scenes: unknown[]): Statement[] {
  return scenes.map((sceneId, i) => ({
    sql: "INSERT OR IGNORE INTO story_scenes (story_id, scene_id, display_order) VALUES (?, ?, ?)",
    params: [storyId, sceneId, i],
  }));
}

function buildElementLinkStatements(
  storyId: string,
  elementIds: unknown[],
  elementBindings?: Record<string, unknown>,
): Statement[] {
  return elementIds.map((elId) => {
    const binding = elementBindings?.[elId as string];
    return {
      sql: "INSERT OR IGNORE INTO story_elements (story_id, element_id, binding_config) VALUES (?, ?, ?)",
      params: [storyId, elId, binding ? JSON.stringify(binding) : null],
    };
  });
}

function buildBeatInsertStatements(
  storyId: string,
  beats: unknown[],
  now: number,
): Statement[] {
  return beats.map((beat, i) => {
    const beatRecord = asRecord(beat);
    const beatId = (beatRecord.id as string) || `beat_${storyId}_${i}_${Date.now()}`;
    return buildBeatInsert(beatId, storyId, i, beatRecord, now);
  });
}

function buildBeatRemovalStatements(beatIds: string[]): Statement[] {
  const statements: Statement[] = [];
  for (const removedId of beatIds) {
    statements.push(
      { sql: "DELETE FROM video_tasks WHERE beat_id = ?", params: [removedId] },
      { sql: "DELETE FROM generation_tasks WHERE beat_id = ?", params: [removedId] },
      { sql: "DELETE FROM media_assets WHERE bound_to_type = 'beat' AND bound_to_id = ?", params: [removedId] },
      { sql: "DELETE FROM story_beats WHERE id = ?", params: [removedId] },
    );
  }
  return statements;
}

async function findRemovedBeatIds(storyId: string, newBeats: unknown[]): Promise<string[]> {
  const newBeatIds = new Set(newBeats.map((b) => asRecord(b).id as string).filter(Boolean));
  const existingBeats = await safeQuery<{ id: string }>(
    "SELECT id FROM story_beats WHERE story_id = ?",
    [storyId],
  );
  return existingBeats.map((r) => r.id).filter((bid) => !newBeatIds.has(bid));
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
    const parsed = parseStory(result[0]!);
    const relations = await fetchStoryRelations(id);
    return { ...parsed, ...relations } as T;
  },

  async getStoryByBeatId(beatId: string): Promise<Story | null> {
    const beatRows = await safeQuery<{ story_id: string }>(
      "SELECT story_id FROM story_beats WHERE id = ?",
      [beatId],
    );
    if (beatRows.length === 0) return null;
    const storyId = beatRows[0]!.story_id;
    return storyStorage.getStoryById(storyId);
  },

  async getStoryVersion(id: string): Promise<number | null> {
    const result = await safeQuery<{ version: number }>(
      "SELECT version FROM stories WHERE id = ?",
      [id],
    );
    return result.length > 0 ? result[0]!.version : null;
  },

  async createStory(story: Partial<Story>): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    const id =
      story.id ||
      `story_${crypto.randomUUID()}`;

    const statements: Statement[] = [];
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

    if (isNonEmptyArray(story.characters)) {
      statements.push(...buildCharacterLinkStatements(id, story.characters));
    }
    if (isNonEmptyArray(story.scenes)) {
      statements.push(...buildSceneLinkStatements(id, story.scenes));
    }
    if (isNonEmptyArray(story.beats)) {
      statements.push(...buildBeatInsertStatements(id, story.beats, now));
    }
    if (isNonEmptyArray(story.elementIds)) {
      statements.push(...buildElementLinkStatements(id, story.elementIds, story.elementBindings));
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

  async updateStory(id: string, story: Partial<Story>, version?: number): Promise<void> {
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
    if (version !== undefined) {
      sets.push("version = version + 1");
    }
    const whereParts: string[] = ["id = ?"];
    values.push(id);
    if (version !== undefined) {
      whereParts.push("version = ?");
      values.push(version);
    }
    const allStatements: Statement[] = [
      {
        sql: `UPDATE stories SET ${sets.join(", ")} WHERE ${whereParts.join(" AND ")}`,
        params: values,
      },
    ];

    if (Array.isArray(story.characters)) {
      allStatements.push({ sql: "DELETE FROM story_characters WHERE story_id = ?", params: [id] });
      allStatements.push(...buildCharacterLinkStatements(id, story.characters));
    }
    if (Array.isArray(story.scenes)) {
      allStatements.push({ sql: "DELETE FROM story_scenes WHERE story_id = ?", params: [id] });
      allStatements.push(...buildSceneLinkStatements(id, story.scenes));
    }
    if (Array.isArray(story.elementIds)) {
      allStatements.push({ sql: "DELETE FROM story_elements WHERE story_id = ?", params: [id] });
      allStatements.push(...buildElementLinkStatements(id, story.elementIds, story.elementBindings));
    }
    if (Array.isArray(story.beats)) {
      const removedBeatIds = await findRemovedBeatIds(id, story.beats);
      allStatements.push(...buildBeatRemovalStatements(removedBeatIds));
      const beatNow = Math.floor(Date.now() / 1000);
      allStatements.push(...buildBeatInsertStatements(id, story.beats, beatNow));
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
      const existing = await safeQuery<{ id: string; version: number }>(
        "SELECT id, version FROM stories WHERE id = ?",
        [id],
      );
      if (existing.length === 0) {
        throw new Error(`Story not found for update: id="${id}"`);
      }
      if (version !== undefined && existing[0]!.version !== version) {
        throw new VersionConflictError("stories", id, version);
      }
    }

    try {
      await trackChange("story", id, "update");
    } catch (e) { errorLogger.warn("[Storage] trackChange failed for story:update", e); }
  },

  async deleteStory(id: string): Promise<void> {
    const beatRows = await safeQuery<{ id: string }>(
      "SELECT id FROM story_beats WHERE story_id = ?",
      [id],
    );
    const statements: { sql: string; params: unknown[] }[] = [
      { sql: "DELETE FROM story_characters WHERE story_id = ?", params: [id] },
      { sql: "DELETE FROM story_scenes WHERE story_id = ?", params: [id] },
      { sql: "DELETE FROM story_elements WHERE story_id = ?", params: [id] },
      { sql: "DELETE FROM story_versions WHERE story_id = ?", params: [id] },
      { sql: "DELETE FROM video_cache WHERE task_id IN (SELECT id FROM video_tasks WHERE story_id = ?)", params: [id] },
      { sql: "DELETE FROM video_tasks WHERE story_id = ?", params: [id] },
      { sql: "DELETE FROM generation_tasks WHERE story_id = ?", params: [id] },
      { sql: "DELETE FROM collection_assets WHERE asset_id = ? AND asset_type = 'story'", params: [id] },
      { sql: "DELETE FROM asset_tags WHERE asset_id = ? AND asset_type = 'story'", params: [id] },
    ];
    for (const beat of beatRows) {
      statements.push({
        sql: "DELETE FROM media_assets WHERE bound_to_type = 'beat' AND bound_to_id = ?",
        params: [beat.id],
      });
    }
    statements.push(
      { sql: "DELETE FROM story_beats WHERE story_id = ?", params: [id] },
      { sql: "DELETE FROM stories WHERE id = ?", params: [id] },
    );
    await safeTransaction(statements);
    try {
      await trackChange("story", id, "delete");
    } catch (e) { errorLogger.warn("[Storage] trackChange failed for story:delete", e); }
  },
};
