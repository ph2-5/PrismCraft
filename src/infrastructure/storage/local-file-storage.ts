import * as fsp from "fs/promises";
import fs from "fs";
import path from "path";
import os from "os";
import type {
  IFileStorage,
  FileCategory,
  FileMetadata,
  SaveFileParams,
  CopyFileParams,
  WriteFileAtomicParams,
} from "@/domain/ports/file-storage-port";
import { errorLogger } from "@/shared/error-logger";

function resolveUserDataRoot(): string {
  try {
    const legacy = path.join(os.homedir(), "AI Animation Studio");
    const current = path.join(os.homedir(), "PrismCraft");
    return fs.existsSync(legacy) ? legacy : current;
  } catch {
    return path.join(os.homedir(), "PrismCraft");
  }
}

const USER_DATA_ROOT = resolveUserDataRoot();

const ASSETS_BASE_DIR = path.join(USER_DATA_ROOT, "Assets");
const CACHE_BASE_DIR = path.join(USER_DATA_ROOT, "Cache");
const UPLOAD_BASE_DIR = path.join(os.tmpdir(), "ai-animation-studio", "uploads");
const PLUGIN_BASE_DIR = path.join(USER_DATA_ROOT, "Plugins");

const CATEGORY_DIRS: Record<FileCategory, string> = {
  character: path.join(ASSETS_BASE_DIR, "Characters"),
  scene: path.join(ASSETS_BASE_DIR, "Scenes"),
  storyboard: path.join(ASSETS_BASE_DIR, "Storyboards"),
  "video-cache": path.join(CACHE_BASE_DIR, "Videos"),
  "image-cache": path.join(CACHE_BASE_DIR, "Images"),
  upload: UPLOAD_BASE_DIR,
  plugin: PLUGIN_BASE_DIR,
};

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
  return MIME_MAP[ext] || `application/octet-stream`;
}

/**
 * 本地文件系统存储实现。
 *
 * key 映射规则：
 * - 纯 key（如 "char-abc123"）→ {CATEGORY_DIR}/{key}.{ext}
 * - 兼容旧物理路径（绝对路径或含分隔符）→ 直接使用，但需通过安全校验
 */
export class LocalFileStorage implements IFileStorage {
  /**
   * listFiles 大目录保护：超过此值的目录只扫描前 N 个文件，避免内存爆炸。
   * 与 file/list HTTP 路由保持一致（见 electron/src/api/route-groups/file-routes.ts）。
   */
  static readonly MAX_DIR_SCAN = 5000;
  /**
   * stat 并发批次大小：50 在 Windows/Linux/macOS 上均稳定。
   */
  static readonly STAT_BATCH_SIZE = 50;

  private readonly allowedRoots: string[];

  constructor() {
    this.allowedRoots = [
      ...Object.values(CATEGORY_DIRS),
      path.join(os.homedir(), "PrismCraft"),
      path.join(os.homedir(), "AI Animation Studio"),
    ];
  }

  private async resolvePath(key: string, category?: FileCategory): Promise<string> {
    // 兼容旧物理路径（绝对路径或含路径分隔符）
    if (path.isAbsolute(key) || key.includes("/") || key.includes("\\")) {
      if (!(await this.isPathAllowed(key))) {
        throw new Error(`Path not allowed: ${key}`);
      }
      return key;
    }

    if (!isFilenameSafe(key)) {
      throw new Error(`Invalid key: ${key}`);
    }

    if (!category) {
      throw new Error("Category is required for key-based path resolution");
    }
    return path.join(CATEGORY_DIRS[category], key);
  }

  /**
   * 安全的路径前缀匹配：校验路径分隔符，防止兄弟目录绕过。
   */
  private static isUnderRoot(target: string, root: string): boolean {
    const normalizedTarget = path.resolve(target).toLowerCase();
    const normalizedRoot = path.resolve(root).toLowerCase();
    if (normalizedTarget === normalizedRoot) return true;
    return normalizedTarget.startsWith(normalizedRoot + path.sep.toLowerCase());
  }

