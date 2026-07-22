import path from "path";
import os from "os";
import type { VectorClock } from "./types";
import { errorLogger } from "@/shared/error-logger";
import {
  writeFile as httpWriteFile,
  readFile as httpReadFile,
  fileExists as httpFileExists,
  deleteFile as httpDeleteFile,
} from "@/shared/file-http";

const SYNC_DATA_DIR = path.join(os.homedir(), ".ai-animation-studio", "sync-server");
const CHANGE_LOG_FILE = path.join(SYNC_DATA_DIR, "changelog.json");
const VECTOR_CLOCK_FILE = path.join(SYNC_DATA_DIR, "vector-clock.json");

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

let _mutex: Promise<void> = Promise.resolve();

async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const previous = _mutex;
  let release!: () => void;
  _mutex = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await fn();
  } finally {
    release();
  }
}

function decodeBuffer(data: ArrayBuffer): string {
  return new TextDecoder().decode(data);
}

async function readJsonFile<T>(filePath: string, defaultValue: T): Promise<T> {
  try {
    const exists = await httpFileExists(filePath);
    if (!exists) return defaultValue;
    const result = await httpReadFile(filePath);
    if (!result || !result.success || !result.data) return defaultValue;
    const content = decodeBuffer(result.data);
    return JSON.parse(content) as T;
  } catch (e) {
    errorLogger.warn("[SyncStore] Failed to read sync data file", e as Error);
    return defaultValue;
  }
}

async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  const content = JSON.stringify(data, null, 2);
  const result = await httpWriteFile(filePath, content);
  if (!result.success) {
    errorLogger.warn("[SyncStore] Failed to write sync data file", result.error);
  }
}

export async function getServerChangeLog(): Promise<ServerChange[]> {
  return readJsonFile<ServerChange[]>(CHANGE_LOG_FILE, []);
}

export async function appendServerChanges(changes: ServerChange[]): Promise<void> {
  await withLock(async () => {
    const log = await getServerChangeLog();
    log.push(...changes);
    const maxEntries = 10000;
    const trimmed = log.length > maxEntries ? log.slice(-maxEntries) : log;
    await writeJsonFile(CHANGE_LOG_FILE, trimmed);
  });
}

export async function getServerVectorClock(): Promise<VectorClock> {
  return readJsonFile<VectorClock>(VECTOR_CLOCK_FILE, {});
}

export async function saveServerVectorClock(vc: VectorClock): Promise<void> {
  await withLock(async () => {
    await writeJsonFile(VECTOR_CLOCK_FILE, vc);
  });
}

export async function clearServerSyncData(): Promise<void> {
  if (await httpFileExists(CHANGE_LOG_FILE)) {
    await httpDeleteFile(CHANGE_LOG_FILE);
  }
  if (await httpFileExists(VECTOR_CLOCK_FILE)) {
    await httpDeleteFile(VECTOR_CLOCK_FILE);
  }
}
