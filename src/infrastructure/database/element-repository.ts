import type { Result } from "@/domain/types";
import { fromAsyncThrowable, DatabaseError } from "@/domain/types";
import type { StoryElement, ElementType, AssetBinding } from "@/domain/schemas";
import { safeQuery, safeRun, safeTransaction } from "@/infrastructure/storage/sqlite-core";
import { toSqlValue, trackChange } from "@/infrastructure/storage/core";
import { errorLogger } from "@/shared/error-logger";
import { safeJsonParse as _safeJsonParse } from "@/shared/utils/safe-json";

function safeJsonParse<T>(raw: unknown, field: string, id: string): T | undefined {
  if (!raw) return undefined;
  const result = _safeJsonParse<T>(raw, null as T);
  if (result === null) {
    errorLogger.warn(
      { code: "ELEMENT_REPO_PARSE_FAILED", message: `Failed to parse ${field} for ${id}` },
      "ElementRepository",
    );
    return undefined;
  }
  return result;
}

function rowToElement(row: Record<string, unknown>): StoryElement {
  const id = row.id as string;
  return {
    id,
    type: row.type as ElementType,
    name: row.name as string,
    description: (row.description as string) ?? "",
    characterConfig: safeJsonParse(row.character_config_json, "character_config_json", id),
    sceneConfig: safeJsonParse(row.scene_config_json, "scene_config_json", id),
    featureAnchor: safeJsonParse(row.feature_anchor_json, "feature_anchor_json", id),
    referenceImageQuality: safeJsonParse(row.reference_image_quality_json, "reference_image_quality_json", id),
    bindings: safeJsonParse<AssetBinding[]>(row.bindings_json, "bindings_json", id) ?? [],
    createdAt: new Date(((row.created_at as number) || 0) * 1000).toISOString(),
    updatedAt: new Date(((row.updated_at as number) || 0) * 1000).toISOString(),
  };
}

export const elementRepository = {
  async findAll(): Promise<Result<StoryElement[]>> {
    return fromAsyncThrowable(async () => {
      const rows = await safeQuery<Record<string, unknown>>(
        "SELECT * FROM elements ORDER BY created_at DESC",
      );
      return rows.map(rowToElement);
    });
  },

  async findById(id: string): Promise<Result<StoryElement | null>> {
    return fromAsyncThrowable(async () => {
      const rows = await safeQuery<Record<string, unknown>>(
        "SELECT * FROM elements WHERE id = ?",
        [id],
      );
      if (rows.length === 0) return null;
      return rowToElement(rows[0]);
    });
  },

  async findByType(type: ElementType): Promise<Result<StoryElement[]>> {
    return fromAsyncThrowable(async () => {
      const rows = await safeQuery<Record<string, unknown>>(
        "SELECT * FROM elements WHERE type = ? ORDER BY created_at DESC",
        [type],
      );
      return rows.map(rowToElement);
    });
  },

  async create(input: {
    type: ElementType;
    name: string;
    description?: string;
  }): Promise<Result<StoryElement>> {
    return fromAsyncThrowable(async () => {
      const prefixMap: Record<ElementType, string> = {
        character: "CHAR",
        prop: "PROP",
        effect: "EFFECT",
      };
      const prefix = prefixMap[input.type];
      const now = Math.floor(Date.now() / 1000);

      for (let attempt = 0; attempt < 3; attempt++) {
        const maxCodeRows = await safeQuery<{ max_code: number }>(
          `SELECT MAX(CAST(SUBSTR(id, ?) AS INTEGER)) as max_code FROM elements WHERE type = ? AND id LIKE ?`,
          [prefix.length + 2, input.type, `${prefix}_%`],
        );
        const maxCode = maxCodeRows[0]?.max_code || 0;
        const num = maxCode + 1 + attempt;
        const id = `${prefix}_${String(num).padStart(3, "0")}`;

        const element: StoryElement = {
          id,
          type: input.type,
          name: input.name,
          description: input.description ?? "",
          bindings: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        await safeRun(
          `INSERT OR IGNORE INTO elements (id, type, name, description, bindings_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [id, input.type, input.name, input.description || null, "[]", now, now],
        );

        const verify = await safeQuery<{ id: string }>(
          "SELECT id FROM elements WHERE id = ?",
          [id],
        );
        if (verify.length > 0) {
          try { await trackChange("element", id, "insert"); } catch (e) { errorLogger.warn("[Storage] trackChange failed for element:insert", e); }
          return element;
        }
      }

      const fallbackId = `${prefix}_${Date.now()}`;
      const element: StoryElement = {
        id: fallbackId,
        type: input.type,
        name: input.name,
        description: input.description ?? "",
        bindings: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await safeRun(
        `INSERT OR IGNORE INTO elements (id, type, name, description, bindings_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [fallbackId, input.type, input.name, input.description || null, "[]", now, now],
      );
      try { await trackChange("element", fallbackId, "insert"); } catch (e) { errorLogger.warn("[Storage] trackChange failed for element:insert", e); }
      return element;
    });
  },

  async update(id: string, input: Partial<StoryElement>): Promise<Result<void>> {
    return fromAsyncThrowable(async () => {
      const existing = await this.findById(id);
      if (!existing.ok || !existing.value) {
        throw new DatabaseError(`Element ${id} not found`);
      }

      const now = Math.floor(Date.now() / 1000);
      const merged = {
        ...existing.value,
        ...input,
        updatedAt: new Date().toISOString(),
      };

      await safeRun(
        `UPDATE elements SET
          name = ?,
          description = ?,
          character_config_json = ?,
          scene_config_json = ?,
          feature_anchor_json = ?,
          reference_image_quality_json = ?,
          bindings_json = ?,
          updated_at = ?
        WHERE id = ?`,
        [
          merged.name,
          merged.description || null,
          toSqlValue(merged.characterConfig),
          toSqlValue(merged.sceneConfig),
          toSqlValue(merged.featureAnchor),
          toSqlValue(merged.referenceImageQuality),
          toSqlValue(merged.bindings),
          now,
          id,
        ],
      );

      try { await trackChange("element", id, "update"); } catch (e) { errorLogger.warn("[Storage] trackChange failed for element:update", e); }
    });
  },

  async delete(id: string): Promise<Result<void>> {
    return fromAsyncThrowable(async () => {
      await safeTransaction([
        { sql: "DELETE FROM story_elements WHERE element_id = ?", params: [id] },
        { sql: "DELETE FROM elements WHERE id = ?", params: [id] },
      ]);
      try { await trackChange("element", id, "delete"); } catch (e) { errorLogger.warn("[Storage] trackChange failed for element:delete", e); }
    });
  },

  async getNextCode(): Promise<Result<Record<ElementType, number>>> {
    return fromAsyncThrowable(async () => {
      const rows = await safeQuery<Record<string, unknown>>(
        "SELECT id, type FROM elements",
      );

      const nextCode: Record<ElementType, number> = { character: 1, prop: 1, effect: 1 };
      for (const row of rows) {
        const match = (row.id as string).match(/_(\d+)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          const type = row.type as ElementType;
          if (num >= nextCode[type]) {
            nextCode[type] = num + 1;
          }
        }
      }
      return nextCode;
    });
  },

  async count(): Promise<Result<number>> {
    return fromAsyncThrowable(async () => {
      const rows = await safeQuery<{ count: number }>(
        "SELECT COUNT(*) as count FROM elements",
      );
      return rows[0]?.count ?? 0;
    });
  },
};