  private async isPathAllowed(filePath: string): Promise<boolean> {
    try {
      const resolved = await fsp.realpath(path.resolve(filePath));
      return this.allowedRoots.some((root) =>
        LocalFileStorage.isUnderRoot(resolved, root),
      );
    } catch {
      const resolved = path.resolve(filePath);
      if (filePath.includes("..") || resolved.includes("..")) {
        return false;
      }
      return this.allowedRoots.some((root) =>
        LocalFileStorage.isUnderRoot(resolved, root),
      );
    }
  }

  async saveFile(params: SaveFileParams): Promise<{ key: string }> {
    const { category, key, data, mimeType } = params;
    await this.ensureDir(category);

    let buffer: Buffer;
    let ext: string;

    if (typeof data === "string") {
      // base64 或 data URL
      const matches = data.match(/^data:[^;]+;base64,/);
      if (matches) {
        const mimeMatch = data.match(/^data:([^;]+);base64,/);
        ext = getExtFromMime(mimeMatch?.[1]);
        buffer = Buffer.from(data.replace(/^data:[^;]+;base64,/, ""), "base64");
      } else {
        ext = getExtFromMime(mimeType);
        buffer = Buffer.from(data, "base64");
      }
    } else if (data instanceof ArrayBuffer) {
      buffer = Buffer.from(data);
      ext = getExtFromMime(mimeType);
    } else {
      buffer = data;
      ext = getExtFromMime(mimeType);
    }

    const finalKey = key.includes(".") ? key : `${key}.${ext}`;
    const filePath = await this.resolvePath(finalKey, category);
    await fsp.writeFile(filePath, buffer);
    return { key: finalKey };
  }

  async readFile(key: string): Promise<Buffer | null> {
    try {
      const filePath = await this.resolvePath(key);
      if (!(await this.isPathAllowed(filePath))) {
        errorLogger.warn(`[LocalFileStorage] Path not allowed: ${key}`);
        return null;
      }
      try {
        await fsp.access(filePath);
      } catch {
        return null;
      }
      return await fsp.readFile(filePath);
    } catch (e) {
      errorLogger.warn(`[LocalFileStorage] readFile failed: ${key}`, e);
      return null;
    }
  }

  async readFileAsBase64(key: string): Promise<string | null> {
    try {
      const filePath = await this.resolvePath(key);
      if (!(await this.isPathAllowed(filePath))) {
        errorLogger.warn(`[LocalFileStorage] Path not allowed: ${key}`);
        return null;
      }
      try {
        await fsp.access(filePath);
      } catch {
        return null;
      }
      const buffer = await fsp.readFile(filePath);
      const mime = getMimeFromExt(filePath);
      return `data:${mime};base64,${buffer.toString("base64")}`;
    } catch (e) {
      errorLogger.warn(`[LocalFileStorage] readFileAsBase64 failed: ${key}`, e);
      return null;
    }
  }

  async deleteFile(key: string): Promise<boolean> {
    try {
      const filePath = await this.resolvePath(key);
      if (!(await this.isPathAllowed(filePath))) {
        errorLogger.warn(`[LocalFileStorage] Path not allowed: ${key}`);
        return false;
      }
      try {
        await fsp.access(filePath);
      } catch {
        return false;
      }
      await fsp.unlink(filePath);
      return true;
    } catch (e) {
      errorLogger.warn(`[LocalFileStorage] deleteFile failed: ${key}`, e);
      return false;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const filePath = await this.resolvePath(key);
      if (!(await this.isPathAllowed(filePath))) return false;
      try {
        await fsp.access(filePath);
        return true;
      } catch {
        return false;
      }
    } catch {
      return false;
    }
  }

