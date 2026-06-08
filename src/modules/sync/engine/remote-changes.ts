import type { RemoteChange, VectorClock } from "./types";
import { compareVectorClocks, isVectorClockConflict } from "./types";
import { safeQuery, safeTransaction } from "@/shared/db-core";
import { errorLogger } from "@/shared/error-logger";
import { safeJsonParse } from "@/shared/utils/safe-json";
import { fromAsyncThrowable } from "@/domain/types/result";
import { getTableName, getPkColumn, TABLES_WITHOUT_UPDATED_AT, HARD_DELETE_TABLES } from "./entity-mapping";

export async function applyRemoteChanges(
  changes: RemoteChange[],
  deviceId: string,
): Promise<void> {
  const changesByEntity: Map<string, RemoteChange[]> = new Map();
  for (const change of changes) {
    if (change.deviceId === deviceId) continue;
    const key = `${change.entityType}:${change.entityId}`;
    const existing = changesByEntity.get(key) || [];
    existing.push(change);
    changesByEntity.set(key, existing);
  }

  const allStatements: { sql: string; params: unknown[] }[] = [];

  for (const [, entityChanges] of changesByEntity) {
    const change = entityChanges[entityChanges.length - 1]!;

    const tableName = getTableName(change.entityType);
    if (!tableName) continue;

    const pk = getPkColumn(tableName);

    const entityResult = await fromAsyncThrowable(async () => {
      const hasIsDeleted = !HARD_DELETE_TABLES.has(tableName);
      const selectCols = hasIsDeleted
        ? `SELECT vector_clock, is_deleted, sync_status FROM ${tableName} WHERE ${pk} = ?`
        : `SELECT vector_clock, sync_status FROM ${tableName} WHERE ${pk} = ?`;
      const readRows = await safeQuery(selectCols, [change.entityId]);

      const localRow = (readRows?.[0] || undefined) as {
        vector_clock: string;
        is_deleted?: number;
        sync_status: string;
      } | undefined;

      let localClock: VectorClock = {};
      try {
        const raw = localRow?.vector_clock;
        localClock = safeJsonParse(raw, {});
      } catch (e) {
        errorLogger.warn("[SyncEngine] vector_clock 解析失败", e);
        localClock = {};
      }

      if (change.operation === "delete") {
        if (HARD_DELETE_TABLES.has(tableName)) {
          allStatements.push({
            sql: `DELETE FROM ${tableName} WHERE ${pk} = ?`,
            params: [change.entityId],
          });
        } else {
          const updatedAtClause = TABLES_WITHOUT_UPDATED_AT.has(tableName)
            ? ""
            : ", updated_at = ?";
          const params = TABLES_WITHOUT_UPDATED_AT.has(tableName)
            ? [JSON.stringify(change.vectorClock), change.entityId]
            : [
                JSON.stringify(change.vectorClock),
                Math.floor(Date.now() / 1000),
                change.entityId,
              ];
          allStatements.push({
            sql: `UPDATE ${tableName} SET is_deleted = 1, vector_clock = ?, sync_status = 'synced'${updatedAtClause} WHERE ${pk} = ?`,
            params,
          });
        }
      } else if (
        change.operation === "insert" ||
        change.operation === "update"
      ) {
        const compareResult = compareVectorClocks(
          localClock,
          change.vectorClock,
        );

        if (!localRow) {
          if (change.data) {
            const columns = Object.keys(change.data).filter((k) =>
              /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k) && k !== pk,
            );
            const values = columns.map((k) => change.data![k]);
            const placeholders = columns.map(() => "?").join(",");
            const updatedAtInsClause = TABLES_WITHOUT_UPDATED_AT.has(tableName)
              ? ""
              : ", updated_at";
            const updatedAtInsValue = TABLES_WITHOUT_UPDATED_AT.has(tableName)
              ? ""
              : ", strftime('%s', 'now')";
            const isDeletedInsClause = hasIsDeleted ? ", is_deleted" : "";
            const isDeletedInsValue = hasIsDeleted ? ", 0" : "";
            allStatements.push({
              sql: `INSERT OR IGNORE INTO ${tableName} (${pk}, ${columns.join(",")}, vector_clock, sync_status${isDeletedInsClause}${updatedAtInsClause})
               VALUES (?, ${placeholders}, ?, 'synced'${isDeletedInsValue}${updatedAtInsValue})`,
              params: [
                change.entityId,
                ...values,
                JSON.stringify(change.vectorClock),
              ],
            });
            const updSetClauses = columns.map((k) => `${k} = ?`).join(", ");
            const updatedAtUpdClause = TABLES_WITHOUT_UPDATED_AT.has(tableName)
              ? ""
              : ", updated_at = strftime('%s', 'now')";
            const isDeletedUpdClause = hasIsDeleted ? ", is_deleted = 0" : "";
            allStatements.push({
              sql: `UPDATE ${tableName} SET ${updSetClauses}, vector_clock = ?, sync_status = 'synced'${isDeletedUpdClause}${updatedAtUpdClause} WHERE ${pk} = ?`,
              params: [
                ...values,
                JSON.stringify(change.vectorClock),
                change.entityId,
              ],
            });
          }
        } else if (compareResult < 0) {
          if (change.data) {
            const safeColumns = Object.keys(change.data).filter((k) =>
              /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k),
            );
            const updatedAtUpdClause = TABLES_WITHOUT_UPDATED_AT.has(tableName)
              ? ""
              : ", updated_at = strftime('%s', 'now')";
            const isDeletedUpdClause = hasIsDeleted ? ", is_deleted = 0" : "";
            const setClauses = safeColumns.map((k) => `${k} = ?`).join(", ");
            const values = safeColumns.map((k) => change.data![k]);
            allStatements.push({
              sql: `UPDATE ${tableName} SET ${setClauses}, vector_clock = ?, sync_status = 'synced'${isDeletedUpdClause}${updatedAtUpdClause} WHERE ${pk} = ?`,
              params: [
                ...values,
                JSON.stringify(change.vectorClock),
                change.entityId,
              ],
            });
          }
        } else if (compareResult === 0 && hasIsDeleted && localRow.is_deleted === 1) {
          if (isVectorClockConflict(localClock, change.vectorClock)) {
            allStatements.push({
              sql: `UPDATE ${tableName} SET sync_status = 'conflict' WHERE ${pk} = ?`,
              params: [change.entityId],
            });
          } else if (change.data) {
            const safeColumns = Object.keys(change.data).filter((k) =>
              /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k),
            );
            const updatedAtUpdClause = TABLES_WITHOUT_UPDATED_AT.has(tableName)
              ? ""
              : ", updated_at = strftime('%s', 'now')";
            const setClauses = safeColumns.map((k) => `${k} = ?`).join(", ");
            const values = safeColumns.map((k) => change.data![k]);
            allStatements.push({
              sql: `UPDATE ${tableName} SET ${setClauses}, is_deleted = 0, vector_clock = ?, sync_status = 'synced'${updatedAtUpdClause} WHERE ${pk} = ?`,
              params: [
                ...values,
                JSON.stringify(change.vectorClock),
                change.entityId,
              ],
            });
          }
        } else if (
          compareResult === 0 &&
          isVectorClockConflict(localClock, change.vectorClock)
        ) {
          allStatements.push({
            sql: `UPDATE ${tableName} SET sync_status = 'conflict' WHERE ${pk} = ?`,
            params: [change.entityId],
          });
        }
      }
    });

    if (!entityResult.ok) {
      errorLogger.warn(
        `[SyncEngine] 处理远程变更失败 (${change.entityType}/${change.entityId})`,
        entityResult.error,
      );
    }
  }

  if (allStatements.length > 0) {
    const batchResult = await fromAsyncThrowable(async () => {
      await safeTransaction(allStatements);
    });
    if (!batchResult.ok) {
      errorLogger.warn("[SyncEngine] 批量应用远程变更失败", batchResult.error);
    }
  }
}
