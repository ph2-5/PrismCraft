import { z } from "zod";
import type { Result } from "@/domain/types";
import { ok, err, AppError, ValidationError } from "@/domain/types";
import { container } from "@/infrastructure/di";
import { safeRun, safeQuery } from "@/shared/db-core";
import { sanitizeIdentifier, sanitizeTable } from "@/shared/sql-safety";
import { errorLogger, extractErrorMessage } from "@/shared/error-logger";
import { t, BLOB_URL_LONG_REVOKE_DELAY_MS } from "@/shared/constants";
import { writeFile as fileHttpWriteFile } from "@/shared/file-http";

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
    const dataForStorage: Record<string, unknown[]> = {};
    for (const [key, value] of Object.entries(validData)) {
      if (Array.isArray(value)) {
        dataForStorage[key] = value;
      }
    }
    if (validData.mediaAssets && !validData.assets) {
      dataForStorage.assets = validData.mediaAssets;
    }

    const storageResult = await container.importExportStorage.importData(dataForStorage, mergeStrategy);
    Object.assign(imported, storageResult);

    if (validData.videoTemplates?.length) {
      const result = await importItems({
        items: validData.videoTemplates,
        createFn: (template) => container.templateStorage.createVideoTemplate(template),
        getId: (template) => (template.id && typeof template.id === "string" ? template.id : undefined),
        errorCode: "IMPORT_VIDEO_TEMPLATE_SKIP",
        errorLabel: "videoTemplate",
        replaceTable: { table: "video_templates", idColumn: "id" },
        mergeStrategy,
      });
      errors.push(...result.errors);
      imported.videoTemplates = result.count;
    }

    if (validData.autoSaves?.length) {
      const result = await importItems({
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
      errors.push(...result.errors);
      imported.autoSaves = result.count;
    }

    if (validData.errorLogs?.length) {
      const result = await importItems({
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
      errors.push(...result.errors);
      imported.errorLogs = result.count;
    }

    if (validData.sessions?.length) {
      const result = await importItems({
        items: validData.sessions,
        createFn: (session) => container.sessionStorage.setSession(session.key as string, session.value),
        getId: (session) => (session.key && typeof session.key === "string" ? session.key : undefined),
        errorCode: "IMPORT_SESSION_SKIP",
        errorLabel: "session",
        replaceTable: { table: "sessions", idColumn: "key" },
        mergeStrategy,
      });
      errors.push(...result.errors);
      imported.sessions = result.count;
    }

    return ok({ success: true, imported, errors });
  } catch (error) {
    const msg = extractErrorMessage(error);
    return err(new AppError("IMPORT_ERROR", msg, error));
  }
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
