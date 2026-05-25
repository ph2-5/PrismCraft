const PREFIX = "ai_anim_studio_";
import { errorLogger } from "@/shared/error-logger";
import { safeJsonParse } from "@/shared/utils/safe-json";

function makeKey(key: string): string {
  return `${PREFIX}${key}`;
}

export const preferencesStorage = {
  get<T>(key: string, defaultValue: T): T {
    if (typeof window === "undefined") return defaultValue;
    try {
      const raw = localStorage.getItem(makeKey(key));
      if (raw === null) return defaultValue;
      return safeJsonParse(raw, null) as T;
    } catch (e) {
      errorLogger.warn("[Preferences] Failed to parse stored value", e);
      return defaultValue;
    }
  },

  set<T>(key: string, value: T): void {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(makeKey(key), JSON.stringify(value));
    } catch (e) {
      errorLogger.warn("[Preferences] Failed to set value", e);
    }
  },

  remove(key: string): void {
    if (typeof window === "undefined") return;
    try {
      localStorage.removeItem(makeKey(key));
    } catch (e) {
      errorLogger.warn("[Preferences] Failed to remove value", e);
    }
  },

  has(key: string): boolean {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(makeKey(key)) !== null;
  },
};
