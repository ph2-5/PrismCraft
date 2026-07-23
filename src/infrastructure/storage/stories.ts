import { safeQuery, safeTransaction } from "./sqlite-core";
import { parseRecordWithTable, toSqlValue, trackChange } from "./core";
import { errorLogger } from "@/shared/error-logger";
import { VersionConflictError } from "@/shared/errors/version-conflict";
import { NotFoundError } from "@/domain/types/result";
import type { Story, StoryStatus } from "@/domain/schemas";
import type { StorySearchOptions } from "@/domain/ports/storage-port";
import { buildBeatInsert } from "./stories/beat-transformer";
import { fetchStoryRelations, fetchAllStoryRelations } from "./stories/relations";

const DEFAULT_STORY_STATUS: StoryStatus = "in_progress";

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
  // status 列默认值为 'in_progress'，但旧数据迁移前可能为 null/undefined
  if (parsed.status == null) {
    parsed.status = DEFAULT_STORY_STATUS;
  }
  return parsed;
}

const SORT_FIELD_MAP: Record<NonNullable<StorySearchOptions["sortBy"]>, string> = {
  updatedAt: "updated_at",
  createdAt: "created_at",
  title: "title",
};

/**
 * 构造搜索 WHERE 子句与参数。
 *
 * - `query` 非空时对 title + description 做 LIKE 模糊匹配
 * - `status` / `genre` / `tone` 数组非空时按 IN 条件过滤；空数组忽略
 *
 * 返回的 `whereClause` 形如 `WHERE cond1 AND cond2`（无条件时为空字符串），
 * `params` 为对应占位符的参数数组，顺序与 SQL 中出现的顺序一致。
 */
function buildSearchWhereClause(
  options: StorySearchOptions,
): { whereClause: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];

  const query = options.query?.trim();
  if (query && query.length > 0) {
    conditions.push("(title LIKE ? OR description LIKE ?)");
    const likePattern = `%${query}%`;
    params.push(likePattern, likePattern);
  }

  if (isNonEmptyArray(options.status)) {
    const placeholders = options.status.map(() => "?").join(", ");
    conditions.push(`status IN (${placeholders})`);
    params.push(...options.status);
  }

  if (isNonEmptyArray(options.genre)) {
    const placeholders = options.genre.map(() => "?").join(", ");
    conditions.push(`genre IN (${placeholders})`);
    params.push(...options.genre);
  }

  if (isNonEmptyArray(options.tone)) {
    const placeholders = options.tone.map(() => "?").join(", ");
    conditions.push(`tone IN (${placeholders})`);
    params.push(...options.tone);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return { whereClause, params };
}

/**
 * 构造排序与分页子句，返回 SQL 片段及追加参数。
 *
 * - `sortBy` 默认 `updatedAt`；`sortOrder` 默认 `desc`
 * - LIMIT/OFFSET 使用占位符 `?`，参数按 LIMIT、OFFSET 顺序追加
 * - SQLite 要求 OFFSET 必须配合 LIMIT 使用；当仅提供 offset 时使用 `LIMIT -1` 表示无限制
 */
