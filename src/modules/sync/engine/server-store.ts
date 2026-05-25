import fs from "fs";
import path from "path";
import os from "os";
import type { VectorClock } from "./types";
import { errorLogger } from "@/shared/error-logger";

const SYNC_DATA_DIR = path.join(os.homedir(), ".ai-animation-studio", "sync-server");
const CHANGE_LOG_FILE = path.join(SYNC_DATA_DIR, "changelog.json");
const VECTOR_CLOCK_FILE = path.join(SYNC_DATA_DIR, "vector-clock.json");
const LOCK_FILE = path.join(SYNC_DATA_DIR, ".lock");

interface ServerChange {
  id: string;
  entityType: string;
  entityId: string;
  operation: string;
  vectorClock: VectorClock;
  data: Record<string, unknown> | null;
  timestamp: number;
  deviceId: string;
}

function ensureDir() {
  if (!fs.existsSync(SYNC_DATA_DIR)) {
    fs.mkdirSync(SYNC_DATA_DIR, { recursive: true });
    try {
      fs.chmodSync(SYNC_DATA_DIR, 0o700);
    } catch (e) {
      errorLogger.warn("[SyncStore] 设置目录权限失败:", e);
    }
  }
}

const LOCK_TTL_MS = 30000;

function acquireLock(): boolean {
  try {
    ensureDir();
    if (fs.existsSync(LOCK_FILE)) {
      try {
        const content = fs.readFileSync(LOCK_FILE, "utf-8");
        const lockInfo = JSON.parse(content) as { pid: number; timestamp: number };
        if (Date.now() - lockInfo.timestamp > LOCK_TTL_MS) {
          fs.unlinkSync(LOCK_FILE);
        } else {
          return false;
        }
      } catch {
        fs.unlinkSync(LOCK_FILE);
      }
    }
    const lockData = JSON.stringify({ pid: process.pid, timestamp: Date.now() });
    fs.writeFileSync(LOCK_FILE, lockData, { flag: "wx" });
    return true;
  } catch {
    return false;
  }
}

function releaseLock(): void {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      fs.unlinkSync(LOCK_FILE);
    }
  } catch (e) {
    errorLogger.warn("[SyncStore] 释放锁文件失败:", e);
  }
}

function withLock<T>(fn: () => T): T {
  let retries = 10;
  while (retries > 0) {
    if (acquireLock()) {
      try {
        return fn();
      } finally {
        releaseLock();
      }
    }
    retries--;
    const delay = Math.floor(Math.random() * 50) + 10;
    const start = Date.now();
    while (Date.now() - start < delay) {
      // busy wait
    }
  }
  throw new Error("Failed to acquire file lock for sync data");
}

function readJsonFile<T>(filePath: string, defaultValue: T): T {
  try {
    if (!fs.existsSync(filePath)) return defaultValue;
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content) as T;
  } catch {
    return defaultValue;
  }
}

function writeJsonFile(filePath: string, data: unknown): void {
  ensureDir();
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tempPath, filePath);
  try {
    fs.chmodSync(filePath, 0o600);
  } catch (e) {
    errorLogger.warn("[SyncStore] 设置文件权限失败:", e);
  }
}

export function getServerChangeLog(): ServerChange[] {
  return readJsonFile<ServerChange[]>(CHANGE_LOG_FILE, []);
}

export function appendServerChanges(changes: ServerChange[]): void {
  withLock(() => {
    const log = getServerChangeLog();
    log.push(...changes);
    const maxEntries = 10000;
    const trimmed = log.length > maxEntries ? log.slice(-maxEntries) : log;
    writeJsonFile(CHANGE_LOG_FILE, trimmed);
  });
}

export function getServerVectorClock(): VectorClock {
  return readJsonFile<VectorClock>(VECTOR_CLOCK_FILE, {});
}

export function saveServerVectorClock(vc: VectorClock): void {
  withLock(() => {
    writeJsonFile(VECTOR_CLOCK_FILE, vc);
  });
}

export function clearServerSyncData(): void {
  ensureDir();
  if (fs.existsSync(CHANGE_LOG_FILE)) {
    fs.unlinkSync(CHANGE_LOG_FILE);
  }
  if (fs.existsSync(VECTOR_CLOCK_FILE)) {
    fs.unlinkSync(VECTOR_CLOCK_FILE);
  }
}
