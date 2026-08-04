// AI: All database table/column definitions live in db-tables.ts. Check before adding new tables or columns.
// AI: Use generateTableSQL/generateJunctionTableSQL for new tables, and add migrations in migrations.ts.
import fs from "fs";
import path from "path";
import os from "os";
import { app } from "electron";
import { getLogger } from "../logging/logger";
import { generateTableSQL, generateJunctionTableSQL, SCHEMA_FEATURES } from "./schema-builder";
import type { TableDef } from "./schema-builder";
import {
  USERS_SQL,
  FEATURE_TABLES,
  JUNCTION_TABLES,
  CACHE_TABLES,
  SYNC_TABLES,
  EXTRA_INDEXES_SQL,
} from "./db-tables";
export { CURRENT_SCHEMA_VERSION, MIGRATIONS, runMigrations } from "./migrations";

const logger = getLogger("db-schema");

export function getUserDataPath(): string {
  try {
    if (app && app.getPath) {
      const p = app.getPath("userData");
      logger.info("[DB-Schema] userData path from Electron:", { path: p });
      return p;
    }
  } catch (e) {
    logger.warn("[DB-Schema] Failed to get Electron userData path:", { error: e instanceof Error ? e.message : String(e) });
  }
  const fallback = path.join(os.homedir(), ".ai-animation-studio");
  logger.info("[DB-Schema] Using fallback userData path:", { path: fallback });
  return fallback;
}

export interface DbPaths {
  DB_DIR: string;
  DB_PATH: string;
  DB_TYPE_FILE: string;
}

export function getDbPaths(): DbPaths {
  const dbDir = path.join(getUserDataPath(), "database");
  return {
    DB_DIR: dbDir,
    DB_PATH: path.join(dbDir, "studio.db"),
    DB_TYPE_FILE: path.join(dbDir, ".db-type"),
  };
}

export function ensureDbDir(): void {
  const { DB_DIR } = getDbPaths();
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
    try {
      fs.chmodSync(DB_DIR, 0o700);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      logger.warn("[DB] Failed to set directory permissions:", { error: message });
    }
  }
}

export function getSchemaSQL(): string {
  const parts: string[] = [];

  parts.push(`
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = -64000;
PRAGMA temp_store = memory;
PRAGMA mmap_size = 268435456;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER DEFAULT (strftime('%s','now'))
);
`);

  if (SCHEMA_FEATURES.users) {
    parts.push(USERS_SQL);
  }

  if (SCHEMA_FEATURES.core) {
    for (const table of FEATURE_TABLES) {
      parts.push(generateTableSQL(table));
    }
  }

  for (const jt of JUNCTION_TABLES) {
    parts.push(generateJunctionTableSQL(jt.name, jt.columns, jt.primaryKey, jt.uniqueConstraints));
  }

  for (const table of CACHE_TABLES) {
    parts.push(generateTableSQL(table));
  }

  if (SCHEMA_FEATURES.sync) {
    for (const table of SYNC_TABLES) {
      parts.push(generateTableSQL(table));
    }
  }

  parts.push(EXTRA_INDEXES_SQL);

  return parts.join("\n\n");
}

export function getTableDefByName(name: string): TableDef | undefined {
  const allTables = [...FEATURE_TABLES, ...CACHE_TABLES, ...SYNC_TABLES];
  return allTables.find((t) => t.name.toLowerCase() === name.toLowerCase());
}

export function getAllTableDefs(): TableDef[] {
  return [...FEATURE_TABLES, ...CACHE_TABLES, ...SYNC_TABLES];
}
