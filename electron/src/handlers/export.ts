import { ipcMain, dialog } from "electron";
import fs from "fs";
import path from "path";
import os from "os";
import { getLogger } from "../logging/logger";

const logger = getLogger("export");

const ALLOWED_EXPORT_DIRS: string[] = [
  path.join(os.homedir(), "Documents"),
  path.join(os.homedir(), "Desktop"),
  path.join(os.homedir(), "Downloads"),
  path.join(os.homedir(), "AI Animation Studio"),
];

/**
 * 校验导出路径是否在允许的目录内。
 *
 * 安全要点：必须匹配完整目录段，避免 `startsWith` 前缀绕过。
 * 例如 `Documents.evil\payload.json` 不应被 `Documents` 前缀放行。
 *
 * 匹配规则：
 * - 路径等于允许目录本身（直接写目录，虽然实际不会发生），或
 * - 路径以 `<allowed>+path.sep` 开头（即 allowed 是路径的一个完整目录段）
 *
 * 大小写不敏感（Windows 文件系统不区分大小写）。
 */
function isPathAllowed(filePath: string): boolean {
  const resolved = path.resolve(filePath).toLowerCase();
  return ALLOWED_EXPORT_DIRS.some((allowed) => {
    const allowedLower = allowed.toLowerCase();
    return resolved === allowedLower || resolved.startsWith(allowedLower + path.sep);
  });
}

export function registerExportHandlers(): void {
  ipcMain.handle(
    "export:data",
    async (
      _event: Electron.IpcMainInvokeEvent,
      data: unknown,
      options?: { filename?: string },
    ) => {
      try {
        const { filePath, canceled } = await dialog.showSaveDialog({
          title: "导出数据",
          defaultPath:
            options?.filename || `ai-animation-export-${Date.now()}.json`,
          filters: [
            { name: "JSON", extensions: ["json"] },
            { name: "All Files", extensions: ["*"] },
          ],
        });

        if (canceled || !filePath) {
          return { success: false, error: "用户取消导出" };
        }

        if (!isPathAllowed(filePath)) {
          return { success: false, error: "Cannot write to system directory" };
        }

        const content =
          typeof data === "string" ? data : JSON.stringify(data, null, 2);
        fs.writeFileSync(filePath, content, "utf-8");

        return { success: true, filePath };
      } catch (error) {
        logger.error("[Export] failed:", error instanceof Error ? error : new Error(String(error)));
        return { success: false, error: "Export failed" };
      }
    },
  );
}

export const handleExport = registerExportHandlers;
