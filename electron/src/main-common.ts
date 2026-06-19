import { app, BrowserWindow, ipcMain, shell } from "electron";
import http from "http";
import type net from "net";
import path from "path";
import fs from "fs";
import url from "url";
import { getLogger } from "./logging/logger";
import { setupAssetHandlers } from "./handlers/assets";
import { setupDatabaseHandlers } from "./handlers/database";
import { registerExportHandlers } from "./handlers/export";
import { loadConfig, saveConfig } from "./handlers/config";
import * as apiGateway from "./api-gateway";
import { API_SERVER_PORT, DEV_SERVER_PORT } from "./config/ports";
import { registerAllowedOrigin } from "./api-server";

const logger = getLogger("main-common");

let activeStaticServer: http.Server | null = null;
const activeConnections: Set<net.Socket> = new Set();

const ALLOWED_CONFIG_KEYS = new Set([
  "app",
  "api",
  "ui",
  "theme",
  "ai_animation_studio_api_config",
]);

const ALLOWED_CONFIG_VALUE_TYPES = new Set([
  "string",
  "number",
  "boolean",
  "object",
]);
const MAX_CONFIG_VALUE_SIZE = 1024 * 1024;

function validateConfigKey(key: string): boolean {
  if (!key || typeof key !== "string") return false;
  if (key.length > 256) return false;
  const keys = key.split(".");
  const topLevelKey = keys[0]!;
  if (!ALLOWED_CONFIG_KEYS.has(topLevelKey)) return false;
  for (const k of keys) {
    if (k === "__proto__" || k === "constructor" || k === "prototype") {
      return false;
    }
    if (k.includes("__proto__") || k.includes("constructor") || k.includes("prototype")) {
      return false;
    }
  }
  return true;
}

function validateConfigValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  const type = typeof value;
  if (!ALLOWED_CONFIG_VALUE_TYPES.has(type)) return false;
  try {
    const serialized = JSON.stringify(value);
    if (serialized.length > MAX_CONFIG_VALUE_SIZE) return false;
  } catch {
    logger.warn("[Main] Failed to serialize config value for validation");
    return false;
  }
  if (type === "string") {
    if ((value as string).startsWith("data:") || (value as string).startsWith("javascript:"))
      return false;
  }
  return true;
}

function applyConfigValue(config: Record<string, unknown>, key: string, value: unknown): void {
  if (
    key === "ai_animation_studio_api_config" &&
    typeof value === "object" &&
    value !== null
  ) {
    let apiConfig: unknown = value;
    if (typeof value === "string") {
      try { apiConfig = JSON.parse(value); } catch { apiConfig = {}; }
    }
    Object.assign(config, apiConfig);
  } else if (key.includes(".")) {
    const keys = key.split(".");
    let current: Record<string, unknown> = config;
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i]!;
      if (
        !(k in current) ||
        typeof current[k] !== "object" ||
        current[k] === null
      ) {
        current[k] = {};
      }
      current = current[k] as Record<string, unknown>;
    }
    current[keys[keys.length - 1]!] = value;
  } else {
    config[key] = value;
  }
}

function getConfigValue(config: Record<string, unknown>, key: string | undefined): unknown {
  if (!key) return config;
  if (key === "ai_animation_studio_api_config") {
    return { ...config };
  }
  return key.split(".").reduce((obj: Record<string, unknown> | undefined, k: string) => obj?.[k] as Record<string, unknown> | undefined, config);
}

interface SetupApiHandlersOptions {
  checkForUpdates?: () => Promise<unknown>;
}

