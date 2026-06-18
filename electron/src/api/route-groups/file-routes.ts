import type { Route } from "../types";
import { defineRoute } from "../types";
import {
  fileSaveSchema,
  fileReadSchema,
  fileDeleteSchema,
  fileExistsSchema,
  fileCopySchema,
  fileListSchema,
  fileInfoSchema,
  fileWriteAtomicSchema,
  fileWriteSchema,
  fileDiskSpaceSchema,
} from "../schemas";
import { getLogger } from "../../logging";
import { ensureVideoCacheDir } from "../../handlers/assets";

const logger = getLogger("file-routes");

// 主进程独立的文件存储实现（不依赖渲染进程的 DI container）
// 复用 handlers/assets.ts 的路径常量和安全校验逻辑
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import os from "os";

const ASSETS_BASE_DIR = path.join(os.homedir(), "AI Animation Studio", "Assets");
const CACHE_BASE_DIR = path.join(os.homedir(), "AI Animation Studio", "Cache");
const UPLOAD_BASE_DIR = path.join(os.tmpdir(), "ai-animation-studio", "uploads");
const PLUGIN_BASE_DIR = path.join(os.homedir(), "AI Animation Studio", "Plugins");

const CATEGORY_DIRS: Record<string, string> = {
  character: path.join(ASSETS_BASE_DIR, "Characters"),
  scene: path.join(ASSETS_BASE_DIR, "Scenes"),
  storyboard: path.join(ASSETS_BASE_DIR, "Storyboards"),
  "video-cache": path.join(CACHE_BASE_DIR, "Videos"),
  "image-cache": path.join(CACHE_BASE_DIR, "Images"),
  upload: UPLOAD_BASE_DIR,
  plugin: PLUGIN_BASE_DIR,
};

const ALLOWED_ROOTS = [
  ...Object.values(CATEGORY_DIRS),
  path.join(os.homedir(), "AI Animation Studio"),
];

const MIME_MAP: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  avi: "video/x-msvideo",
};

function isFilenameSafe(filename: string): boolean {
  if (!filename || typeof filename !== "string") return false;
  const normalized = path.normalize(filename);
  if (normalized !== filename) return false;
  if (filename.includes("..")) return false;
  if (/[/\\]/.test(filename)) return false;
  return true;
}

async function isPathAllowed(filePath: string): Promise<boolean> {
  try {
    const resolved = await fsp.realpath(path.resolve(filePath));
    const normalizedResolved = resolved.toLowerCase();
    return ALLOWED_ROOTS.some((root) => normalizedResolved.startsWith(root.toLowerCase()));
  } catch {
    const resolved = path.resolve(filePath);
    if (filePath.includes("..") || resolved.includes("..")) return false;
    const normalizedResolved = resolved.toLowerCase();
    return ALLOWED_ROOTS.some((root) => normalizedResolved.startsWith(root.toLowerCase()));
  }
}

function getExtFromMime(mimeType?: string): string {
  if (!mimeType) return "png";
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
    "video/x-msvideo": "avi",
  };
  return map[mimeType] || "bin";
}

function getMimeFromExt(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase().replace(".", "");
  return MIME_MAP[ext] || "application/octet-stream";
}

