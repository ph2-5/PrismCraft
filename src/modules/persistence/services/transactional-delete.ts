import type { Result } from "@/domain/types";
import { fromAsyncThrowable } from "@/domain/types";
import { safeQuery, safeTransaction } from "@/shared/db-core";
import { sanitizeIdentifier, sanitizeTable } from "@/shared/sql-safety";
import { errorLogger } from "@/shared/error-logger";
import { safeJsonParseArray } from "@/shared/utils/safe-json";

function isLocalFilePath(p: string): boolean {
  return !p.startsWith("http://") && !p.startsWith("https://") && !p.startsWith("data:") && !p.startsWith("vcache://");
}

async function cleanupLocalFiles(paths: (string | null | undefined)[]): Promise<void> {
  const validPaths = paths.filter((p): p is string => typeof p === "string" && p.length > 0 && isLocalFilePath(p));
  if (validPaths.length === 0) return;
  const api = window.electronAPI;
  if (!api?.deleteFile) return;
  for (const filePath of validPaths) {
    try {
      await api.deleteFile(filePath);
    } catch (e) {
      errorLogger.warn("[TransactionalDelete] Failed to delete file", { filePath, error: e });
    }
  }
}

async function buildRemoveIdFromJsonArrayStatements(
  table: string,
  idValue: string,
  arrayColumn: string,
): Promise<Array<{ sql: string; params: unknown[] }>> {
  const safeTable = sanitizeTable(table);
  const safeArrayCol = sanitizeIdentifier(arrayColumn);
  const statements: Array<{ sql: string; params: unknown[] }> = [];
  const rows = await safeQuery<Record<string, unknown>>(
    `SELECT id, ${safeArrayCol} FROM ${safeTable} WHERE EXISTS (SELECT 1 FROM json_each(${safeArrayCol}) WHERE json_each.value = ?)`,
    [idValue],
  );
  for (const row of rows) {
    try {
      const raw = row[arrayColumn];
      const arr = safeJsonParseArray(raw);
      const filtered = arr.filter((item) => item !== idValue);
      if (filtered.length !== arr.length) {
        statements.push({
          sql: `UPDATE ${safeTable} SET ${safeArrayCol} = ? WHERE id = ?`,
          params: [JSON.stringify(filtered), row.id],
        });
      }
    } catch (e) {
      errorLogger.warn("[TransactionalDelete] buildRemoveIdFromJsonArrayStatements failed", e);
    }
  }
  return statements;
}

export async function deleteCharacterWithRefs(characterId: string): Promise<Result<void>> {
  return fromAsyncThrowable(async () => {
    const characterRows = await safeQuery<Record<string, unknown>>(
      `SELECT ref_image_path, avatar_path, thumbnail_path, preview_path, generated_image FROM characters WHERE id = ?`,
      [characterId],
    );
    const characterPaths: (string | null | undefined)[] = [];
    if (characterRows.length > 0) {
      const row = characterRows[0]!;
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

    const allStatements: Array<{ sql: string; params: unknown[] }> = [];

    allStatements.push({
      sql: `DELETE FROM story_characters WHERE character_id = ?`,
      params: [characterId],
    });

    allStatements.push({
      sql: `UPDATE story_beats SET character = NULL WHERE character = ?`,
      params: [characterId],
    });

    allStatements.push({
      sql: `DELETE FROM character_outfits WHERE character_id = ?`,
      params: [characterId],
    });

    allStatements.push({
      sql: `DELETE FROM characters WHERE id = ?`,
      params: [characterId],
    });

    const jsonArrayStatements = [
      ...await buildRemoveIdFromJsonArrayStatements("story_beats", characterId, "character_ids_json"),
      ...await buildRemoveIdFromJsonArrayStatements("storyboard_assets", characterId, "character_ids"),
    ];
    allStatements.push(...jsonArrayStatements);

    await safeTransaction(allStatements);

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
      const row = sceneRows[0]!;
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
