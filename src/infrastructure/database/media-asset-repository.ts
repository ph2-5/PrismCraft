import type { Result } from "@/domain/types";
import { DatabaseError, fromAsyncThrowable } from "@/domain/types";
import type { MediaAsset } from "@/domain/schemas";
import { mediaAssetSchema } from "@/domain/schemas";
import { safeQuery, safeRun, safeTransaction } from "@/infrastructure/storage/sqlite-core";
import { toSqlValue, trackChange } from "@/infrastructure/storage/core";
import { errorLogger } from "@/shared/error-logger";
import { safeJsonParseArray } from "@/shared/utils/safe-json";

function rowToMediaAsset(row: Record<string, unknown>): MediaAsset {
  let tags: string[] = [];
  const rawTags = row.tags;
  if (typeof rawTags === "string") {
    const parsed = safeJsonParseArray<string>(rawTags);
    if (parsed.length > 0) tags = parsed;
  } else if (Array.isArray(rawTags)) {
    tags = rawTags;
  }

  const boundToType = row.bound_to_type as string | null;
  const boundToId = row.bound_to_id as string | null;
  const boundToName = row.bound_to_name as string | null;

  return mediaAssetSchema.parse({
    id: String(row.id || ""),
    name: String(row.name || ""),
    description: row.description ? String(row.description) : "",
    type: (row.type as "image" | "video") || "image",
    url: String(row.url || ""),
    thumbnailUrl: row.thumbnail_url ? String(row.thumbnail_url) : undefined,
    tags,
    createdAt: row.created_at ? String(row.created_at) : "",
    updatedAt: row.updated_at ? String(row.updated_at) : "",
    boundTo:
      boundToType && boundToId
        ? {
            type: boundToType as "character" | "scene",
            id: boundToId,
            name: boundToName || "",
          }
        : undefined,
    fileSize: row.file_size ? Number(row.file_size) : undefined,
    mimeType: row.mime_type ? String(row.mime_type) : undefined,
    width: row.width ? Number(row.width) : undefined,
    height: row.height ? Number(row.height) : undefined,
    duration: row.duration ? Number(row.duration) : undefined,
  });
}

export const mediaAssetRepository = {
  async findAll(): Promise<Result<MediaAsset[]>> {
    return fromAsyncThrowable(async () => {
      const rows = await safeQuery<Record<string, unknown>>(
        "SELECT * FROM media_assets ORDER BY created_at DESC",
      );
      return rows.map(rowToMediaAsset);
    });
  },

  async findById(id: string): Promise<Result<MediaAsset | null>> {
    return fromAsyncThrowable(async () => {
      const rows = await safeQuery<Record<string, unknown>>(
        "SELECT * FROM media_assets WHERE id = ?",
        [id],
      );
      if (rows.length === 0) return null;
      return rowToMediaAsset(rows[0]);
    });
  },

  async create(
    input: Partial<MediaAsset> & { id: string },
  ): Promise<Result<MediaAsset>> {
    return fromAsyncThrowable(async () => {
      const now = Math.floor(Date.now() / 1000);
      await safeRun(
        `INSERT OR IGNORE INTO media_assets (id, name, description, type, url, thumbnail_url, tags, file_size, mime_type, width, height, duration, bound_to_type, bound_to_id, bound_to_name, owner_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          input.id,
          input.name || "",
          input.description || null,
          input.type || "image",
          input.url || null,
          input.thumbnailUrl || null,
          toSqlValue(input.tags),
          input.fileSize || null,
          input.mimeType || null,
          input.width || null,
          input.height || null,
          input.duration || null,
          input.boundTo?.type || null,
          input.boundTo?.id || null,
          input.boundTo?.name || null,
          1,
          input.createdAt || now,
          now,
        ],
      );

      try {
        await trackChange("media_asset", input.id, "insert");
      } catch (e) { errorLogger.warn("[Storage] trackChange failed for media_asset:insert", e); }

      const result = await this.findById(input.id);
      if (!result.ok) throw result.error;
      if (!result.value) throw new DatabaseError("Failed to create media asset");
      return result.value;
    });
  },

  async update(
    input: Partial<MediaAsset> & { id: string },
  ): Promise<Result<MediaAsset>> {
    return fromAsyncThrowable(async () => {
      const now = Math.floor(Date.now() / 1000);
      await safeRun(
        `UPDATE media_assets SET name = ?, description = ?, type = ?, url = ?, thumbnail_url = ?, tags = ?, file_size = ?, mime_type = ?, width = ?, height = ?, duration = ?, bound_to_type = ?, bound_to_id = ?, bound_to_name = ?, updated_at = ? WHERE id = ?`,
        [
          input.name || "",
          input.description || null,
          input.type || "image",
          input.url || null,
          input.thumbnailUrl || null,
          toSqlValue(input.tags),
          input.fileSize || null,
          input.mimeType || null,
          input.width || null,
          input.height || null,
          input.duration || null,
          input.boundTo?.type || null,
          input.boundTo?.id || null,
          input.boundTo?.name || null,
          now,
          input.id,
        ],
      );

      try {
        await trackChange("media_asset", input.id, "update");
      } catch (e) { errorLogger.warn("[Storage] trackChange failed for media_asset:update", e); }

      const result = await this.findById(input.id);
      if (!result.ok) throw result.error;
      if (!result.value) throw new DatabaseError("Failed to update media asset");
      return result.value;
    });
  },

  async delete(id: string): Promise<Result<void>> {
    return fromAsyncThrowable(async () => {
      await safeTransaction([
        {
          sql: "DELETE FROM collection_assets WHERE asset_id = ? AND asset_type = 'media_asset'",
          params: [id],
        },
        { sql: "DELETE FROM media_assets WHERE id = ?", params: [id] },
      ]);
      try {
        await trackChange("media_asset", id, "delete");
      } catch (e) { errorLogger.warn("[Storage] trackChange failed for media_asset:delete", e); }
    });
  },
};
