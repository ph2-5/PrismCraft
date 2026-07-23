import { getLogger } from "../logging/logger";
import { extractErrorMessage } from "../logging/extract-error";
import type { DatabaseInterface } from "../db-interface";
import {
  getSchemaSQL,
  getAllTableDefs,
} from "./db-schema";

const logger = getLogger("db-schema-runner");

/** 有效的 SQL 标识符正则（表名/列名） */
export const VALID_TABLE_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

const CRITICAL_TABLES = [
  "characters",
  "scenes",
  "stories",
  "story_beats",
  "video_tasks",
  "schema_version",
];

export function getCurrentSchemaVersion(db: DatabaseInterface): number {
  try {
    const row = db.prepare("SELECT MAX(version) as v FROM schema_version").get();
    if (row && row.v !== undefined && row.v !== null) {
      return Number(row.v);
    }
  } catch {
    logger.info("[DB] schema_version table not found, assuming version 0");
  }
  return 0;
}

export function markSchemaVersion(db: DatabaseInterface, version: number): void {
  try {
    db.prepare(
      "INSERT OR REPLACE INTO schema_version (version, applied_at) VALUES (?, strftime('%s', 'now'))"
    ).run(version);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    logger.warn("[DB] Failed to set schema version:", { message });
  }
}

export function validateSqlIdentifier(name: string, kind: "table" | "column"): void {
  if (!name || !VALID_TABLE_IDENTIFIER.test(name)) {
    throw new Error(`Invalid ${kind} name: ${name}`);
  }
}

export function migrateSchema(db: DatabaseInterface): void {
  const allDefs = getAllTableDefs();

  for (const tableDef of allDefs) {
    if (tableDef.baseColumns === false) continue;
    validateSqlIdentifier(tableDef.name, "table");

    let existingCols: Set<string>;
    try {
      const info = db.prepare(`PRAGMA table_info("${tableDef.name}")`).all() as Array<{ name: string }>;
      if (info.length === 0) continue;
      existingCols = new Set(info.map((c) => c.name));
    } catch {
      continue;
    }

    const BASE_COL_DEFS: Record<string, { type: string; default: string }> = {
      owner_id: { type: "INTEGER", default: "1" },
      created_at: { type: "INTEGER", default: "(strftime('%s','now'))" },
      updated_at: { type: "INTEGER", default: "(strftime('%s','now'))" },
      is_deleted: { type: "INTEGER", default: "0" },
      deleted_at: { type: "INTEGER", default: "NULL" },
      version: { type: "INTEGER", default: "1" },
      sync_id: { type: "TEXT", default: "NULL" },
    };

    for (const [colName, colDef] of Object.entries(BASE_COL_DEFS)) {
      addMissingColumn(db, tableDef.name, colName, existingCols, () =>
        `ALTER TABLE "${tableDef.name}" ADD COLUMN "${colName}" ${colDef.type} DEFAULT ${colDef.default}`
      );
    }

    for (const [colName, colDef] of Object.entries(tableDef.columns)) {
      addMissingColumn(db, tableDef.name, colName, existingCols, () => {
        let sql = `ALTER TABLE "${tableDef.name}" ADD COLUMN "${colName}" ${colDef.type}`;
        if (colDef.notNull) sql += " NOT NULL";
        if (colDef.default !== undefined) sql += ` DEFAULT ${colDef.default}`;
        return sql;
      });
    }
  }
}

/**
 * 给表添加缺失的列。如果列已存在或为 duplicate column 错误则跳过。
 * SQL 由 buildSql 回调惰性构造，避免对已有列做无谓的字符串拼接。
 */
function addMissingColumn(
  db: DatabaseInterface,
  tableName: string,
  colName: string,
  existingCols: Set<string>,
  buildSql: () => string,
): void {
  validateSqlIdentifier(colName, "column");
  if (existingCols.has(colName)) return;
  try {
    db.exec(buildSql());
    logger.info(`[DB] Migrated: ${tableName}.${colName} added`);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("duplicate column")) return;
    logger.warn(`[DB] Failed to add ${tableName}.${colName}`, { error: msg });
  }
}

export function executeSchemaSafely(db: DatabaseInterface): void {
  const schemaSql = getSchemaSQL();
  const statements = schemaSql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const errors: string[] = [];

  for (const stmt of statements) {
    try {
      db.exec(stmt + ";");
    } catch (error: unknown) {
      const msg = extractErrorMessage(error);
      if (
        msg.includes("already exists") ||
        msg.includes("duplicate column")
      ) {
        continue;
      }
      const isIndexStmt = stmt.trim().toUpperCase().startsWith("CREATE INDEX");
      if (isIndexStmt) {
        logger.warn("[DB] Index creation skipped (non-fatal)", {
          statement: stmt.substring(0, 80),
          error: msg,
        });
        continue;
      }
      const isCriticalTable = CRITICAL_TABLES.some((t) =>
        stmt.toLowerCase().includes(t.toLowerCase())
      );
      if (isCriticalTable) {
        errors.push(`Critical schema failed: ${stmt.substring(0, 80)} - ${msg}`);
      } else {
        logger.warn("[DB] Schema statement failed (non-fatal)", {
          statement: stmt.substring(0, 80),
          error: msg,
        });
      }
    }
  }

  if (errors.length > 0) {
    const combined = errors.join("; ");
    logger.error("[DB] Critical schema errors:", new Error(combined));
    throw new Error(`Critical schema initialization failed: ${combined}`);
  }
}
