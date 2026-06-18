import type { IFileStorage } from "@/domain/ports/file-storage-port";
import { LocalFileStorage } from "./local-file-storage";
import { S3FileStorage, type S3StorageConfig } from "./s3-file-storage";
import { errorLogger } from "@/shared/error-logger";

export type FileStorageBackend = "local" | "s3";

export interface FileStorageConfig {
  backend: FileStorageBackend;
  s3?: S3StorageConfig;
}

let _instance: IFileStorage | null = null;
let _currentBackend: FileStorageBackend | null = null;

/**
 * 获取文件存储配置（从 localStorage 读取，支持运行时切换）。
 *
 * 配置键：fileStorageConfig
 * 格式：{ backend: "local" | "s3", s3?: S3StorageConfig }
 */
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

/**
 * 保存文件存储配置到 localStorage。
 */
export function saveFileStorageConfig(config: FileStorageConfig): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem("fileStorageConfig", JSON.stringify(config));
    // 重置实例，下次 getFileStorage 会重新创建
    _instance = null;
    _currentBackend = null;
  } catch (e) {
    errorLogger.warn("[file-storage] Failed to save config", e);
  }
}

/**
 * 获取当前文件存储配置。
 */
export function getFileStorageConfig(): FileStorageConfig {
  return loadConfig();
}

/**
 * 获取文件存储实例（单例，根据配置自动选择后端）。
 *
 * - backend === "local" → LocalFileStorage
 * - backend === "s3" → S3FileStorage
 *
 * 配置变更后，调用 saveFileStorageConfig 会重置实例，下次调用自动切换。
 */
export function getFileStorage(): IFileStorage {
  const config = loadConfig();

  // 如果配置未变且实例已存在，直接返回
  if (_instance && _currentBackend === config.backend) {
    return _instance;
  }

  // 配置变更，创建新实例
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

/**
 * 重置文件存储实例（用于测试）。
 */
export function resetFileStorage(): void {
  _instance = null;
  _currentBackend = null;
}
