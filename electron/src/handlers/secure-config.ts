import { ipcMain } from "electron";
import { keyStorage } from "../security/key-storage/key-storage";
import { getLogger } from "../logging/logger";

const logger = getLogger("secure-config");

const RESOLVE_RATE_LIMIT_MAX = 10;
const RESOLVE_RATE_LIMIT_WINDOW_MS = 60_000;

const resolveCallTimestamps = new Map<string, number[]>();

function checkResolveRateLimit(providerId: string): boolean {
  const now = Date.now();
  const windowStart = now - RESOLVE_RATE_LIMIT_WINDOW_MS;
  const timestamps = resolveCallTimestamps.get(providerId) || [];
  const validTimestamps = timestamps.filter((t) => t > windowStart);
  if (validTimestamps.length >= RESOLVE_RATE_LIMIT_MAX) {
    resolveCallTimestamps.set(providerId, validTimestamps);
    return false;
  }
  validTimestamps.push(now);
  resolveCallTimestamps.set(providerId, validTimestamps);
  return true;
}

const cleanupTimer = setInterval(() => {
  const now = Date.now();
  const windowStart = now - RESOLVE_RATE_LIMIT_WINDOW_MS;
  for (const [key, timestamps] of resolveCallTimestamps.entries()) {
    const valid = timestamps.filter((t) => t > windowStart);
    if (valid.length === 0) {
      resolveCallTimestamps.delete(key);
    } else {
      resolveCallTimestamps.set(key, valid);
    }
  }
}, 60_000);
if (cleanupTimer.unref) {
  cleanupTimer.unref();
}

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
    async (event, providerId: string) => {
      try {
        if (!checkResolveRateLimit(providerId)) {
          const senderTitle = event.sender.getTitle?.() || "unknown";
          logger.warn(`secure-config:resolve rate limit exceeded for provider: ${providerId}, source: ${senderTitle}`);
          return { success: false, apiKey: null, error: "Rate limit exceeded" };
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
