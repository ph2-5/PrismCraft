import type { BrowserWindow } from "electron";
import Store from "electron-store";
import { app, safeStorage } from "electron";
import * as crypto from "crypto";
import { getLogger } from "../logging/logger";

const logger = getLogger("config-storage");

interface ConfigMetadata {
  providers: Record<string, unknown>;
  updatedAt: number;
  version: number;
}

const CONFIG_STORE_KEY = "api-config-metadata";
const MAX_HISTORY = 5;

/**
 * 运行时校验 ConfigMetadata 结构，防止恶意渲染进程传入任意对象污染 store。
 */
function isValidConfigMetadata(value: unknown): value is ConfigMetadata {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.providers === "object" && v.providers !== null &&
    typeof v.updatedAt === "number" && Number.isFinite(v.updatedAt) &&
    typeof v.version === "number" && Number.isInteger(v.version) && v.version >= 0
  );
}

function isValidVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

let configStore: Store | null = null;

/**
 * 从应用唯一密钥派生加密密钥，避免硬编码。
 * 基于 app 路径 + 用户数据目录生成，不同安装实例密钥不同。
 */
function deriveEncryptionKey(): string {
  // safeStorage 可用时优先使用其加密；不可用时回退到派生密钥
  if (safeStorage.isEncryptionAvailable()) {
    // 用 safeStorage 加密一个固定标识，结果作为 store 的 encryptionKey
    // 这样密钥不落盘、不可从源码推导
    const appSecret = `prismcraft:${app.getPath("userData")}`;
    return safeStorage.encryptString(appSecret).toString("base64");
  }
  // 回退：基于 userData 路径派生（弱保护，但优于硬编码）
  const seed = app.getPath("userData") + process.platform + "prismcraft-v1";
  return crypto.createHash("sha256").update(seed).digest("hex");
}

function getConfigStore(): Store {
  if (!configStore) {
    configStore = new Store({
      name: "config-metadata",
      encryptionKey: deriveEncryptionKey(),
    });
  }
  return configStore;
}

export function getConfigMetadata(): ConfigMetadata | null {
  try {
    const store = getConfigStore();
    return store.get(CONFIG_STORE_KEY, null) as ConfigMetadata | null;
  } catch (error) {
    logger.error("Failed to get config metadata", error as Error);
    return null;
  }
}

export function saveConfigMetadata(metadata: ConfigMetadata): boolean {
  try {
    const store = getConfigStore();
    const current = getConfigMetadata();
    
    if (current) {
      const history = (store.get("config-metadata-history", []) as ConfigMetadata[]).slice(0, MAX_HISTORY - 1);
      history.unshift(current);
      store.set("config-metadata-history", history);
    }
    
    store.set(CONFIG_STORE_KEY, { ...metadata, version: (current?.version ?? 0) + 1 });
    return true;
  } catch (error) {
    logger.error("Failed to save config metadata", error as Error);
    return false;
  }
}

export function getConfigHistory(): ConfigMetadata[] {
  try {
    const store = getConfigStore();
    return store.get("config-metadata-history", []) as ConfigMetadata[];
  } catch (error) {
    logger.error("Failed to get config history", error as Error);
    return [];
  }
}

export function restoreConfigVersion(version: number): boolean {
  try {
    const history = getConfigHistory();
    const target = history.find(h => h.version === version);
    if (!target) return false;
    
    const store = getConfigStore();
    const current = getConfigMetadata();
    if (current) {
      const history = (store.get("config-metadata-history", []) as ConfigMetadata[]).slice(0, MAX_HISTORY - 1);
      history.unshift(current);
      store.set("config-metadata-history", history);
    }
    
    store.set(CONFIG_STORE_KEY, { ...target, version: Date.now() });
    return true;
  } catch (error) {
    logger.error("Failed to restore config version", error as Error);
    return false;
  }
}

export function registerConfigStorageHandlers(_mainWindow: BrowserWindow | null): void {
  const { ipcMain } = require("electron");
  
  ipcMain.handle("config:metadata:get", () => {
    return getConfigMetadata();
  });
  
  ipcMain.handle("config:metadata:save", (_event: unknown, metadata: unknown) => {
    if (!isValidConfigMetadata(metadata)) {
      logger.warn("Invalid config metadata rejected", { metadata });
      return false;
    }
    const result = saveConfigMetadata(metadata);
    logger.info(`config:metadata:save ${result ? "succeeded" : "failed"} (version: ${metadata.version})`);
    return result;
  });

  ipcMain.handle("config:history:get", () => {
    return getConfigHistory();
  });

  ipcMain.handle("config:history:restore", (_event: unknown, version: unknown) => {
    if (!isValidVersion(version)) {
      logger.warn("Invalid version rejected", { version });
      return false;
    }
    const result = restoreConfigVersion(version);
    logger.info(`config:history:restore version=${version} ${result ? "succeeded" : "failed"}`);
    return result;
  });
  
  logger.info("Config storage IPC handlers registered");
}
