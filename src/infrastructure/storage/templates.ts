import { safeQuery, safeRun } from "./sqlite-core";
import { parseRecordWithTable, toSqlValue, trackChange } from "./core";
import { errorLogger } from "@/shared/error-logger";

export const templateStorage = {
  async getVideoTemplates<T = Record<string, unknown>>(): Promise<T[]> {
    const result = await safeQuery<Record<string, unknown>>(
      "SELECT * FROM video_templates ORDER BY created_at DESC",
    );
    return result.map((r) => parseRecordWithTable(r, "video_templates")) as T[];
  },

  async createVideoTemplate(template: Record<string, unknown>): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    const id =
      (template.id as string) ||
      `vt_${crypto.randomUUID()}`;
    await safeRun(
      `INSERT OR IGNORE INTO video_templates (id, name, description, category, total_duration, shots_json, tags, thumbnail_url, owner_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        template.name || "",
        template.description || null,
        template.category || null,
        template.totalDuration || template.total_duration || null,
        toSqlValue(template.shots || template.shots_json),
        toSqlValue(template.tags),
        template.thumbnailUrl || template.thumbnail_url || null,
        1,
        template.created_at || now,
        now,
      ],
    );
    try {
      await trackChange("video_template", id, "insert");
    } catch (e) { errorLogger.warn("[Storage] trackChange failed for video_template:insert", e); }
  },

  async saveASTTemplate(meta: {
    id: string;
    name: string;
    description?: string;
    category?: string;
    genre?: string;
    tone?: string;
    tags?: string;
    author?: string;
    totalDuration: number;
    beatsCount: number;
    charactersCount?: number;
    scenesCount?: number;
    astFilePath?: string;
    astFileSize?: number;
    isPublic?: boolean;
    parentTemplateId?: string;
  }): Promise<void> {
    await safeRun(
      `INSERT OR IGNORE INTO ast_templates 
       (id, name, description, category, genre, tone, tags, author, 
        total_duration, beats_count, characters_count, scenes_count,
        ast_file_path, ast_file_size, is_public, parent_template_id, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        meta.id,
        meta.name,
        meta.description || null,
        meta.category || null,
        meta.genre || null,
        meta.tone || null,
        meta.tags || null,
        meta.author || null,
        meta.totalDuration,
        meta.beatsCount,
        meta.charactersCount || 0,
        meta.scenesCount || 0,
        meta.astFilePath || null,
        meta.astFileSize || null,
        meta.isPublic ? 1 : 0,
        meta.parentTemplateId || null,
        Math.floor(Date.now() / 1000),
      ],
    );
    try {
      await trackChange("ast_template", meta.id, "insert");
    } catch (e) { errorLogger.warn("[Storage] trackChange failed for ast_template:insert", e); }
  },

  async getASTTemplate(id: string): Promise<Record<string, unknown> | null> {
    const result = await safeQuery<Record<string, unknown>>(
      "SELECT * FROM ast_templates WHERE id = ?",
      [id],
    );
    return result.length > 0 ? parseRecordWithTable(result[0], "ast_templates") : null;
  },

  async getASTTemplates(filters?: {
    category?: string;
    search?: string;
    sortBy?: "created" | "usage" | "name";
    limit?: number;
  }): Promise<Record<string, unknown>[]> {
    let sql = "SELECT * FROM ast_templates WHERE 1=1";
    const params: unknown[] = [];

    if (filters?.category) {
      sql += " AND category = ?";
      params.push(filters.category);
    }

    if (filters?.search) {
      sql += " AND (name LIKE ? OR description LIKE ?)";
      const escaped = filters.search.replace(/%/g, "\\%").replace(/_/g, "\\_");
      params.push(`%${escaped}%`, `%${escaped}%`);
    }

    switch (filters?.sortBy) {
      case "usage":
        sql += " ORDER BY usage_count DESC";
        break;
      case "name":
        sql += " ORDER BY name ASC";
        break;
      default:
        sql += " ORDER BY created_at DESC";
    }

    if (filters?.limit) {
      sql += " LIMIT ?";
      params.push(filters.limit);
    }

    const result = await safeQuery<Record<string, unknown>>(sql, params);
    return result.map((r) => parseRecordWithTable(r, "ast_templates"));
  },

  async deleteASTTemplate(id: string): Promise<boolean> {
    const template = await templateStorage.getASTTemplate(id);
    if (template) {
      await safeRun("DELETE FROM ast_templates WHERE id = ?", [id]);
      try {
        await trackChange("ast_template", id, "delete");
      } catch (e) { errorLogger.warn("[Storage] trackChange failed for ast_template:delete", e); }
      return true;
    }
    return false;
  },

  async incrementASTTemplateUsage(id: string): Promise<void> {
    const result = await safeRun(
      "UPDATE ast_templates SET usage_count = usage_count + 1, updated_at = ? WHERE id = ?",
      [Math.floor(Date.now() / 1000), id],
    );
    const updateResult = result;
    if (!updateResult || updateResult.changes === 0) {
      const existing = await safeQuery<{ id: string }>(
        "SELECT id FROM ast_templates WHERE id = ?",
        [id],
      );
      if (existing.length === 0) {
        throw new Error(`ASTTemplate not found for update: id="${id}"`);
      }
    }
    try {
      await trackChange("ast_template", id, "update");
    } catch (e) { errorLogger.warn("[Storage] trackChange failed for ast_template:incrementUsage", e); }
  },
};
