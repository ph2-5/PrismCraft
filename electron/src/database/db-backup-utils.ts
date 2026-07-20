import fs from "fs";
import path from "path";
import { getLogger } from "../logging/logger";
import { getDbPaths } from "./db-schema";

const logger = getLogger("db-backup");

export const MAX_BACKUPS = 7;
export const MAX_BACKUP_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** 返回文件 mtimeMs；失败时返回 null 并记录 debug 日志 */
export function tryStatMtime(filePath: string): number | null {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch (e) {
    logger.debug(`[DB] Failed to stat file: ${filePath}`, { error: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

/** 安全删除文件，失败时记录 debug 日志 */
export function tryUnlink(filePath: string, name: string, context: string = ""): void {
  try {
    fs.unlinkSync(filePath);
    logger.info(`[DB] Cleaned up old file: ${name}`);
  } catch (e) {
    logger.debug(context || `[DB] Failed to clean up old file: ${name}`, { error: e instanceof Error ? e.message : String(e) });
  }
}

export function getBackupDir(): string {
  const { DB_DIR } = getDbPaths();
  const backupDir = path.join(DB_DIR, "backups");
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  return backupDir;
}

export function cleanupOldBackups(): void {
  try {
    const { DB_PATH } = getDbPaths();
    const dir = path.dirname(DB_PATH);
    const base = path.basename(DB_PATH);
    const files = fs.readdirSync(dir);
    const now = Date.now();
    const MAX_AGE_MS = MAX_BACKUP_AGE_MS;
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
        const fileMtime = tryStatMtime(filePath);
        if (fileMtime === null) continue;
        if (now - fileMtime > MAX_AGE_MS) {
          tryUnlink(filePath, file);
        } else if (file.startsWith(base + ".corrupted.")) {
          corruptedFiles.push({ name: file, path: filePath, mtime: fileMtime });
        }
      }
    }

    if (corruptedFiles.length > MAX_CORRUPTED_FILES) {
      corruptedFiles.sort((a, b) => a.mtime - b.mtime);
      const toRemove = corruptedFiles.slice(0, corruptedFiles.length - MAX_CORRUPTED_FILES);
      for (const f of toRemove) {
        tryUnlink(f.path, f.name, "[db-connection] Resource cleanup failed");
      }
    }
  } catch (e) {
    logger.debug("[DB] Backup cleanup scan failed", { error: e instanceof Error ? e.message : String(e) });
  }
}

export function tryRestoreFromBackup(dbPath: string): boolean {
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

export function cleanupBackups(): void {
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
