import { describe, it, expect, vi, beforeEach } from "vitest";
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

import { preferencesStorage } from "../preferences";

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
});
