import { ipcMain, BrowserWindow } from "electron";
import { keyStorage } from "../security/key-storage/key-storage";
import { getLogger } from "../logging/logger";

const logger = getLogger("secure-config");

/**
 * 校验调用方是否为主窗口，防止任意 renderer（含被 XSS 注入的脚本）
 * 通过此通道获取明文 apiKey。
 */
function isFromMainWindow(sender: Electron.WebContents): boolean {
  const allWindows = BrowserWindow.getAllWindows();
  return allWindows.some((w) => w.webContents === sender);
}

/**
 * 校验 providerId 格式：仅允许字母、数字、下划线、连字符，最长 128 字符。
 * 防止注入特殊字符或填充 keyStorage 占满磁盘。
 */
function isValidProviderId(providerId: unknown): providerId is string {
  return (
    typeof providerId === "string" &&
    providerId.length > 0 &&
    providerId.length <= 128 &&
    /^[a-zA-Z0-9_-]+$/.test(providerId)
  );
}

/**
 * 校验 apiKey：非空字符串，长度上限 4096，防止存储超长字符串导致存储异常。
 */
function isValidApiKey(apiKey: unknown): apiKey is string {
  return (
    typeof apiKey === "string" &&
    apiKey.length > 0 &&
    apiKey.length <= 4096
  );
}

export function registerSecureConfigHandlers(): void {
  ipcMain.handle(
    "secure-config:save",
    async (_event, providerId: string, apiKey: string) => {
      if (!isValidProviderId(providerId)) {
        return { success: false, error: "Invalid providerId" };
      }
      if (!isValidApiKey(apiKey)) {
        return { success: false, error: "Invalid apiKey" };
      }
      try {
        const result = await keyStorage.save(`api-key:${providerId}`, apiKey);
        if (result.ok) {
          logger.info(`API Key saved for provider: ${providerId}`);
          return { success: true };
        }
        logger.error(`Failed to save API Key for ${providerId}: ${result.error}`);
        return { success: false, error: result.error };
      } catch (e) {
        logger.error(`secure-config:save error: ${e}`);
        return { success: false, error: String(e) };
      }
    },
  );

  ipcMain.handle(
    "secure-config:load",
    async (_event, providerId: string) => {
      if (!isValidProviderId(providerId)) {
        return { success: false, hasKey: false };
      }
      try {
        const result = await keyStorage.load(`api-key:${providerId}`);
        if (result.ok) {
          return { success: true, hasKey: !!result.value };
        }
        return { success: false, hasKey: false };
      } catch (e) {
        logger.error(`secure-config:load error: ${e}`);
        return { success: false, hasKey: false };
      }
    },
  );

  ipcMain.handle(
    "secure-config:resolve",
    async (event, providerId: string) => {
      if (!isValidProviderId(providerId)) {
        return { success: false, apiKey: null };
      }
      try {
        // 限制只有主窗口能解析明文 apiKey，防止恶意 renderer 窃取
        if (!isFromMainWindow(event.sender)) {
          logger.warn(`secure-config:resolve rejected: caller is not main window (provider: ${providerId})`);
          return { success: false, apiKey: null };
        }
        const senderTitle = event.sender.getTitle?.() || "unknown";
        logger.info(`secure-config:resolve called for provider: ${providerId}, source: ${senderTitle}`);
        const result = await keyStorage.load(`api-key:${providerId}`);
        if (result.ok && result.value) {
          return { success: true, apiKey: result.value };
        }
        return { success: false, apiKey: null };
      } catch (e) {
        logger.error(`secure-config:resolve error: ${e}`);
        return { success: false, apiKey: null };
      }
    },
  );

  ipcMain.handle(
    "secure-config:delete",
    async (_event, providerId: string) => {
      if (!isValidProviderId(providerId)) {
        return { success: false };
      }
      try {
        const result = await keyStorage.delete(`api-key:${providerId}`);
        return { success: result.ok };
      } catch (e) {
        logger.error(`secure-config:delete error: ${e}`);
        return { success: false };
      }
    },
  );

  ipcMain.handle(
    "secure-config:has",
    async (_event, providerId: string) => {
      if (!isValidProviderId(providerId)) {
        return { success: false, hasKey: false };
      }
      try {
        const result = await keyStorage.load(`api-key:${providerId}`);
        return { success: true, hasKey: result.ok && !!result.value };
      } catch {
        return { success: false, hasKey: false };
      }
    },
  );
}