function setupApiHandlers(options: SetupApiHandlersOptions = {}): void {
  const { checkForUpdates } = options;

  ipcMain.on("log:security", (_event, data: { level: string; message: string }) => {
    if (data.level === "error") {
      logger.error("[Preload]", new Error(data.message));
    } else {
      logger.warn("[Preload]", { message: data.message });
    }
  });

  ipcMain.handle("api:health", async () => {
    return { status: "ok", timestamp: Date.now() };
  });

  ipcMain.handle("check-updates", async () => {
    if (checkForUpdates) {
      return checkForUpdates();
    }
    return { success: true, updateAvailable: false };
  });

  ipcMain.handle("shell:open-external", async (_event, url: string) => {
    if (!url || typeof url !== "string") {
      return { success: false, error: "Invalid URL" };
    }
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      return { success: false, error: "Only http/https URLs are allowed" };
    }
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  });

  ipcMain.handle("shell:open-path", async (_event, filePath: string) => {
    if (!filePath || typeof filePath !== "string") {
      return { success: false, error: "Invalid path" };
    }
    try {
      await shell.openPath(filePath);
      return { success: true };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  });

  ipcMain.handle("config:get", async (_event, key: string) => {
    if (key && !validateConfigKey(key)) return null;
    const config = loadConfig();
    return getConfigValue(config, key);
  });

  ipcMain.handle("config:set", async (_event, key: string, value: unknown) => {
    if (!validateConfigKey(key)) return false;
    if (!validateConfigValue(value)) return false;
    const config = loadConfig();
    applyConfigValue(config, key, value);
    saveConfig(config);
    return true;
  });

  // 窗口控制 IPC（无框窗口需要前端触发）
  ipcMain.handle("window:minimize", () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) win.minimize();
  });
  ipcMain.handle("window:maximize", () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) {
      if (win.isMaximized()) {
        win.unmaximize();
      } else {
        win.maximize();
      }
    }
  });
  ipcMain.handle("window:close", () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) win.close();
  });
  ipcMain.handle("window:isMaximized", () => {
    const win = BrowserWindow.getFocusedWindow();
    return win ? win.isMaximized() : false;
  });

  ipcMain.on("config:get", (event: Electron.IpcMainEvent, key: string) => {
    if (key && !validateConfigKey(key)) {
      event.returnValue = null;
      return;
    }
    const config = loadConfig();
    event.returnValue = getConfigValue(config, key);
  });

  ipcMain.on("config:set", (event: Electron.IpcMainEvent, key: string, value: unknown) => {
    if (!validateConfigKey(key)) {
      event.returnValue = false;
      return;
    }
    if (!validateConfigValue(value)) {
      event.returnValue = false;
      return;
    }
    const config = loadConfig();
    applyConfigValue(config, key, value);
    saveConfig(config);
    event.returnValue = true;
  });
}

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
  ".webp": "image/webp",
  ".webm": "video/webm",
  ".mp4": "video/mp4",
  ".wasm": "application/wasm",
};

function getStaticDir(): string {
  if (app.isPackaged) {
    // 优先使用 unpacked 目录（若存在原生模块或需子进程执行的文件），
    // 否则回退到 asar 内的 out 目录（纯前端 JS/HTML/CSS 资源可从 asar 内读取）
    const unpackedDir = path.join(process.resourcesPath, "app.asar.unpacked", "out");
    if (fs.existsSync(unpackedDir)) {
      return unpackedDir;
    }
    return path.join(process.resourcesPath, "app.asar", "out");
  }
  const projectRoot = path.join(__dirname, "..", "..");
  return path.join(projectRoot, "out");
}

