import type { Result } from "@/domain/types";
import { fromAsyncThrowable } from "@/domain/types";
import { safeQuery, safeRun, safeTransaction } from "@/shared/db-core";
import { sanitizeIdentifier, sanitizeTable } from "@/shared/sql-safety";
import { errorLogger } from "@/shared/error-logger";
import { safeJsonParseArray } from "@/shared/utils/safe-json";
import { container } from "@/infrastructure/di";

function isLocalFilePath(p: string): boolean {
  return !p.startsWith("http://") && !p.startsWith("https://") && !p.startsWith("data:") && !p.startsWith("vcache://");
}

/**
 * 清理本地文件，失败时记录到 orphan_files 表供后续清理。
 *
 * orphan_files 表结构（自动创建）：
 * - id: INTEGER PRIMARY KEY AUTOINCREMENT
 * - file_path: TEXT NOT NULL
 * - reason: TEXT（失败原因）
 * - created_at: INTEGER NOT NULL（Unix 时间戳）
 */

// 模块级标志位：DDL 只在首次调用时执行，避免每次 recordOrphanFile 都跑 CREATE TABLE
let orphanTableEnsured = false;
// 记录 orphan 的次数，用于触发周期性清理
let orphanRecordCount = 0;
// 每记录多少条 orphan 触发一次清理
const ORPHAN_CLEANUP_INTERVAL = 100;

async function ensureOrphanFilesTable(): Promise<void> {
  if (orphanTableEnsured) return;
  await safeRun(`
    CREATE TABLE IF NOT EXISTS orphan_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT NOT NULL,
      reason TEXT,
      created_at INTEGER NOT NULL
    )
  `);
  orphanTableEnsured = true;
}

/**
 * 删除 orphan_files 表中超过 maxAgeDays 天的记录，防止表无限增长。
 * 返回删除的行数。
 */
export async function cleanupOldOrphanFiles(maxAgeDays: number = 30): Promise<number> {
  try {
    await ensureOrphanFilesTable();
    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
    const result = await safeRun(
      `DELETE FROM orphan_files WHERE created_at < ?`,
      [cutoff],
    );
    // better-sqlite3 风格的 safeRun 不一定返回 changes；这里仅尽力而为
    return result?.changes ?? 0;
  } catch (e) {
    errorLogger.warn("[TransactionalDelete] cleanupOldOrphanFiles failed", e);
    return 0;
  }
}

async function recordOrphanFile(filePath: string, reason: string): Promise<void> {
  try {
    await ensureOrphanFilesTable();
    await safeRun(
      `INSERT INTO orphan_files (file_path, reason, created_at) VALUES (?, ?, ?)`,
      [filePath, reason, Date.now()],
    );
    // 偶尔触发清理，避免 orphan_files 表无限增长
    orphanRecordCount += 1;
    if (orphanRecordCount % ORPHAN_CLEANUP_INTERVAL === 0) {
      // 后台清理，不阻塞主流程；失败仅记录日志
      cleanupOldOrphanFiles().catch((e) =>
        errorLogger.warn("[TransactionalDelete] periodic cleanupOldOrphanFiles failed", e),
      );
    }
  } catch (dbError) {
    // 记录失败也不能影响主流程，仅日志
    errorLogger.warn("[TransactionalDelete] Failed to record orphan file", { filePath, reason, dbError });
  }
}

async function cleanupLocalFiles(paths: (string | null | undefined)[]): Promise<void> {
  const validPaths = paths.filter((p): p is string => typeof p === "string" && p.length > 0 && isLocalFilePath(p));
  if (validPaths.length === 0) return;
  const fileStorage = await container.fileStorage;
  for (const filePath of validPaths) {
    try {
      const deleted = await fileStorage.deleteFile(filePath);
      if (!deleted) {
        // 文件不存在不算失败，跳过
        continue;
      }
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      errorLogger.warn("[TransactionalDelete] Failed to delete file, recording as orphan", { filePath, reason });
      // 记录到 orphan_files 表，供后续清理
      await recordOrphanFile(filePath, reason);
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
