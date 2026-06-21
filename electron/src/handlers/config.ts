/**
 * handlers/config.ts
 *
 * 配置处理器 - 集成安全密钥存储
 *
 * 修改：
 * - API Key 通过 keyStorage 安全存储
 * - 配置文件仅存储加密后的密钥引用
 * - 支持从明文配置自动迁移
 */

import fs from "fs";
import path from "path";
import { keyStorage } from "../security/key-storage/key-storage";
import { getLogger } from "../logging/logger";
import { getUserDataPath } from "../database/db-schema";

const logger = getLogger("config-handler");

function getConfigDir(): string {
  return getUserDataPath();
}
function getConfigFile(): string {
  return path.join(getConfigDir(), "config.json");
}
function getConfigBackupFile(): string {
  return path.join(getConfigDir(), "config.json.backup");
}

/** 密钥存储前缀，用于标识加密存储的 API Key */
const KEY_STORAGE_PREFIX = "api-key:";

interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  format?: string;
  templateId?: string;
  models?: { id: string; name?: string; capabilities?: string[]; defaultParams?: Record<string, unknown> }[];
  [key: string]: unknown;
}

interface AppConfig {
  version: number;
  providers: ProviderConfig[];
  mapping: Record<string, string>;
  fallback: { enabled: boolean; order: string[] };
  freeImageBackup?: boolean;
  /** 标记是否已迁移到安全存储 */
  _migratedToSecureStorage?: boolean;
  [key: string]: unknown;
}

const DEFAULT_CONFIG: AppConfig = {
  version: 1,
  providers: [],
  mapping: {},
  fallback: { enabled: true, order: ["text", "image", "vision", "video"] },
};

function ensureConfigDir(): void {
  const configDir = getConfigDir();
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
}

/**
 * 加载配置
 * 
 * 如果配置未迁移到安全存储，自动迁移 API Key 到 keyStorage
 */