function startStaticServer(appPort: number, apiPort: number): http.Server | null {
  const staticDir = getStaticDir();

  logger.info("[Main] ========================================");
  logger.info("[Main] Starting Static File Server...");
  logger.info("[Main] Is Packaged:", { packaged: app.isPackaged });
  logger.info("[Main] Static Dir:", { dir: staticDir });
  logger.info("[Main] ========================================");

  if (!fs.existsSync(staticDir)) {
    logger.error("[Main] Static directory not found:", undefined, { dir: staticDir });
    return null;
  }

  const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url || "/");
    const pathname = decodeURIComponent(parsedUrl.pathname || "/");

    if (pathname.startsWith("/api/")) {
      const getUploadedFile: (name: string) => string | null = apiGateway.getUploadedFile;
      const uploadMatch = pathname.match(/^\/api\/upload\/([a-zA-Z0-9_.\-]+)$/);
      if (uploadMatch && req.method === "GET") {
        const filePath = getUploadedFile(uploadMatch[1]!);
        if (filePath) {
          const ext = path.extname(filePath).toLowerCase();
          const mimeTypes: Record<string, string> = {
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".gif": "image/gif",
            ".webp": "image/webp",
            ".svg": "image/svg+xml",
            ".mp4": "video/mp4",
            ".webm": "video/webm",
            ".mov": "video/quicktime",
          };
          const contentType = mimeTypes[ext] || "application/octet-stream";
          try {
            const data = fs.readFileSync(filePath);
            res.writeHead(200, {
              "Content-Type": contentType,
              "Cache-Control": "public, max-age=86400",
            });
            res.end(data);
            return;
          } catch {
            logger.warn("[Main] Failed to serve static file", { url: req.url });
            res.writeHead(404);
            res.end("Not Found");
            return;
          }
        }
      }

      const proxyOptions: http.RequestOptions = {
        hostname: "127.0.0.1",
        port: apiPort,
        path: req.url,
        method: req.method,
        headers: {
          ...req.headers,
          host: `127.0.0.1:${apiPort}`,
        },
      };

      const proxy = http.request(proxyOptions, (proxyRes) => {
        const origin = req.headers.origin || "";
        if (origin) {
          proxyRes.headers["access-control-allow-origin"] = origin as string;
        }
        res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
        proxyRes.pipe(res);
      });

      proxy.on("error", (err: Error) => {
        logger.error("[Main] API proxy error:", err);
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "API server unavailable" }));
      });

      req.pipe(proxy);
      return;
    }

    let filePath = path.join(staticDir, pathname);
    const resolvedPath = path.resolve(filePath);
    if (!resolvedPath.startsWith(path.resolve(staticDir))) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    filePath = resolvedPath;

    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      const indexPath = path.join(filePath, "index.html");
      if (fs.existsSync(indexPath)) {
        filePath = indexPath;
      } else {
        const htmlPath = filePath + ".html";
        if (fs.existsSync(htmlPath)) {
          filePath = htmlPath;
        } else {
          filePath = indexPath;
        }
      }
    } else if (!fs.existsSync(filePath)) {
      const htmlPath = filePath + ".html";
      if (fs.existsSync(htmlPath)) {
        filePath = htmlPath;
      } else {
        const rootHtmlPath = path.join(staticDir, "index.html");
        if (pathname !== "/" && fs.existsSync(rootHtmlPath)) {
          filePath = rootHtmlPath;
        } else {
          res.writeHead(404);
          res.end("Not Found");
          return;
        }
      }
    }

    try {
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || "application/octet-stream";
      const data = fs.readFileSync(filePath);
      res.writeHead(200, {
        "Content-Type": `${contentType}; charset=utf-8`,
        "Cache-Control":
          ext === ".html" ? "no-cache" : "public, max-age=31536000",
      });
      res.end(data);
    } catch (error: unknown) {
      logger.error("[Main] File serve error:", error instanceof Error ? error : new Error(String(error)));
      res.writeHead(500);
      res.end("Internal Server Error");
    }
  });

  server.on("connection", (socket) => {
    activeConnections.add(socket);
    socket.on("close", () => {
      activeConnections.delete(socket);
    });
  });

  server.listen(appPort, "127.0.0.1", () => {
    logger.info("[Main] Static server running", { url: `http://localhost:${appPort}` });
  });

  server.on("error", (err: unknown) => {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === "EADDRINUSE") {
      logger.error(`[Main] Port ${appPort} is already in use`);
    } else {
      logger.error("[Main] Server error:", err instanceof Error ? err : new Error(String(err)));
    }
  });

  return server;
}

async function waitForServer(urlStr: string, maxRetries = 30, interval = 500): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(urlStr);
      if (response.ok || response.status === 200) {
        logger.info("[Main] Server ready", { checks: i + 1 });
        return true;
      }
    } catch {
      logger.warn("[Main] API server not ready, retrying...");
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  return false;
}

interface CreateWindowOptions {
  appPort: number;
  apiPort?: number;
  startApiServerFn: () => Promise<void>;
  openDevTools?: boolean;
  onQuit?: () => void;
}

