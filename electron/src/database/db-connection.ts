import fs from "fs";
import path from "path";
import BetterSqlite3 from "better-sqlite3";
import { getLogger } from "../logging/logger";
import { createOptimalDatabase, BetterSqlite3Database, DatabaseInterface } from "../db-interface";
import {
  getDbPaths,
  ensureDbDir,
  getSchemaSQL,
  getAllTableDefs,
} from "./db-schema";
import {
  CURRENT_SCHEMA_VERSION,
  runMigrations,
} from "./migrations";
import type { DatabaseResult, QueryParams, RunResult } from "../types/database";
import { ipcMain, BrowserWindow } from "electron";

const logger = getLogger("db-connection");

let dbInstance: DatabaseInterface | null = null;
let dbPath = "";
let initDbPromise: Promise<DatabaseInterface> | null = null;
let initRetryCount = 0;
let isMigrating = false;
let operationQueue: Promise<void> = Promise.resolve();
let isPersistenceAvailable = true;
let lastSaveTime = Date.now();
let consecutiveSaveFailures = 0;
let backupInterval: ReturnType<typeof setInterval> | null = null;
let lastBackupTime = 0;

const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const MAX_BACKUPS = 7;
const MAX_BACKUP_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const SOFT_DELETE_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const SOFT_DELETE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
let softDeleteCleanupInterval: ReturnType<typeof setInterval> | null = null;

function getPersistenceStatus(): { available: boolean; lastSave: number; failures: number } {
  return {
    available: isPersistenceAvailable,
    lastSave: lastSaveTime,
    failures: consecutiveSaveFailures
  };
}

const CRITICAL_TABLES = [
  "characters",
  "scenes",
  "stories",
  "story_beats",
  "video_tasks",
  "schema_version",
];

function getCurrentSchemaVersion(db: DatabaseInterface): number {
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

function markSchemaVersion(db: DatabaseInterface): void {
  try {
    db.prepare(
      "INSERT OR REPLACE INTO schema_version (version, applied_at) VALUES (?, strftime('%s', 'now'))"
    ).run(CURRENT_SCHEMA_VERSION);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    logger.warn("[DB] Failed to set schema version:", { message });
  }
}

function migrateSchema(db: DatabaseInterface): void {
  const allDefs = getAllTableDefs();

  for (const tableDef of allDefs) {
    if (tableDef.baseColumns === false) continue;

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
      if (!existingCols.has(colName)) {
        try {
          const sql = `ALTER TABLE "${tableDef.name}" ADD COLUMN "${colName}" ${colDef.type} DEFAULT ${colDef.default}`;
          db.exec(sql);
          logger.info(`[DB] Migrated: ${tableDef.name}.${colName} added`);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          if (msg.includes("duplicate column")) continue;
          logger.warn(`[DB] Failed to add ${tableDef.name}.${colName}`, { error: msg });
        }
      }
    }

    for (const [colName, colDef] of Object.entries(tableDef.columns)) {
      if (!existingCols.has(colName)) {
        try {
          let sql = `ALTER TABLE "${tableDef.name}" ADD COLUMN "${colName}" ${colDef.type}`;
          if (colDef.notNull) sql += " NOT NULL";
          if (colDef.default !== undefined) sql += ` DEFAULT ${colDef.default}`;
          db.exec(sql);
          logger.info(`[DB] Migrated: ${tableDef.name}.${colName} added`);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          if (msg.includes("duplicate column")) continue;
          logger.warn(`[DB] Failed to add ${tableDef.name}.${colName}`, { error: msg });
        }
      }
    }
  }
}

function executeSchemaSafely(db: DatabaseInterface): void {
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
      const msg = error instanceof Error ? error.message : String(error);
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

const OPERATION_TIMEOUT_MS = 30000;

function enqueueOperation<T>(fn: () => T): Promise<T> {
  const prevQueue = operationQueue;
  let resolve: () => void;
  const nextQueue = new Promise<void>((r) => { resolve = r; });
  operationQueue = nextQueue;

  return prevQueue.then(async () => {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Database operation timed out after 30s")), OPERATION_TIMEOUT_MS);
    });
    try {
      return await Promise.race([fn(), timeoutPromise]);
    } finally {
      resolve!();
    }
  });
}

