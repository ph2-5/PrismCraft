import type { SyncConflict, SyncEntityType } from "./types";
import { safeQuery, safeRun } from "@/shared/db-core";
import { errorLogger } from "@/shared/error-logger";
import { fromAsyncThrowable } from "@/domain/types/result";
import { getTableName, getPkColumn, TABLES_WITHOUT_UPDATED_AT } from "./entity-mapping";
import { sanitizeIdentifier } from "@/shared/sql-safety";

export async function resolveConflict(conflict: SyncConflict, conflictStrategy: string): Promise<void> {
  switch (conflictStrategy) {
    case "local-wins": {
      const tableName = getTableName(conflict.entityType);
      if (tableName) {
        const pk = getPkColumn(tableName);
        await safeRun(
          `UPDATE ${sanitizeIdentifier(tableName)} SET sync_status = 'pending' WHERE ${sanitizeIdentifier(pk)} = ?`,
          [conflict.entityId],
        );
      }
      break;
    }
    case "remote-wins": {
      const tableName = getTableName(conflict.entityType);
      if (tableName && conflict.remoteData) {
        const pk = getPkColumn(tableName);
        const columns = Object.keys(conflict.remoteData).filter((k) =>
          /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k),
        );
        const setClauses = columns.map((k) => `${sanitizeIdentifier(k)} = ?`).join(", ");
        const values = columns.map(
          (k) => (conflict.remoteData as Record<string, unknown>)[k],
        );

        const backupResult = await fromAsyncThrowable(async () => {
          const localBackup = await safeQuery(
            `SELECT * FROM ${sanitizeIdentifier(tableName)} WHERE ${sanitizeIdentifier(pk)} = ?`,
            [conflict.entityId],
          );
          if (localBackup && localBackup.length > 0) {
            const backupData = JSON.stringify(localBackup[0]);
            const backupId = `${conflict.entityId}_conflict_${Date.now()}`;
            await safeRun(
              `INSERT INTO sync_conflict_backup (id, entity_type, entity_id, local_data, remote_data, resolved_at)
               VALUES (?, ?, ?, ?, ?, ?)`,
              [backupId, conflict.entityType, conflict.entityId, backupData, JSON.stringify(conflict.remoteData), Date.now()],
            );
          }
        });
        if (!backupResult.ok) {
          errorLogger.warn("[SyncEngine] Failed to backup local data", backupResult.error);
        }

        await safeRun(
          `UPDATE ${sanitizeIdentifier(tableName)} SET ${setClauses}, vector_clock = ?, sync_status = 'synced' WHERE ${sanitizeIdentifier(pk)} = ?`,
          [
            ...values,
            JSON.stringify(conflict.remoteVectorClock),
            conflict.entityId,
          ],
        );
      }
      break;
    }
    case "last-write-wins": {
      const tableName = getTableName(conflict.entityType);
      if (!tableName) break;
      const pk = getPkColumn(tableName);
      const localData: Record<string, unknown> = conflict.localData || {};
      const remoteData: Record<string, unknown> = conflict.remoteData || {};
      const localTime = (localData.updated_at as number) || 0;
      const remoteTime = (remoteData.updated_at as number) || 0;

      // P0-3 修复：对无 updated_at 列的表（video_tasks/story_versions），
      // localTime 和 remoteTime 都为 0，导致 `remoteTime >= localTime` 恒真，
      // remote 恒胜——本地变更永远被远程覆盖，即使本地更新更晚。
      // 这与 LWW 语义相悖：LWW 应比较时间戳，无时间戳时无法判定"谁更晚"。
      // 修复策略：对无 updated_at 的表，回退到 local-wins 行为（保留本地数据），
      // 标记为 conflict 待用户手动解决。这比静默丢弃本地变更更安全。
      if (TABLES_WITHOUT_UPDATED_AT.has(tableName)) {
        // 无时间戳可比较，标记冲突而非静默 remote-wins
        await markConflict(conflict.entityType, conflict.entityId);
        errorLogger.warn(
          `[SyncEngine] LWW 无法比较无 updated_at 的表 ${tableName} (entityId=${conflict.entityId})，已标记为 conflict`,
        );
        break;
      }

      if (remoteTime >= localTime && remoteData) {
        const backupResult = await fromAsyncThrowable(async () => {
          const localBackup = await safeQuery(
            `SELECT * FROM ${sanitizeIdentifier(tableName)} WHERE ${sanitizeIdentifier(pk)} = ?`,
            [conflict.entityId],
          );
          const backupArray = localBackup as Array<Record<string, unknown>> | undefined;
          if (backupArray && backupArray.length > 0) {
            const backupData = JSON.stringify(backupArray[0]);
            const backupId = `${conflict.entityId}_conflict_${Date.now()}`;
            await safeRun(
              `INSERT INTO sync_conflict_backup (id, entity_type, entity_id, local_data, remote_data, resolved_at)
               VALUES (?, ?, ?, ?, ?, ?)`,
              [backupId, conflict.entityType, conflict.entityId, backupData, JSON.stringify(remoteData), Date.now()],
            );
          }
        });
        if (!backupResult.ok) {
          errorLogger.warn("[SyncEngine] Failed to backup local data", backupResult.error);
        }

        const columns = Object.keys(remoteData).filter((k) =>
          /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k),
        );
        const setClauses = columns.map((k) => `${sanitizeIdentifier(k)} = ?`).join(", ");
        const values = columns.map((k) => remoteData[k]);
        await safeRun(
          `UPDATE ${sanitizeIdentifier(tableName)} SET ${setClauses}, vector_clock = ?, sync_status = 'synced' WHERE ${sanitizeIdentifier(pk)} = ?`,
          [
            ...values,
            JSON.stringify(conflict.remoteVectorClock),
            conflict.entityId,
          ],
        );
      }
      break;
    }
    case "manual":
      await markConflict(conflict.entityType, conflict.entityId);
      break;
  }
}

export async function markConflict(
  entityType: SyncEntityType,
  entityId: string,
): Promise<void> {
  const tableName = getTableName(entityType);
  if (!tableName) return;

  const pk = getPkColumn(tableName);
  await safeRun(
    `UPDATE ${sanitizeIdentifier(tableName)} SET sync_status = 'conflict' WHERE ${sanitizeIdentifier(pk)} = ?`,
    [entityId],
  );
}
