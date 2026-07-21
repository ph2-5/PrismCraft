import fs from "fs";
import { promises as fsp } from "fs";
import path from "path";
import { ipcMain, dialog } from "electron";
import { getLogger } from "../logging/logger";
import {
  getUserDataRootDir,
  getAllUserDataDirs,
  isPathUnderAnyRoot,
} from "../app-paths";

const logger = getLogger("assets");

const USER_DATA_ROOT = getUserDataRootDir();

export const ASSETS_BASE_DIR = path.join(USER_DATA_ROOT, "Assets");

export const VIDEO_CACHE_DIR = path.join(USER_DATA_ROOT, "Cache", "Videos");

const ALLOWED_ASSET_ROOTS = getAllUserDataDirs();

async function isPathAllowed(filePath: string): Promise<boolean> {
  try {
    const resolved = await fsp.realpath(path.resolve(filePath));
    return isPathUnderAnyRoot(resolved, ALLOWED_ASSET_ROOTS);
  } catch {
    logger.warn("Failed to resolve asset path, falling back to path.resolve");
    const resolved = path.resolve(filePath);
    if (filePath.includes("..") || resolved.includes("..")) {
      return false;
    }
    return isPathUnderAnyRoot(resolved, ALLOWED_ASSET_ROOTS);
  }
}

function isFilenameSafe(filename: string): boolean {
  if (!filename || typeof filename !== "string") return false;
  const normalized = path.normalize(filename);
  if (normalized !== filename) return false;
  if (filename.includes("..")) return false;
  if (/[/\\]/.test(filename)) return false;
  return true;
}

const SUB_DIRS: Record<string, string> = {
  characters: path.join(ASSETS_BASE_DIR, "Characters"),
  scenes: path.join(ASSETS_BASE_DIR, "Scenes"),
  storyboards: path.join(ASSETS_BASE_DIR, "Storyboards"),
};

export async function ensureAssetsDir(): Promise<void> {
  if (!fs.existsSync(ASSETS_BASE_DIR)) {
    await fsp.mkdir(ASSETS_BASE_DIR, { recursive: true });
  }
  for (const dir of Object.values(SUB_DIRS)) {
    if (!fs.existsSync(dir)) {
      await fsp.mkdir(dir, { recursive: true });
    }
  }
}

export async function ensureVideoCacheDir(): Promise<string> {
  if (!fs.existsSync(VIDEO_CACHE_DIR)) {
    await fsp.mkdir(VIDEO_CACHE_DIR, { recursive: true });
  }
  return VIDEO_CACHE_DIR;
}

async function deleteAssetFile(filePath: string): Promise<boolean> {
  if (!(await isPathAllowed(filePath))) {
    logger.error("[Assets] Path not allowed:", undefined, { path: filePath });
    return false;
  }
  try {
    if (fs.existsSync(filePath)) {
      await fsp.unlink(filePath);
      return true;
    }
  } catch (e) {
    logger.error("[Assets] Failed to delete file:", e instanceof Error ? e : new Error(String(e)));
  }
  return false;
}

