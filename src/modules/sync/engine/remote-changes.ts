import type { RemoteChange, VectorClock } from "./types";
import { compareVectorClocks, isVectorClockConflict } from "./types";
import { safeQuery, safeTransaction } from "@/shared/db-core";
import { errorLogger } from "@/shared/error-logger";
import { safeJsonParse } from "@/shared/utils/safe-json";
import { fromAsyncThrowable } from "@/domain/types/result";
import { getTableName, getPkColumn, TABLES_WITHOUT_UPDATED_AT, HARD_DELETE_TABLES } from "./entity-mapping";
import { sanitizeIdentifier } from "@/shared/sql-safety";

type Statement = { sql: string; params: unknown[] };

type LocalRow = {
  vector_clock: string;
  is_deleted?: number;
  sync_status: string;
} | undefined;

const COLUMN_NAME_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function filterColumnNames(data: Record<string, unknown>, excludePk?: string): string[] {
  return Object.keys(data).filter((k) => COLUMN_NAME_PATTERN.test(k) && k !== excludePk);
}

function buildUpdatedAtClause(tableName: string, prefix: string): string {
  return TABLES_WITHOUT_UPDATED_AT.has(tableName) ? "" : prefix;
}

function buildDeleteStatements(
  change: RemoteChange,
  tableName: string,
  safeTable: string,
  safePk: string,
): Statement[] {
  if (HARD_DELETE_TABLES.has(tableName)) {
    return [{ sql: `DELETE FROM ${safeTable} WHERE ${safePk} = ?`, params: [change.entityId] }];
  }
  const hasUpdatedAt = !TABLES_WITHOUT_UPDATED_AT.has(tableName);
  const params = hasUpdatedAt
    ? [JSON.stringify(change.vectorClock), Math.floor(Date.now() / 1000), change.entityId]
    : [JSON.stringify(change.vectorClock), change.entityId];
  const updatedAtClause = hasUpdatedAt ? ", updated_at = ?" : "";
  return [{
    sql: `UPDATE ${safeTable} SET is_deleted = 1, vector_clock = ?, sync_status = 'synced'${updatedAtClause} WHERE ${safePk} = ?`,
    params,
  }];
}

function buildInsertStatements(
  change: RemoteChange,
  safeTable: string,
  safePk: string,
  pk: string,
  hasIsDeleted: boolean,
  tableName: string,
): Statement[] {
  if (!change.data) return [];
  const columns = filterColumnNames(change.data, pk);
  const safeColumns = columns.map(sanitizeIdentifier);
  const values = columns.map((k) => change.data![k]);
  const placeholders = columns.map(() => "?").join(",");
  const updatedAtInsClause = buildUpdatedAtClause(tableName, ", updated_at");
  const updatedAtInsValue = buildUpdatedAtClause(tableName, ", strftime('%s', 'now')");
  const isDeletedInsClause = hasIsDeleted ? ", is_deleted" : "";
  const isDeletedInsValue = hasIsDeleted ? ", 0" : "";
  const insertStmt: Statement = {
    sql: `INSERT OR IGNORE INTO ${safeTable} (${safePk}, ${safeColumns.join(",")}, vector_clock, sync_status${isDeletedInsClause}${updatedAtInsClause})
     VALUES (?, ${placeholders}, ?, 'synced'${isDeletedInsValue}${updatedAtInsValue})`,
    params: [
      change.entityId,
      ...values,
      JSON.stringify(change.vectorClock),
    ],
  };
  const updSetClauses = columns.map((k) => `${sanitizeIdentifier(k)} = ?`).join(", ");
  const updatedAtUpdClause = buildUpdatedAtClause(tableName, ", updated_at = strftime('%s', 'now')");
  const isDeletedUpdClause = hasIsDeleted ? ", is_deleted = 0" : "";
  const updateStmt: Statement = {
    sql: `UPDATE ${safeTable} SET ${updSetClauses}, vector_clock = ?, sync_status = 'synced'${isDeletedUpdClause}${updatedAtUpdClause} WHERE ${safePk} = ?`,
    params: [
      ...values,
      JSON.stringify(change.vectorClock),
      change.entityId,
    ],
  };
  return [insertStmt, updateStmt];
}

