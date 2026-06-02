import { describe, it, expect, vi, beforeEach } from "vitest";

describe("platform", () => {
  beforeEach(() => {
    vi.resetModules();
    delete (window as unknown as Record<string, unknown>).electronAPI;
  });

  it("should return true when window.electronAPI exists", async () => {
    (window as unknown as Record<string, unknown>).electronAPI = { send: vi.fn() };
    const { isElectron } = await import("../platform");
    expect(isElectron()).toBe(true);
  });

  it("should return true when protocol is electron:", async () => {
    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      value: { protocol: "electron:" },
      writable: true,
      configurable: true,
    });
    const { isElectron } = await import("../platform");
    expect(isElectron()).toBe(true);
    Object.defineProperty(window, "location", {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
  });

  it("should return false in regular browser environment", async () => {
    const { isElectron } = await import("../platform");
    expect(isElectron()).toBe(false);
  });

  it("should cache the result after first call", async () => {
    (window as unknown as Record<string, unknown>).electronAPI = { send: vi.fn() };
    const { isElectron } = await import("../platform");
    expect(isElectron()).toBe(true);
    delete (window as unknown as Record<string, unknown>).electronAPI;
    expect(isElectron()).toBe(true);
  });

  it("should return false when window access throws", async () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(window, "location");
    Object.defineProperty(window, "location", {
      get() { throw new Error("access denied"); },
      configurable: true,
    });
    const { isElectron } = await import("../platform");
    expect(isElectron()).toBe(false);
    if (originalDescriptor) {
      Object.defineProperty(window, "location", originalDescriptor);
    }
  });

  it("should detect electronAPI over electron: protocol", async () => {
    (window as unknown as Record<string, unknown>).electronAPI = { send: vi.fn() };
    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      value: { protocol: "http:" },
      writable: true,
      configurable: true,
    });
    const { isElectron } = await import("../platform");
    expect(isElectron()).toBe(true);
    Object.defineProperty(window, "location", {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
  });
});
