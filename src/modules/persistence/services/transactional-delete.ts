import type { Result } from "@/domain/types";
import { fromAsyncThrowable } from "@/domain/types";
import { safeQuery, safeRun, safeTransaction } from "@/shared/db-core";
import { sanitizeIdentifier, sanitizeTable } from "@/shared/sql-safety";
import { errorLogger } from "@/shared/error-logger";
import { safeJsonParseArray } from "@/shared/utils/safe-json";

function isLocalFilePath(p: string): boolean {
  return !p.startsWith("http://") && !p.startsWith("https://") && !p.startsWith("data:") && !p.startsWith("vcache://");
}

async function cleanupLocalFiles(paths: (string | null | undefined)[]): Promise<void> {
  const validPaths = paths.filter((p): p is string => typeof p === "string" && p.length > 0 && isLocalFilePath(p));
  if (validPaths.length === 0) return;
  const api = (window as unknown as { electronAPI?: { deleteFile?: (p: string) => Promise<unknown> } }).electronAPI;
  if (!api?.deleteFile) return;
  for (const filePath of validPaths) {
    try {
      await api.deleteFile(filePath);
    } catch (e) {
      errorLogger.warn("[TransactionalDelete] Failed to delete file", { filePath, error: e });
    }
  }
}

async function removeIdFromJsonArray(
  table: string,
  _idColumn: string,
  idValue: string,
  arrayColumn: string,
): Promise<void> {
  const safeTable = sanitizeTable(table);
  const safeArrayCol = sanitizeIdentifier(arrayColumn);
  const rows = await safeQuery<Record<string, unknown>>(
    `SELECT id, ${safeArrayCol} FROM ${safeTable} WHERE ${safeArrayCol} LIKE ?`,
    [`%${idValue}%`],
  );
  for (const row of rows) {
    try {
      const raw = row[arrayColumn];
      const arr = safeJsonParseArray(raw);
      const filtered = arr.filter((item) => item !== idValue);
      if (filtered.length !== arr.length) {
        await safeRun(
          `UPDATE ${safeTable} SET ${safeArrayCol} = ? WHERE id = ?`,
          [JSON.stringify(filtered), row.id],
        );
      }
    } catch (e) {
      errorLogger.warn("[TransactionalDelete] removeIdFromJsonArray failed", e);
    }
  }
}

export async function deleteCharacterWithRefs(characterId: string): Promise<Result<void>> {
  return fromAsyncThrowable(async () => {
    const characterRows = await safeQuery<Record<string, unknown>>(
      `SELECT ref_image_path, avatar_path, thumbnail_path, preview_path, generated_image FROM characters WHERE id = ?`,
      [characterId],
    );
    const characterPaths: (string | null | undefined)[] = [];
    if (characterRows.length > 0) {
      const row = characterRows[0];
      characterPaths.push(
        row.ref_image_path as string | undefined,
        row.avatar_path as string | undefined,
        row.thumbnail_path as string | undefined,
        row.preview_path as string | undefined,
        row.generated_image as string | undefined,
      );
    }

    const outfitRows = await safeQuery<Record<string, unknown>>(
      `SELECT image_url, local_image_path FROM character_outfits WHERE character_id = ?`,
      [characterId],
    );
    const outfitPaths: (string | null | undefined)[] = [];
    for (const row of outfitRows) {
      outfitPaths.push(
        row.image_url as string | undefined,
        row.local_image_path as string | undefined,
      );
    }

    const statements: Array<{ sql: string; params: unknown[] }> = [];

    statements.push({
      sql: `DELETE FROM story_characters WHERE character_id = ?`,
      params: [characterId],
    });

    statements.push({
      sql: `UPDATE story_beats SET character = NULL WHERE character = ?`,
      params: [characterId],
    });

    await safeTransaction(statements);

    await removeIdFromJsonArray("story_beats", "character", characterId, "character_ids_json");
    await removeIdFromJsonArray("storyboard_assets", "character", characterId, "character_ids");

    const deleteStatements: Array<{ sql: string; params: unknown[] }> = [];
    deleteStatements.push({
      sql: `DELETE FROM character_outfits WHERE character_id = ?`,
      params: [characterId],
    });
    deleteStatements.push({
      sql: `DELETE FROM characters WHERE id = ?`,
      params: [characterId],
    });
    await safeTransaction(deleteStatements);

    await cleanupLocalFiles([...characterPaths, ...outfitPaths]);
  });
}

export async function deleteSceneWithRefs(sceneId: string): Promise<Result<void>> {
  return fromAsyncThrowable(async () => {
    const sceneRows = await safeQuery<Record<string, unknown>>(
      `SELECT ref_image_path, generated_image FROM scenes WHERE id = ?`,
      [sceneId],
    );
    const scenePaths: (string | null | undefined)[] = [];
    if (sceneRows.length > 0) {
      const row = sceneRows[0];
      scenePaths.push(
        row.ref_image_path as string | undefined,
        row.generated_image as string | undefined,
      );
    }

    const statements: Array<{ sql: string; params: unknown[] }> = [];

    statements.push({
      sql: `DELETE FROM story_scenes WHERE scene_id = ?`,
      params: [sceneId],
    });

    statements.push({
      sql: `UPDATE story_beats SET scene = NULL WHERE scene = ?`,
      params: [sceneId],
    });

    statements.push({
      sql: `UPDATE story_beats SET scene_id = NULL WHERE scene_id = ?`,
      params: [sceneId],
    });

    statements.push({
      sql: `UPDATE storyboard_assets SET scene_id = NULL WHERE scene_id = ?`,
      params: [sceneId],
    });

    statements.push({
      sql: `DELETE FROM scenes WHERE id = ?`,
      params: [sceneId],
    });

    await safeTransaction(statements);

    await cleanupLocalFiles(scenePaths);
  });
}

export { errorLogger };
