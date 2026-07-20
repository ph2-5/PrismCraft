import { z } from "zod";
import type { Result } from "@/domain/types";
import { ok, err, AppError, ValidationError } from "@/domain/types";
import { container } from "@/infrastructure/di";
import { safeRun, safeQuery } from "@/shared/db-core";
import { sanitizeIdentifier, sanitizeTable } from "@/shared/sql-safety";
import { errorLogger, extractErrorMessage } from "@/shared/error-logger";
import { t, BLOB_URL_LONG_REVOKE_DELAY_MS } from "@/shared/constants";
import { writeFile as fileHttpWriteFile, fileExists, getCacheDirectory } from "@/shared/file-http";

export const importDataSchema = z.object({
  characters: z.array(z.record(z.string(), z.unknown())).optional(),
  scenes: z.array(z.record(z.string(), z.unknown())).optional(),
  stories: z.array(z.record(z.string(), z.unknown())).optional(),
  videoTasks: z.array(z.record(z.string(), z.unknown())).optional(),
  mediaAssets: z.array(z.record(z.string(), z.unknown())).optional(),
  assets: z.array(z.record(z.string(), z.unknown())).optional(),
  videoTemplates: z.array(z.record(z.string(), z.unknown())).optional(),
  storyVersions: z.array(z.record(z.string(), z.unknown())).optional(),
  storyboardAssets: z.array(z.record(z.string(), z.unknown())).optional(),
  collections: z.array(z.record(z.string(), z.unknown())).optional(),
  collectionAssets: z.array(z.record(z.string(), z.unknown())).optional(),
  autoSaves: z.array(z.record(z.string(), z.unknown())).optional(),
  errorLogs: z.array(z.record(z.string(), z.unknown())).optional(),
  sessions: z.array(z.record(z.string(), z.unknown())).optional(),
  version: z.string().optional(),
  exportedAt: z.string().optional(),
});

export type ImportData = z.infer<typeof importDataSchema>;

export const importResultSchema = z.object({
  success: z.boolean(),
  imported: z.record(z.string(), z.number()),
  errors: z.array(z.string()),
  // 跨机器导入时的图片路径迁移统计
  migration: z.object({
    cleared: z.number(),
    remapped: z.number(),
  }).optional(),
});

export type ImportResult = z.infer<typeof importResultSchema>;

export const mergeStrategySchema = z.enum(["replace", "merge", "skip"]);

export type MergeStrategy = z.infer<typeof mergeStrategySchema>;

function validateImportData(data: unknown): Result<ImportData> {
  const parsed = importDataSchema.safeParse(data);
  if (!parsed.success) {
    return err(new ValidationError(parsed.error.message));
  }

  const validData = parsed.data;
  const dataKeys = [
    "characters", "scenes", "stories", "videoTasks", "mediaAssets",
    "assets", "videoTemplates", "storyVersions", "storyboardAssets",
    "collections", "collectionAssets", "autoSaves", "errorLogs", "sessions",
  ] as const;

  const hasAnyData = dataKeys.some(
    (key) => Array.isArray(validData[key]) && validData[key].length > 0,
  );

  if (!hasAnyData) {
    return err(new ValidationError(t("error.noImportData")));
  }

  return ok(validData);
}

async function deleteExcludingIds(table: string, idColumn: string, keepIds: string[]): Promise<void> {
  const safeTable = sanitizeTable(table);
  const safeIdCol = sanitizeIdentifier(idColumn);
  if (keepIds.length === 0) {
    await safeRun(`DELETE FROM ${safeTable}`);
    return;
  }
  const placeholders = keepIds.map(() => "?").join(",");
  await safeRun(
    `DELETE FROM ${safeTable} WHERE ${safeIdCol} NOT IN (${placeholders})`,
    keepIds,
  );
}

interface ImportItemsOptions<T> {
  items: T[];
  createFn: (item: T) => Promise<unknown>;
  getId?: (item: T) => string | undefined;
  errorCode: string;
  errorLabel: string;
  replaceTable?: { table: string; idColumn: string };
  mergeStrategy: MergeStrategy;
  onReplaceAll?: () => Promise<void>;
}

async function importItems<T>(opts: ImportItemsOptions<T>): Promise<{ count: number; errors: string[] }> {
  const { items, createFn, getId, errorCode, errorLabel, replaceTable, mergeStrategy, onReplaceAll } = opts;
  const errors: string[] = [];
  const importedIds: string[] = [];
  let count = 0;

  if (mergeStrategy === "replace" && onReplaceAll && items.length > 0) {
    await onReplaceAll();
  }

  for (const item of items) {
    try {
      await createFn(item);
      count++;
      const id = getId?.(item);
      if (id) importedIds.push(id);
    } catch (e) {
      const msg = `[Import] ${errorLabel} skip: ${e instanceof Error ? e.message : String(e)}`;
      errorLogger.warn({ code: errorCode, message: msg }, String(e));
      errors.push(msg);
    }
  }

  if (mergeStrategy === "replace" && replaceTable && importedIds.length > 0) {
    await deleteExcludingIds(replaceTable.table, replaceTable.idColumn, importedIds);
  }

  return { count, errors };
}