async function createWindow(options: CreateWindowOptions): Promise<Electron.BrowserWindow> {
  const {
    appPort,
    apiPort = API_SERVER_PORT,
    startApiServerFn,
    openDevTools = false,
  } = options;

  const serverUrl = `http://localhost:${appPort}`;
  let loadRetryCount = 0;
  const MAX_LOAD_RETRIES = 5;

  try {
    logger.info("[Main] Starting API server...");
    await startApiServerFn();
  } catch (error) {
    logger.error("[Main] Failed to start API server:", error instanceof Error ? error : new Error(String(error)));
  }

  registerAllowedOrigin(appPort);

  let staticServer: http.Server | null = null;
  if (appPort !== DEV_SERVER_PORT) {
    staticServer = startStaticServer(appPort, apiPort);
    if (!staticServer) {
      logger.error("[Main] Failed to start static server");
      throw new Error("Failed to start static server");
    }
    activeStaticServer = staticServer;
  }

  const serverReady = await waitForServer(serverUrl);
  if (!serverReady) {
    logger.error("[Main] Server failed to start within timeout");
  }

  logger.info("[Main] Creating window and loading:", { url: serverUrl });

  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    frame: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      preload: path.join(__dirname, "preload.js"),
    },
    show: false,
  });

  mainWindow.loadURL(serverUrl);

  const allowedPorts = new Set([String(appPort), String(apiPort)]);

  mainWindow.webContents.on("will-navigate", (event, navigationUrl) => {
    try {
      const parsed = new URL(navigationUrl);
      if (
        (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") &&
        parsed.protocol === "http:" &&
        allowedPorts.has(parsed.port)
      ) {
        return;
      }
      if (parsed.protocol === "file:") {
        const requestedPath = decodeURIComponent(parsed.pathname || "").replace(/^\/([A-Za-z]:)/, "$1");
        const appRoot = path.join(process.resourcesPath || path.dirname(__dirname), "app");
        const outRoot = getStaticDir();
        if (requestedPath.startsWith(outRoot) || requestedPath.startsWith(appRoot)) {
          return;
        }
      }
    } catch {
      logger.warn("[Main] Failed to validate navigation URL");
    }
    event.preventDefault();
    logger.warn("[Main] Blocked navigation", { url: navigationUrl });
  });

  mainWindow.webContents.setWindowOpenHandler(({ url: openUrl }) => {
    try {
      const parsed = new URL(openUrl);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        if (parsed.hostname !== "localhost") {
          shell.openExternal(openUrl);
        }
      }
    } catch {
      logger.warn("[Main] Failed to validate window open URL");
    }
    return { action: "deny" };
  });

  mainWindow.once("ready-to-show", () => {
    logger.info("[Main] Window ready");
    mainWindow.show();
    if (openDevTools) {
      mainWindow.webContents.openDevTools();
    }
  });

  mainWindow.on("closed", () => {
    logger.info("[Main] Window closed");
  });

  mainWindow.webContents.on("did-fail-load", (_e, code, desc, validatedURL) => {
    logger.error("[Main] Failed to load:", undefined, { code, desc, validatedURL });
    if (code === -102 || code === -105) {
      if (loadRetryCount >= MAX_LOAD_RETRIES) {
        logger.error(`[Main] Max load retries (${MAX_LOAD_RETRIES}) reached, giving up`);
        return;
      }
      loadRetryCount++;
      logger.info(`[Main] Connection refused, retrying in 3s (attempt ${loadRetryCount}/${MAX_LOAD_RETRIES})...`);
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.loadURL(serverUrl);
        }
      }, 3000);
    }
  });

  return mainWindow;
}

export {
  validateConfigKey,
  validateConfigValue,
  getConfigValue,
  applyConfigValue,
  setupApiHandlers,
  startStaticServer,
  waitForServer,
  createWindow,
  setupAssetHandlers,
  setupDatabaseHandlers,
  registerExportHandlers,
  loadConfig,
  saveConfig,
};

export function closeStaticServer(): void {
  if (activeStaticServer) {
    logger.info("[Main] Closing static server...");
    const server = activeStaticServer;
    activeStaticServer = null;
    for (const conn of activeConnections) {
      try {
        conn.destroy();
      } catch (e) { logger.error("[Main] Failed to destroy static server connection", e instanceof Error ? e : undefined); }
    }
    activeConnections.clear();
    server.close((err) => {
      if (err) {
        logger.error("[Main] Error closing static server:", err instanceof Error ? err : new Error(String(err)));
      }
    });
  }
}


