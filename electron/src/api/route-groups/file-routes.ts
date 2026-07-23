import type { Route } from "../types";
import { defineRoute } from "../types";
import { extractErrorMessage } from "../../logging/extract-error";
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
  fileCacheDirectorySchema,
} from "../schemas";
import { getLogger } from "../../logging";
import { ensureVideoCacheDir } from "../../handlers/assets";
import {
  getUserDataRootDir,
  getAllUserDataDirs,
  isPathUnderAnyRoot,
  isPathUnderRoot,
} from "../../app-paths";

const logger = getLogger("file-routes");

// 主进程独立的文件存储实现（不依赖渲染进程的 DI container）
// 复用 handlers/assets.ts 的路径常量和安全校验逻辑
import fsp from "fs/promises";
import path from "path";
import os from "os";

/**
 * 文件操作错误码。
 * 主进程返回错误码字符串，渲染进程通过 mapUserFacingError 的 EXTRA_PATTERNS
 * 映射到 i18n key 进行本地化展示（见 src/shared/utils/user-facing-error.ts）。
 */
const FILE_ERRORS = {
  PATH_NOT_ALLOWED: "FILE_PATH_NOT_ALLOWED",
  FILE_NOT_FOUND: "FILE_NOT_FOUND",
  FILE_TOO_LARGE: "FILE_TOO_LARGE",
  INVALID_KEY: "FILE_INVALID_KEY",
  INVALID_CATEGORY: "FILE_INVALID_CATEGORY",
  SOURCE_PATH_NOT_ALLOWED: "FILE_SOURCE_PATH_NOT_ALLOWED",
  SOURCE_NOT_FOUND: "FILE_SOURCE_NOT_FOUND",
} as const;

const UPLOAD_BASE_DIR = path.join(os.tmpdir(), "ai-animation-studio", "uploads");

const USER_DATA_ROOT = getUserDataRootDir();

const ASSETS_BASE_DIR = path.join(USER_DATA_ROOT, "Assets");
const CACHE_BASE_DIR = path.join(USER_DATA_ROOT, "Cache");
const PLUGIN_BASE_DIR = path.join(USER_DATA_ROOT, "Plugins");

const CATEGORY_DIRS: Record<string, string> = {
  character: path.join(ASSETS_BASE_DIR, "Characters"),
  scene: path.join(ASSETS_BASE_DIR, "Scenes"),
  storyboard: path.join(ASSETS_BASE_DIR, "Storyboards"),
  "video-cache": path.join(CACHE_BASE_DIR, "Videos"),
  "image-cache": path.join(CACHE_BASE_DIR, "Images"),
  upload: UPLOAD_BASE_DIR,
  plugin: PLUGIN_BASE_DIR,
};

// file/list 大目录保护：超过 MAX_DIR_SCAN 个文件时只扫描前 N 个并附带 warning。
// 避免数千文件导致内存爆炸和长时间阻塞 IPC。 caller 可据此决定是否需要
// 更细粒度的索引方案（如 DB 索引 / 文件名前缀分桶）。
const MAX_DIR_SCAN = 5000;
// stat 并发批次大小：50 是经验值，在 Windows/Linux/macOS 上均稳定，
// 既能显著降低串行延迟，又不会过载 fs 句柄。
const STAT_BATCH_SIZE = 50;
// 文件读写安全上限：避免一次性读入超大文件导致内存爆炸。
// read/read-base64 共享 50MB 上限，write 100MB 上限（与 HTTP JSON body 限制对齐）。
// write-binary 500MB 上限：用于支持 Seedance 2.5 30秒 4K / Kling 180秒 等大视频直写
// （绕过 base64 膨胀，走 application/octet-stream）。
const MAX_READ_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_WRITE_SIZE = 100 * 1024 * 1024; // 100MB（JSON 路径）
const MAX_WRITE_BINARY_SIZE = 500 * 1024 * 1024; // 500MB（octet-stream 路径）

