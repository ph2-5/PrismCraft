import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { setupElectronApiMock, type getElectronApiMock, resetElectronApiMock } from "../mocks/electron-api";
import { saveConfig, loadConfig, invalidateConfigCache } from "@/infrastructure/ai-providers/api-config/storage";
import type { ApiConfig } from "@/infrastructure/ai-providers/api-config/types";

vi.mock("@/shared/utils/platform", () => ({
  isElectron: () => true,
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

const CONFIG_KEY = "ai_animation_studio_api_config";

const sampleConfig: ApiConfig = {
  version: 1,
  providers: [],
  mapping: {},
  fallback: {
    enabled: true,
    order: ["text", "image", "vision", "video"],
  },
};

function createLocalStorageStore() {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { store.set(key, value); }),
    removeItem: vi.fn((key: string) => { store.delete(key); }),
    clear: vi.fn(() => { store.clear(); }),
    _store: store,
  };
}

describe("E2E API 配置存储与迁移测试", () => {
  let mock: ReturnType<typeof getElectronApiMock>;
  let lsStore: ReturnType<typeof createLocalStorageStore>;

  beforeEach(() => {
    lsStore = createLocalStorageStore();
    (window as unknown as Record<string, unknown>).localStorage = lsStore;
    invalidateConfigCache();
    mock = setupElectronApiMock();
    resetElectronApiMock();
  });

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).electronAPI;
  });

  describe("Electron 模式 - 保存配置", () => {
    it("调用 saveConfig 时优先使用 electronAPI.setConfig", async () => {
      mock.setConfig.mockResolvedValue(true);

      await saveConfig(sampleConfig);

      expect(mock.setConfig).toHaveBeenCalledWith(CONFIG_KEY, JSON.stringify(sampleConfig));
      expect(lsStore.setItem).not.toHaveBeenCalled();
    });

    it("electronAPI.setConfig 返回 false 时应抛出错误", async () => {
      mock.setConfig.mockResolvedValue(false);

      await expect(saveConfig(sampleConfig)).rejects.toThrow("保存配置失败");

      expect(mock.setConfig).toHaveBeenCalledWith(CONFIG_KEY, JSON.stringify(sampleConfig));
    });

    it("electronAPI.setConfig 抛出异常时应抛出错误", async () => {
      mock.setConfig.mockRejectedValue(new Error("IPC error"));

      await expect(saveConfig(sampleConfig)).rejects.toThrow("保存配置失败");

      expect(mock.setConfig).toHaveBeenCalledWith(CONFIG_KEY, JSON.stringify(sampleConfig));
    });
  });

  describe("Electron 模式 - 加载配置", () => {
    it("优先从 electronAPI.getConfig 加载", async () => {
      mock.getConfig.mockResolvedValue(JSON.stringify(sampleConfig));

      const result = await loadConfig();

      expect(mock.getConfig).toHaveBeenCalledWith(CONFIG_KEY);
      expect(result).toMatchObject(sampleConfig);
    });

    it("electronAPI.getConfig 返回 null 时返回默认配置", async () => {
      mock.getConfig.mockResolvedValue(null);

      const result = await loadConfig();

      expect(result).toMatchObject({ version: 1, providers: [] });
    });

    it("版本不匹配时自动迁移配置", async () => {
      const oldConfig = { version: 0, providers: [{ name: "old" }], mapping: {} };
      mock.getConfig.mockResolvedValue(JSON.stringify(oldConfig));
      mock.setConfig.mockResolvedValue(true);

      const result = await loadConfig();

      expect(result.version).toBe(1);
      expect(result.providers).toHaveLength(1);
      expect(result.providers[0]!.name).toBe("old");
    });
  });

  describe("非 Electron 模式", () => {
    beforeEach(() => {
      delete (window as unknown as Record<string, unknown>).electronAPI;
    });

    it("saveConfig 应抛出错误", async () => {
      await expect(saveConfig(sampleConfig)).rejects.toThrow("保存配置失败");
    });

    it("loadConfig 应返回默认配置", async () => {
      const result = await loadConfig();

      expect(result).toMatchObject({ version: 1, providers: [] });
    });
  });

  describe("配置格式", () => {
    beforeEach(() => {
      mock.setConfig.mockResolvedValue(true);
    });

    it("保存的配置是有效的 JSON 字符串", async () => {
      await saveConfig(sampleConfig);

      expect(mock.setConfig).toHaveBeenCalledWith(CONFIG_KEY, JSON.stringify(sampleConfig));
      expect(() => JSON.parse(JSON.stringify(sampleConfig))).not.toThrow();
    });

    it("加载后能正确解析为对象", async () => {
      mock.getConfig.mockResolvedValue(JSON.stringify(sampleConfig));
      invalidateConfigCache();
      const result = await loadConfig();

      expect(result.version).toBe(sampleConfig.version);
      expect(result.providers).toEqual(sampleConfig.providers);
      expect(result.mapping).toEqual(sampleConfig.mapping);
      expect(result.fallback).toEqual(sampleConfig.fallback);
    });
  });
});
