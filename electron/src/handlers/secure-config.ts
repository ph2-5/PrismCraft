import { ipcMain } from "electron";
import { keyStorage } from "../security/key-storage/key-storage";
import { getLogger } from "../logging/logger";

const logger = getLogger("secure-config");

export function registerSecureConfigHandlers(): void {
  ipcMain.handle(
    "secure-config:save",
    async (_event, providerId: string, apiKey: string) => {
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
    async (_event, providerId: string) => {
      try {
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
      try {
        const result = await keyStorage.load(`api-key:${providerId}`);
        return { success: true, hasKey: result.ok && !!result.value };
      } catch (e) {
        return { success: false, hasKey: false };
      }
    },
  );
}
