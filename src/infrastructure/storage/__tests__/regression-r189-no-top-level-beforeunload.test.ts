/**
 * R189: video-cache 模块加载时禁止顶层 beforeunload 注册，必须延迟到 registerObjectUrl()
 *
 * 回归规则目的：
 *   src/infrastructure/storage/video-cache.ts 模块加载时不应注册 window.beforeunload
 *   监听器。所有 beforeunload 注册必须延迟到 registerObjectUrl() 显式调用后。
 *   cleanupVideoCache() 应能正确移除已注册的监听器。
 *
 * 历史问题：
 *   原实现在模块顶层 window.addEventListener("beforeunload", ...) 注册，
 *   导致仅导入模块就注册了全局监听器，HMR 时重复注册。
 *
 * 被测代码：
 *   src/infrastructure/storage/video-cache.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockSafeQuery, mockSafeRun, mockErrorLogger, mockContainer } = vi.hoisted(() => ({
  mockSafeQuery: vi.fn().mockResolvedValue([]),
  mockSafeRun: vi.fn().mockResolvedValue(undefined),
  mockErrorLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  mockContainer: {},
}));

vi.mock("@/infrastructure/storage/sqlite-core", () => ({
  safeQuery: mockSafeQuery,
  safeRun: mockSafeRun,
}));

vi.mock("@/infrastructure/di", () => ({
  container: mockContainer,
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: mockErrorLogger,
}));

describe("R189: video-cache 禁止顶层 beforeunload 注册", () => {
  let addEventListenerSpy: ReturnType<typeof vi.spyOn>;
  let removeEventListenerSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    addEventListenerSpy = vi.spyOn(window, "addEventListener");
    removeEventListenerSpy = vi.spyOn(window, "removeEventListener");
  });

  afterEach(() => {
    addEventListenerSpy.mockRestore();
    removeEventListenerSpy.mockRestore();
  });

  it("模块导入时不应注册 beforeunload 监听器", async () => {
    addEventListenerSpy.mockClear();

    await import("@/infrastructure/storage/video-cache");

    // 模块加载期间不应有 beforeunload 监听器注册
    expect(addEventListenerSpy).not.toHaveBeenCalledWith(
      "beforeunload",
      expect.any(Function),
    );
  });

  it("模块导入时不应有任何 window.addEventListener 调用", async () => {
    addEventListenerSpy.mockClear();

    await import("@/infrastructure/storage/video-cache");

    expect(addEventListenerSpy).not.toHaveBeenCalled();
  });

  it("调用 registerObjectUrl() 后才注册 beforeunload 监听器", async () => {
    addEventListenerSpy.mockClear();
    const mod = await import("@/infrastructure/storage/video-cache");

    // 导入后不应注册
    expect(addEventListenerSpy).not.toHaveBeenCalledWith(
      "beforeunload",
      expect.any(Function),
    );

    // 调用 registerObjectUrl 后应注册
    mod.registerObjectUrl("task-1", "blob:https://example.com/1");

    expect(addEventListenerSpy).toHaveBeenCalledWith(
      "beforeunload",
      expect.any(Function),
    );
  });

  it("重复调用 registerObjectUrl() 不应重复注册 beforeunload 监听器", async () => {
    addEventListenerSpy.mockClear();
    const mod = await import("@/infrastructure/storage/video-cache");

    mod.registerObjectUrl("task-1", "blob:https://example.com/1");
    const callsAfterFirst = addEventListenerSpy.mock.calls.filter(
      ([event]: [string, ...unknown[]]) => event === "beforeunload",
    ).length;

    mod.registerObjectUrl("task-2", "blob:https://example.com/2");
    mod.registerObjectUrl("task-3", "blob:https://example.com/3");
    const callsAfterThird = addEventListenerSpy.mock.calls.filter(
      ([event]: [string, ...unknown[]]) => event === "beforeunload",
    ).length;

    // ensureBeforeUnloadRegistered 通过 beforeUnloadRegistered 标志守卫，应只注册一次
    expect(callsAfterThird).toBe(callsAfterFirst);
    expect(callsAfterThird).toBe(1);
  });

  it("cleanupVideoCache() 应移除 beforeunload 监听器", async () => {
    removeEventListenerSpy.mockClear();
    const mod = await import("@/infrastructure/storage/video-cache");

    // 先注册
    mod.registerObjectUrl("task-1", "blob:https://example.com/1");

    // 清理前不应有 removeEventListener
    expect(removeEventListenerSpy).not.toHaveBeenCalledWith(
      "beforeunload",
      expect.any(Function),
    );

    // 清理
    mod.cleanupVideoCache();

    // 应调用 removeEventListener
    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      "beforeunload",
      expect.any(Function),
    );
  });

  it("cleanupVideoCache() 后再次 registerObjectUrl 应能重新注册监听器", async () => {
    addEventListenerSpy.mockClear();
    const mod = await import("@/infrastructure/storage/video-cache");

    mod.registerObjectUrl("task-1", "blob:https://example.com/1");
    const callsAfterFirstRegister = addEventListenerSpy.mock.calls.filter(
      ([event]: [string, ...unknown[]]) => event === "beforeunload",
    ).length;
    expect(callsAfterFirstRegister).toBe(1);

    mod.cleanupVideoCache();

    // 清理后再次注册
    addEventListenerSpy.mockClear();
    mod.registerObjectUrl("task-2", "blob:https://example.com/2");
    const callsAfterSecondRegister = addEventListenerSpy.mock.calls.filter(
      ([event]: [string, ...unknown[]]) => event === "beforeunload",
    ).length;
    expect(callsAfterSecondRegister).toBe(1);
  });

  it("未注册时调用 cleanupVideoCache() 不应抛错", async () => {
    const mod = await import("@/infrastructure/storage/video-cache");

    // 直接调用 cleanup（未注册过）不应抛错
    expect(() => mod.cleanupVideoCache()).not.toThrow();
  });

  it("cleanupAllObjectUrls 不应注册 beforeunload（仅清理 URL）", async () => {
    addEventListenerSpy.mockClear();
    const mod = await import("@/infrastructure/storage/video-cache");

    // 调用 cleanupAllObjectUrls（不是 registerObjectUrl）
    mod.cleanupAllObjectUrls();

    // 不应注册 beforeunload
    expect(addEventListenerSpy).not.toHaveBeenCalledWith(
      "beforeunload",
      expect.any(Function),
    );
  });

  it("导入模块不应抛出异常", async () => {
    await expect(import("@/infrastructure/storage/video-cache")).resolves.toBeDefined();
  });
});