// ===== 跨机器图片路径迁移 =====

// 已知的图片/媒体路径字段名集合（覆盖 characters/scenes/outfits/story_beats 等表）
const IMAGE_PATH_FIELDS: ReadonlySet<string> = new Set([
  "image_path",
  "thumbnail_path",
  "avatar_path",
  "avatar_url",
  "preview_path",
  "ref_image_path",
  "generated_image",
  "image_url",
  "local_image_path",
  "local_video_path",
  "local_keyframe_path",
  "local_first_frame_path",
  "local_last_frame_path",
  "src",
]);

// 判断是否为远程/协议路径（http、data、file、vcache、icache、/api/），无需迁移
function isProtocolPath(p: string): boolean {
  return (
    p.startsWith("http://") ||
    p.startsWith("https://") ||
    p.startsWith("data:") ||
    p.startsWith("file://") ||
    p.startsWith("vcache://") ||
    p.startsWith("icache://") ||
    p.startsWith("/api/")
  );
}

// 判断是否为绝对路径（Windows 盘符如 C:\ 或 Unix 根路径 /）
function isAbsolutePath(p: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith("/") || p.startsWith("\\");
}

// 路径拼接（不依赖 node:path，兼容渲染进程环境）
function joinPath(base: string, relative: string): string {
  const normalizedBase = base.replace(/[\\/]+$/, "");
  const normalizedRelative = relative.replace(/^[\\/]+/, "");
  return `${normalizedBase}/${normalizedRelative}`;
}

// 从缓存目录（USER_DATA_ROOT/Cache/Videos）推导 Assets 目录（USER_DATA_ROOT/Assets）
function deriveAssetsDirFromCacheDir(cacheDir: string): string | null {
  const normalized = cacheDir.replace(/\\/g, "/").replace(/\/+$/, "");
  const segments = normalized.split("/");
  // 至少需要 3 段（如 C:/Users/PrismCraft/Cache/Videos）
  if (segments.length < 3) return null;
  // 去掉最后两级（Cache/Videos），得到 userData 根目录
  const rootSegments = segments.slice(0, -2);
  const root = rootSegments.join("/");
  if (!root) return null;
  return `${root}/Assets`;
}

// 路径迁移统计
export interface MigrationStats {
  // 清空的不存在绝对路径数
  cleared: number;
  // 重映射的相对路径数（在目标机器找到并改写为本地路径）
  remapped: number;
}

/**
 * 迁移单条记录的单个字段路径。
 *
 * - 远程/协议路径：跳过
 * - 绝对路径：目标机器不存在则清空
 * - 相对路径：在 userDataImagesDir 下查找，找到则改写为本地绝对路径
 *
 * 返回 "skipped" | "cleared" | "remapped" | "kept"。
 */
async function migrateRecordField(
  record: Record<string, unknown>,
  field: string,
  userDataImagesDir: string,
): Promise<"skipped" | "cleared" | "remapped" | "kept"> {
  const raw = record[field];
  if (typeof raw !== "string" || raw === "") return "skipped";
  // 远程/协议路径：跳过
  if (isProtocolPath(raw)) return "skipped";

  if (isAbsolutePath(raw)) {
    // 绝对路径：检查目标机器上是否存在
    const exists = await fileExists(raw);
    if (!exists) {
      record[field] = null;
      errorLogger.warn(
        "[Import] 路径迁移：清空不存在的绝对路径",
        { field, path: raw },
      );
      return "cleared";
    }
    return "kept";
  }

  // 相对路径：在目标机器的 userData 图片目录下查找
  const candidatePath = joinPath(userDataImagesDir, raw);
  const exists = await fileExists(candidatePath);
  if (exists) {
    record[field] = candidatePath;
    return "remapped";
  }
  // 未找到时保留原值（可能由 LocalFileStorage 按类别目录解析）
  return "kept";
}

/**
 * 跨机器导入时迁移图片路径。
 *
 * - 绝对路径：若目标机器上文件不存在，清空该字段（让 UI 显示占位图）
 * - 相对路径：在 userDataImagesDir 下查找，找到则改写为本地绝对路径
 * - 远程/协议路径（http、data: 等）：跳过，不处理
 *
 * 该函数直接修改 data 中的行对象（原地迁移），同时返回统计信息。
 *
 * @param data 已通过 schema 校验的导入数据
 * @param userDataImagesDir 目标机器的 userData 图片基础目录
 */
