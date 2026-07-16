import { getLogger } from "../logging/logger";

const logger = getLogger("migrations");

const VALID_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * 允许的列类型白名单（含简单 DEFAULT 字面量）。
 * 迁移脚本中的 type 字段虽来自代码常量，但仍通过白名单校验
 * 防止未来误拼接用户输入。
 */
const VALID_COLUMN_TYPE = /^(TEXT|INTEGER|REAL|BLOB|NUMERIC|BOOLEAN)(\s+DEFAULT\s+([0-9]+|'[a-zA-Z0-9_\-:]*'|\([^)]*\)))?$/i;

function sanitizeIdentifier(name: string): string {
  if (!VALID_IDENTIFIER.test(name)) {
    throw new Error(`Invalid SQL identifier in migration: ${name}`);
  }
  return `"${name}"`;
}

function sanitizeColumnType(type: string): string {
  if (!VALID_COLUMN_TYPE.test(type)) {
    throw new Error(`Invalid SQL column type in migration: ${type}`);
  }
  return type;
}

export const CURRENT_SCHEMA_VERSION = 6;

export interface MigrationDb {
  prepare(sql: string): { get(...params: unknown[]): Record<string, unknown> | undefined; run(...params: unknown[]): unknown };
  exec(sql: string): void;
  transaction(fn: () => void): void;
}

export const MIGRATIONS: Record<number, (db: MigrationDb) => void> = {
  3: (db) => {
    const columns = [
      { table: "video_tasks", column: "local_video_path", type: "TEXT" },
      { table: "story_beats", column: "local_video_path", type: "TEXT" },
      { table: "story_beats", column: "local_keyframe_path", type: "TEXT" },
      { table: "story_beats", column: "local_first_frame_path", type: "TEXT" },
      { table: "story_beats", column: "local_last_frame_path", type: "TEXT" },
    ];
    for (const { table, column, type } of columns) {
      try {
        db.exec(`ALTER TABLE ${sanitizeIdentifier(table)} ADD COLUMN ${sanitizeIdentifier(column)} ${sanitizeColumnType(type)};`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!msg.includes("duplicate column")) {
          throw e;
        }
      }
    }
  },
  4: (db) => {
    const columns = [
      { table: "collection_assets", column: "created_at", type: "INTEGER DEFAULT (strftime('%s','now'))" },
      { table: "collection_assets", column: "updated_at", type: "INTEGER DEFAULT (strftime('%s','now'))" },
    ];
    for (const { table, column, type } of columns) {
      try {
        db.exec(`ALTER TABLE ${sanitizeIdentifier(table)} ADD COLUMN ${sanitizeIdentifier(column)} ${sanitizeColumnType(type)};`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!msg.includes("duplicate column")) {
          throw e;
        }
      }
    }
  },
  5: (db) => {
    const columns = [
      { table: "video_cache", column: "owner_id", type: "INTEGER DEFAULT 1" },
      { table: "video_cache", column: "version", type: "INTEGER DEFAULT 1" },
      { table: "video_cache", column: "sync_id", type: "TEXT" },
    ];
    for (const { table, column, type } of columns) {
      try {
        db.exec(`ALTER TABLE ${sanitizeIdentifier(table)} ADD COLUMN ${sanitizeIdentifier(column)} ${sanitizeColumnType(type)};`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!msg.includes("duplicate column")) {
          throw e;
        }
      }
    }
  },
  6: (db) => {
    const columns = [
      { table: "video_tasks", column: "priority", type: "INTEGER DEFAULT 0" },
    ];
    for (const { table, column, type } of columns) {
      try {
        db.exec(`ALTER TABLE ${sanitizeIdentifier(table)} ADD COLUMN ${sanitizeIdentifier(column)} ${sanitizeColumnType(type)};`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!msg.includes("duplicate column")) {
          throw e;
        }
      }
    }
  },
};

export function runMigrations(db: MigrationDb, currentVersion: number): void {
  const targetVersion = CURRENT_SCHEMA_VERSION;
  if (currentVersion >= targetVersion) {
    logger.info(`[DB] No pending migrations (current: ${currentVersion})`);
    return;
  }

  const hasPending = Array.from({ length: targetVersion - currentVersion }, (_, i) => currentVersion + 1 + i)
    .some((v) => MIGRATIONS[v]);

  if (!hasPending) {
    logger.info(`[DB] Schema version: ${currentVersion} → ${targetVersion} (no-op)`);
    return;
  }

  db.transaction(() => {
    for (let v = currentVersion + 1; v <= targetVersion; v++) {
      const migrate = MIGRATIONS[v];
      if (migrate) {
        logger.info(`[DB] Running migration v${v}...`);
        migrate(db);
      }
    }
  });

  logger.info(`[DB] Schema version: ${currentVersion} → ${targetVersion}`);
}
