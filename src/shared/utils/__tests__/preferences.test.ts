import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { localStorageMock } from "@/__tests__/setup";

const { mockSafeJsonParse } = vi.hoisted(() => ({
  mockSafeJsonParse: vi.fn(),
}));

const { mockErrorLogger } = vi.hoisted(() => ({
  mockErrorLogger: { warn: vi.fn() },
}));

vi.mock("@/shared/utils/safe-json", () => ({
  safeJsonParse: mockSafeJsonParse,
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: mockErrorLogger,
}));

import { preferencesStorage, usePreference } from "../preferences";

describe("preferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSafeJsonParse.mockReset();
  });

  describe("get", () => {
    it("should return defaultValue when key not found in localStorage", () => {
      const result = preferencesStorage.get("nonexistent", "default");
      expect(result).toBe("default");
    });

    it("should return stored value when key exists", () => {
      localStorageMock.getItem.mockReturnValue('"dark"');
      mockSafeJsonParse.mockReturnValue("dark");
      const result = preferencesStorage.get("theme", "light");
      expect(result).toBe("dark");
      expect(mockSafeJsonParse).toHaveBeenCalledWith('"dark"', null);
    });

    it("should apply prefix to key", () => {
      localStorageMock.getItem.mockReturnValue('"value"');
      mockSafeJsonParse.mockReturnValue("value");
      preferencesStorage.get("mykey", "");
      expect(localStorage.getItem).toHaveBeenCalledWith("ai_anim_studio_mykey");
    });

    it("should return defaultValue when localStorage throws", () => {
      localStorageMock.getItem.mockImplementation(() => {
        throw new Error("storage error");
      });
      const result = preferencesStorage.get("key", 42);
      expect(result).toBe(42);
      expect(mockErrorLogger.warn).toHaveBeenCalled();
    });

    it("should return null when safeJsonParse returns null fallback", () => {
      localStorageMock.getItem.mockReturnValue("corrupt{json");
      mockSafeJsonParse.mockReturnValue(null);
      const result = preferencesStorage.get("key", { default: true });
      expect(result).toBeNull();
    });

    it("should handle complex stored objects", () => {
      const stored = { timeout: 5000, retries: 3 };
      localStorageMock.getItem.mockReturnValue(JSON.stringify(stored));
      mockSafeJsonParse.mockReturnValue(stored);
      const result = preferencesStorage.get("config", {});
      expect(result).toEqual(stored);
    });
  });

  describe("set", () => {
    it("should store value as JSON with prefixed key", () => {
      preferencesStorage.set("theme", "dark");
      expect(localStorage.setItem).toHaveBeenCalledWith(
        "ai_anim_studio_theme",
        JSON.stringify("dark"),
      );
    });

    it("should store objects as JSON", () => {
      const config = { timeout: 5000, retries: 3 };
      preferencesStorage.set("config", config);
      expect(localStorage.setItem).toHaveBeenCalledWith(
        "ai_anim_studio_config",
        JSON.stringify(config),
      );
    });

    it("should store numbers as JSON", () => {
      preferencesStorage.set("count", 42);
      expect(localStorage.setItem).toHaveBeenCalledWith(
        "ai_anim_studio_count",
        "42",
      );
    });

    it("should store booleans as JSON", () => {
      preferencesStorage.set("enabled", true);
      expect(localStorage.setItem).toHaveBeenCalledWith(
        "ai_anim_studio_enabled",
        "true",
      );
    });

    it("should not throw when localStorage.setItem fails", () => {
      localStorageMock.setItem.mockImplementation(() => {
        throw new Error("quota exceeded");
      });
      expect(() => preferencesStorage.set("key", "value")).not.toThrow();
      expect(mockErrorLogger.warn).toHaveBeenCalled();
    });
  });

  describe("remove", () => {
    it("should remove key with prefix", () => {
      preferencesStorage.remove("theme");
      expect(localStorage.removeItem).toHaveBeenCalledWith("ai_anim_studio_theme");
    });

    it("should not throw when localStorage.removeItem fails", () => {
      localStorageMock.removeItem.mockImplementation(() => {
        throw new Error("storage error");
      });
      expect(() => preferencesStorage.remove("key")).not.toThrow();
      expect(mockErrorLogger.warn).toHaveBeenCalled();
    });
  });

  describe("has", () => {
    it("should return true when key exists", () => {
      localStorageMock.getItem.mockReturnValue('"dark"');
      expect(preferencesStorage.has("theme")).toBe(true);
    });

    it("should return false when key does not exist", () => {
      localStorageMock.getItem.mockReturnValue(null);
      expect(preferencesStorage.has("nonexistent")).toBe(false);
    });

    it("should use prefixed key", () => {
      localStorageMock.getItem.mockReturnValue('"value"');
      expect(preferencesStorage.has("mykey")).toBe(true);
      expect(localStorage.getItem).toHaveBeenCalledWith("ai_anim_studio_mykey");
    });
  });

  describe("SSR guard", () => {
    it("should return defaultValue from get when window is undefined", () => {
      const originalWindow = globalThis.window;
      Object.defineProperty(globalThis, "window", {
        value: undefined,
        writable: true,
        configurable: true,
      });
      expect(preferencesStorage.get("key", "fallback")).toBe("fallback");
      Object.defineProperty(globalThis, "window", {
        value: originalWindow,
        writable: true,
        configurable: true,
      });
    });

    it("should be a no-op for set when window is undefined", () => {
      const originalWindow = globalThis.window;
      Object.defineProperty(globalThis, "window", {
        value: undefined,
        writable: true,
        configurable: true,
      });
      expect(() => preferencesStorage.set("key", "value")).not.toThrow();
      Object.defineProperty(globalThis, "window", {
        value: originalWindow,
        writable: true,
        configurable: true,
      });
    });

    it("should be a no-op for remove when window is undefined", () => {
      const originalWindow = globalThis.window;
      Object.defineProperty(globalThis, "window", {
        value: undefined,
        writable: true,
        configurable: true,
      });
      expect(() => preferencesStorage.remove("key")).not.toThrow();
      Object.defineProperty(globalThis, "window", {
        value: originalWindow,
        writable: true,
        configurable: true,
      });
    });

    it("should return false from has when window is undefined", () => {
      const originalWindow = globalThis.window;
      Object.defineProperty(globalThis, "window", {
        value: undefined,
        writable: true,
        configurable: true,
      });
      expect(preferencesStorage.has("key")).toBe(false);
      Object.defineProperty(globalThis, "window", {
        value: originalWindow,
        writable: true,
        configurable: true,
      });
    });
  });

  describe("usePreference", () => {
    let memoryStore: Map<string, string>;

    beforeEach(() => {
      memoryStore = new Map();
      localStorageMock.getItem.mockImplementation((key: string) => memoryStore.get(key) ?? null);
      localStorageMock.setItem.mockImplementation((key: string, value: string) => {
        memoryStore.set(key, value);
      });
      localStorageMock.removeItem.mockImplementation((key: string) => {
        memoryStore.delete(key);
      });
      mockSafeJsonParse.mockImplementation((raw: string) => JSON.parse(raw));
    });

    it("should return default value when no stored value", () => {
      const { result } = renderHook(() => usePreference("hook-default", "fallback"));
      expect(result.current[0]).toBe("fallback");
    });

    it("should return stored value from localStorage", () => {
      memoryStore.set("ai_anim_studio_hook-stored", JSON.stringify("stored"));
      const { result } = renderHook(() => usePreference("hook-stored", "fallback"));
      expect(result.current[0]).toBe("stored");
    });

    it("should update value via setValue with direct value", () => {
      const { result } = renderHook(() => usePreference("hook-set-direct", "initial"));
      expect(result.current[0]).toBe("initial");
      act(() => {
        result.current[1]("updated");
      });
      expect(result.current[0]).toBe("updated");
    });

    it("should update value via setValue with functional updater", () => {
      memoryStore.set("ai_anim_studio_hook-fn-update", JSON.stringify({ count: 1 }));
      const { result } = renderHook(() => usePreference("hook-fn-update", { count: 0 }));
      expect(result.current[0]).toEqual({ count: 1 });
      act(() => {
        result.current[1]((prev) => ({ ...prev, count: prev.count + 1 }));
      });
      expect(result.current[0]).toEqual({ count: 2 });
    });

    it("should re-render when preferencesStorage.set triggers emitChange", () => {
      const { result } = renderHook(() => usePreference("hook-emit-set", "initial"));
      expect(result.current[0]).toBe("initial");
      act(() => {
        preferencesStorage.set("hook-emit-set", "changed");
      });
      expect(result.current[0]).toBe("changed");
    });

    it("should re-render when preferencesStorage.remove triggers emitChange", () => {
      memoryStore.set("ai_anim_studio_hook-emit-remove", JSON.stringify("stored"));
      const { result } = renderHook(() => usePreference("hook-emit-remove", "default"));
      expect(result.current[0]).toBe("stored");
      act(() => {
        preferencesStorage.remove("hook-emit-remove");
      });
      expect(result.current[0]).toBe("default");
    });

    it("should unsubscribe on unmount", () => {
      const { unmount } = renderHook(() => usePreference("hook-unsub", "val"));
      unmount();
      act(() => {
        preferencesStorage.set("hook-unsub", "new");
      });
    });

    it("should return same reference from snapshotCache for same raw value", () => {
      memoryStore.set("ai_anim_studio_hook-cache", JSON.stringify({ a: 1 }));
      const { result } = renderHook(() => usePreference("hook-cache", { a: 0 }));
      const firstRef = result.current[0];
      act(() => {
        preferencesStorage.set("hook-cache", { a: 1 });
      });
      expect(result.current[0]).toBe(firstRef);
    });

    it("should notify multiple listeners for the same key", () => {
      const { result: result1 } = renderHook(() => usePreference("hook-multi", "initial"));
      const { result: result2 } = renderHook(() => usePreference("hook-multi", "initial"));
      act(() => {
        preferencesStorage.set("hook-multi", "updated");
      });
      expect(result1.current[0]).toBe("updated");
      expect(result2.current[0]).toBe("updated");
    });

    it("should return defaultValue via getServerSnapshot during SSR", async () => {
      const React = await import("react");
      const ReactDOMServer = await import("react-dom/server");
      function TestComponent() {
        const [value] = usePreference("hook-ssr", "ssr-default");
        return React.createElement("span", null, String(value));
      }
      const html = ReactDOMServer.renderToString(React.createElement(TestComponent));
      expect(html).toContain("ssr-default");
    });
  });

  describe("emitChange and listener mechanism", () => {
    let memoryStore: Map<string, string>;

    beforeEach(() => {
      memoryStore = new Map();
      localStorageMock.getItem.mockImplementation((key: string) => memoryStore.get(key) ?? null);
      localStorageMock.setItem.mockImplementation((key: string, value: string) => {
        memoryStore.set(key, value);
      });
      localStorageMock.removeItem.mockImplementation((key: string) => {
        memoryStore.delete(key);
      });
      mockSafeJsonParse.mockImplementation((raw: string) => JSON.parse(raw));
    });

    it("should trigger listeners when set is called", () => {
      const _listener = vi.fn();
      const { result } = renderHook(() => usePreference("emit-set", "initial"));
      const prevValue = result.current[0];
      act(() => {
        preferencesStorage.set("emit-set", "new-value");
      });
      expect(result.current[0]).toBe("new-value");
      expect(result.current[0]).not.toBe(prevValue);
    });

    it("should trigger listeners when remove is called", () => {
      memoryStore.set("ai_anim_studio_emit-remove", JSON.stringify("stored"));
      const { result } = renderHook(() => usePreference("emit-remove", "default"));
      expect(result.current[0]).toBe("stored");
      act(() => {
        preferencesStorage.remove("emit-remove");
      });
      expect(result.current[0]).toBe("default");
    });

    it("should support multiple listeners on the same key simultaneously", () => {
      const _listener1 = vi.fn();
      const _listener2 = vi.fn();
      const { result: r1 } = renderHook(() => usePreference("emit-multi", "a"));
      const { result: r2 } = renderHook(() => usePreference("emit-multi", "a"));
      act(() => {
        preferencesStorage.set("emit-multi", "b");
      });
      expect(r1.current[0]).toBe("b");
      expect(r2.current[0]).toBe("b");
    });

    it("should not trigger listeners for different keys", () => {
      const { result: r1 } = renderHook(() => usePreference("emit-key-a", "a"));
      const { result: r2 } = renderHook(() => usePreference("emit-key-b", "b"));
      act(() => {
        preferencesStorage.set("emit-key-a", "changed-a");
      });
      expect(r1.current[0]).toBe("changed-a");
      expect(r2.current[0]).toBe("b");
    });
  });

  describe("storage event cross-tab sync", () => {
    let memoryStore: Map<string, string>;

    beforeEach(() => {
      memoryStore = new Map();
      localStorageMock.getItem.mockImplementation((key: string) => memoryStore.get(key) ?? null);
      localStorageMock.setItem.mockImplementation((key: string, value: string) => {
        memoryStore.set(key, value);
      });
      localStorageMock.removeItem.mockImplementation((key: string) => {
        memoryStore.delete(key);
      });
      mockSafeJsonParse.mockImplementation((raw: string) => JSON.parse(raw));
    });

    it("should update when storage event fires with prefixed key", () => {
      const { result } = renderHook(() => usePreference("storage-sync", "initial"));
      memoryStore.set("ai_anim_studio_storage-sync", JSON.stringify("synced"));
      act(() => {
        window.dispatchEvent(
          new StorageEvent("storage", {
            key: "ai_anim_studio_storage-sync",
            newValue: JSON.stringify("synced"),
          }),
        );
      });
      expect(result.current[0]).toBe("synced");
    });

    it("should ignore storage event with non-prefixed key", () => {
      const { result } = renderHook(() => usePreference("storage-ignore", "initial"));
      act(() => {
        window.dispatchEvent(
          new StorageEvent("storage", {
            key: "other_key",
            newValue: JSON.stringify("value"),
          }),
        );
      });
      expect(result.current[0]).toBe("initial");
    });

    it("should ignore storage event with null key", () => {
      const { result } = renderHook(() => usePreference("storage-null", "initial"));
      act(() => {
        window.dispatchEvent(
          new StorageEvent("storage", {
            key: null,
            newValue: null,
          }),
        );
      });
      expect(result.current[0]).toBe("initial");
    });
  });
});
