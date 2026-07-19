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

export const CURRENT_SCHEMA_VERSION = 7;

export interface MigrationDb {
  prepare(sql: string): { get(...params: unknown[]): Record<string, unknown> | undefined; all(...params: unknown[]): Record<string, unknown>[]; run(...params: unknown[]): unknown };
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
  // Task 2A.22: 重建 generation_assets 表以更新 CHECK 约束
  // 同时修复 Task 2A.21 遗留问题（CHECK 未包含 preview_3d_snapshot/blockout_* 类型）
  // SQLite 不支持 ALTER COLUMN，只能 CREATE-INSERT-DROP-RENAME 重建
  7: (db) => {
    // 1. 创建新表（无 CHECK 约束，类型由 Zod schema 在 app 层校验）
    db.exec(`
      CREATE TABLE IF NOT EXISTS generation_assets_v7 (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        source_type TEXT NOT NULL CHECK(source_type IN ('ai_generated', 'user_uploaded', 'composited')),
        url TEXT NOT NULL,
        local_path TEXT,
        thumbnail_path TEXT,
        prompt TEXT,
        model_id TEXT,
        provider_id TEXT,
        metadata TEXT DEFAULT '{}',
        story_beat_id TEXT,
        sub_shot_id TEXT,
        character_id TEXT,
        character_variant_id TEXT,
        scene_id TEXT,
        scene_variant_id TEXT,
        project_id TEXT,
        source_asset_id TEXT,
        owner_id INTEGER DEFAULT 1,
        created_at INTEGER DEFAULT (strftime('%s','now')),
        updated_at INTEGER DEFAULT (strftime('%s','now')),
        is_deleted INTEGER DEFAULT 0,
        deleted_at INTEGER,
        version INTEGER DEFAULT 1,
        sync_id TEXT
      );
    `);

    // 2. 检查旧表是否存在并迁移数据
    const oldTableExists = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='generation_assets'",
    ).get();
    if (oldTableExists) {
      // 获取旧表的实际列
      const oldCols = db.prepare("PRAGMA table_info(generation_assets)").all() as Array<{ name: string }>;
      const oldColNames = oldCols.map((c) => c.name);
      // 仅迁移两边都存在的列
      const newColNames = [
        "id", "type", "source_type", "url", "local_path", "thumbnail_path", "prompt",
        "model_id", "provider_id", "metadata", "story_beat_id", "sub_shot_id", "character_id",
        "character_variant_id", "scene_id", "scene_variant_id", "project_id", "source_asset_id",
        "owner_id", "created_at", "updated_at", "is_deleted", "deleted_at", "version", "sync_id",
      ];
      const commonCols = newColNames.filter((c) => oldColNames.includes(c));
      const colList = commonCols.map((c) => `"${c}"`).join(", ");
      try {
        db.exec(`INSERT INTO generation_assets_v7 (${colList}) SELECT ${colList} FROM generation_assets;`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.warn(`[DB] migration v7: data migration failed (continuing): ${msg}`);
      }
      // 3. 删除旧表并重命名
      db.exec("DROP TABLE generation_assets;");
    }
    db.exec("ALTER TABLE generation_assets_v7 RENAME TO generation_assets;");
    logger.info("[DB] migration v7: generation_assets rebuilt (CHECK constraint relaxed, source_asset_id added)");
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
