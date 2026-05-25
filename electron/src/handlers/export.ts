import { ipcMain, dialog } from "electron";
import fs from "fs";
import path from "path";
import os from "os";
import { getLogger } from "../logging/logger";

const logger = getLogger("export");

const BLOCKED_PATHS: string[] = [
  path.join(os.homedir(), "AppData", "Roaming", "Microsoft", "Windows"),
  path.join(os.homedir(), "AppData", "Local", "Microsoft"),
  "C:\\Windows",
  "C:\\Program Files",
  "C:\\Program Files (x86)",
  "/usr/bin",
  "/bin",
  "/sbin",
  "/etc",
  "/System",
];

function isPathBlocked(filePath: string): boolean {
  const resolved = path.resolve(filePath).toLowerCase();
  return BLOCKED_PATHS.some((blocked) =>
    resolved.startsWith(blocked.toLowerCase()),
  );
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

        if (isPathBlocked(filePath)) {
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
