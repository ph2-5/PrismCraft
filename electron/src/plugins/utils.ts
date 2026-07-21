import fs from "fs";
import path from "path";
import os from "os";
import https from "https";
import http from "http";
import { getLogger } from "../logging/logger";
import { getUserDataRootDir } from "../app-paths";

const logger = getLogger("plugin-utils");

const USER_DATA_ROOT = getUserDataRootDir();

const VIDEO_CACHE_DIR = path.join(USER_DATA_ROOT, "Cache", "Videos");
const ASSETS_BASE_DIR = path.join(USER_DATA_ROOT, "Assets");
const UPLOAD_DIR =
  process.env.AI_STUDIO_UPLOAD_DIR ||
  path.join(os.tmpdir(), "ai-animation-studio", "uploads");

export { VIDEO_CACHE_DIR, ASSETS_BASE_DIR, UPLOAD_DIR };

const MAX_BASE64_FILE_SIZE = 20 * 1024 * 1024;

const MIME_BY_EXTENSION: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

/** 读取文件并编码为 data URI；超过 20MB 或读取失败返回 null */
function readFileAsDataUri(filePath: string, mime: string): string | null {
  try {
    if (!fs.existsSync(filePath)) {
      logger.warn(`Local file not found: ${filePath}`);
      return null;
    }
    const stat = fs.statSync(filePath);
    if (stat.size > MAX_BASE64_FILE_SIZE) {
      logger.warn(
        `Local file too large for base64 encoding (${(stat.size / 1024 / 1024).toFixed(1)}MB): ${filePath}`,
      );
      return null;
    }
    const buffer = fs.readFileSync(filePath);
    return `data:${mime};base64,${buffer.toString("base64")}`;
  } catch (e) {
    logger.warn(
      `Failed to read local file: ${e instanceof Error ? e.message : String(e)}`,
    );
    return null;
  }
}

/** 解析 vcache:// URL 为 base64（提取以降低 resolveLocalUrlToBase64 复杂度） */
function resolveVcacheUrl(url: string): string | null {
  let taskId = url.substring(9);
  const hashIndex = taskId.indexOf("#");
  if (hashIndex >= 0) taskId = taskId.substring(0, hashIndex);
  const queryIndex = taskId.indexOf("?");
  if (queryIndex >= 0) taskId = taskId.substring(0, queryIndex);

  if (!taskId || taskId.includes("..") || taskId.includes("/") || taskId.includes("\\")) {
    logger.warn(`Invalid vcache task ID: ${taskId}`);
    return null;
  }

  const filePath = path.resolve(path.join(VIDEO_CACHE_DIR, `${taskId}.mp4`));
  if (!filePath.startsWith(VIDEO_CACHE_DIR)) {
    logger.warn(`vcache path traversal detected: ${filePath}`);
    return null;
  }

  return readFileAsDataUri(filePath, "video/mp4");
}

/** 解析本地 file:// 或绝对路径 URL 为 base64（提取以降低 resolveLocalUrlToBase64 复杂度） */
function resolveLocalFileUrl(url: string): string | null {
  let filePath = url.startsWith("file://") ? url.substring(7) : url;
  filePath = decodeURIComponent(filePath);

  if (filePath.includes("..")) {
    logger.warn(`Local path traversal detected: ${filePath}`);
    return null;
  }

  const resolvedPath = path.resolve(filePath);
  const isAllowed =
    resolvedPath.startsWith(ASSETS_BASE_DIR) ||
    resolvedPath.startsWith(VIDEO_CACHE_DIR) ||
    resolvedPath.startsWith(UPLOAD_DIR) ||
    resolvedPath.startsWith(os.tmpdir());

  if (!isAllowed) {
    logger.warn(`Local file access denied (outside allowed dirs): ${resolvedPath}`);
    return null;
  }

  const ext = path.extname(resolvedPath).toLowerCase();
  const mime = MIME_BY_EXTENSION[ext] || "application/octet-stream";
  return readFileAsDataUri(resolvedPath, mime);
}

export function resolveLocalUrlToBase64(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    if (!url || typeof url !== "string") {
      resolve(null);
      return;
    }

    if (url.startsWith("data:")) {
      resolve(url);
      return;
    }

    if (url.startsWith("vcache://")) {
      resolve(resolveVcacheUrl(url));
      return;
    }

    if (url.startsWith("/") || url.startsWith("file://")) {
      resolve(resolveLocalFileUrl(url));
      return;
    }

    if (url.startsWith("blob:")) {
      logger.warn(`blob: URLs cannot be resolved server-side: ${url.substring(0, 50)}`);
      resolve(null);
      return;
    }

    resolve(null);
  });
}

export async function ensureAccessibleUrl(
  url: string | undefined | null,
): Promise<string | undefined> {
  if (!url) return undefined;

  if (url.startsWith("https://") || url.startsWith("http://")) {
    return url;
  }

  const base64 = await resolveLocalUrlToBase64(url);
  if (base64) return base64;

  logger.warn(
    `Cannot resolve URL for AI API, skipping: ${url.substring(0, 80)}`,
  );
  return undefined;
}

export function downloadAsBase64(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    const req = client.get(url, { timeout: 30000 }, (res) => {
      if (
        res.statusCode &&
        (res.statusCode < 200 || res.statusCode >= 300)
      ) {
        res.resume();
        reject(
          new Error(
            `HTTP ${res.statusCode}: ${res.statusMessage || "Request failed"}`,
          ),
        );
        return;
      }

      const chunks: Buffer[] = [];
      let totalSize = 0;
      const MAX_DOWNLOAD_SIZE = 50 * 1024 * 1024;

      res.on("data", (chunk: Buffer) => {
        totalSize += chunk.length;
        if (totalSize > MAX_DOWNLOAD_SIZE) {
          req.destroy(
            new Error(
              `File too large (max ${MAX_DOWNLOAD_SIZE / 1024 / 1024}MB)`,
            ),
          );
          return;
        }
        chunks.push(chunk);
      });

      res.on("end", () => {
        const buffer = Buffer.concat(chunks);
        resolve(buffer.toString("base64"));
      });
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Download timeout"));
    });
  });
}

export function stripDataUriPrefix(dataUri: string): string {
  const match = dataUri.match(/^data:[\w/+\-.]+;base64,(.+)$/);
  return match ? match[1]! : dataUri;
}

export async function urlToPureBase64(url: string): Promise<string> {
  if (url.startsWith("data:")) {
    return stripDataUriPrefix(url);
  }
  return downloadAsBase64(url);
}
