import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";
import type { IpcArgs, IpcResult, MenuEventCallback } from "./types/ipc";

type MenuListener = (event: IpcRendererEvent, ...args: IpcArgs) => void;
const menuListeners = new Map<string, MenuListener>();

function onMenuEvent(channel: string, callback: MenuEventCallback): void {
  const existingListener = menuListeners.get(channel);
  if (existingListener) {
    ipcRenderer.removeListener(channel, existingListener);
  }
  const listener: MenuListener = (_event, ...args) => callback(...args);
  menuListeners.set(channel, listener);
  ipcRenderer.on(channel, listener);
}

function removeMenuListeners(): void {
  for (const [channel, listener] of menuListeners) {
    ipcRenderer.removeListener(channel, listener);
  }
  menuListeners.clear();
}

const IPC_PERMISSIONS: Record<string, string[]> = {
  READONLY: [
    "db:query", "db:get", "db:stats", "db:type",
    "assets:read-file-base64", "assets:get-dir", "assets:file-exists",
    "fs:read-file", "cache:get-cache-directory", "fs:get-file-info", "fs:get-disk-space", "image:to-base64", "config:get",
    "secure-config:load", "secure-config:has",
    "export:data",
  ],
  READWRITE: [
    "db:run", "db:batch-insert", "db:init", "db:save",
    "assets:save-image", "assets:save-buffer", "assets:copy-file",
    "fs:write-file", "image:normalize", "config:set",
    "secure-config:save", "secure-config:delete",
  ],
  DANGEROUS: [
    "db:transaction", "db:migrate", "db:vacuum",
    "db:analyze", "db:checkpoint", "assets:delete-file",
  ],
  SYSTEM: [
    "shell:open-external", "shell:open-path", "dialog:open-file", "dialog:save-file", "db:close",
  ],
  SECURE: [
    "secure-config:resolve",
  ],
};

function checkPermission(channel: string): { allowed: boolean; level: string } {
  for (const [level, channels] of Object.entries(IPC_PERMISSIONS)) {
    if (channels.includes(channel)) {
      return { allowed: true, level };
    }
  }
  ipcRenderer.send("log:security", { level: "warn", message: `Unregistered IPC channel blocked: ${channel}` });
  return { allowed: false, level: "UNKNOWN" };
}

function createSecureIpcInvoker(channel: string): (...args: IpcArgs) => Promise<IpcResult> {
  return async (...args: IpcArgs) => {
    const permission = checkPermission(channel);
    if (!permission.allowed) {
      throw new Error(`IPC channel "${channel}" is not allowed`);
    }
    return ipcRenderer.invoke(channel, ...args);
  };
}

function createSecureSyncIpcInvoker(channel: string): (...args: IpcArgs) => IpcResult {
  return (...args: IpcArgs) => {
    const permission = checkPermission(channel);
    if (!permission.allowed) {
      ipcRenderer.send("log:security", { level: "warn", message: `Blocked sync IPC channel: ${channel}` });
      return null;
    }
    return ipcRenderer.sendSync(channel, ...args);
  };
}

contextBridge.exposeInMainWorld("electronAPI", {
  onNavigate: (callback: MenuEventCallback) => {
    onMenuEvent("navigate", callback);
  },
  onMenuNewCharacter: (callback: MenuEventCallback) => {
    onMenuEvent("menu-new-character", callback);
  },
  onMenuNewScene: (callback: MenuEventCallback) => {
    onMenuEvent("menu-new-scene", callback);
  },
  onMenuExport: (callback: MenuEventCallback) => {
    onMenuEvent("menu-export", callback);
  },
  openExternal: createSecureIpcInvoker("shell:open-external"),
  openPath: createSecureIpcInvoker("shell:open-path"),
  removeMenuListeners,
  platform: process.platform,
  versions: {
    node: process.versions.node,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  },
  getConfig: (key: string) => {
    try {
      const config = createSecureSyncIpcInvoker("config:get")(key);
      return config ? JSON.stringify(config) : null;
    } catch (e) {
      ipcRenderer.send("log:security", { level: "error", message: `getConfig failed: ${e instanceof Error ? e.message : String(e)}` });
      return null;
    }
  },
  setConfig: (key: string, value: unknown) => {
    try {
      let parsedValue = value;
      if (typeof value === "string") {
        try {
          parsedValue = JSON.parse(value);
        } catch { /* ignore */ }
      }
      return createSecureSyncIpcInvoker("config:set")(key, parsedValue);
    } catch (e) {
      ipcRenderer.send("log:security", { level: "error", message: `setConfig failed: ${e instanceof Error ? e.message : String(e)}` });
      return false;
    }
  },
  saveImage: createSecureIpcInvoker("assets:save-image"),
  deleteFile: createSecureIpcInvoker("assets:delete-file"),
  readFileAsBase64: createSecureIpcInvoker("assets:read-file-base64"),
  getAssetsDir: createSecureIpcInvoker("assets:get-dir"),
  saveBuffer: createSecureIpcInvoker("assets:save-buffer"),
  fileExists: createSecureIpcInvoker("assets:file-exists"),
  copyFile: createSecureIpcInvoker("assets:copy-file"),
  openFileDialog: createSecureIpcInvoker("dialog:open-file"),
  saveFileDialog: createSecureIpcInvoker("dialog:save-file"),
  writeFile: createSecureIpcInvoker("fs:write-file"),
  readFile: createSecureIpcInvoker("fs:read-file"),
  getCacheDirectory: createSecureIpcInvoker("cache:get-cache-directory"),
  getFileInfo: createSecureIpcInvoker("fs:get-file-info"),
  getDiskSpace: createSecureIpcInvoker("fs:get-disk-space"),
  normalizeImage: createSecureIpcInvoker("image:normalize"),
  imageToBase64IPC: createSecureIpcInvoker("image:to-base64"),
  dbQuery: createSecureIpcInvoker("db:query"),
  dbRun: createSecureIpcInvoker("db:run"),
  dbTransaction: createSecureIpcInvoker("db:transaction"),
  secureConfigSave: createSecureIpcInvoker("secure-config:save"),
  secureConfigLoad: createSecureIpcInvoker("secure-config:load"),
  secureConfigResolve: createSecureIpcInvoker("secure-config:resolve"),
  secureConfigDelete: createSecureIpcInvoker("secure-config:delete"),
  secureConfigHas: createSecureIpcInvoker("secure-config:has"),
  exportData: createSecureIpcInvoker("export:data"),
});
