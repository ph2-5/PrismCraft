import { protocol } from "electron";
import path from "path";
import fs from "fs";
import url from "url";
import { getLogger } from "./logging/logger";
import { VIDEO_CACHE_DIR } from "./handlers/assets";

const logger = getLogger("protocol");

function resolvePath(...segments: string[]): string {
  return path.resolve(__dirname, ...segments);
}

export function registerAppProtocol(): void {
  protocol.registerFileProtocol("app", (request, callback) => {
    const appPath = process.resourcesPath || path.dirname(__dirname);

    const urlStr = request.url;
    let cleanPath = "";

    if (urlStr.startsWith("app://")) {
      cleanPath = urlStr.substring(6);
    } else {
      const parsedUrl = url.parse(urlStr);
      cleanPath = (parsedUrl.pathname || "").replace(/^\//, "");
    }

    cleanPath = decodeURIComponent(cleanPath);

    if (!cleanPath || cleanPath === "") {
      cleanPath = "index.html";
    }

    if (cleanPath.startsWith("./")) {
      cleanPath = cleanPath.substring(2);
    }

    const normalizedPath = path.normalize(cleanPath);

    if (normalizedPath.startsWith("..") || normalizedPath.includes(path.sep + ".." + path.sep)) {
      logger.error("[Protocol] Path traversal detected:", undefined, { path: cleanPath });
      return callback({ error: -6 });
    }

    const possiblePaths = [
      resolvePath("..", "dist", normalizedPath),
      path.join(process.cwd(), "dist", normalizedPath),
      path.join(appPath, "dist", normalizedPath),
      path.join(appPath, "app", "dist", normalizedPath),
      path.join(path.dirname(appPath), "dist", normalizedPath),
    ];

    for (const filePath of possiblePaths) {
      const resolved = path.resolve(filePath);
      if (fs.existsSync(resolved)) {
        logger.info("[Protocol] Serving:", { cleanPath, resolved });
        return callback({ path: resolved });
      }
    }

    logger.error("[Protocol] File not found:", undefined, { path: cleanPath });
    logger.error("[Protocol] Tried paths:", undefined, { paths: possiblePaths });
    callback({ error: -6 });
  });

  protocol.interceptFileProtocol("file", (request, callback) => {
    const urlStr = request.url;

    if (urlStr.includes("/./") || urlStr.includes("\\.\\")) {
      const appPath = process.resourcesPath || path.dirname(__dirname);
      const cleanPath = urlStr
        .replace(/^file:\/\//, "")
        .replace(/^.*[/\\]\.\//, "");

      if (cleanPath.includes("..")) {
        logger.error("[Protocol] Path traversal detected in file://:", undefined, { path: cleanPath });
        return callback({ error: -6 });
      }
      const normalizedPath = path.normalize(cleanPath);

      const possiblePaths = [
        resolvePath("..", "dist", normalizedPath),
        path.join(process.cwd(), "dist", normalizedPath),
        path.join(appPath, "dist", normalizedPath),
      ];

      for (const filePath of possiblePaths) {
        if (fs.existsSync(filePath)) {
          return callback({ path: filePath });
        }
      }
    }

    const filePath = urlStr.replace(/^file:\/\//, "");
    if (filePath.includes("..")) {
      logger.error("[Protocol] Path traversal detected in file://:", undefined, { path: filePath });
      return callback({ error: -6 });
    }
    const normalizedPath = path.normalize(filePath);
    callback({ path: normalizedPath });
  });

  protocol.registerFileProtocol("vcache", (request, callback) => {
    const urlStr = request.url;
    let taskId = "";

    if (urlStr.startsWith("vcache://")) {
      taskId = urlStr.substring(9);
    }

    const hashIndex = taskId.indexOf("#");
    if (hashIndex >= 0) taskId = taskId.substring(0, hashIndex);
    const queryIndex = taskId.indexOf("?");
    if (queryIndex >= 0) taskId = taskId.substring(0, queryIndex);

    if (!taskId || taskId.includes("..") || taskId.includes("/") || taskId.includes("\\")) {
      logger.error("[Protocol] Invalid vcache task ID:", undefined, { taskId });
      return callback({ error: -6 });
    }

    const filePath = path.join(VIDEO_CACHE_DIR, `${taskId}.mp4`);
    const resolvedPath = path.resolve(filePath);

    if (!resolvedPath.startsWith(VIDEO_CACHE_DIR)) {
      logger.error("[Protocol] vcache path traversal detected:", undefined, { path: resolvedPath });
      return callback({ error: -6 });
    }

    if (fs.existsSync(resolvedPath)) {
      return callback({ path: resolvedPath });
    }

    callback({ error: -6 });
  });
}
