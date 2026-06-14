import { app } from "electron";
import path from "path";
import { autoUpdater } from "electron-updater";
import { getLogger, loggerRegistry } from "./logging/logger";
import { ConsoleTransport } from "./logging/transports/console.transport";
import { FileTransport } from "./logging/transports/file.transport";
import { startApiServer } from "./api-server";
import { registerAppProtocol } from "./protocol";
import { API_SERVER_PORT, APP_SERVER_PORT } from "./config/ports";
import { LifecycleManager } from "./lifecycle";

loggerRegistry.setDefaultTransports([
  new ConsoleTransport({ minLevel: "info" }),
  new FileTransport({ minLevel: "info", filename: "app" }),
]);

const logger = getLogger("main");

import {
  setupApiHandlers,
  setupAssetHandlers,
  setupDatabaseHandlers,
  registerExportHandlers,
  createWindow,
} from "./main-common";
import { registerSecureConfigHandlers } from "./handlers/secure-config";

app.setName("ai-animation-studio");
const userDataPath = app.getPath("userData");
if (userDataPath.toLowerCase().endsWith("electron")) {
  const correctPath = path.join(path.dirname(userDataPath), "ai-animation-studio");
  app.setPath("userData", correctPath);
  logger.info("[Main] Override userData path:", { path: correctPath });
}

const isTest = process.env.NODE_ENV === "test";
const gotTheLock = isTest || app.requestSingleInstanceLock();
if (!gotTheLock) {
  logger.error("[Main] Another instance is already running. Quitting.");
  app.quit();
  process.exit(0);
}

const APP_PORT = APP_SERVER_PORT;
const API_PORT = API_SERVER_PORT;

const lifecycle = new LifecycleManager({
  createWindowFn: () =>
    createWindow({
      appPort: APP_PORT,
      apiPort: API_PORT,
      startApiServerFn: startApiServer,
      openDevTools: false,
    }),
});

app.on("second-instance", () => {
  logger.info("[Main] Second instance detected, focusing existing window");
  const window = lifecycle.window;
  if (window) {
    if (window.isMinimized()) {
      window.restore();
    }
    window.focus();
  }
});

function setupAutoUpdater(): void {
  autoUpdater.logger = {
    debug: (message: string) => logger.debug(message),
    info: (message: string) => logger.info(message),
    warn: (message: string) => logger.warn(message),
    error: (message: string) => logger.error(message),
  };
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-available", (info: { version?: string }) => {
    logger.info("[AutoUpdate] New version available:", { version: info.version });
    const window = lifecycle.window;
    if (window && !window.isDestroyed()) {
      window.webContents.send("update-available", info);
    }
  });

  autoUpdater.on("update-downloaded", (info: { version?: string }) => {
    logger.info("[AutoUpdate] Update downloaded:", { version: info.version });
    const window = lifecycle.window;
    if (window && !window.isDestroyed()) {
      window.webContents.send("update-downloaded", info);
    }
  });

  autoUpdater.on("error", (error: Error) => {
    logger.error("[AutoUpdate] Error:", error);
    const window = lifecycle.window;
    if (window && !window.isDestroyed()) {
      window.webContents.send("update-error", error.message);
    }
  });
}

setupApiHandlers({
  checkForUpdates: async () => {
    try {
      const result = await autoUpdater.checkForUpdates();
      if (!result) {
        return { success: true, updateAvailable: false };
      }
      return {
        success: true,
        updateAvailable: !!result.updateInfo,
        version: (result.updateInfo as { version?: string })?.version,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  },
});
setupAssetHandlers();
setupDatabaseHandlers();
registerExportHandlers();
registerSecureConfigHandlers();
setupAutoUpdater();

app.whenReady().then(async () => {
  registerAppProtocol();
  lifecycle.start();

  const window = await createWindow({
    appPort: APP_PORT,
    apiPort: API_PORT,
    startApiServerFn: startApiServer,
    openDevTools: false,
  });

  lifecycle.setWindow(window);
  lifecycle.markWindowReady();
});
