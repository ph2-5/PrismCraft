/**
 * GenerationAsset Storage — 生成资产持久化层（Task 4.11）
 *
 * 职责：
 *   - 通过 HTTP API / IPC 与 SQLite 交互
 *   - DB 列 ↔ 域对象转换（snake_case ↔ camelCase，JSON 容器解析）
 *   - 实现 IGenerationAssetStorage Port 接口
 */
import { safeQuery, safeRun } from "../sqlite-core";
import { errorLogger } from "@/shared/error-logger";
import { safeJsonParse } from "@/shared/utils/safe-json";
import type { GenerationAsset } from "@/domain/schemas";
import type { IGenerationAssetStorage } from "@/domain/ports";

interface AssetRow {
  id: string;
  type: string;
  source_type: string;
  url: string;
  local_path: string | null;
  thumbnail_path: string | null;
  prompt: string | null;
  model_id: string | null;
  provider_id: string | null;
  metadata: string | null;
  story_beat_id: string | null;
  sub_shot_id: string | null;
  character_id: string | null;
  character_variant_id: string | null;
  scene_id: string | null;
  scene_variant_id: string | null;
  project_id: string | null;
  created_at: number | null;
}

function rowToAsset(row: AssetRow): GenerationAsset {
  return {
    id: row.id,
    type: row.type as GenerationAsset["type"],
    sourceType: row.source_type as GenerationAsset["sourceType"],
    url: row.url,
    localPath: row.local_path ?? undefined,
    thumbnailPath: row.thumbnail_path ?? undefined,
    prompt: row.prompt ?? undefined,
    modelId: row.model_id ?? undefined,
    providerId: row.provider_id ?? undefined,
    metadata: row.metadata ? safeJsonParse<Record<string, unknown>>(row.metadata, {}) : undefined,
    storyBeatId: row.story_beat_id ?? undefined,
    subShotId: row.sub_shot_id ?? undefined,
    characterId: row.character_id ?? undefined,
    characterVariantId: row.character_variant_id ?? undefined,
    sceneId: row.scene_id ?? undefined,
    sceneVariantId: row.scene_variant_id ?? undefined,
    projectId: row.project_id ?? undefined,
    createdAt: row.created_at != null ? new Date(row.created_at * 1000).toISOString() : new Date().toISOString(),
  };
}

function assetToFields(asset: Partial<GenerationAsset>): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  if (asset.type !== undefined) fields.type = asset.type;
  if (asset.sourceType !== undefined) fields.source_type = asset.sourceType;
  if (asset.url !== undefined) fields.url = asset.url;
  if (asset.localPath !== undefined) fields.local_path = asset.localPath;
  if (asset.thumbnailPath !== undefined) fields.thumbnail_path = asset.thumbnailPath;
  if (asset.prompt !== undefined) fields.prompt = asset.prompt;
  if (asset.modelId !== undefined) fields.model_id = asset.modelId;
  if (asset.providerId !== undefined) fields.provider_id = asset.providerId;
  if (asset.metadata !== undefined) fields.metadata = JSON.stringify(asset.metadata);
  if (asset.storyBeatId !== undefined) fields.story_beat_id = asset.storyBeatId;
  if (asset.subShotId !== undefined) fields.sub_shot_id = asset.subShotId;
  if (asset.characterId !== undefined) fields.character_id = asset.characterId;
  if (asset.characterVariantId !== undefined) fields.character_variant_id = asset.characterVariantId;
  if (asset.sceneId !== undefined) fields.scene_id = asset.sceneId;
  if (asset.sceneVariantId !== undefined) fields.scene_variant_id = asset.sceneVariantId;
  if (asset.projectId !== undefined) fields.project_id = asset.projectId;
  return fields;
}