export async function migrateImagePaths(
  data: ImportData,
  userDataImagesDir: string,
): Promise<MigrationStats> {
  const stats: MigrationStats = { cleared: 0, remapped: 0 };

  for (const value of Object.values(data)) {
    if (!Array.isArray(value)) continue;
    for (const row of value) {
      if (row === null || typeof row !== "object") continue;
      const record = row as Record<string, unknown>;
      for (const field of IMAGE_PATH_FIELDS) {
        const result = await migrateRecordField(record, field, userDataImagesDir);
        if (result === "cleared") stats.cleared++;
        else if (result === "remapped") stats.remapped++;
      }
    }
  }

  return stats;
}

/** 跨机器路径迁移：获取本地图片目录，检测并修正导入数据中的图片路径 */
async function runImageMigration(validData: ImportData): Promise<MigrationStats | undefined> {
  try {
    const cacheDirResult = await getCacheDirectory();
    if (!cacheDirResult.success || !cacheDirResult.path) return undefined;
    const assetsDir = deriveAssetsDirFromCacheDir(cacheDirResult.path);
    if (!assetsDir) return undefined;

    const stats = await migrateImagePaths(validData, assetsDir);
    if (stats.cleared > 0 || stats.remapped > 0) {
      errorLogger.warn(
        "[Import] 路径迁移完成",
        { cleared: stats.cleared, remapped: stats.remapped },
      );
    }
    return stats;
  } catch (e) {
    // 路径迁移失败不阻断导入流程
    errorLogger.warn("[Import] 路径迁移失败，跳过", e instanceof Error ? e : new Error(String(e)));
    return undefined;
  }
}

/** 构建 storage 所需的 dataForStorage 对象（含 mediaAssets → assets 兼容） */
function buildDataForStorage(validData: ImportData): Record<string, unknown[]> {
  const dataForStorage: Record<string, unknown[]> = {};
  for (const [key, value] of Object.entries(validData)) {
    if (Array.isArray(value)) {
      dataForStorage[key] = value;
    }
  }
  if (validData.mediaAssets && !validData.assets) {
    dataForStorage.assets = validData.mediaAssets;
  }
  return dataForStorage;
}

/** 导入 videoTemplates（若存在） */
async function importVideoTemplates(
  validData: ImportData,
  mergeStrategy: MergeStrategy,
): Promise<{ count: number; errors: string[] }> {
  if (!validData.videoTemplates?.length) return { count: 0, errors: [] };
  return await importItems({
    items: validData.videoTemplates,
    createFn: (template) => container.templateStorage.createVideoTemplate(template),
    getId: (template) => (template.id && typeof template.id === "string" ? template.id : undefined),
    errorCode: "IMPORT_VIDEO_TEMPLATE_SKIP",
    errorLabel: "videoTemplate",
    replaceTable: { table: "video_templates", idColumn: "id" },
    mergeStrategy,
  });
}

/** 导入 autoSaves（若存在） */
async function importAutoSaves(
  validData: ImportData,
  mergeStrategy: MergeStrategy,
): Promise<{ count: number; errors: string[] }> {
  if (!validData.autoSaves?.length) return { count: 0, errors: [] };
  return await importItems({
    items: validData.autoSaves,
    createFn: (save) => container.autoSaveStorage.createAutoSave({
      id: save.id as string,
      type: save.type as string,
      data: (save as Record<string, unknown>).data_json || save.data,
      timestamp: save.timestamp as number,
    }),
    getId: (save) => (save.id && typeof save.id === "string" ? save.id : undefined),
    errorCode: "IMPORT_AUTO_SAVE_SKIP",
    errorLabel: "autoSave",
    replaceTable: { table: "auto_saves", idColumn: "id" },
    mergeStrategy,
  });
}

/** 导入 errorLogs（若存在） */
async function importErrorLogs(
  validData: ImportData,
  mergeStrategy: MergeStrategy,
): Promise<{ count: number; errors: string[] }> {
  if (!validData.errorLogs?.length) return { count: 0, errors: [] };
  return await importItems({
    items: validData.errorLogs,
    createFn: (log) => container.errorLogStorage.addErrorLog({
      message: log.message as string,
      stack: log.stack as string | undefined,
      timestamp: log.timestamp as number,
      component: log.component as string | undefined,
    }),
    errorCode: "IMPORT_ERROR_LOG_SKIP",
    errorLabel: "errorLog",
    mergeStrategy,
    onReplaceAll: async () => { await safeRun("DELETE FROM error_logs"); },
  });
}

/** 导入 sessions（若存在） */
async function importSessions(
  validData: ImportData,
  mergeStrategy: MergeStrategy,
): Promise<{ count: number; errors: string[] }> {
  if (!validData.sessions?.length) return { count: 0, errors: [] };
  return await importItems({
    items: validData.sessions,
    createFn: (session) => container.sessionStorage.setSession(session.key as string, session.value),
    getId: (session) => (session.key && typeof session.key === "string" ? session.key : undefined),
    errorCode: "IMPORT_SESSION_SKIP",
    errorLabel: "session",
    replaceTable: { table: "sessions", idColumn: "key" },
    mergeStrategy,
  });
}