async function resolvePath(key: string, category?: string): Promise<string> {
  // 兼容旧物理路径
  if (path.isAbsolute(key) || key.includes("/") || key.includes("\\")) {
    if (!(await isPathAllowed(key))) {
      throw new Error(`Path not allowed: ${key}`);
    }
    return key;
  }
  if (!isFilenameSafe(key)) {
    throw new Error(`Invalid key: ${key}`);
  }
  if (category) {
    const dir = CATEGORY_DIRS[category];
    if (!dir) {
      throw new Error(`Invalid category: ${category}`);
    }
    return path.join(dir, key);
  }
  // 纯 key 未指定 category：遍历所有 CATEGORY_DIRS 查找已存在的文件
  for (const dir of Object.values(CATEGORY_DIRS)) {
    const candidate = path.join(dir, key);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(`File not found in any category: ${key}`);
}

async function ensureDir(category: string): Promise<void> {
  const dir = CATEGORY_DIRS[category];
  if (!dir) {
    throw new Error(`Invalid category: ${category}`);
  }
  if (!fs.existsSync(dir)) {
    await fsp.mkdir(dir, { recursive: true });
  }
}

function toFileCategory(cat: string): string {
  const valid = ["character", "scene", "storyboard", "video-cache", "image-cache", "upload", "plugin"];
  if (!valid.includes(cat)) {
    throw new Error(`Invalid file category: ${cat}`);
  }
  return cat;
}

export const fileRoutes: Record<string, Route> = {
  "file/save": defineRoute({
    schema: fileSaveSchema,
    handler: async (_method, body) => {
      try {
        const category = toFileCategory(body.category);
        await ensureDir(category);

        let buffer: Buffer;
        let ext: string;
        const data = body.data;

        if (typeof data === "string") {
          const matches = data.match(/^data:[^;]+;base64,/);
          if (matches) {
            const mimeMatch = data.match(/^data:([^;]+);base64,/);
            ext = getExtFromMime(mimeMatch?.[1]);
            buffer = Buffer.from(data.replace(/^data:[^;]+;base64,/, ""), "base64");
          } else {
            ext = getExtFromMime(body.mimeType);
            buffer = Buffer.from(data, "base64");
          }
        } else {
          buffer = Buffer.from(data);
          ext = getExtFromMime(body.mimeType);
        }

        const finalKey = body.key.includes(".") ? body.key : `${body.key}.${ext}`;
        const filePath = await resolvePath(finalKey, category);
        await fsp.writeFile(filePath, buffer);
        return { success: true, data: { key: finalKey } };
      } catch (error) {
        logger.error("[File HTTP] save failed:", error instanceof Error ? error : new Error(String(error)));
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
    methods: ["POST"],
  }),

  "file/read": defineRoute({
    schema: fileReadSchema,
    handler: async (_method, body) => {
      try {
        const filePath = await resolvePath(body.key);
        if (!(await isPathAllowed(filePath))) {
          return { success: false, error: "Path not allowed" };
        }
        if (!fs.existsSync(filePath)) {
          return { success: false, error: "File not found" };
        }
        const buffer = await fsp.readFile(filePath);
        return { success: true, data: { base64: buffer.toString("base64") } };
      } catch (error) {
        logger.error("[File HTTP] read failed:", error instanceof Error ? error : new Error(String(error)));
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
    methods: ["POST"],
  }),

  "file/read-base64": defineRoute({
    schema: fileReadSchema,
    handler: async (_method, body) => {
      try {
        const filePath = await resolvePath(body.key);
        if (!(await isPathAllowed(filePath))) {
          return { success: false, error: "Path not allowed" };
        }
        if (!fs.existsSync(filePath)) {
          return { success: false, error: "File not found" };
        }
        const buffer = await fsp.readFile(filePath);
        const mime = getMimeFromExt(filePath);
        return { success: true, data: { dataUrl: `data:${mime};base64,${buffer.toString("base64")}` } };
      } catch (error) {
        logger.error("[File HTTP] read-base64 failed:", error instanceof Error ? error : new Error(String(error)));
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
    methods: ["POST"],
  }),

  "file/delete": defineRoute({
    schema: fileDeleteSchema,
    handler: async (_method, body) => {
      try {
        const filePath = await resolvePath(body.key);
        if (!(await isPathAllowed(filePath))) {
          return { success: false, error: "Path not allowed" };
        }
        let deleted = false;
        if (fs.existsSync(filePath)) {
          await fsp.unlink(filePath);
          deleted = true;
        }
        return { success: true, data: { deleted } };
      } catch (error) {
        logger.error("[File HTTP] delete failed:", error instanceof Error ? error : new Error(String(error)));
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
    methods: ["POST"],
  }),

  "file/exists": defineRoute({
    schema: fileExistsSchema,
    handler: async (_method, body) => {
      try {
        const filePath = await resolvePath(body.key);
        if (!(await isPathAllowed(filePath))) {
          return { success: true, data: { exists: false } };
        }
        return { success: true, data: { exists: fs.existsSync(filePath) } };
      } catch (error) {
        logger.error("[File HTTP] exists failed:", error instanceof Error ? error : new Error(String(error)));
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
    methods: ["POST"],
  }),

  "file/copy": defineRoute({
    schema: fileCopySchema,
    handler: async (_method, body) => {
      try {
        const targetCategory = toFileCategory(body.targetCategory);
        await ensureDir(targetCategory);

        const sourcePath = await resolvePath(body.sourceKey);
        if (!(await isPathAllowed(sourcePath))) {
          return { success: false, error: "Source path not allowed" };
        }
        if (!fs.existsSync(sourcePath)) {
          return { success: false, error: "Source file not found" };
        }

        const sourceExt = path.extname(sourcePath);
        const finalTargetKey = body.targetKey.includes(".") ? body.targetKey : `${body.targetKey}${sourceExt}`;
        const targetPath = await resolvePath(finalTargetKey, targetCategory);

        await fsp.copyFile(sourcePath, targetPath);
        return { success: true, data: { key: finalTargetKey } };
      } catch (error) {
        logger.error("[File HTTP] copy failed:", error instanceof Error ? error : new Error(String(error)));
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
    methods: ["POST"],
  }),

  "file/list": defineRoute({
    schema: fileListSchema,
    handler: async (_method, body) => {
      try {
        const category = toFileCategory(body.category);
        const dir = CATEGORY_DIRS[category];
        if (!dir || !fs.existsSync(dir)) {
          return { success: true, data: { files: [] } };
        }

        const files = await fsp.readdir(dir);
        const results: Array<{
          key: string;
          category: string;
          size: number;
          mimeType: string;
          createdAt: number;
          updatedAt: number;
        }> = [];

        for (const file of files) {
          const filePath = path.join(dir, file);
          try {
            const stat = await fsp.stat(filePath);
            if (!stat.isFile()) continue;
            results.push({
              key: file,
              category,
              size: stat.size,
              mimeType: getMimeFromExt(filePath),
              createdAt: Math.floor(stat.birthtime.getTime() / 1000),
              updatedAt: Math.floor(stat.mtime.getTime() / 1000),
            });
          } catch {
            // 跳过无法访问的文件
          }
        }
        return { success: true, data: { files: results } };
      } catch (error) {
        logger.error("[File HTTP] list failed:", error instanceof Error ? error : new Error(String(error)));
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
    methods: ["POST"],
  }),

  "file/info": defineRoute({
    schema: fileInfoSchema,
    handler: async (_method, body) => {
      try {
        const filePath = await resolvePath(body.key);
        if (!(await isPathAllowed(filePath))) {
          return { success: true, data: null };
        }
        if (!fs.existsSync(filePath)) {
          return { success: true, data: null };
        }
        const stat = await fsp.stat(filePath);

        const normalizedPath = path.resolve(filePath).toLowerCase();
        let category = "upload";
        for (const [cat, dir] of Object.entries(CATEGORY_DIRS)) {
          if (normalizedPath.startsWith(dir.toLowerCase())) {
            category = cat;
            break;
          }
        }

        return {
          success: true,
          data: {
            key: body.key,
            category,
            size: stat.size,
            mimeType: getMimeFromExt(filePath),
            createdAt: Math.floor(stat.birthtime.getTime() / 1000),
            updatedAt: Math.floor(stat.mtime.getTime() / 1000),
          },
        };
      } catch (error) {
        logger.error("[File HTTP] info failed:", error instanceof Error ? error : new Error(String(error)));
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
    methods: ["POST"],
  }),

  "file/write-atomic": defineRoute({
    schema: fileWriteAtomicSchema,
    handler: async (_method, body) => {
      try {
        const category = toFileCategory(body.category);
        await ensureDir(category);

        const filePath = await resolvePath(body.key, category);
        if (!(await isPathAllowed(filePath))) {
          return { success: false, error: "Path not allowed" };
        }

        const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
        const buffer = typeof body.data === "string" ? Buffer.from(body.data, "utf-8") : Buffer.from(body.data);

        try {
          await fsp.writeFile(tmpPath, buffer);
          await fsp.rename(tmpPath, filePath);
        } catch (e) {
          try {
            if (fs.existsSync(tmpPath)) await fsp.unlink(tmpPath);
          } catch {
            // 忽略清理失败
          }
          throw e;
        }
        return { success: true, data: { key: body.key } };
      } catch (error) {
        logger.error("[File HTTP] write-atomic failed:", error instanceof Error ? error : new Error(String(error)));
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
    methods: ["POST"],
  }),

  // 按绝对路径写入文件（受 ALLOWED_ROOTS 限制，对齐 IPC fs:write-file）
  "file/write": defineRoute({
    schema: fileWriteSchema,
    handler: async (_method, body) => {
      try {
        const filePath = path.resolve(body.filePath);
        if (!(await isPathAllowed(filePath))) {
          return { success: false, error: "Path not allowed" };
        }
        // 确保父目录存在
        const parentDir = path.dirname(filePath);
        if (!fs.existsSync(parentDir)) {
          await fsp.mkdir(parentDir, { recursive: true });
        }
        const buffer = typeof body.data === "string" ? Buffer.from(body.data, "utf-8") : Buffer.from(body.data);
        // 大小限制（对齐 IPC 的 100MB）
        const MAX_WRITE_SIZE = 100 * 1024 * 1024;
        if (buffer.length > MAX_WRITE_SIZE) {
          return { success: false, error: "File too large" };
        }
        await fsp.writeFile(filePath, buffer);
        return { success: true };
      } catch (error) {
        logger.error("[File HTTP] write failed:", error instanceof Error ? error : new Error(String(error)));
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
    methods: ["POST"],
  }),

  // 获取视频缓存目录（对齐 IPC cache:get-cache-directory）
  "file/cache-directory": defineRoute({
    handler: async () => {
      try {
        const cacheDir = ensureVideoCacheDir();
        return { success: true, data: { path: cacheDir } };
      } catch (error) {
        logger.error("[File HTTP] cache-directory failed:", error instanceof Error ? error : new Error(String(error)));
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
    methods: ["POST", "GET"],
  }),

  // 查询磁盘空间（对齐 IPC fs:get-disk-space）
  "file/disk-space": defineRoute({
    schema: fileDiskSpaceSchema,
    handler: async (_method, body) => {
      try {
        const resolvedPath = path.resolve(body.dirPath);
        if (!(await isPathAllowed(resolvedPath))) {
          return { success: false, error: "Path not allowed" };
        }
        const statfs = fs.statfsSync(resolvedPath);
        return {
          success: true,
          data: {
            availableBytes: statfs.bavail * statfs.bsize,
            totalBytes: statfs.blocks * statfs.bsize,
          },
        };
      } catch (error) {
        logger.error("[File HTTP] disk-space failed:", error instanceof Error ? error : new Error(String(error)));
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
    methods: ["POST"],
  }),
};
