import fs from "fs";
import path from "path";
import BetterSqlite3 from "better-sqlite3";
import { getLogger } from "../logging/logger";
import { createOptimalDatabase, type DatabaseInterface } from "../db-interface";
import {
  getDbPaths,
  ensureDbDir,
} from "./db-schema";
import {
  CURRENT_SCHEMA_VERSION,
  runMigrations,
} from "./migrations";
import {
  VALID_TABLE_IDENTIFIER,
  executeSchemaSafely,
  migrateSchema,
  getCurrentSchemaVersion,
  markSchemaVersion,
} from "./db-schema-runner";
import {
  tryRestoreFromBackup,
  getBackupDir,
  cleanupBackups,
} from "./db-backup-utils";
import type { DatabaseResult, QueryParams, RunResult } from "../types/database";
import { ipcMain, BrowserWindow } from "electron";

// Re-export for external callers (preserves public API)
export { cleanupOldBackups } from "./db-backup-utils";

const logger = getLogger("db-connection");

let dbInstance: DatabaseInterface | null = null;
let dbPath = "";
let initDbPromise: Promise<DatabaseInterface> | null = null;
let initRetryCount = 0;
let initPermanentlyFailed = false;
let operationQueue: Promise<void> = Promise.resolve();
// 读写分离说明：
// - 写操作（run/exec）通过 enqueueOperation 串行化，保护事务语义、避免竞争。
// - 读操作（query）不再排队 — better-sqlite3 是同步 API，且 WAL 模式下读不阻塞写，
//   串行化读只会无谓增加延迟（数千小读会被前面的大写阻塞）。
let isPersistenceAvailable = true;
let lastSaveTime = Date.now();
let consecutiveSaveFailures = 0;
let backupInterval: ReturnType<typeof setInterval> | null = null;
let backupStartupTimer: ReturnType<typeof setTimeout> | null = null;
let lastBackupTime = 0;

const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const BACKUP_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const BACKUP_STARTUP_DELAY_MS = 30 * 1000;
const CLEANUP_STARTUP_DELAY_MS = 10 * 60 * 1000;

const SOFT_DELETE_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const SOFT_DELETE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
// 软删除清理覆盖的表：仅包含用户可显式删除的内容实体。
// 不包含 video_tasks（有自己的生命周期清理）、story_beats（依赖 stories 级联）、
// 错误日志/sync_changelog（有自己的清理逻辑）。
// 新增表前请确认该表确有 is_deleted 列（BASE_COL_DEFS 自动添加）。
const SOFT_DELETE_TABLES = ["characters", "scenes", "elements"] as const;
let softDeleteCleanupInterval: ReturnType<typeof setInterval> | null = null;
let softDeleteStartupTimer: ReturnType<typeof setTimeout> | null = null;

function getPersistenceStatus(): { available: boolean; lastSave: number; failures: number } {
  return {
    available: isPersistenceAvailable,
    lastSave: lastSaveTime,
    failures: consecutiveSaveFailures
  };
}

const OPERATION_TIMEOUT_MS = 30000;

function enqueueOperation<T>(fn: () => T): Promise<T> {
  const prevQueue = operationQueue;
  let resolve: () => void;
  const nextQueue = new Promise<void>((r) => { resolve = r; });
  operationQueue = nextQueue;

  return prevQueue.then(async () => {
    let timeoutId: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error("Database operation timed out after 30s")), OPERATION_TIMEOUT_MS);
    });
    try {
      return await Promise.race([fn(), timeoutPromise]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      resolve!();
    }
  });
}

