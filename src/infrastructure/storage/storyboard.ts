import { safeQuery, safeRun, safeTransaction } from "./sqlite-core";
import { parseRecordWithTable, toSqlValue, trackChange } from "./core";
import { errorLogger } from "@/shared/error-logger";
import type { StoryboardAsset } from "@/domain/schemas";

function safeParseStringArray(value: unknown): string[] {
  if (Array.isArray(value))
    return value.filter((v): v is string => typeof v === "string");
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed))
        return parsed.filter((v): v is string => typeof v === "string");
    } catch {
      return value ? [value] : [];
    }
  }
  return [];
}

function parseStoryboardAsset(
  record: Record<string, unknown>,
): StoryboardAsset {
  const parsed = parseRecordWithTable(record, "storyboard_assets");
  const rawDuration = parsed.duration;
  let durationNum = 0;
  if (typeof rawDuration === "number") {
    durationNum = rawDuration;
  } else if (typeof rawDuration === "string") {
    const parsedNum = parseFloat(rawDuration);
    durationNum = isNaN(parsedNum) ? 0 : parsedNum;
  }
  const validShotTypes: StoryboardAsset["shotType"][] = [
    "wide",
    "medium",
    "close_up",
    "extreme_close_up",
    "over_shoulder",
    "aerial",
    "tracking",
    "static",
  ];
  const rawShotType = parsed.shot_type;
  const shotType =
    typeof rawShotType === "string" &&
    validShotTypes.includes(rawShotType as StoryboardAsset["shotType"])
      ? (rawShotType as StoryboardAsset["shotType"])
      : undefined;
  return {
    id: String(parsed.id || ""),
    script: String(parsed.script || ""),
    duration: durationNum,
    shotType,
    previewPath: parsed.preview_path ? String(parsed.preview_path) : undefined,
    characterIds: safeParseStringArray(parsed.character_ids),
    sceneId: parsed.scene_id ? String(parsed.scene_id) : undefined,
    projectId: parsed.project_id ? String(parsed.project_id) : undefined,
    createdAt: parsed.created_at ? String(parsed.created_at) : "",
    updatedAt: parsed.updated_at ? String(parsed.updated_at) : "",
  };
}

export const storyboardStorage = {
  async getStoryboardAssets(
    limit?: number,
    offset?: number,
  ): Promise<StoryboardAsset[]> {
    let sql = "SELECT * FROM storyboard_assets ORDER BY created_at DESC";
    const params: unknown[] = [];
    if (limit !== undefined) {
      sql += " LIMIT ?";
      params.push(limit);
      if (offset !== undefined) {
        sql += " OFFSET ?";
        params.push(offset);
      }
    }
    const result = await safeQuery<Record<string, unknown>>(sql, params);
    return result.map(parseStoryboardAsset);
  },

  async getStoryboardAssetById(id: string): Promise<StoryboardAsset | null> {
    const result = await safeQuery<Record<string, unknown>>(
      "SELECT * FROM storyboard_assets WHERE id = ?",
      [id],
    );
    return result.length > 0 ? parseStoryboardAsset(result[0]) : null;
  },

  async createStoryboardAsset(
    asset: Partial<StoryboardAsset>,
  ): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const id =
      asset.id || `sb_${crypto.randomUUID()}`;
    await safeRun(
      `INSERT INTO storyboard_assets (id, script, duration, shot_type, preview_path, character_ids, scene_id, project_id, owner_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        asset.script || null,
        asset.duration || null,
        asset.shotType || null,
        asset.previewPath || null,
        toSqlValue(asset.characterIds),
        asset.sceneId || null,
        asset.projectId || null,
        1,
        asset.createdAt || now,
        now,
      ],
    );
    try {
      await trackChange("storyboard_asset", id, "insert");
    } catch (e) { errorLogger.warn("[Storage] trackChange failed for storyboard_asset:insert", e); }
    return id;
  },

  async updateStoryboardAsset(
    id: string,
    updates: Partial<StoryboardAsset>,
  ): Promise<void> {
    const sets: string[] = [];
    const values: unknown[] = [];
    const fieldMap: Record<string, string> = {
      script: "script",
      duration: "duration",
      shotType: "shot_type",
      previewPath: "preview_path",
      characterIds: "character_ids",
      sceneId: "scene_id",
      projectId: "project_id",
    };
    for (const [jsKey, sqlKey] of Object.entries(fieldMap)) {
      if (updates[jsKey as keyof StoryboardAsset] !== undefined) {
        sets.push(`${sqlKey} = ?`);
        const val = updates[jsKey as keyof StoryboardAsset];
        values.push(jsKey === "characterIds" ? toSqlValue(val) : val);
      }
    }
    if (sets.length === 0) return;
    sets.push("updated_at = ?");
    values.push(Math.floor(Date.now() / 1000));
    values.push(id);
    const result = await safeRun(
      `UPDATE storyboard_assets SET ${sets.join(", ")} WHERE id = ?`,
      values,
    );
    const updateResult = result;
    if (!updateResult || updateResult.changes === 0) {
      const existing = await safeQuery<{ id: string }>(
        "SELECT id FROM storyboard_assets WHERE id = ?",
        [id],
      );
      if (existing.length === 0) {
        throw new Error(`StoryboardAsset not found for update: id="${id}"`);
      }
    }
    try {
      await trackChange("storyboard_asset", id, "update");
    } catch (e) { errorLogger.warn("[Storage] trackChange failed for storyboard_asset:update", e); }
  },

  async deleteStoryboardAsset(id: string): Promise<void> {
    await safeTransaction([
      {
        sql: "DELETE FROM collection_assets WHERE asset_id = ? AND asset_type = 'storyboard'",
        params: [id],
      },
      {
        sql: "DELETE FROM storyboard_assets WHERE id = ?",
        params: [id],
      },
    ]);
    try {
      await trackChange("storyboard_asset", id, "delete");
    } catch (e) { errorLogger.warn("[Storage] trackChange failed for storyboard_asset:delete", e); }
  },
};