export async function initDatabase(): Promise<DatabaseInterface> {
  if (initDbPromise) return initDbPromise;

  initDbPromise = (async () => {
    if (dbInstance) return dbInstance;

    ensureDbDir();
    const { DB_PATH } = getDbPaths();

    try {
      dbInstance = createOptimalDatabase();
      dbInstance.init({ filePath: DB_PATH });
      dbType = "better-sqlite3";

      executeSchemaSafely(dbInstance);
      migrateSchema(dbInstance);
      runMigrations(dbInstance, getCurrentSchemaVersion(dbInstance));
      markSchemaVersion(dbInstance);
      dbPath = DB_PATH;

      logger.info(`Initialized with better-sqlite3`);

      startScheduledBackup();
      startSoftDeleteCleanup();

      return dbInstance;
    } catch (error) {
      logger.error("Failed to initialize database", error as Error);

      if (dbInstance) {
        try {
          dbInstance.close();
        } catch (closeError) {
          logger.warn("[DB] Failed to close database before recovery:", { error: closeError instanceof Error ? closeError.message : String(closeError) });
        }
        dbInstance = null;
      }

      try {
        const corruptedPath = `${DB_PATH}.corrupted.${Date.now()}`;
        if (fs.existsSync(DB_PATH)) {
          fs.renameSync(DB_PATH, corruptedPath);
          logger.info(`Renamed corrupted database to ${corruptedPath}`);
        }
        if (fs.existsSync(`${DB_PATH}-wal`)) {
          try { fs.unlinkSync(`${DB_PATH}-wal`); } catch { /* ignore */ }
        }
        if (fs.existsSync(`${DB_PATH}-shm`)) {
          try { fs.unlinkSync(`${DB_PATH}-shm`); } catch { /* ignore */ }
        }
      } catch (renameError) {
        logger.error("Failed to rename corrupted database", renameError instanceof Error ? renameError : new Error(String(renameError)));
      }

      try {
        const restored = tryRestoreFromBackup(DB_PATH);
        dbInstance = createOptimalDatabase();
        dbInstance.init({ filePath: DB_PATH });
        dbType = "better-sqlite3";

        executeSchemaSafely(dbInstance);
        migrateSchema(dbInstance);
        runMigrations(dbInstance, getCurrentSchemaVersion(dbInstance));
        markSchemaVersion(dbInstance);
        dbPath = DB_PATH;

        startScheduledBackup();
        startSoftDeleteCleanup();

        if (restored) {
          logger.info("Database restored from backup successfully");
        } else {
          logger.info("Re-initialized database with new file (no backup available)");
        }
        return dbInstance;
      } catch (fallbackError) {
        if (dbInstance) {
          try { dbInstance.close(); } catch (e) { logger.warn("关闭数据库连接失败", { error: e instanceof Error ? e.message : String(e) }); }
          dbInstance = null;
        }
        logger.error("Database re-initialization also failed", fallbackError as Error);
        throw fallbackError;
      }
    }
  })().catch((error) => {
    initDbPromise = null;
    initRetryCount++;
    if (initRetryCount > 3) {
      initRetryCount = 0;
      logger.error("Database initialization failed after 3 retries, giving up", error as Error);
    }
    throw error;
  });

  return initDbPromise;
}

export function getDb(): DatabaseInterface {
  if (!dbInstance) {
    throw new Error("Database not initialized. Call initDatabase() first.");
  }
  return dbInstance;
}

export function getDbType(): string {
  return "better-sqlite3";
}

export function getDbPath(): string {
  return dbPath;
}

export function saveDatabase(): boolean {
  if (dbInstance) {
    try {
      performCheckpoint();
      consecutiveSaveFailures = 0;
      lastSaveTime = Date.now();
      if (Date.now() - lastBackupTime > 60 * 60 * 1000) {
        createBackup().catch(() => {});
      }
      return true;
    } catch (error: unknown) {
      consecutiveSaveFailures++;
      if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOSPC") {
        isPersistenceAvailable = false;
        logger.error("[DB] CRITICAL: Disk full! WAL checkpoint failed!");
        const mainWindow = BrowserWindow.getAllWindows()[0];
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("db:persistence-error", {
            type: "disk-full",
            message: "磁盘空间不足！请立即清理磁盘空间。",
            timestamp: Date.now()
          });
        }
        return false;
      }
      if (consecutiveSaveFailures > 0) {
        logger.warn(`[DB] Checkpoint failed (attempt ${consecutiveSaveFailures})`);
      }
      return false;
    }
  }
  return true;
}

export function closeDatabase(): void {
  if (backupInterval) {
    clearInterval(backupInterval);
    backupInterval = null;
  }
  if (softDeleteCleanupInterval) {
    clearInterval(softDeleteCleanupInterval);
    softDeleteCleanupInterval = null;
  }
  if (dbInstance) {
    try {
      performCheckpoint();
    } catch (error) {
      logger.error("[DB] Checkpoint before close failed", error instanceof Error ? error : new Error(String(error)));
    }
    try {
      dbInstance.close();
    } catch (error) {
      logger.error("Close failed", error as Error);
    }
    dbInstance = null;
    dbPath = "";
    initDbPromise = null;
    isMigrating = false;
    isPersistenceAvailable = true;
    consecutiveSaveFailures = 0;
    logger.info("Database connection closed");
  }
}