  async copyFile(params: CopyFileParams): Promise<{ key: string }> {
    const { sourceKey, targetCategory, targetKey } = params;
    await this.ensureDir(targetCategory);

    const sourcePath = await this.resolvePath(sourceKey);
    if (!(await this.isPathAllowed(sourcePath))) {
      throw new Error(`Source path not allowed: ${sourceKey}`);
    }
    try {
      await fsp.access(sourcePath);
    } catch {
      throw new Error(`Source file not found: ${sourceKey}`);
    }

    const sourceExt = path.extname(sourcePath);
    const finalTargetKey = targetKey.includes(".") ? targetKey : `${targetKey}${sourceExt}`;
    const targetPath = await this.resolvePath(finalTargetKey, targetCategory);

    await fsp.copyFile(sourcePath, targetPath);
    return { key: finalTargetKey };
  }

  async listFiles(category: FileCategory): Promise<FileMetadata[]> {
    const dir = CATEGORY_DIRS[category];
    try {
      await fsp.access(dir);
    } catch {
      return [];
    }

    // 大目录保护：与 file/list HTTP 路由保持一致的上限与并发策略。
    // 渲染进程直接走此实现（不走 HTTP），故必须同样保护。
    const files = await fsp.readdir(dir);
    let scannedFiles = files;
    if (files.length > LocalFileStorage.MAX_DIR_SCAN) {
      scannedFiles = files.slice(0, LocalFileStorage.MAX_DIR_SCAN);
    }

    const results: FileMetadata[] = [];
    for (let i = 0; i < scannedFiles.length; i += LocalFileStorage.STAT_BATCH_SIZE) {
      const batch = scannedFiles.slice(i, i + LocalFileStorage.STAT_BATCH_SIZE);
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
          } as FileMetadata;
        }),
      );
      for (const r of settled) {
        if (r.status === "fulfilled" && r.value) {
          results.push(r.value);
        }
      }
    }
    return results;
  }

  async getFileInfo(key: string): Promise<FileMetadata | null> {
    try {
      const filePath = await this.resolvePath(key);
      if (!(await this.isPathAllowed(filePath))) return null;
      try {
        await fsp.access(filePath);
      } catch {
        return null;
      }
      const stat = await fsp.stat(filePath);

      // 从路径推断 category
      const normalizedPath = path.resolve(filePath);
      let category: FileCategory = "upload";
      for (const [cat, dir] of Object.entries(CATEGORY_DIRS)) {
        if (LocalFileStorage.isUnderRoot(normalizedPath, dir)) {
          category = cat as FileCategory;
          break;
        }
      }

      return {
        key,
        category,
        size: stat.size,
        mimeType: getMimeFromExt(filePath),
        createdAt: Math.floor(stat.birthtime.getTime() / 1000),
        updatedAt: Math.floor(stat.mtime.getTime() / 1000),
      };
    } catch {
      return null;
    }
  }

  async ensureDir(category: FileCategory): Promise<void> {
    const dir = CATEGORY_DIRS[category];
    try {
      await fsp.access(dir);
    } catch {
      await fsp.mkdir(dir, { recursive: true });
    }
  }

  async writeFileAtomic(params: WriteFileAtomicParams): Promise<{ key: string }> {
    const { category, key, data } = params;
    await this.ensureDir(category);

    const filePath = await this.resolvePath(key, category);
    if (!(await this.isPathAllowed(filePath))) {
      throw new Error(`Path not allowed: ${key}`);
    }

    const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
    const buffer = typeof data === "string" ? Buffer.from(data, "utf-8") : data;

    try {
      await fsp.writeFile(tmpPath, buffer);
      await fsp.rename(tmpPath, filePath);
    } catch (e) {
      // 清理临时文件
      try {
        await fsp.unlink(tmpPath);
      } catch {
        // 忽略清理失败（包括文件不存在）
      }
      throw e;
    }
    return { key };
  }
}