const ALLOWED_ROOTS = [
  ...Object.values(CATEGORY_DIRS),
  ...getAllUserDataDirs(),
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
    return isPathUnderAnyRoot(resolved, ALLOWED_ROOTS);
  } catch {
    const resolved = path.resolve(filePath);
    if (filePath.includes("..") || resolved.includes("..")) return false;
    return isPathUnderAnyRoot(resolved, ALLOWED_ROOTS);
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
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
      logger.warn("[File HTTP] resolvePath rejected path", { key });
      throw new Error(FILE_ERRORS.PATH_NOT_ALLOWED);
    }
    return key;
  }
  if (!isFilenameSafe(key)) {
    logger.warn("[File HTTP] resolvePath rejected invalid key", { key });
    throw new Error(FILE_ERRORS.INVALID_KEY);
  }
  if (category) {
    const dir = CATEGORY_DIRS[category];
    if (!dir) {
      logger.warn("[File HTTP] resolvePath rejected invalid category", { category });
      throw new Error(FILE_ERRORS.INVALID_CATEGORY);
    }
    return path.join(dir, key);
  }
  // 纯 key 未指定 category：遍历所有 CATEGORY_DIRS 查找已存在的文件
  for (const dir of Object.values(CATEGORY_DIRS)) {
    const candidate = path.join(dir, key);
    if (await pathExists(candidate)) {
      return candidate;
    }
  }
  logger.warn("[File HTTP] resolvePath file not found in any category", { key });
  throw new Error(FILE_ERRORS.FILE_NOT_FOUND);
}

async function ensureDir(category: string): Promise<void> {
  const dir = CATEGORY_DIRS[category];
  if (!dir) {
    throw new Error(FILE_ERRORS.INVALID_CATEGORY);
  }
  if (!(await pathExists(dir))) {
    await fsp.mkdir(dir, { recursive: true });
  }
}

