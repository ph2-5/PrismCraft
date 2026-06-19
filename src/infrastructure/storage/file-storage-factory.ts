import type { IFileStorage } from "@/domain/ports/file-storage-port";
import { S3FileStorage, type S3StorageConfig } from "./s3-file-storage";
import { LocalFileStorage } from "./local-file-storage";
import { errorLogger } from "@/shared/error-logger";

export type FileStorageBackend = "local" | "s3";

export interface FileStorageConfig {
  backend: FileStorageBackend;
  s3?: S3StorageConfig;
}

let _instance: IFileStorage | null = null;
let _currentBackend: FileStorageBackend | null = null;

function loadConfig(): FileStorageConfig {
  if (typeof window === "undefined" || !window.localStorage) {
    return { backend: "local" };
  }
  try {
    const raw = window.localStorage.getItem("fileStorageConfig");
    if (!raw) return { backend: "local" };
    const parsed = JSON.parse(raw) as FileStorageConfig;
    if (parsed.backend === "s3" && parsed.s3) {
      return parsed;
    }
    return { backend: "local" };
  } catch (e) {
    errorLogger.warn("[file-storage] Failed to load config, fallback to local", e);
    return { backend: "local" };
  }
}

export function saveFileStorageConfig(config: FileStorageConfig): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem("fileStorageConfig", JSON.stringify(config));
    _instance = null;
    _currentBackend = null;
  } catch (e) {
    errorLogger.warn("[file-storage] Failed to save config", e);
  }
}

export function getFileStorageConfig(): FileStorageConfig {
  return loadConfig();
}

export async function getFileStorage(): Promise<IFileStorage> {
  const config = loadConfig();

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
}