function buildUpdateForNewerChange(
  change: RemoteChange,
  safeTable: string,
  safePk: string,
  hasIsDeleted: boolean,
  tableName: string,
): Statement[] {
  if (!change.data) return [];
  const safeColumnNames = filterColumnNames(change.data);
  const updatedAtUpdClause = buildUpdatedAtClause(tableName, ", updated_at = strftime('%s', 'now')");
  const isDeletedUpdClause = hasIsDeleted ? ", is_deleted = 0" : "";
  const setClauses = safeColumnNames.map((k) => `${sanitizeIdentifier(k)} = ?`).join(", ");
  const values = safeColumnNames.map((k) => change.data![k]);
  return [{
    sql: `UPDATE ${safeTable} SET ${setClauses}, vector_clock = ?, sync_status = 'synced'${isDeletedUpdClause}${updatedAtUpdClause} WHERE ${safePk} = ?`,
    params: [
      ...values,
      JSON.stringify(change.vectorClock),
      change.entityId,
    ],
  }];
}

function buildUndeleteStatements(
  change: RemoteChange,
  safeTable: string,
  safePk: string,
  tableName: string,
): Statement[] {
  if (!change.data) return [];
  const safeColumnNames = filterColumnNames(change.data);
  const updatedAtUpdClause = buildUpdatedAtClause(tableName, ", updated_at = strftime('%s', 'now')");
  const setClauses = safeColumnNames.map((k) => `${sanitizeIdentifier(k)} = ?`).join(", ");
  const values = safeColumnNames.map((k) => change.data![k]);
  return [{
    sql: `UPDATE ${safeTable} SET ${setClauses}, is_deleted = 0, vector_clock = ?, sync_status = 'synced'${updatedAtUpdClause} WHERE ${safePk} = ?`,
    params: [
      ...values,
      JSON.stringify(change.vectorClock),
      change.entityId,
    ],
  }];
}

function buildConflictStatement(safeTable: string, safePk: string, entityId: string): Statement {
  return {
    sql: `UPDATE ${safeTable} SET sync_status = 'conflict' WHERE ${safePk} = ?`,
    params: [entityId],
  };
}

function buildStatementsForEqualClock(
  change: RemoteChange,
  safeTable: string,
  safePk: string,
  hasIsDeleted: boolean,
  tableName: string,
  localRow: LocalRow,
  localClock: VectorClock,
): Statement[] {
  const isConflict = isVectorClockConflict(localClock, change.vectorClock);

  if (hasIsDeleted && localRow?.is_deleted === 1) {
    if (isConflict) return [buildConflictStatement(safeTable, safePk, change.entityId)];
    return buildUndeleteStatements(change, safeTable, safePk, tableName);
  }

  if (isConflict) return [buildConflictStatement(safeTable, safePk, change.entityId)];
  return [];
}

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

  const allStatements: Statement[] = [];

  for (const [, entityChanges] of changesByEntity) {
    const change = entityChanges[entityChanges.length - 1]!;

    const tableName = getTableName(change.entityType);
    if (!tableName) continue;

    const pk = getPkColumn(tableName);
    const safeTable = sanitizeIdentifier(tableName);
    const safePk = sanitizeIdentifier(pk);

    const entityResult = await fromAsyncThrowable(async () => {
      const hasIsDeleted = !HARD_DELETE_TABLES.has(tableName);
      const selectCols = hasIsDeleted
        ? `SELECT vector_clock, is_deleted, sync_status FROM ${safeTable} WHERE ${safePk} = ?`
        : `SELECT vector_clock, sync_status FROM ${safeTable} WHERE ${safePk} = ?`;
      const readRows = await safeQuery(selectCols, [change.entityId]);

      const localRow = (readRows?.[0] || undefined) as LocalRow;

      let localClock: VectorClock = {};
      try {
        const raw = localRow?.vector_clock;
        localClock = safeJsonParse(raw, {});
      } catch (e) {
        errorLogger.warn("[SyncEngine] vector_clock 解析失败", e);
        localClock = {};
      }

      if (change.operation === "delete") {
        allStatements.push(...buildDeleteStatements(change, tableName, safeTable, safePk));
      } else if (change.operation === "insert" || change.operation === "update") {
        const compareResult = compareVectorClocks(localClock, change.vectorClock);
        if (!localRow) {
          allStatements.push(...buildInsertStatements(change, safeTable, safePk, pk, hasIsDeleted, tableName));
        } else if (compareResult < 0) {
          allStatements.push(...buildUpdateForNewerChange(change, safeTable, safePk, hasIsDeleted, tableName));
        } else if (compareResult === 0) {
          allStatements.push(...buildStatementsForEqualClock(change, safeTable, safePk, hasIsDeleted, tableName, localRow, localClock));
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
