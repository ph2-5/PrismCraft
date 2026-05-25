import { z } from "zod";
import type { Result } from "@/domain/types";
import { ok, err, AppError, ValidationError } from "@/domain/types";
import { container } from "@/infrastructure/di";
import { errorLogger, extractErrorMessage } from "@/shared/error-logger";

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
    return err(new ValidationError("没有找到可导入的数据"));
  }

  return ok(validData);
}

export async function importData(
  data: unknown,
  options: { mergeStrategy?: MergeStrategy } = {},
): Promise<Result<ImportResult>> {
  const validation = validateImportData(data);
  if (!validation.ok) {
    return ok({ success: false, imported: {}, errors: [validation.error.message] });
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
      if (mergeStrategy === "replace") {
        await container.safeRun("DELETE FROM video_templates");
      }
      let count = 0;
      for (const template of validData.videoTemplates) {
        try {
          await container.templateStorage.createVideoTemplate(template);
          count++;
        } catch (e) {
          errorLogger.warn({ code: "IMPORT_VIDEO_TEMPLATE_SKIP", message: "[Import] videoTemplate skip" }, String(e));
        }
      }
      imported.videoTemplates = count;
    }

    if (validData.autoSaves?.length) {
      if (mergeStrategy === "replace") {
        await container.safeRun("DELETE FROM auto_saves");
      }
      let count = 0;
      for (const save of validData.autoSaves) {
        try {
          await container.autoSaveStorage.createAutoSave({
            id: save.id as string,
            type: save.type as string,
            data: (save as Record<string, unknown>).data_json || save.data,
            timestamp: save.timestamp as number,
          });
          count++;
        } catch (e) {
          errorLogger.warn({ code: "IMPORT_AUTO_SAVE_SKIP", message: "[Import] autoSave skip" }, String(e));
        }
      }
      imported.autoSaves = count;
    }

    if (validData.errorLogs?.length) {
      if (mergeStrategy === "replace") {
        await container.safeRun("DELETE FROM error_logs");
      }
      let count = 0;
      for (const log of validData.errorLogs) {
        try {
          await container.errorLogStorage.addErrorLog({
            message: log.message as string,
            stack: log.stack as string | undefined,
            timestamp: log.timestamp as number,
            component: log.component as string | undefined,
          });
          count++;
        } catch (e) {
          errorLogger.warn({ code: "IMPORT_ERROR_LOG_SKIP", message: "[Import] errorLog skip" }, String(e));
        }
      }
      imported.errorLogs = count;
    }

    if (validData.sessions?.length) {
      if (mergeStrategy === "replace") {
        await container.safeRun("DELETE FROM sessions");
      }
      let count = 0;
      for (const session of validData.sessions) {
        try {
          await container.sessionStorage.setSession(session.key as string, session.value);
          count++;
        } catch (e) {
          errorLogger.warn({ code: "IMPORT_SESSION_SKIP", message: "[Import] session skip" }, String(e));
        }
      }
      imported.sessions = count;
    }

    return ok({ success: true, imported, errors });
  } catch (error) {
    const msg = extractErrorMessage(error);
    return ok({ success: false, imported, errors: [...errors, msg] });
  }
}

export async function exportData(): Promise<Result<ImportData>> {
  try {
    const [data, autoSaves, errorLogs, sessions] = await Promise.all([
      container.importExportStorage.exportAll(),
      container.autoSaveStorage.getAutoSaves(),
      container.errorLogStorage.getErrorLogs(),
      container.safeQuery("SELECT * FROM sessions"),
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
        const encoder = new TextEncoder();
        const writeResult = await electronAPI.writeFile(
          result.filePath,
          Array.from(encoder.encode(jsonStr)),
        );
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
    setTimeout(() => URL.revokeObjectURL(url), 10000);

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
    } catch {
      return err(new ValidationError("文件内容不是有效的 JSON 格式"));
    }
    const result = await importData(data);
    if (!result.ok) return result;
    return ok(result.value);
  } catch (e) {
    if (e instanceof AppError) return err(e);
    return err(new AppError("IMPORT_ERROR", e instanceof Error ? e.message : String(e), e));
  }
}