export const generationAssetStorage: IGenerationAssetStorage = {
  async getAssetsByType(type: string): Promise<GenerationAsset[]> {
    try {
      const rows = await safeQuery<AssetRow>(
        "SELECT * FROM generation_assets WHERE type = ? AND is_deleted = 0 ORDER BY created_at DESC",
        [type],
      );
      return rows.map(rowToAsset);
    } catch (e) {
      errorLogger.error("[asset-storage] getAssetsByType failed", { type, error: e });
      return [];
    }
  },

  async getAssetsByProject(projectId: string): Promise<GenerationAsset[]> {
    try {
      const rows = await safeQuery<AssetRow>(
        "SELECT * FROM generation_assets WHERE project_id = ? AND is_deleted = 0 ORDER BY created_at DESC",
        [projectId],
      );
      return rows.map(rowToAsset);
    } catch (e) {
      errorLogger.error("[asset-storage] getAssetsByProject failed", { projectId, error: e });
      return [];
    }
  },

  async getAssetsByStoryBeat(beatId: string): Promise<GenerationAsset[]> {
    try {
      const rows = await safeQuery<AssetRow>(
        "SELECT * FROM generation_assets WHERE story_beat_id = ? AND is_deleted = 0 ORDER BY created_at DESC",
        [beatId],
      );
      return rows.map(rowToAsset);
    } catch (e) {
      errorLogger.error("[asset-storage] getAssetsByStoryBeat failed", { beatId, error: e });
      return [];
    }
  },

  async getAssetById(id: string): Promise<GenerationAsset | null> {
    try {
      const rows = await safeQuery<AssetRow>(
        "SELECT * FROM generation_assets WHERE id = ? AND is_deleted = 0",
        [id],
      );
      const row = rows[0];
      return row ? rowToAsset(row) : null;
    } catch (e) {
      errorLogger.error("[asset-storage] getAssetById failed", { id, error: e });
      return null;
    }
  },

  async createAsset(asset: Partial<GenerationAsset> & { id: string; type: string; sourceType: string; url: string }): Promise<void> {
    try {
      const fields = assetToFields(asset);
      fields.id = asset.id;
      const columns = Object.keys(fields);
      const placeholders = columns.map(() => "?").join(", ");
      const sql = `INSERT INTO generation_assets (${columns.join(", ")}) VALUES (${placeholders})`;
      const params = columns.map((c) => fields[c]);
      await safeRun(sql, params);
    } catch (e) {
      errorLogger.error("[asset-storage] createAsset failed", { id: asset.id, error: e });
      throw e;
    }
  },

  async updateAsset(id: string, updates: Partial<GenerationAsset>): Promise<void> {
    try {
      const fields = assetToFields(updates);
      if (Object.keys(fields).length === 0) return;
      const columns = Object.keys(fields);
      const setClause = columns.map((c) => `${c} = ?`).join(", ");
      const sql = `UPDATE generation_assets SET ${setClause}, updated_at = (strftime('%s','now')) WHERE id = ?`;
      const params = [...columns.map((c) => fields[c]), id];
      await safeRun(sql, params);
    } catch (e) {
      errorLogger.error("[asset-storage] updateAsset failed", { id, error: e });
      throw e;
    }
  },

  async deleteAsset(id: string): Promise<void> {
    try {
      await safeRun(
        "UPDATE generation_assets SET is_deleted = 1, deleted_at = (strftime('%s','now')) WHERE id = ?",
        [id],
      );
    } catch (e) {
      errorLogger.error("[asset-storage] deleteAsset failed", { id, error: e });
      throw e;
    }
  },

  async deleteUnreferencedAssets(): Promise<number> {
    try {
      const result = await safeRun(
        `UPDATE generation_assets SET is_deleted = 1, deleted_at = (strftime('%s','now'))
         WHERE is_deleted = 0
         AND story_beat_id IS NULL AND sub_shot_id IS NULL
         AND character_id IS NULL AND character_variant_id IS NULL
         AND scene_id IS NULL AND scene_variant_id IS NULL
         AND project_id IS NULL`,
        [],
      );
      return result.changes ?? 0;
    } catch (e) {
      errorLogger.error("[asset-storage] deleteUnreferencedAssets failed", { error: e });
      throw e;
    }
  },
};
