import { safeQuery, safeRun } from "./sqlite-core";
import { errorLogger } from "@/shared/error-logger";

export const sessionStorage = {
  async getSession(key: string): Promise<unknown | null> {
    const result = await safeQuery<{ value: string }>(
      "SELECT value FROM sessions WHERE key = ?",
      [key],
    );
    if (result.length > 0) {
      try {
        return JSON.parse(result[0].value);
      } catch (e) {
        errorLogger.debug(`[Storage] Failed to parse session value for key ${key}: ${e instanceof Error ? e.message : String(e)}`);
        return result[0].value;
      }
    }
    return null;
  },

  async setSession(key: string, value: unknown): Promise<void> {
    await safeRun(
      "INSERT OR REPLACE INTO sessions (id, key, value, timestamp) VALUES (?, ?, ?, ?)",
      [key, key, JSON.stringify(value), Math.floor(Date.now() / 1000)],
    );
  },
};
