import type { BrowserWindow } from "electron";
import Store from "electron-store";
import { getLogger } from "../logging/logger";

const logger = getLogger("config-storage");

interface ConfigMetadata {
  providers: Record<string, unknown>;
  updatedAt: number;
  version: number;
}

const CONFIG_STORE_KEY = "api-config-metadata";
const MAX_HISTORY = 5;

let configStore: Store | null = null;

function getConfigStore(): Store {
  if (!configStore) {
    configStore = new Store({
      name: "config-metadata",
      encryptionKey: "ai-animation-studio-config",
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
  
  ipcMain.handle("config:metadata:save", (_event: unknown, metadata: ConfigMetadata) => {
    return saveConfigMetadata(metadata);
  });
  
  ipcMain.handle("config:history:get", () => {
    return getConfigHistory();
  });
  
  ipcMain.handle("config:history:restore", (_event: unknown, version: number) => {
    return restoreConfigVersion(version);
  });
  
  logger.info("Config storage IPC handlers registered");
}
