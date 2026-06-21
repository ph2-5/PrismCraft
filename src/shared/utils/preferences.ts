const PREFIX = "ai_anim_studio_";
import { useSyncExternalStore, useCallback } from "react";
import { errorLogger } from "@/shared/error-logger";
import { safeJsonParse } from "@/shared/utils/safe-json";

function makeKey(key: string): string {
  return `${PREFIX}${key}`;
}

const preferenceListeners = new Map<string, Set<() => void>>();

function getListeners(key: string): Set<() => void> {
  let listeners = preferenceListeners.get(key);
  if (!listeners) {
    listeners = new Set();
    preferenceListeners.set(key, listeners);
  }
  return listeners;
}

function emitChange(key: string): void {
  const listeners = preferenceListeners.get(key);
  if (listeners) {
    listeners.forEach((l) => l());
  }
}

let storageEventHandler: ((e: StorageEvent) => void) | null = null;

if (typeof window !== "undefined") {
  storageEventHandler = (e: StorageEvent) => {
    if (e.key && e.key.startsWith(PREFIX)) {
      const rawKey = e.key.slice(PREFIX.length);
      emitChange(rawKey);
    }
  };
  window.addEventListener("storage", storageEventHandler);
}

/** 清理 preferences 的 storage 事件监听器（测试/HMR 场景使用） */
export function cleanupPreferencesListener(): void {
  if (storageEventHandler && typeof window !== "undefined") {
    window.removeEventListener("storage", storageEventHandler);
    storageEventHandler = null;
  }
}

export const preferencesStorage = {
  get<T>(key: string, defaultValue: T): T {
    if (typeof window === "undefined") return defaultValue;
    try {
      const raw = localStorage.getItem(makeKey(key));
      if (raw === null) return defaultValue;
      // Safe: T is guaranteed by defaultValue type constraint
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
    emitChange(key);
  },

  remove(key: string): void {
    if (typeof window === "undefined") return;
    try {
      localStorage.removeItem(makeKey(key));
    } catch (e) {
      errorLogger.warn("[Preferences] Failed to remove value", e);
    }
    emitChange(key);
  },

  has(key: string): boolean {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(makeKey(key)) !== null;
  },
};

const snapshotCache = new Map<string, { raw: string | null; parsed: unknown }>();

export function usePreference<T>(key: string, defaultValue: T): [T, (value: T | ((prev: T) => T)) => void] {
  const subscribe = useCallback(
    (callback: () => void) => {
      const listeners = getListeners(key);
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    },
    [key],
  );

  const getSnapshot = useCallback(() => {
    const storageKey = makeKey(key);
    const raw = typeof window !== "undefined" ? localStorage.getItem(storageKey) : null;
    const cached = snapshotCache.get(key);
    if (cached && cached.raw === raw) {
      // Safe: T is guaranteed by defaultValue type constraint
      return cached.parsed as T;
    }
    const parsed = preferencesStorage.get(key, defaultValue);
    snapshotCache.set(key, { raw, parsed });
    return parsed;
  }, [key, defaultValue]);

  const getServerSnapshot = useCallback(() => {
    return defaultValue;
  }, [defaultValue]);

  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setValue = useCallback(
    (next: T | ((prev: T) => T)) => {
      const current = preferencesStorage.get(key, defaultValue);
      const resolved = typeof next === "function" ? (next as (prev: T) => T)(current) : next;
      preferencesStorage.set(key, resolved);
    },
    [key, defaultValue],
  );

  return [value, setValue];
}
