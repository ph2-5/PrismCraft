import type { IFileStorage } from "@/domain/ports/file-storage-port";
import { S3FileStorage, type S3StorageConfig } from "./s3-file-storage";
import { LocalFileStorage } from "./local-file-storage";
import { errorLogger } from "@/shared/error-logger";
import { getConfig as fileHttpGetConfig, setConfig as fileHttpSetConfig } from "@/shared/file-http";

export type FileStorageBackend = "local" | "s3";

export interface FileStorageConfig {
  backend: FileStorageBackend;
  s3?: S3StorageConfig;
}

const FILE_STORAGE_CONFIG_KEY = "fileStorageConfig";

let _instance: IFileStorage | null = null;
let _currentBackend: FileStorageBackend | null = null;
let _cachedConfig: FileStorageConfig | null = null;

async function loadConfig(): Promise<FileStorageConfig> {
  if (_cachedConfig) return _cachedConfig;
  try {
    const raw = await fileHttpGetConfig(FILE_STORAGE_CONFIG_KEY);
    if (!raw) return { backend: "local" };
    const parsed = (typeof raw === "string" ? JSON.parse(raw) : raw) as FileStorageConfig;
    if (parsed.backend === "s3" && parsed.s3) {
      _cachedConfig = parsed;
      return parsed;
    }
    return { backend: "local" };
  } catch (e) {
    errorLogger.warn("[file-storage] Failed to load config, fallback to local", e);
    return { backend: "local" };
  }
}

export async function saveFileStorageConfig(config: FileStorageConfig): Promise<void> {
  try {
    await fileHttpSetConfig(FILE_STORAGE_CONFIG_KEY, JSON.stringify(config));
    _instance = null;
    _currentBackend = null;
    _cachedConfig = config;
  } catch (e) {
    errorLogger.warn("[file-storage] Failed to save config", e);
  }
}

export async function getFileStorageConfig(): Promise<FileStorageConfig> {
  return await loadConfig();
}

export async function getFileStorage(): Promise<IFileStorage> {
  const config = await loadConfig();

  if (_instance && _currentBackend === config.backend) {
    return _instance;
  }

  if (config.backend === "s3" && config.s3) {
    try {
      _instance = new S3FileStorage(config.s3);
      _currentBackend = "s3";
      errorLogger.info("[file-storage] Switched to S3 backend");
    } catch (e) {
      errorLogger.error("[file-storage] Failed to create S3 storage, fallback to local", e instanceof Error ? e : new Error(String(e)));
      _instance = new LocalFileStorage();
      _currentBackend = "local";
    }
  } else {
    _instance = new LocalFileStorage();
    _currentBackend = "local";
  }

  return _instance;
}

export function resetFileStorage(): void {
  _instance = null;
  _currentBackend = null;
  _cachedConfig = null;
}