function toFileCategory(cat: string): string {
  const valid = ["character", "scene", "storyboard", "video-cache", "image-cache", "upload", "plugin"];
  if (!valid.includes(cat)) {
    throw new Error(FILE_ERRORS.INVALID_CATEGORY);
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
        return { success: false, error: extractErrorMessage(error) };
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
          return { success: false, error: FILE_ERRORS.PATH_NOT_ALLOWED };
        }
        if (!(await pathExists(filePath))) {
          return { success: false, error: FILE_ERRORS.FILE_NOT_FOUND };
        }
        // 文件大小限制，避免读取超大文件导致 OOM
        const stat = await fsp.stat(filePath);
        if (stat.size > MAX_READ_SIZE) {
          logger.warn("[File HTTP] read rejected oversized file", { size: stat.size, max: MAX_READ_SIZE });
          return { success: false, error: FILE_ERRORS.FILE_TOO_LARGE };
        }
        const buffer = await fsp.readFile(filePath);
        return { success: true, data: { base64: buffer.toString("base64") } };
      } catch (error) {
        logger.error("[File HTTP] read failed:", error instanceof Error ? error : new Error(String(error)));
        return { success: false, error: extractErrorMessage(error) };
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
          return { success: false, error: FILE_ERRORS.PATH_NOT_ALLOWED };
        }
        if (!(await pathExists(filePath))) {
          return { success: false, error: FILE_ERRORS.FILE_NOT_FOUND };
        }
        // 文件大小限制，避免读取超大文件导致 OOM
        const stat = await fsp.stat(filePath);
        if (stat.size > MAX_READ_SIZE) {
          logger.warn("[File HTTP] read-base64 rejected oversized file", { size: stat.size, max: MAX_READ_SIZE });
          return { success: false, error: FILE_ERRORS.FILE_TOO_LARGE };
        }
        const buffer = await fsp.readFile(filePath);
        const mime = getMimeFromExt(filePath);
        return { success: true, data: { dataUrl: `data:${mime};base64,${buffer.toString("base64")}` } };
      } catch (error) {
        logger.error("[File HTTP] read-base64 failed:", error instanceof Error ? error : new Error(String(error)));
        return { success: false, error: extractErrorMessage(error) };
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
          return { success: false, error: FILE_ERRORS.PATH_NOT_ALLOWED };
        }
        let deleted = false;
        if (await pathExists(filePath)) {
          await fsp.unlink(filePath);
          deleted = true;
        }
        return { success: true, data: { deleted } };
      } catch (error) {
        logger.error("[File HTTP] delete failed:", error instanceof Error ? error : new Error(String(error)));
        return { success: false, error: extractErrorMessage(error) };
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
        return { success: true, data: { exists: await pathExists(filePath) } };
      } catch (error) {
        logger.error("[File HTTP] exists failed:", error instanceof Error ? error : new Error(String(error)));
        return { success: false, error: extractErrorMessage(error) };
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
          return { success: false, error: FILE_ERRORS.SOURCE_PATH_NOT_ALLOWED };
        }
        if (!(await pathExists(sourcePath))) {
          return { success: false, error: FILE_ERRORS.SOURCE_NOT_FOUND };
        }

        const sourceExt = path.extname(sourcePath);
        const finalTargetKey = body.targetKey.includes(".") ? body.targetKey : `${body.targetKey}${sourceExt}`;
        const targetPath = await resolvePath(finalTargetKey, targetCategory);

        await fsp.copyFile(sourcePath, targetPath);
        return { success: true, data: { key: finalTargetKey } };
      } catch (error) {
        logger.error("[File HTTP] copy failed:", error instanceof Error ? error : new Error(String(error)));
        return { success: false, error: extractErrorMessage(error) };
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
        if (!dir || !(await pathExists(dir))) {
          return { success: true, data: { files: [], total: 0, offset: 0, limit: 500 } };
        }

        const limit = typeof body.limit === "number" ? Math.min(body.limit, 500) : 500;
        const offset = typeof body.offset === "number" ? Math.max(body.offset, 0) : 0;

        // 注意：按 createdAt 排序需要对所有文件执行 stat，无法仅 stat 分页范围。
        // 安全上限：目录文件数超过 MAX_DIR_SCAN 时只扫描前 N 个并附带 warning，
        // 避免数千文件导致内存爆炸和长时间阻塞。 caller 可据此决定是否需要
        // 更细粒度的索引方案。
        const files = await fsp.readdir(dir);
        const totalOnDisk = files.length;
        let truncated = false;
        let scannedFiles = files;
        if (totalOnDisk > MAX_DIR_SCAN) {
          truncated = true;
          scannedFiles = files.slice(0, MAX_DIR_SCAN);
          logger.warn(
            `[File HTTP] list: directory ${category} has ${totalOnDisk} entries, ` +
              `scanning only first ${MAX_DIR_SCAN} (truncated).`,
          );
        }

        // 并行 stat：每批 STAT_BATCH_SIZE 个并发，避免串行等待 + 防止
        // 一次性 Promise.all 在超大目录上压爆 fs 句柄。
        const results: Array<{
          key: string;
          category: string;
          size: number;
          mimeType: string;
          createdAt: number;
          updatedAt: number;
        }> = [];
        for (let i = 0; i < scannedFiles.length; i += STAT_BATCH_SIZE) {
          const batch = scannedFiles.slice(i, i + STAT_BATCH_SIZE);
          const settled = await Promise.allSettled(
            batch.map(async (file) => {
              const filePath = path.join(dir, file);
              const stat = await fsp.stat(filePath);
              if (!stat.isFile()) return null;
              return {
                key: file,
                category,
                size: stat.size,
                mimeType: getMimeFromExt(filePath),
                createdAt: Math.floor(stat.birthtime.getTime() / 1000),
                updatedAt: Math.floor(stat.mtime.getTime() / 1000),
              } as const;
            }),
          );
          for (const r of settled) {
            if (r.status === "fulfilled" && r.value) {
              results.push(r.value);
            }
            // rejected / non-file entries: 跳过无法访问的文件
          }
        }
        results.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        const paginatedResults = results.slice(offset, offset + limit);
        return {
          success: true,
          data: {
            files: paginatedResults,
            total: results.length,
            offset,
            limit,
            ...(truncated ? { warning: `DIRECTORY_TRUNCATED: scanned ${MAX_DIR_SCAN} of ${totalOnDisk} entries` } : {}),
          },
        };
      } catch (error) {
        logger.error("[File HTTP] list failed:", error instanceof Error ? error : new Error(String(error)));
        return { success: false, error: extractErrorMessage(error) };
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
        if (!(await pathExists(filePath))) {
          return { success: true, data: null };
        }
        const stat = await fsp.stat(filePath);

        const normalizedPath = path.resolve(filePath);
        let category = "upload";
        for (const [cat, dir] of Object.entries(CATEGORY_DIRS)) {
          if (isPathUnderRoot(normalizedPath, dir)) {
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
        return { success: false, error: extractErrorMessage(error) };
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
          return { success: false, error: FILE_ERRORS.PATH_NOT_ALLOWED };
        }

        const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
        const buffer = typeof body.data === "string" ? Buffer.from(body.data, "utf-8") : Buffer.from(body.data);

        try {
          await fsp.writeFile(tmpPath, buffer);
          await fsp.rename(tmpPath, filePath);
        } catch (e) {
          try {
            if (await pathExists(tmpPath)) await fsp.unlink(tmpPath);
          } catch {
            // 忽略清理失败
          }
          throw e;
        }
        return { success: true, data: { key: body.key } };
      } catch (error) {
        logger.error("[File HTTP] write-atomic failed:", error instanceof Error ? error : new Error(String(error)));
        return { success: false, error: extractErrorMessage(error) };
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
          return { success: false, error: FILE_ERRORS.PATH_NOT_ALLOWED };
        }
        // 确保父目录存在
        const parentDir = path.dirname(filePath);
        if (!(await pathExists(parentDir))) {
          await fsp.mkdir(parentDir, { recursive: true });
        }
        // 根据 encoding 字段解码数据：
        // - "base64": data 为 base64 编码的二进制数据（避免数字数组内存膨胀）
        // - undefined / "utf-8": data 为 UTF-8 字符串
        const buffer = body.encoding === "base64"
          ? Buffer.from(body.data as string, "base64")
          : typeof body.data === "string" ? Buffer.from(body.data, "utf-8") : Buffer.from(body.data);
        // 大小限制（对齐 IPC 的 100MB）
        if (buffer.length > MAX_WRITE_SIZE) {
          logger.warn("[File HTTP] write rejected oversized buffer", { size: buffer.length, max: MAX_WRITE_SIZE });
          return { success: false, error: FILE_ERRORS.FILE_TOO_LARGE };
        }
        await fsp.writeFile(filePath, buffer);
        return { success: true };
      } catch (error) {
        logger.error("[File HTTP] write failed:", error instanceof Error ? error : new Error(String(error)));
        return { success: false, error: extractErrorMessage(error) };
      }
    },
    methods: ["POST"],
  }),

  // 二进制直写路由（application/octet-stream）：绕过 base64 编码 + JSON.parse，
  // 用于大视频文件（>20MB）直写到磁盘。filePath 通过 X-File-Path header 传递。
  // server.ts 会检测 Content-Type 并将原始 Buffer 挂到 req.__rawBuffer。
  "file/write-binary": defineRoute({
    handler: async (_method, _body, req) => {
      try {
        // 从自定义 header 读取目标路径（header 须经 ELECTRON_APP_HEADERS 白名单）
        const rawPath = req.headers["x-file-path"];
        if (typeof rawPath !== "string" || !rawPath) {
          return { success: false, error: "Missing or invalid x-file-path header" };
        }
        const filePath = path.resolve(rawPath);
        if (!(await isPathAllowed(filePath))) {
          return { success: false, error: FILE_ERRORS.PATH_NOT_ALLOWED };
        }
        // 确保父目录存在
        const parentDir = path.dirname(filePath);
        if (!(await pathExists(parentDir))) {
          await fsp.mkdir(parentDir, { recursive: true });
        }
        // 从 req 读取原始 Buffer（server.ts 在二进制模式下挂载）
        const rawBuffer = (req as import("http").IncomingMessage & { __rawBuffer?: Buffer }).__rawBuffer;
        if (!rawBuffer || rawBuffer.length === 0) {
          return { success: false, error: "Empty binary body" };
        }
        // 二进制路径的独立限额（500MB，支持 Seedance 2.5 30秒 4K / Kling 180秒）
        if (rawBuffer.length > MAX_WRITE_BINARY_SIZE) {
          logger.warn("[File HTTP] write-binary rejected oversized buffer", {
            size: rawBuffer.length,
            max: MAX_WRITE_BINARY_SIZE,
          });
          return { success: false, error: FILE_ERRORS.FILE_TOO_LARGE };
        }
        await fsp.writeFile(filePath, rawBuffer);
        return { success: true };
      } catch (error) {
        logger.error("[File HTTP] write-binary failed:", error instanceof Error ? error : new Error(String(error)));
        return { success: false, error: extractErrorMessage(error) };
      }
    },
    methods: ["POST"],
  }),

  // 获取视频缓存目录（对齐 IPC cache:get-cache-directory）
  "file/cache-directory": defineRoute({
    schema: fileCacheDirectorySchema,
    handler: async () => {
      try {
        const cacheDir = await ensureVideoCacheDir();
        return { success: true, data: { path: cacheDir } };
      } catch (error) {
        logger.error("[File HTTP] cache-directory failed:", error instanceof Error ? error : new Error(String(error)));
        return { success: false, error: extractErrorMessage(error) };
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
          return { success: false, error: FILE_ERRORS.PATH_NOT_ALLOWED };
        }
        const statfs = await fsp.statfs(resolvedPath);
        return {
          success: true,
          data: {
            availableBytes: statfs.bavail * statfs.bsize,
            totalBytes: statfs.blocks * statfs.bsize,
          },
        };
      } catch (error) {
        logger.error("[File HTTP] disk-space failed:", error instanceof Error ? error : new Error(String(error)));
        return { success: false, error: extractErrorMessage(error) };
      }
    },
    methods: ["POST"],
  }),
};