async function loadConfigAsync(): Promise<AppConfig> {
  try {
    const configFile = getConfigFile();
    if (!fs.existsSync(configFile)) return { ...DEFAULT_CONFIG };

    const data = fs.readFileSync(configFile, "utf-8").trim();
    if (!data) return { ...DEFAULT_CONFIG };

    let config: AppConfig;

    try {
      config = JSON.parse(data);
    } catch {
      // 不再尝试 base64 解码：base64 是编码而非加密，历史迁移已完成
      // 配置文件损坏时使用默认配置，避免明文凭据通过 base64 回退进入内存
      logger.warn("Could not parse config file as JSON, using defaults");
      return { ...DEFAULT_CONFIG };
    }

    if (!config.providers && !config.mapping) {
      return { ...DEFAULT_CONFIG };
    }

    // 自动迁移：如果未迁移且配置中有明文 API Key，迁移到安全存储
    if (!config._migratedToSecureStorage && config.providers?.length > 0) {
      config = await migrateToSecureStorage(config);
    }

    // 从 keyStorage 加载 API Key
    for (const provider of config.providers) {
      if (provider.apiKey && !provider.apiKey.startsWith("$secure:")) {
        // 如果 apiKey 不是引用，尝试从安全存储加载
        const storedKey = await keyStorage.load(`${KEY_STORAGE_PREFIX}${provider.id}`);
        if (storedKey.ok && storedKey.value) {
          provider.apiKey = storedKey.value;
        }
      } else if (provider.apiKey?.startsWith("$secure:")) {
        // 是安全引用，从 keyStorage 加载
        const storedKey = await keyStorage.load(`${KEY_STORAGE_PREFIX}${provider.id}`);
        provider.apiKey = storedKey.ok && storedKey.value ? storedKey.value : "";
      }
    }

    return config;
  } catch (error) {
    logger.error("Failed to load config", error instanceof Error ? error : undefined);
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * 同步加载配置（兼容旧代码）
 *
 * @deprecated 此函数不解析 `$secure:` 引用，返回的 provider.apiKey 可能是
 * `$secure:providerId` 形式的引用而非实际密钥。需要实际 API Key 的调用方
 * 必须使用 `loadConfigAsync()`。仅保留用于不涉及 apiKey 的通用配置读写
 * （如 config:get/config:set 的非密钥字段）和同步 IPC 处理器（ipcMain.on）。
 */
function loadConfig(): AppConfig {
  try {
    const configFile = getConfigFile();
    if (!fs.existsSync(configFile)) return { ...DEFAULT_CONFIG };
    const data = fs.readFileSync(configFile, "utf-8").trim();
    if (!data) return { ...DEFAULT_CONFIG };
    const parsed = JSON.parse(data);
    return parsed.providers || parsed.mapping ? parsed : { ...DEFAULT_CONFIG };
  } catch {
    logger.warn("Failed to load config file, using defaults");
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * 迁移配置到安全存储
 */
async function migrateToSecureStorage(config: AppConfig): Promise<AppConfig> {
  logger.info("Migrating API Keys to secure storage...");

  for (const provider of config.providers) {
    if (provider.apiKey && !provider.apiKey.startsWith("$secure:")) {
      // 保存到安全存储
      const result = await keyStorage.save(`${KEY_STORAGE_PREFIX}${provider.id}`, provider.apiKey);
      if (result.ok) {
        // 将配置文件中的 apiKey 替换为引用
        provider.apiKey = `$secure:${provider.id}`;
      }
    }
  }

  config._migratedToSecureStorage = true;
  await saveConfigAsync(config);
  logger.info("Migration to secure storage completed");

  return config;
}

/**
 * 保存配置
 * 
 * API Key 存储到 keyStorage，配置文件仅保存引用
 */
async function saveConfigAsync(config: AppConfig): Promise<boolean> {
  try {
    ensureConfigDir();

    const configFile = getConfigFile();
    const configBackupFile = getConfigBackupFile();

    if (fs.existsSync(configFile)) {
      try {
        fs.copyFileSync(configFile, configBackupFile);
      } catch {
        logger.warn("Failed to create config backup before save");
      }
    }

    // 创建配置副本，将 API Key 替换为引用
    const configToSave: AppConfig = {
      ...config,
      providers: await Promise.all(
        config.providers.map(async (p) => {
          if (p.apiKey && !p.apiKey.startsWith("$secure:")) {
            await keyStorage.save(`${KEY_STORAGE_PREFIX}${p.id}`, p.apiKey);
            return { ...p, apiKey: `$secure:${p.id}` };
          }
          return p;
        })
      ),
      _migratedToSecureStorage: true,
    };

    const data = JSON.stringify(configToSave, null, 2);
    const tempPath = `${configFile}.tmp`;
    fs.writeFileSync(tempPath, data);
    fs.renameSync(tempPath, configFile);

    logger.info("Config saved successfully");
    return true;
  } catch (error) {
    logger.error("Failed to save config", error instanceof Error ? error : undefined);
    return false;
  }
}

/** 同步保存配置（兼容旧代码） */
function saveConfig(config: AppConfig): boolean {
  try {
    ensureConfigDir();
    const configFile = getConfigFile();
    const configBackupFile = getConfigBackupFile();
    if (fs.existsSync(configFile)) {
      try {
        fs.copyFileSync(configFile, configBackupFile);
      } catch {
        logger.warn("Failed to create config backup before atomic write");
      }
    }
    // 安全防护：同步保存路径无法调用异步的 keyStorage.save()，
    // 因此在写入前将明文 apiKey 替换为 $secure: 引用，避免明文密钥落盘。
    // 注意：这不会将 apiKey 保存到 keyStorage，调用方应使用 saveConfigAsync() 完整保存。
    let hasPlaintextKey = false;
    const configToSave: AppConfig = {
      ...config,
      providers: config.providers.map((p) => {
        if (p.apiKey && !p.apiKey.startsWith("$secure:")) {
          hasPlaintextKey = true;
          return { ...p, apiKey: `$secure:${p.id}` };
        }
        return p;
      }),
      _migratedToSecureStorage: true,
    };
    if (hasPlaintextKey) {
      logger.warn("saveConfig (sync) detected plaintext apiKey — stripped before write. Use saveConfigAsync() to persist apiKey to keyStorage.");
    }
    const data = JSON.stringify(configToSave, null, 2);
    const tempPath = `${configFile}.tmp`;
    fs.writeFileSync(tempPath, data);
    fs.renameSync(tempPath, configFile);
    return true;
  } catch (error) {
    logger.error("Failed to save config", error instanceof Error ? error : undefined);
    return false;
  }
}

function maskApiKey(key: string): string {
  if (!key || key.length <= 8) return "****";
  if (key.startsWith("$secure:")) return "****-****";
  return key.slice(0, 4) + "****" + key.slice(-4);
}

async function handleConfig(method: string, _body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const config = await loadConfigAsync();

  const capabilities = ["text", "image", "vision", "video"];
  const status: Record<string, unknown> = {};

  capabilities.forEach((cap) => {
    const mapping = config.mapping?.[cap];
    if (mapping) {
      const [providerId] = mapping.split("/");
      const provider = config.providers.find((p) => p.id === providerId);
      if (provider && provider.apiKey) {
        status[cap] = {
          configured: true,
          provider: provider.name,
          available: true,
        };
      } else {
        status[cap] = {
          configured: false,
          provider: "未配置",
          available: false,
        };
      }
    } else {
      status[cap] = { configured: false, provider: "未配置", available: false };
    }
  });

  let safeConfig: AppConfig | undefined;
  if (method === "GET") {
    safeConfig = {
      ...config,
      providers: config.providers.map((p) => ({
        ...p,
        apiKey: maskApiKey(p.apiKey),
      })),
    };
  }

  return {
    success: true,
    status,
    config: safeConfig,
  };
}

async function handleSecureConfig(_method: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { operation, config: cfg } = body as { operation?: string; config?: AppConfig };

  switch (operation) {
    case "save":
      try {
        if (cfg && await saveConfigAsync(cfg)) {
          return { success: true };
        }
        return { success: false, error: "Failed to save config" };
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    case "load":
      try {
        const config = await loadConfigAsync();
        const safeConfig = {
          ...config,
          providers: config.providers.map((p) => ({
            ...p,
            apiKey: maskApiKey(p.apiKey),
          })),
        };
        return { success: true, config: safeConfig };
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    case "clear":
      try {
        const configFile = getConfigFile();
        if (fs.existsSync(configFile)) {
          const backupPath = `${configFile}.backup.${Date.now()}`;
          fs.copyFileSync(configFile, backupPath);
          fs.unlinkSync(configFile);
        }
        // 清除安全存储中的 API Key
        const keys = await keyStorage.list();
        if (keys.ok && keys.value) {
          for (const key of keys.value) {
            if (key.startsWith(KEY_STORAGE_PREFIX)) {
              await keyStorage.delete(key);
            }
          }
        }
        return { success: true };
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    default:
      return { success: false, error: "Unknown operation" };
  }
}

export {
  handleConfig,
  handleSecureConfig,
  loadConfig,
  loadConfigAsync,
  saveConfig,
  saveConfigAsync,
  getConfigFile,
  getConfigDir,
};
export type { AppConfig, ProviderConfig };