export async function query(sql: string, params: QueryParams = []): Promise<DatabaseResult[]> {
  return enqueueOperation(() => {
    const db = getDb();
    const stmt = db.prepare(sql);
    return stmt.all(...params) as DatabaseResult[];
  });
}

export async function run(sql: string, params: QueryParams = []): Promise<RunResult> {
  return enqueueOperation(() => {
    const db = getDb();
    const stmt = db.prepare(sql);
    return stmt.run(...params) as unknown as RunResult;
  });
}

export async function exec(sql: string): Promise<void> {
  return enqueueOperation(() => {
    const db = getDb();
    db.exec(sql);
  });
}

function cleanupOldBackups(): void {
  try {
    const { DB_PATH } = getDbPaths();
    const dir = path.dirname(DB_PATH);
    const base = path.basename(DB_PATH);
    const files = fs.readdirSync(dir);
    const now = Date.now();
    const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
    const MAX_CORRUPTED_FILES = 5;

    const corruptedFiles: { name: string; path: string; mtime: number }[] = [];

    for (const file of files) {
      if (
        file.startsWith(base + ".corrupted.") ||
        file.startsWith(base + ".backup.") ||
        file.startsWith(base + ".tmp") ||
        file.startsWith(base + ".old.")
      ) {
        const filePath = path.join(dir, file);
        try {
          const stat = fs.statSync(filePath);
          if (now - stat.mtimeMs > MAX_AGE_MS) {
            fs.unlinkSync(filePath);
            logger.info(`[DB] Cleaned up old file: ${file}`);
          } else if (file.startsWith(base + ".corrupted.")) {
            corruptedFiles.push({ name: file, path: filePath, mtime: stat.mtimeMs });
          }
        } catch (e) {
          logger.debug(`[DB] Failed to clean up old file: ${file}`, { error: e instanceof Error ? e.message : String(e) });
        }
      }
    }

    if (corruptedFiles.length > MAX_CORRUPTED_FILES) {
      corruptedFiles.sort((a, b) => a.mtime - b.mtime);
      const toRemove = corruptedFiles.slice(0, corruptedFiles.length - MAX_CORRUPTED_FILES);
      for (const f of toRemove) {
        try {
          fs.unlinkSync(f.path);
          logger.info(`[DB] Cleaned up excess corrupted file: ${f.name}`);
        } catch { /* ignore */ }
      }
    }
  } catch (e) {
    logger.debug("[DB] Backup cleanup scan failed", { error: e instanceof Error ? e.message : String(e) });
  }
}

function tryRestoreFromBackup(dbPath: string): boolean {
  try {
    const backupDir = getBackupDir();
    if (!fs.existsSync(backupDir)) return false;

    const backupFiles = fs
      .readdirSync(backupDir)
      .filter((f) => f.endsWith(".db"))
      .map((f) => ({
        name: f,
        path: path.join(backupDir, f),
        mtime: fs.statSync(path.join(backupDir, f)).mtimeMs,
      }))
      .sort((a, b) => b.mtime - a.mtime);

    for (const backup of backupFiles) {
      try {
        fs.copyFileSync(backup.path, dbPath);
        logger.info(`[DB] Restored database from backup: ${backup.name}`);
        return true;
      } catch (copyError) {
        logger.error(`[DB] Failed to restore from backup ${backup.name}`, copyError instanceof Error ? copyError : new Error(String(copyError)));
        continue;
      }
    }
  } catch (error) {
    logger.error("[DB] Backup restoration failed", error instanceof Error ? error : new Error(String(error)));
  }
  return false;
}

function getBackupDir(): string {
  const { DB_DIR } = getDbPaths();
  const backupDir = path.join(DB_DIR, "backups");
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  return backupDir;
}

function performCheckpoint(): boolean {
  try {
    const db = getDb();
    if (!db) return false;

    if (typeof db.checkpoint === "function") {
      db.checkpoint();
    } else if (typeof db.exec === "function") {
      db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
    }
    return true;
  } catch (error) {
    logger.error("[DB] Checkpoint failed:", error instanceof Error ? error : new Error(String(error)));
    return false;
  }
}

