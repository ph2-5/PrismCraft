import { type ApiConfig, type ApiCapability, type ProviderConfig } from "./types";
import { errorLogger } from "@/shared/error-logger";
import { t } from "@/shared/constants";
import { API_SERVER_PORT, ELECTRON_APP_HEADERS } from "@/config/constants";

const CONFIG_KEY = "ai_animation_studio_api_config";
const CONFIG_VERSION = 1;

// HTTP 配置存储（统一通信层），失败回退到 IPC
let _httpAvailable: boolean | null = null;

async function withHttpFallback<T>(endpoint: string, body: unknown): Promise<T | null> {
  if (typeof window === "undefined" || typeof fetch !== "function") return null;
  if (_httpAvailable === null) {
    try {
      const probe = await fetch(`http://localhost:${API_SERVER_PORT}/api/health`, {
        method: "GET",
        headers: ELECTRON_APP_HEADERS,
        signal: AbortSignal.timeout(1000),
      });
      _httpAvailable = probe.ok;
    } catch {
      _httpAvailable = false;
    }
  }
  if (!_httpAvailable) return null;
  try {
    const response = await fetch(`http://localhost:${API_SERVER_PORT}/api/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ELECTRON_APP_HEADERS },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch (e) {
    _httpAvailable = false;
    errorLogger.debug(`[API Config] HTTP ${endpoint} 失败，回退到 IPC`, e);
    return null;
  }
}

async function httpConfigGet(key: string): Promise<unknown | null> {
  const result = await withHttpFallback<{ success: boolean; data?: { value: unknown } }>("config/get", { key });
  if (!result) return null;
  if (!result.success) return null;
  return result.data?.value ?? null;
}

async function httpConfigSet(key: string, value: unknown): Promise<boolean> {
  const result = await withHttpFallback<{ success: boolean }>("config/set", { key, value });
  if (!result) return false;
  return result.success;
}

export function getDefaultConfig(): ApiConfig {
  return {
    version: CONFIG_VERSION,
    providers: [],
    mapping: {},
    fallback: {
      enabled: true,
      order: ["text", "image", "vision", "video"],
    },
  };
}

let configCache: ApiConfig | null = null;
let configCacheTimestamp = 0;
let configLoadPromise: Promise<ApiConfig> | null = null;
const CONFIG_CACHE_TTL = 2000;
const MAX_CACHE_TTL = 30000;

export function invalidateConfigCache(): void {
  configCache = null;
  configCacheTimestamp = 0;
}

let cacheClearTimeout: ReturnType<typeof setTimeout> | null = null;
function scheduleCacheClear() {
  if (cacheClearTimeout) clearTimeout(cacheClearTimeout);
  cacheClearTimeout = setTimeout(() => {
    invalidateConfigCache();
  }, MAX_CACHE_TTL);
}

function cleanProvider(p: ProviderConfig): ProviderConfig {
  const { _obfuscationVersion, _encryptedKey, ...rest } =
    p as ProviderConfig & {
      _obfuscationVersion?: unknown;
      _encryptedKey?: unknown;
    };
  return rest;
}

export async function loadConfig(): Promise<ApiConfig> {
  const now = Date.now();
  if (configCache && now - configCacheTimestamp < CONFIG_CACHE_TTL) {
    return configCache;
  }

  if (configLoadPromise) {
    return configLoadPromise;
  }

  configLoadPromise = (async (): Promise<ApiConfig> => {
    try {
      let stored: string | null = null;

      // 优先尝试 HTTP API（统一通信层）
      const httpValue = await httpConfigGet(CONFIG_KEY);
      if (httpValue !== null) {
        if (typeof httpValue === "string") {
          stored = httpValue;
        } else if (typeof httpValue === "object") {
          // config/get 返回的是已解析的对象，直接使用
          stored = JSON.stringify(httpValue);
        }
      }

      // Fallback: IPC
      if (stored === null && typeof window !== "undefined" && window.electronAPI?.getConfig) {
        try {
          const electronResult = await window.electronAPI.getConfig(CONFIG_KEY);
          if (electronResult !== null && electronResult !== undefined) {
            if (typeof electronResult === "object" && "data" in electronResult) {
              stored = (electronResult as { data: unknown }).data as string | null;
            } else {
              stored = electronResult as string | null;
            }
          }
        } catch (e) {
          errorLogger.warn(
            "[API Config] Electron 存储读取失败:",
            e,
          );
        }
      }

      if (!stored) return getDefaultConfig();

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(stored);
      } catch (e) {
        errorLogger.warn("[API Config] 配置 JSON 解析失败，使用默认配置", e);
        return getDefaultConfig();
      }

      if (parsed.version !== CONFIG_VERSION) {
        errorLogger.warn(
          `[API Config] 配置版本不匹配: ${parsed.version} vs ${CONFIG_VERSION}`,
        );
        const cleanedProviders: ProviderConfig[] = (
          (parsed.providers as ProviderConfig[]) || []
        ).map(cleanProvider);
        const cleanedParsed = { ...parsed, providers: cleanedProviders };
        const migrated = migrateConfig(cleanedParsed);
        if (migrated) {
          try {
            await saveConfig(migrated);
          } catch (e) {
            // Task 4.9: 迁移后保存失败仅影响下次启动的持久化，本次内存中已使用 migrated 配置，降级为 warn。
            errorLogger.warn("[API Config] 迁移后保存配置失败:", e);
          }
          configCache = migrated;
          configCacheTimestamp = Date.now();
          scheduleCacheClear();
          return migrated;
        }
        const defaultConfig = getDefaultConfig();
        configCache = defaultConfig;
        configCacheTimestamp = Date.now();
        scheduleCacheClear();
        return defaultConfig;
      }

      const defaultCfg = getDefaultConfig();
      const result: ApiConfig = {
        version: (parsed.version as number) ?? defaultCfg.version,
        providers: ((parsed.providers as ProviderConfig[]) || []).map(cleanProvider),
        mapping: (parsed.mapping as ApiConfig["mapping"]) ?? defaultCfg.mapping,
        fallback: (parsed.fallback as ApiConfig["fallback"]) ?? defaultCfg.fallback,
      };
      configCache = result;
      configCacheTimestamp = Date.now();
      scheduleCacheClear();
      return result;
    } catch (error) {
      // Task 4.9: 配置加载失败已有 getDefaultConfig() 兜底，非致命错误，降级为 warn 避免污染 console。
      errorLogger.warn("[API Config] 加载配置失败:", error);
      return getDefaultConfig();
    } finally {
      configLoadPromise = null;
    }
  })();

  return configLoadPromise!;
}

export async function saveConfig(config: ApiConfig): Promise<void> {
  invalidateConfigCache();
  try {
    const configString = JSON.stringify(config);

    // 优先尝试 HTTP API（统一通信层）
    const httpOk = await httpConfigSet(CONFIG_KEY, configString);
    if (httpOk) return;

    // Fallback: IPC
    if (typeof window !== "undefined" && window.electronAPI?.setConfig) {
      const result = await window.electronAPI.setConfig(
        CONFIG_KEY,
        configString,
      );
      if (result === false) {
        throw new Error(t("error.electronIpcSaveFailed"));
      }
    } else {
      throw new Error(t("error.apiConfigStorageRequiresElectron"));
    }
  } catch (error) {
    errorLogger.error("[API Config] 保存配置失败:", error);
    throw new Error(t("error.saveConfigFailed"));
  }
}

function migrateConfig(oldConfig: Record<string, unknown>): ApiConfig | null {
  try {
    const newConfig = getDefaultConfig();

    if (oldConfig.providers && Array.isArray(oldConfig.providers)) {
      newConfig.providers = (
        oldConfig.providers as {
          id?: string;
          name?: string;
          format?: string;
          baseUrl?: string;
          models?: unknown[];
          [key: string]: unknown;
        }[]
      ).map((p) => ({
        ...p,
        id:
          p.id ||
          `provider_${crypto.randomUUID()}`,
        name: p.name || p.id,
        format: p.format || "openai",
        baseUrl: p.baseUrl || "https://api.openai.com/v1",
        models: p.models || [],
      })) as import("./types").ProviderConfig[];
    }

    if (oldConfig.mapping) {
      newConfig.mapping = oldConfig.mapping as ApiConfig["mapping"];
    }

    return newConfig;
  } catch (e) {
    errorLogger.warn("[API Config] 配置迁移失败", e);
    return null;
  }
}

export function addProvider(
  config: ApiConfig,
  provider: ProviderConfig,
): ApiConfig {
  const exists = config.providers.some((p) => p.id === provider.id);
  if (exists) {
    throw new Error(t("error.providerIdExists", { id: provider.id }));
  }

  return {
    ...config,
    providers: [...config.providers, provider],
  };
}

export function removeProvider(
  config: ApiConfig,
  providerId: string,
): ApiConfig {
  const newProviders = config.providers.filter((p) => p.id !== providerId);

  const newMapping = { ...config.mapping };
  (Object.keys(newMapping) as Array<keyof typeof newMapping>).forEach((key) => {
    const value = newMapping[key];
    if (value && value.startsWith(`${providerId}/`)) {
      delete newMapping[key];
    }
  });

  return {
    ...config,
    providers: newProviders,
    mapping: newMapping,
  };
}

export function setCapabilityMapping(
  config: ApiConfig,
  capability: ApiCapability,
  providerModelId: string | undefined,
): ApiConfig {
  return {
    ...config,
    mapping: {
      ...config.mapping,
      [capability]: providerModelId,
    },
  };
}

export function getCapabilityConfig(
  config: ApiConfig,
  capability: ApiCapability,
): { provider: ProviderConfig | null; modelId: string | null } {
  const mappingValue = config.mapping[capability];
  if (!mappingValue) {
    return { provider: null, modelId: null };
  }

  const lastSlashIndex = mappingValue.lastIndexOf("/");
  if (lastSlashIndex === -1) {
    return { provider: null, modelId: null };
  }
  const providerId = mappingValue.substring(0, lastSlashIndex);
  const modelId = mappingValue.substring(lastSlashIndex + 1);
  const provider = config.providers.find((p) => p.id === providerId);

  return { provider: provider || null, modelId: modelId || null };
}


