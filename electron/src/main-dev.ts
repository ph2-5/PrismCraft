import "./shared-logic-resolve";

import path from "path";
import { app } from "electron";
import { getLogger, loggerRegistry } from "./logging/logger";
import { ConsoleTransport } from "./logging/transports/console.transport";
import { FileTransport } from "./logging/transports/file.transport";
import { startApiServer } from "./api-server";
import { registerAppProtocol } from "./protocol";
import { API_SERVER_PORT, DEV_SERVER_PORT } from "./config/ports";
import { LifecycleManager } from "./lifecycle";

loggerRegistry.setDefaultTransports([
  new ConsoleTransport({ minLevel: "debug" }),
  new FileTransport({ minLevel: "debug", filename: "dev" }),
]);

const logger = getLogger("main-dev");

import {
  setupApiHandlers,
  setupAssetHandlers,
  setupDatabaseHandlers,
  registerExportHandlers,
  createWindow,
} from "./main-common";

app.setName("ai-animation-studio");
const userDataPath = app.getPath("userData");
if (userDataPath.endsWith("Electron") || userDataPath.endsWith("electron")) {
  const correctPath = path.join(path.dirname(userDataPath), "ai-animation-studio");
  app.setPath("userData", correctPath);
  logger.info("[MainDev] Override userData path:", { path: correctPath });
}

const DEV_PORT = DEV_SERVER_PORT;
const API_PORT = API_SERVER_PORT;

const lifecycle = new LifecycleManager({
  createWindowFn: () =>
    createWindow({
      appPort: DEV_PORT,
      apiPort: API_PORT,
      startApiServerFn: startApiServer,
      openDevTools: true,
    }),
});

setupApiHandlers();
setupAssetHandlers();
setupDatabaseHandlers();
registerExportHandlers();

app.whenReady().then(async () => {
  registerAppProtocol();
  lifecycle.start();

  const window = await createWindow({
    appPort: DEV_PORT,
    apiPort: API_PORT,
    startApiServerFn: startApiServer,
    openDevTools: true,
  });

  lifecycle.setWindow(window);
  lifecycle.markWindowReady();
});