function buildOrderAndPagingClause(
  options: StorySearchOptions,
): { clause: string; params: unknown[] } {
  const sortBy = options.sortBy ?? "updatedAt";
  const sortField = SORT_FIELD_MAP[sortBy] ?? SORT_FIELD_MAP.updatedAt;
  const sortOrder = options.sortOrder === "asc" ? "ASC" : "DESC";

  const parts: string[] = [`ORDER BY ${sortField} ${sortOrder}`];
  const params: unknown[] = [];

  const hasLimit = typeof options.limit === "number" && Number.isFinite(options.limit);
  const hasOffset = typeof options.offset === "number" && Number.isFinite(options.offset);

  if (hasLimit) {
    parts.push("LIMIT ?");
    params.push(Math.max(0, Math.floor(options.limit!)));
  } else if (hasOffset) {
    // SQLite 要求 OFFSET 必须配合 LIMIT；-1 表示无上限
    parts.push("LIMIT -1");
  }

  if (hasOffset) {
    parts.push("OFFSET ?");
    params.push(Math.max(0, Math.floor(options.offset!)));
  }

  return { clause: parts.join(" "), params };
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

    const status: StoryStatus = story.status ?? DEFAULT_STORY_STATUS;

    const statements: Statement[] = [];
    statements.push({
      sql: `INSERT OR IGNORE INTO stories (id, title, description, genre, tone, target_duration, keyframe_chain_valid, style_guide_json, status, owner_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        id,
        story.title || "",
        story.description || null,
        story.genre || null,
        story.tone || null,
        story.targetDuration || null,
        story.keyframeChainValid ? 1 : 0,
        story.styleGuide ? JSON.stringify(story.styleGuide) : null,
        status,
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
      status: "status",
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
        throw new NotFoundError("Story", id);
      }
      if (version !== undefined && existing[0]!.version !== version) {
        throw new VersionConflictError("stories", id, version);
      }
    }

    try {
      await trackChange("story", id, "update");
    } catch (e) { errorLogger.warn("[Storage] trackChange failed for story:update", e); }
  },

  async updateStoryStatus(id: string, status: StoryStatus): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    const results = await safeTransaction([
      {
        sql: `UPDATE stories SET status = ?, updated_at = ?, version = version + 1 WHERE id = ?`,
        params: [status, now, id],
      },
    ]).catch((e) => {
      errorLogger.error(
        { code: "STORY_STATUS_TX", message: `Failed to update story status: ${id}`, cause: e },
        "storyStorage.updateStoryStatus",
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
        throw new NotFoundError("Story", id);
      }
    }

    try {
      await trackChange("story", id, "update");
    } catch (e) { errorLogger.warn("[Storage] trackChange failed for story:status", e); }
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

  async duplicateStory(sourceId: string, newTitle: string): Promise<string> {
    // a. 读取源 Story
    const source = await storyStorage.getStoryById<Story>(sourceId);
    if (!source) {
      throw new NotFoundError("Story", sourceId);
    }

    const now = Math.floor(Date.now() / 1000);
    const newStoryId = `story_${crypto.randomUUID()}`;

    const statements: Statement[] = [];

    // b. 复制 stories 记录（新 ID、新标题、status='draft'、新时间戳）
    statements.push({
      sql: `INSERT OR IGNORE INTO stories (id, title, description, genre, tone, target_duration, keyframe_chain_valid, style_guide_json, status, owner_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        newStoryId,
        newTitle,
        source.description || null,
        source.genre || null,
        source.tone || null,
        source.targetDuration || null,
        source.keyframeChainValid ? 1 : 0,
        source.styleGuide ? JSON.stringify(source.styleGuide) : null,
        "draft" as StoryStatus,
        1,
        now,
        now,
      ],
    });

    // c. 复制 story_beats（新 ID、新 story_id，保留 sequence/description/character_ids_json/scene_id/camera/generation/meta）
    //    不复制 local_*_path（避免文件引用混乱，因为 media_assets 不复制）
    if (isNonEmptyArray(source.beats)) {
      const beatsForInsert = source.beats.map((beat) => {
        const beatRecord = asRecord(beat);
        return {
          ...beatRecord,
          id: undefined,           // 强制生成新 beat ID
          localVideoPath: undefined,
          localKeyframePath: undefined,
          localFirstFramePath: undefined,
          localLastFramePath: undefined,
        };
      });
      // 使用 buildBeatInsert 直接调用，保留原始 sequence（而非数组索引）
      statements.push(
        ...beatsForInsert.map((beat, i) => {
          const beatRecord = asRecord(beat);
          const beatId = `beat_${newStoryId}_${i}_${Date.now()}_${crypto.randomUUID()}`;
          const originalSequence =
            typeof beatRecord.sequence === "number" ? beatRecord.sequence : i;
          return buildBeatInsert(beatId, newStoryId, originalSequence, beatRecord, now);
        }),
      );
    }

    // d. 复制 story_characters 关联（新 story_id）
    if (isNonEmptyArray(source.characters)) {
      statements.push(...buildCharacterLinkStatements(newStoryId, source.characters));
    }
    // e. 复制 story_scenes 关联
    if (isNonEmptyArray(source.scenes)) {
      statements.push(...buildSceneLinkStatements(newStoryId, source.scenes));
    }
    // f. 复制 story_elements 关联
    if (isNonEmptyArray(source.elementIds)) {
      statements.push(...buildElementLinkStatements(newStoryId, source.elementIds, source.elementBindings));
    }
    // g/h/i: 不复制 story_versions、video_tasks、media_assets

    // 单个事务执行所有写入
    await safeTransaction(statements).catch((e) => {
      errorLogger.error(
        { code: "STORY_DUPLICATE_TX", message: `Transaction failed. Statement count: ${statements.length}`, cause: e },
        "storyStorage.duplicateStory",
      );
      throw e;
    });

    try {
      await trackChange("story", newStoryId, "insert");
    } catch (e) { errorLogger.warn("[Storage] trackChange failed for story:duplicate", e); }

    return newStoryId;
  },

  /**
   * 按条件搜索故事。支持 query 模糊匹配（title + description）、status/genre/tone 多选过滤、
   * 字段排序与分页。返回结果会附加 characters/scenes/beats/elements 关联数据（与 getStories 一致）。
   *
   * 默认按 updatedAt desc 排序。空 options 等价于 getStories，但走 SQL 路径而非全表加载后过滤。
   */
  async searchStories<T = Story>(options: StorySearchOptions): Promise<T[]> {
    const { whereClause, params: whereParams } = buildSearchWhereClause(options);
    const { clause: orderPagingClause, params: orderPagingParams } = buildOrderAndPagingClause(options);
    const sql = `SELECT * FROM stories ${whereClause} ${orderPagingClause}`.trim();
    const params = [...whereParams, ...orderPagingParams];

    const result = await safeQuery<Record<string, unknown>>(sql, params);
    if (result.length === 0) return [];
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

  /**
   * 按条件统计故事数量。条件与 searchStories 一致，但只返回 COUNT(*)。
   * 用于分页计算总数。
   */
  async countStories(options: StorySearchOptions): Promise<number> {
    const { whereClause, params } = buildSearchWhereClause(options);
    const sql = `SELECT COUNT(*) as count FROM stories ${whereClause}`.trim();
    const result = await safeQuery<{ count: number }>(sql, params);
    return result.length > 0 ? Number(result[0]!.count) || 0 : 0;
  },
};
