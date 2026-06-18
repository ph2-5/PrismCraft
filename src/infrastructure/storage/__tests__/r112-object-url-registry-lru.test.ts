/**
 * R112: objectUrlRegistry LRU 100 条上限测试
 *
 * 回归规则: src/infrastructure/storage/video-cache.ts 中的 registerObjectUrl 函数
 * 必须遵守 MAX_OBJECT_URLS (100) 条上限，超过上限时淘汰最旧条目。
 *
 * 被淘汰的 blob URL 应调用 URL.revokeObjectURL 释放资源。
 * 重新注册已存在的 taskId 不应触发淘汰（更新而非新增）。
 *
 * 测试场景:
 * 1. 注册第 101 个 URL 时应淘汰第 1 个（最旧）条目
 * 2. 被淘汰的 blob URL 应调用 URL.revokeObjectURL
 * 3. 注册表大小不应超过 MAX_OBJECT_URLS
 * 4. 重新注册已存在的 taskId 不应触发淘汰
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

if (typeof URL.revokeObjectURL !== "function") {
  URL.revokeObjectURL = vi.fn();
}

vi.mock("@/infrastructure/storage/sqlite-core", () => ({
  safeQuery: vi.fn(),
  safeRun: vi.fn(),
}));

vi.mock("@/infrastructure/di", () => ({
  container: {},
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: {
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import {
  registerObjectUrl,
  getObjectUrl,
  cleanupAllObjectUrls,
} from "@/infrastructure/storage/video-cache";

describe("R112: objectUrlRegistry LRU 100 条上限", () => {
  let revokeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    cleanupAllObjectUrls();
    revokeSpy = vi.spyOn(URL, "revokeObjectURL");
  });

  afterEach(() => {
    revokeSpy.mockRestore();
  });

  it("注册第 101 个 URL 时应淘汰第 1 个（最旧）条目", () => {
    // 注册 100 个 URL（达到上限）
    for (let i = 0; i < 100; i++) {
      registerObjectUrl(`task-${i}`, `blob:https://example.com/${i}`);
    }
    expect(getObjectUrl("task-0")).toBe("blob:https://example.com/0");

    // 注册第 101 个 URL
    registerObjectUrl("task-100", "blob:https://example.com/100");

    // task-0（最旧）应被淘汰
    expect(getObjectUrl("task-0")).toBeUndefined();
    // task-100 应已注册
    expect(getObjectUrl("task-100")).toBe("blob:https://example.com/100");
    // task-1 应仍存在
    expect(getObjectUrl("task-1")).toBe("blob:https://example.com/1");
  });

  it("被淘汰的 blob URL 应调用 URL.revokeObjectURL", () => {
    for (let i = 0; i < 100; i++) {
      registerObjectUrl(`task-${i}`, `blob:https://example.com/${i}`);
    }
    revokeSpy.mockClear();

    registerObjectUrl("task-100", "blob:https://example.com/100");

    // 被淘汰的 blob URL 应调用 revokeObjectURL
    expect(revokeSpy).toHaveBeenCalledWith("blob:https://example.com/0");
  });

  it("注册表大小不应超过 MAX_OBJECT_URLS", () => {
    // 注册 150 个 URL，应只保留最后 100 个
    for (let i = 0; i < 150; i++) {
      registerObjectUrl(`task-${i}`, `blob:https://example.com/${i}`);
    }

    // task-0 到 task-49 应被淘汰
    expect(getObjectUrl("task-49")).toBeUndefined();
    // task-50 到 task-149 应存在
    expect(getObjectUrl("task-50")).toBe("blob:https://example.com/50");
    expect(getObjectUrl("task-149")).toBe("blob:https://example.com/149");

    // 验证注册表大小不超过 100：注册新 URL 时应淘汰最旧条目
    revokeSpy.mockClear();
    registerObjectUrl("task-150", "blob:https://example.com/150");
    // task-50 应被淘汰（当前最旧）
    expect(getObjectUrl("task-50")).toBeUndefined();
    expect(revokeSpy).toHaveBeenCalledWith("blob:https://example.com/50");
  });

  it("重新注册已存在的 taskId 不应触发淘汰", () => {
    for (let i = 0; i < 100; i++) {
      registerObjectUrl(`task-${i}`, `blob:https://example.com/${i}`);
    }
    revokeSpy.mockClear();

    // 重新注册已存在的 task-0
    registerObjectUrl("task-0", "blob:https://example.com/new-0");

    // 不应触发淘汰（不应调用 revokeObjectURL）
    expect(revokeSpy).not.toHaveBeenCalled();
    // task-0 应更新为新 URL
    expect(getObjectUrl("task-0")).toBe("blob:https://example.com/new-0");

    // 注册表大小应仍为 100（未新增条目）
    // 验证：注册第 101 个新 taskId 时，淘汰的应是 task-0（Map 迭代顺序中仍是最旧），
    // 而非 task-1，因为重新注册不改变 Map 中 key 的迭代顺序
    registerObjectUrl("task-100", "blob:https://example.com/100");
    expect(getObjectUrl("task-0")).toBeUndefined();
    expect(getObjectUrl("task-1")).toBe("blob:https://example.com/1");
  });

  it("非 blob URL 被淘汰时不应调用 revokeObjectURL", () => {
    // 注册非 blob URL（如 vcache://）
    for (let i = 0; i < 100; i++) {
      registerObjectUrl(`task-${i}`, `vcache://task-${i}`);
    }
    revokeSpy.mockClear();

    // 注册第 101 个，应淘汰 task-0
    registerObjectUrl("task-100", "vcache://task-100");

    // task-0 应被淘汰
    expect(getObjectUrl("task-0")).toBeUndefined();
    // 非 blob URL 不应调用 revokeObjectURL
    expect(revokeSpy).not.toHaveBeenCalled();
  });
});
