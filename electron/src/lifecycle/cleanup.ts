import type { BrowserWindow } from "electron";
import { getLogger, loggerRegistry } from "../logging/logger";
import { closeDatabase } from "../database";
import { stopApiServer } from "../api-server";
import { closeStaticServer } from "../main-common";
import { shutdownAllProcessManagers } from "../plugins/plugin-process-manager";

const logger = getLogger("lifecycle:cleanup");

export interface CleanupOptions {
  mainWindow: BrowserWindow | null;
  reason: string;
}

export async function performCleanup(options: CleanupOptions): Promise<void> {
  const { mainWindow, reason } = options;

  logger.info(`[Lifecycle] Starting cleanup (reason: ${reason})...`);

  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      mainWindow.destroy();
      logger.info("[Lifecycle] Window destroyed");
    } catch (error) {
      logger.error("[Lifecycle] Failed to destroy window:", error instanceof Error ? error : new Error(String(error)));
    }
  }

  try {
    closeStaticServer();
    logger.info("[Lifecycle] Static server closed");
  } catch (error) {
    logger.error("[Lifecycle] Failed to close static server:", error instanceof Error ? error : new Error(String(error)));
  }

  try {
    stopApiServer();
    logger.info("[Lifecycle] API server stopped");
  } catch (error) {
    logger.error("[Lifecycle] Failed to stop API server:", error instanceof Error ? error : new Error(String(error)));
  }

  try {
    await shutdownAllProcessManagers();
    logger.info("[Lifecycle] Plugin processes shut down");
  } catch (error) {
    logger.error("[Lifecycle] Failed to shutdown plugin processes:", error instanceof Error ? error : new Error(String(error)));
  }

  try {
    closeDatabase();
    logger.info("[Lifecycle] Database closed");
  } catch (error) {
    logger.error("[Lifecycle] Failed to close database:", error instanceof Error ? error : new Error(String(error)));
  }

  logger.info("[Lifecycle] Cleanup completed");

  // 最后关闭日志 transport（清理 flushTimer 和 beforeExit 监听器，flush 残留日志）
  // 必须在所有其他清理之后，因为前面的步骤需要 logger 记录日志
  try {
    await loggerRegistry.closeAllTransports();
  } catch (error) {
    console.error("[Lifecycle] Failed to close logger transports:", error);
  }
}