async function readAssetFileAsBase64(filePath: string): Promise<string | null> {
  if (!(await isPathAllowed(filePath))) {
    logger.error("[Assets] Path not allowed:", undefined, { path: filePath });
    return null;
  }
  try {
    if (!fs.existsSync(filePath)) return null;
    const buffer = await fsp.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase().replace(".", "");
    const mimeMap: Record<string, string> = {
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
    const mime = mimeMap[ext] || `image/${ext}`;
    return `data:${mime};base64,${buffer.toString("base64")}`;
  } catch (e) {
    logger.error("[Assets] Failed to read file:", e instanceof Error ? e : new Error(String(e)));
    return null;
  }
}

async function getAssetsDir(): Promise<string> {
  await ensureAssetsDir();
  return ASSETS_BASE_DIR;
}

/** dialog:open-file handler 实现（提取以降低 setupAssetHandlers 行数） */
async function handleDialogOpenFile(
  options?: Record<string, unknown>,
): Promise<{ success: boolean; error?: string; filePaths?: string[] }> {
  try {
    const safeOptions: Record<string, unknown> = { ...(options || {}) };
    delete safeOptions.properties;
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: (safeOptions.filters as Electron.FileFilter[]) || [
        { name: "Images", extensions: ["jpg", "jpeg", "png", "gif", "webp"] },
      ],
      ...safeOptions,
    });
    return { success: !result.canceled, filePaths: result.filePaths };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

/** dialog:save-file handler 实现（提取以降低 setupAssetHandlers 行数） */
async function handleDialogSaveFile(
  options?: Record<string, unknown>,
): Promise<{ success: boolean; error?: string; filePath?: string }> {
  try {
    const safeOptions: Record<string, unknown> = { ...(options || {}) };
    delete safeOptions.properties;
    const result = await dialog.showSaveDialog({
      filters: (safeOptions.filters as Electron.FileFilter[]) || [
        { name: "ASA Files", extensions: ["asa"] },
      ],
      ...safeOptions,
    });
    return { success: !result.canceled, filePath: result.filePath };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

/** assets:save-buffer handler 实现（提取以降低 setupAssetHandlers 行数） */
async function handleAssetsSaveBuffer(
  buffer: ArrayBuffer | Buffer,
  subDir: string,
  filename: string,
): Promise<{ success: boolean; error?: string; filePath?: string }> {
  try {
    if (!isFilenameSafe(filename)) {
      return { success: false, error: "Invalid filename: " + filename };
    }
    await ensureAssetsDir();
    const targetDir = SUB_DIRS[subDir] || ASSETS_BASE_DIR;
    const filePath = path.join(targetDir, filename);
    await fsp.writeFile(filePath, Buffer.from(buffer as ArrayBufferLike));
    return { success: true, filePath };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

/** assets:copy-file handler 实现（提取以降低 setupAssetHandlers 行数） */
async function handleAssetsCopyFile(
  srcPath: string,
  subDir: string,
  filename: string,
): Promise<{ success: boolean; error?: string; filePath?: string }> {
  try {
    if (!(await isPathAllowed(srcPath))) {
      return { success: false, error: "Source path not allowed: " + srcPath };
    }
    if (!isFilenameSafe(filename)) {
      return { success: false, error: "Invalid filename: " + filename };
    }
    await ensureAssetsDir();
    const targetDir = SUB_DIRS[subDir] || ASSETS_BASE_DIR;
    const destPath = path.join(targetDir, filename);
    await fsp.copyFile(srcPath, destPath);
    return { success: true, filePath: destPath };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

/** fs:write-file handler 实现（提取以降低 setupAssetHandlers 行数） */
async function handleFsWriteFile(
  filePath: string,
  data: unknown,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!(await isPathAllowed(filePath))) {
      return { success: false, error: "Path not allowed" };
    }
    if (data === undefined || data === null) {
      return { success: false, error: "Data is required" };
    }
    const resolvedPath = path.resolve(filePath);
    const dir = path.dirname(resolvedPath);
    if (!(await isPathAllowed(dir))) {
      return { success: false, error: "Path not allowed" };
    }
    if (!fs.existsSync(dir)) {
      await fsp.mkdir(dir, { recursive: true });
    }
    const maxFileSize = 500 * 1024 * 1024;
    let buffer: Buffer;
    try {
      buffer = Buffer.from(data as ArrayBufferLike);
    } catch {
      logger.warn("Failed to convert data to Buffer", { resolvedPath });
      return { success: false, error: "Invalid data format" };
    }
    if (buffer.length > maxFileSize) {
      return { success: false, error: "File too large" };
    }
    await fsp.writeFile(resolvedPath, buffer);
    return { success: true };
  } catch (e) {
    logger.error("[Assets] fs:write-file error:", e instanceof Error ? e : new Error(String(e)));
    return { success: false, error: "Write failed" };
  }
}

/** fs:read-file handler 实现（提取以降低 setupAssetHandlers 行数） */
async function handleFsReadFile(
  filePath: string,
): Promise<{ success: boolean; error?: string; data?: Buffer }> {
  try {
    const resolvedPath = path.resolve(filePath);
    if (!(await isPathAllowed(resolvedPath))) {
      return { success: false, error: "Path not allowed" };
    }
    if (!fs.existsSync(resolvedPath)) {
      return { success: false, error: "File not found" };
    }
    const stats = await fsp.stat(resolvedPath);
    if (!stats.isFile()) {
      return { success: false, error: "Not a file" };
    }
    const maxFileSize = 500 * 1024 * 1024;
    if (stats.size > maxFileSize) {
      return { success: false, error: "File too large" };
    }
    const buffer = await fsp.readFile(resolvedPath);
    return { success: true, data: buffer };
  } catch (e) {
    logger.error("[Assets] fs:read-file error:", e instanceof Error ? e : new Error(String(e)));
    return { success: false, error: "Read failed" };
  }
}

/** image:normalize handler 实现（提取以降低 setupAssetHandlers 行数） */
async function handleImageNormalize(
  sharpModule: typeof import("sharp") | null,
  inputPath: string,
  outputPath: string | undefined,
  options: { maxWidth?: number; maxHeight?: number; format?: string; quality?: number } | undefined,
): Promise<{ success: boolean; error?: string; filePath?: string; width?: number; height?: number; size?: number; format?: string }> {
  if (!sharpModule) {
    return { success: false, error: "sharp not available" };
  }
  try {
    if (!(await isPathAllowed(inputPath))) {
      return { success: false, error: "Input path not allowed: " + inputPath };
    }
    if (outputPath && !(await isPathAllowed(outputPath))) {
      return { success: false, error: "Output path not allowed: " + outputPath };
    }
    let image = sharpModule(inputPath);
    const metadata = await image.metadata();
    const width = metadata.width;
    const height = metadata.height;

    if (options?.maxWidth || options?.maxHeight) {
      image = image.resize(options.maxWidth, options.maxHeight, {
        fit: "inside",
        withoutEnlargement: true,
      });
    }

    const format = options?.format || "jpeg";
    const quality = options?.quality || 90;
    let outputBuffer: Buffer;

    if (format === "png") {
      outputBuffer = await image.png({ quality }).toBuffer();
    } else if (format === "webp") {
      outputBuffer = await image.webp({ quality }).toBuffer();
    } else {
      outputBuffer = await image.jpeg({ quality }).toBuffer();
    }

    const finalOutputPath =
      outputPath ||
      inputPath.replace(
        /\.\w+$/,
        `_normalized.${format === "jpeg" ? "jpg" : format}`,
      );
    await fsp.writeFile(finalOutputPath, outputBuffer);

    return {
      success: true,
      filePath: finalOutputPath,
      width,
      height,
      size: outputBuffer.length,
      format,
    };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

/** image:to-base64 handler 实现（提取以降低 setupAssetHandlers 行数） */
async function handleImageToBase64(
  sharpModule: typeof import("sharp") | null,
  inputPath: string,
  format: string | undefined,
  quality: number | undefined,
): Promise<{ success: boolean; error?: string; base64?: string }> {
  if (!sharpModule) {
    if (!(await isPathAllowed(inputPath))) {
      return { success: false, error: "Path not allowed: " + inputPath };
    }
    if (fs.existsSync(inputPath)) {
      const buffer = await fsp.readFile(inputPath);
      const ext = path.extname(inputPath).toLowerCase().replace(".", "");
      const mime = ext === "jpg" ? "jpeg" : ext;
      return {
        success: true,
        base64: `data:image/${mime};base64,${buffer.toString("base64")}`,
      };
    }
    return {
      success: false,
      error: "File not found and sharp not available",
    };
  }
  try {
    if (!(await isPathAllowed(inputPath))) {
      return { success: false, error: "Path not allowed: " + inputPath };
    }
    const fmt = format || "jpeg";
    const q = quality || 90;
    const image = sharpModule(inputPath);
    let outputBuffer: Buffer;

    if (fmt === "png") {
      outputBuffer = await image.png({ quality: q }).toBuffer();
    } else if (fmt === "webp") {
      outputBuffer = await image.webp({ quality: q }).toBuffer();
    } else {
      outputBuffer = await image.jpeg({ quality: q }).toBuffer();
    }

    const base64 = outputBuffer.toString("base64");
    return { success: true, base64: `data:image/${fmt};base64,${base64}` };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export function setupAssetHandlers(): void {
  ipcMain.handle(
    "assets:delete-file",
    async (
      _event: Electron.IpcMainInvokeEvent,
      { filePath }: { filePath: string },
    ) => {
      try {
        const result = await deleteAssetFile(filePath);
        if (result) {
          return { success: true };
        }
        return { success: false, error: "File not found or path not allowed" };
      } catch (e) {
        return { success: false, error: (e as Error).message };
      }
    },
  );

  ipcMain.handle(
    "assets:read-file-base64",
    async (
      _event: Electron.IpcMainInvokeEvent,
      { filePath }: { filePath: string },
    ) => {
      const base64 = await readAssetFileAsBase64(filePath);
      return { success: !!base64, base64 };
    },
  );

  ipcMain.handle("assets:get-dir", async () => {
    return { success: true, dir: await getAssetsDir() };
  });

  ipcMain.handle(
    "assets:save-buffer",
    async (
      _event: Electron.IpcMainInvokeEvent,
      { buffer, subDir, filename }: {
        buffer: ArrayBuffer | Buffer;
        subDir: string;
        filename: string;
      },
    ) => handleAssetsSaveBuffer(buffer, subDir, filename),
  );

  ipcMain.handle(
    "assets:file-exists",
    async (
      _event: Electron.IpcMainInvokeEvent,
      { filePath }: { filePath: string },
    ) => {
      try {
        if (!(await isPathAllowed(filePath))) {
          return { success: false, exists: false, error: "Path not allowed" };
        }
        return { success: true, exists: fs.existsSync(filePath) };
      } catch {
        logger.warn("Failed to check asset file existence", { filePath });
        return { success: false, exists: false };
      }
    },
  );

  ipcMain.handle(
    "assets:copy-file",
    async (
      _event: Electron.IpcMainInvokeEvent,
      { srcPath, subDir, filename }: {
        srcPath: string;
        subDir: string;
        filename: string;
      },
    ) => handleAssetsCopyFile(srcPath, subDir, filename),
  );

  ipcMain.handle(
    "dialog:open-file",
    async (
      _event: Electron.IpcMainInvokeEvent,
      options?: Record<string, unknown>,
    ) => handleDialogOpenFile(options),
  );

  ipcMain.handle(
    "dialog:save-file",
    async (
      _event: Electron.IpcMainInvokeEvent,
      options?: Record<string, unknown>,
    ) => handleDialogSaveFile(options),
  );

  ipcMain.handle(
    "fs:write-file",
    async (
      _event: Electron.IpcMainInvokeEvent,
      { filePath, data }: { filePath: string; data: unknown },
    ) => handleFsWriteFile(filePath, data),
  );

  ipcMain.handle(
    "fs:read-file",
    async (
      _event: Electron.IpcMainInvokeEvent,
      { filePath }: { filePath: string },
    ) => handleFsReadFile(filePath),
  );

  ipcMain.handle("cache:get-cache-directory", async () => {
    try {
      const cacheDir = await ensureVideoCacheDir();
      return { success: true, path: cacheDir };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  });

  ipcMain.handle(
    "fs:get-file-info",
    async (
      _event: Electron.IpcMainInvokeEvent,
      { filePath }: { filePath: string },
    ) => {
      try {
        const resolvedPath = path.resolve(filePath);
        if (!(await isPathAllowed(resolvedPath))) {
          return { success: false, error: "Path not allowed" };
        }
        const stats = await fsp.stat(resolvedPath);
        return {
          success: true,
          size: stats.size,
        };
      } catch (e) {
        return { success: false, error: (e as Error).message };
      }
    },
  );

  ipcMain.handle(
    "fs:get-disk-space",
    async (
      _event: Electron.IpcMainInvokeEvent,
      { dirPath }: { dirPath: string },
    ) => {
      try {
        const resolvedPath = path.resolve(dirPath);
        if (!(await isPathAllowed(resolvedPath))) {
          return { success: false, error: "Path not allowed" };
        }
        const statfs = await fsp.statfs(resolvedPath);
        return {
          success: true,
          availableBytes: statfs.bavail * statfs.bsize,
          totalBytes: statfs.blocks * statfs.bsize,
        };
      } catch (e) {
        return { success: false, error: (e as Error).message };
      }
    },
  );

  let sharpModule: typeof import("sharp") | null = null;
  import("sharp")
    .then((mod) => { sharpModule = mod.default || mod; })
    .catch(() => { logger.warn("[Assets] sharp not available, image processing via IPC disabled"); });

  ipcMain.handle(
    "image:normalize",
    async (
      _event: Electron.IpcMainInvokeEvent,
      { inputPath, outputPath, options }: {
        inputPath: string;
        outputPath?: string;
        options?: {
          maxWidth?: number;
          maxHeight?: number;
          format?: string;
          quality?: number;
        };
      },
    ) => handleImageNormalize(sharpModule, inputPath, outputPath, options),
  );

  ipcMain.handle(
    "image:to-base64",
    async (
      _event: Electron.IpcMainInvokeEvent,
      { inputPath, format, quality }: {
        inputPath: string;
        format?: string;
        quality?: number;
      },
    ) => handleImageToBase64(sharpModule, inputPath, format, quality),
  );
}