export async function initDatabase(): Promise<DatabaseInterface> {
  if (initPermanentlyFailed) {
    throw new Error("Database initialization permanently failed. Manual intervention required.");
  }
  if (initDbPromise) return initDbPromise;

  initDbPromise = (async () => {
    if (dbInstance) return dbInstance;

    ensureDbDir();
    const { DB_PATH } = getDbPaths();

    try {
      dbInstance = createOptimalDatabase();
      dbInstance.init({ filePath: DB_PATH });
      dbInstance.pragma("foreign_keys = ON");

      executeSchemaSafely(dbInstance);
      migrateSchema(dbInstance);
      runMigrations(dbInstance, getCurrentSchemaVersion(dbInstance));
      markSchemaVersion(dbInstance, CURRENT_SCHEMA_VERSION);
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
          try { fs.unlinkSync(`${DB_PATH}-wal`); } catch (e) {
            logger.debug("[db-connection] Resource cleanup failed", { error: e instanceof Error ? e.message : String(e) });
          }
        }
        if (fs.existsSync(`${DB_PATH}-shm`)) {
          try { fs.unlinkSync(`${DB_PATH}-shm`); } catch (e) {
            logger.debug("[db-connection] Resource cleanup failed", { error: e instanceof Error ? e.message : String(e) });
          }
        }
      } catch (renameError) {
        logger.error("Failed to rename corrupted database", renameError instanceof Error ? renameError : new Error(String(renameError)));
      }

      try {
        const restored = tryRestoreFromBackup(DB_PATH);
        dbInstance = createOptimalDatabase();
        dbInstance.init({ filePath: DB_PATH });
        dbInstance.pragma("foreign_keys = ON");

        executeSchemaSafely(dbInstance);
        migrateSchema(dbInstance);
        runMigrations(dbInstance, getCurrentSchemaVersion(dbInstance));
        markSchemaVersion(dbInstance, CURRENT_SCHEMA_VERSION);
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
      initPermanentlyFailed = true;
      logger.error("Database initialization permanently failed after max retries", error as Error);
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
      if (Date.now() - lastBackupTime > BACKUP_CHECK_INTERVAL_MS) {
        createBackup().catch((e: unknown) => {
          logger.warn("[DB] Background backup failed:", { error: e instanceof Error ? e.message : String(e) });
        });
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
            message: "DISK_FULL_PLEASE_CLEANUP",
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
  if (backupStartupTimer) {
    clearTimeout(backupStartupTimer);
    backupStartupTimer = null;
  }
  if (softDeleteStartupTimer) {
    clearTimeout(softDeleteStartupTimer);
    softDeleteStartupTimer = null;
  }
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
    isPersistenceAvailable = true;
    consecutiveSaveFailures = 0;
    logger.info("Database connection closed");
  }
}

export async function query(sql: string, params: QueryParams = []): Promise<DatabaseResult[]> {
  // 读操作不走 enqueueOperation：better-sqlite3 是同步 API，且 WAL 模式下读不阻塞写。
  // 串行化读会让数千小读被前面的大写操作无谓阻塞，显著增加延迟。
  // 注意：调用方仍应 await 本函数，以保证 read-modify-write 跨多个语句时的语义。
  const db = getDb();
  const stmt = db.prepare(sql);
  return stmt.all(...params);
}

export async function run(sql: string, params: QueryParams = []): Promise<RunResult> {
  return enqueueOperation(() => {
    const db = getDb();
    const stmt = db.prepare(sql);
    return stmt.run(...params);
  });
}

export async function exec(sql: string): Promise<void> {
  return enqueueOperation(() => {
    const db = getDb();
    db.exec(sql);
  });
}

/**
 * 验证备份文件是否包含有效的 SQLite 表。
 * 返回 true 表示备份有效，false 表示备份为空或损坏。
 */
function verifyBackupIntegrity(backupPath: string): boolean {
  const verifyDb = new BetterSqlite3(backupPath, { readonly: true });
  try {
    const tables = verifyDb.prepare("SELECT count(*) as cnt FROM sqlite_master WHERE type='table'").get() as { cnt: number };
    return tables.cnt > 0;
  } finally {
    verifyDb.close();
  }
}

function performCheckpoint(): boolean {
  // Checkpoint 重试：WAL checkpoint 偶尔会因 WAL 文件被其他进程持有而失败，
  // 重试 3 次（每次间隔 100ms）能显著降低失败率。
  // 失败时仍返回 false，调用方（如 closeDatabase）会继续 close，
  // SQLite 在下次启动时会自动重放 WAL，数据不会丢失，只是 WAL 文件未清理。
  const MAX_CHECKPOINT_RETRIES = 3;
  const RETRY_DELAY_MS = 100;

  for (let attempt = 1; attempt <= MAX_CHECKPOINT_RETRIES; attempt++) {
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
      const isLastAttempt = attempt === MAX_CHECKPOINT_RETRIES;
      logger.error(
        `[DB] Checkpoint attempt ${attempt}/${MAX_CHECKPOINT_RETRIES} failed:`,
        error instanceof Error ? error : new Error(String(error)),
      );
      if (isLastAttempt) return false;
      // 同步 sleep：better-sqlite3 是同步 API，这里阻塞 100ms 是可接受的。
      // 用 Atomics.wait 实现同步 sleep，避免引入 worker/async 复杂度。
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, RETRY_DELAY_MS);
    }
  }
  return false;
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
        if (!createBackupViaFileCopy(backupPath)) return null;
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

/**
 * 通过文件拷贝方式创建备份（fallback：当 better-sqlite3 不支持 backup API 时）。
 * 返回 true 表示备份成功，false 表示备份失败。
 */
function createBackupViaFileCopy(backupPath: string): boolean {
  const currentDbPath = getDbPath();
  if (!currentDbPath || !fs.existsSync(currentDbPath)) {
    logger.error("[DB] Cannot backup: no source database file found");
    return false;
  }
  fs.copyFileSync(currentDbPath, backupPath);
  if (!verifyBackupIntegrity(backupPath)) {
    fs.unlinkSync(backupPath);
    logger.error("[DB] Backup verification failed: empty database");
    return false;
  }
  logger.info(`[DB] Backup created (file copy): ${backupPath}`);
  cleanupBackups();
  lastBackupTime = Date.now();
  return true;
}

function startScheduledBackup(): void {
  if (backupInterval || backupStartupTimer) return;

  logger.info(`[DB] Scheduled backup will start in ${BACKUP_STARTUP_DELAY_MS}ms and repeat every ${BACKUP_INTERVAL_MS}ms`);
  backupStartupTimer = setTimeout(() => {
    backupStartupTimer = null;
    createBackup();
    backupInterval = setInterval(() => createBackup(), BACKUP_INTERVAL_MS);
  }, BACKUP_STARTUP_DELAY_MS);
}

function startSoftDeleteCleanup(): void {
  if (softDeleteCleanupInterval || softDeleteStartupTimer) return;
  logger.info(`[DB] Soft delete cleanup will start in ${CLEANUP_STARTUP_DELAY_MS}ms and repeat every ${SOFT_DELETE_CLEANUP_INTERVAL_MS}ms`);
  softDeleteStartupTimer = setTimeout(() => {
    softDeleteStartupTimer = null;
    performSoftDeleteCleanup();
    softDeleteCleanupInterval = setInterval(() => performSoftDeleteCleanup(), SOFT_DELETE_CLEANUP_INTERVAL_MS);
  }, CLEANUP_STARTUP_DELAY_MS);
}

function performSoftDeleteCleanup(): void {
  try {
    const db = getDb();
    const cutoff = Math.floor((Date.now() - SOFT_DELETE_MAX_AGE_MS) / 1000);
    for (const table of SOFT_DELETE_TABLES) {
      if (!VALID_TABLE_IDENTIFIER.test(table)) {
        logger.warn(`[DB] Invalid table name in soft delete cleanup: ${table}`);
        continue;
      }
      const result = db.prepare(`DELETE FROM "${table}" WHERE is_deleted = 1 AND updated_at < ?`).run(cutoff);
      if (result.changes > 0) {
        logger.info(`[DB] Cleaned up ${result.changes} soft-deleted records from ${table}`);
      }
    }
  } catch (error) {
    logger.warn("[DB] Soft delete cleanup failed", { error: error instanceof Error ? error.message : String(error) });
  }
}

export function registerBackupIpcHandlers(): void {
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