export async function importData(
  data: unknown,
  options: { mergeStrategy?: MergeStrategy } = {},
): Promise<Result<ImportResult>> {
  const validation = validateImportData(data);
  if (!validation.ok) {
    return err(validation.error);
  }

  const validData = validation.value;
  const { mergeStrategy = "merge" } = options;
  const errors: string[] = [];
  const imported: Record<string, number> = {};

  try {
    // 1. 跨机器路径迁移
    const migrationStats = await runImageMigration(validData);

    // 2. 主存储导入
    const dataForStorage = buildDataForStorage(validData);
    const storageResult = await container.importExportStorage.importData(dataForStorage, mergeStrategy);
    Object.assign(imported, storageResult);

    // 3. 各可选集合导入
    const [videoTemplates, autoSaves, errorLogs, sessions] = await Promise.all([
      importVideoTemplates(validData, mergeStrategy),
      importAutoSaves(validData, mergeStrategy),
      importErrorLogs(validData, mergeStrategy),
      importSessions(validData, mergeStrategy),
    ]);

    pushImportResults(errors, imported, "videoTemplates", videoTemplates);
    pushImportResults(errors, imported, "autoSaves", autoSaves);
    pushImportResults(errors, imported, "errorLogs", errorLogs);
    pushImportResults(errors, imported, "sessions", sessions);

    return ok({ success: true, imported, errors, migration: migrationStats });
  } catch (error) {
    const msg = extractErrorMessage(error);
    return err(new AppError("IMPORT_ERROR", msg, error));
  }
}

/** 将单个集合的导入结果合并到全局 errors/imported */
function pushImportResults(
  errors: string[],
  imported: Record<string, number>,
  key: string,
  result: { count: number; errors: string[] },
): void {
  errors.push(...result.errors);
  imported[key] = result.count;
}

export async function exportData(): Promise<Result<ImportData>> {
  try {
    const [data, autoSaves, errorLogs, sessions] = await Promise.all([
      container.importExportStorage.exportAll(),
      container.autoSaveStorage.getAutoSaves(),
      container.errorLogStorage.getErrorLogs(),
      safeQuery("SELECT * FROM sessions"),
    ]);

    const result: ImportData = {
      ...data,
      mediaAssets: (data.assets || []) as Record<string, unknown>[],
      autoSaves: (autoSaves || []) as Record<string, unknown>[],
      errorLogs: (errorLogs || []) as Record<string, unknown>[],
      sessions: (sessions || []) as Record<string, unknown>[],
      version: "1.0",
      exportedAt: new Date().toISOString(),
    };
    return ok(result);
  } catch (e) {
    if (e instanceof AppError) return err(e);
    return err(new AppError("EXPORT_ERROR", e instanceof Error ? e.message : String(e), e));
  }
}

export async function downloadExport(): Promise<Result<void>> {
  const exportResult = await exportData();
  if (!exportResult.ok) return exportResult as Result<void>;

  try {
    const jsonStr = JSON.stringify(exportResult.value, null, 2);
    const defaultName = `ai-animation-studio-export-${new Date().toISOString().split("T")[0]}.json`;

    const electronAPI = window.electronAPI;

    if (electronAPI?.saveFileDialog) {
      const result = await electronAPI.saveFileDialog({
        defaultPath: defaultName,
        filters: [{ name: "ASA Export", extensions: ["json"] }],
      });
      if (result.success && result.filePath) {
        const writeResult = await fileHttpWriteFile(result.filePath, jsonStr);
        if (!writeResult.success) {
          throw new Error(writeResult.error || "写入文件失败");
        }
        return ok(undefined);
      }
      return ok(undefined);
    }

    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = defaultName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), BLOB_URL_LONG_REVOKE_DELAY_MS);

    return ok(undefined);
  } catch (e) {
    return err(new AppError("EXPORT_ERROR", e instanceof Error ? e.message : String(e), e));
  }
}

export async function importFromFile(file: File): Promise<Result<ImportResult>> {
  try {
    const content = await file.text();
    let data: unknown;
    try {
      data = JSON.parse(content);
    } catch (e) {
      errorLogger.warn("[ImportExport] Failed to parse import file as JSON", e as Error);
      return err(new ValidationError(t("error.invalidJsonFormat")));
    }
    const result = await importData(data);
    if (!result.ok) return result;
    return ok(result.value);
  } catch (e) {
    if (e instanceof AppError) return err(e);
    return err(new AppError("IMPORT_ERROR", e instanceof Error ? e.message : String(e), e));
  }
}