async function createBackup(): Promise<string | null> {
  try {
    const db = getDb();
    if (!db) return null;

    const backupDir = getBackupDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = path.join(backupDir, `studio.backup.${timestamp}.db`);

    performCheckpoint();

    try {
      if (typeof db.backup === "function") {
        const backupDb = db.backup(backupPath) as { close: () => void } | undefined;
        if (backupDb && typeof backupDb.close === "function") {
          backupDb.close();
        }
        logger.info(`[DB] Backup created: ${backupPath}`);
        cleanupBackups();
        lastBackupTime = Date.now();
      } else {
        const currentDbPath = getDbPath();
        if (currentDbPath && fs.existsSync(currentDbPath)) {
          fs.copyFileSync(currentDbPath, backupPath);
          const verifyDb = new BetterSqlite3(backupPath, { readonly: true });
          const tables = verifyDb.prepare("SELECT count(*) as cnt FROM sqlite_master WHERE type='table'").get() as { cnt: number };
          verifyDb.close();
          if (tables.cnt === 0) {
            fs.unlinkSync(backupPath);
            logger.error("[DB] Backup verification failed: empty database");
            return null;
          }
          logger.info(`[DB] Backup created (file copy): ${backupPath}`);
          cleanupBackups();
          lastBackupTime = Date.now();
        } else {
          logger.error("[DB] Cannot backup: no source database file found");
          return null;
        }
      }
    } catch (err) {
      logger.error("[DB] Backup failed:", err instanceof Error ? err : new Error(String(err)));
    }

    return backupPath;
  } catch (error) {
    logger.error("[DB] Backup creation failed:", error instanceof Error ? error : new Error(String(error)));
    return null;
  }
}

function cleanupBackups(): void {
  try {
    const backupDir = getBackupDir();
    const files = fs.readdirSync(backupDir)
      .filter(f => f.startsWith("studio.backup.") && f.endsWith(".db"))
      .map(f => ({
        name: f,
        path: path.join(backupDir, f),
        time: fs.statSync(path.join(backupDir, f)).mtime.getTime()
      }))
      .sort((a, b) => b.time - a.time);

    const toRemove = files.slice(MAX_BACKUPS);
    for (const file of toRemove) {
      fs.unlinkSync(file.path);
      logger.debug(`[DB] Removed old backup: ${file.name}`);
    }

    const cutoff = Date.now() - MAX_BACKUP_AGE_MS;
    for (const file of files) {
      if (file.time < cutoff) {
        fs.unlinkSync(file.path);
        logger.debug(`[DB] Removed expired backup: ${file.name}`);
      }
    }
  } catch (error) {
    logger.error("[DB] Backup cleanup failed:", error instanceof Error ? error : new Error(String(error)));
  }
}

function startScheduledBackup(): void {
  if (backupInterval) return;

  setTimeout(() => {
    createBackup();
    backupInterval = setInterval(() => createBackup(), BACKUP_INTERVAL_MS);
  }, 30 * 1000);
}

function startSoftDeleteCleanup(): void {
  if (softDeleteCleanupInterval) return;
  setTimeout(() => {
    performSoftDeleteCleanup();
    softDeleteCleanupInterval = setInterval(() => performSoftDeleteCleanup(), SOFT_DELETE_CLEANUP_INTERVAL_MS);
  }, 10 * 60 * 1000);
}

function performSoftDeleteCleanup(): void {
  try {
    const db = getDb();
    if (!db) return;
    const cutoff = Math.floor((Date.now() - SOFT_DELETE_MAX_AGE_MS) / 1000);
    const tables = ["characters", "scenes"];
    for (const table of tables) {
      const result = db.prepare(`DELETE FROM ${table} WHERE is_deleted = 1 AND updated_at < ?`).run(cutoff);
      if (result.changes > 0) {
        logger.info(`[DB] Cleaned up ${result.changes} soft-deleted records from ${table}`);
      }
    }
  } catch (error) {
    logger.warn("[DB] Soft delete cleanup failed", { error: error instanceof Error ? error.message : String(error) });
  }
}

function registerBackupIpcHandlers(): void {
  ipcMain.handle("db:backup-status", async () => {
    try {
      await ensureDb();
      const backupDir = getBackupDir();
      const files = fs.readdirSync(backupDir)
        .filter(f => f.startsWith("studio.backup.") && f.endsWith(".db"))
        .map(f => ({
          name: f,
          time: fs.statSync(path.join(backupDir, f)).mtime.toISOString()
        }))
        .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

      return {
        success: true,
        status: getPersistenceStatus(),
        backups: files
      };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle("db:create-backup", async () => {
    try {
      await ensureDb();
      const backupPath = await createBackup();
      return { success: !!backupPath, path: backupPath };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });
}

async function ensureDb(): Promise<void> {
  if (!dbInstance) {
    await initDatabase();
  }
}

let dbType = "better-sqlite3";
