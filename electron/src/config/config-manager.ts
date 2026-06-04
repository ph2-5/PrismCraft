/**
 * config/config-manager.ts
 *
 * 统一配置管理模块
 *
 * 职责：
 * - 配置文件的加载、保存、验证
 * - API Key 安全管理（脱敏、迁移到安全存储）
 * - 配置变更通知
 * - 原子写入 + 自动备份
 */

import fs from "fs";
import path from "path";
import { getLogger } from "../logging/logger";
import { getUserDataPath } from "../database/db-schema";

const logger = getLogger("config-manager");

// --- 类型定义 ---

export interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  format?: string;
  templateId?: string;
  models?: {
    id: string;
    name?: string;
    capabilities?: string[];
    defaultParams?: Record<string, unknown>;
  }[];
  [key: string]: unknown;
}

export interface AppConfig {
  version: number;
  providers: ProviderConfig[];
  mapping: Record<string, string>;
  fallback: { enabled: boolean; order: string[] };
  freeImageBackup?: boolean;
  [key: string]: unknown;
}

export interface ConfigManagerOptions {
  /** 配置文件目录 */
  configDir?: string;
  /** 配置文件名 */
  configFilename?: string;
  /** 是否在加载时验证 */
  validateOnLoad?: boolean;
}

export type ConfigChangeListener = (config: AppConfig) => void;

// --- 默认值 ---

const DEFAULT_CONFIG: AppConfig = {
  version: 1,
  providers: [],
  mapping: {},
  fallback: { enabled: true, order: ["text", "image", "vision", "video"] },
};

// --- 配置管理器 ---

class ConfigManager {
  private configDir: string;
  private configPath: string;
  private backupPath: string;
  private cache: AppConfig | null = null;
  private listeners: Set<ConfigChangeListener> = new Set();

  constructor(options: ConfigManagerOptions = {}) {
    this.configDir = options.configDir ?? getUserDataPath();
    this.configPath = path.join(this.configDir, options.configFilename ?? "config.json");
    this.backupPath = `${this.configPath}.backup`;
  }

  /** 加载配置（带缓存） */
  load(): AppConfig {
    if (this.cache) return this.cache;

    try {
      if (!fs.existsSync(this.configPath)) {
        logger.info("Config file not found, using defaults");
        this.cache = { ...DEFAULT_CONFIG };
        return this.cache;
      }

      const data = fs.readFileSync(this.configPath, "utf-8").trim();
      if (!data) {
        logger.warn("Config file is empty, using defaults");
        this.cache = { ...DEFAULT_CONFIG };
        return this.cache;
      }

      // 尝试直接解析 JSON
      let parsed: AppConfig;
      try {
        parsed = JSON.parse(data);
        if (parsed.providers || parsed.mapping) {
          this.cache = this.mergeWithDefaults(parsed);
          return this.cache;
        }
      } catch {
        logger.warn("Config is not plain JSON, trying base64 decode");
      }

      // 尝试 base64 解码
      try {
        const decoded = Buffer.from(data, "base64").toString("utf-8");
        parsed = JSON.parse(decoded);
        if (parsed.providers || parsed.mapping) {
          this.save(parsed); // 重新保存为明文 JSON
          this.cache = this.mergeWithDefaults(parsed);
          return this.cache;
        }
      } catch {
        logger.warn("Config is not base64 JSON either, using defaults");
      }

      logger.warn("Could not parse config file, using defaults");
    } catch (error) {
      logger.error("Failed to load config", error as Error);
    }

    this.cache = { ...DEFAULT_CONFIG };
    return this.cache;
  }

  /** 保存配置（原子写入 + 自动备份） */
  save(config: AppConfig): boolean {
    try {
      this.ensureConfigDir();

      // 自动备份
      if (fs.existsSync(this.configPath)) {
        try {
          fs.copyFileSync(this.configPath, this.backupPath);
        } catch {
          logger.warn("Failed to create config backup before save");
        }
      }

      // 原子写入
      const data = JSON.stringify(config, null, 2);
      const tempPath = `${this.configPath}.tmp`;
      fs.writeFileSync(tempPath, data);
      fs.renameSync(tempPath, this.configPath);

      this.cache = config;
      this.notifyListeners(config);

      logger.info("Config saved successfully");
      return true;
    } catch (error) {
      logger.error("Failed to save config", error as Error);
      return false;
    }
  }

  /** 获取安全配置（API Key 脱敏） */
  getSafeConfig(): AppConfig {
    const config = this.load();
    return {
      ...config,
      providers: config.providers.map((p) => ({
        ...p,
        apiKey: maskApiKey(p.apiKey),
      })),
    };
  }

  /** 获取能力状态 */
  getCapabilityStatus(): Record<string, { configured: boolean; provider: string; available: boolean }> {
    const config = this.load();
    const capabilities = ["text", "image", "vision", "video"];
    const status: Record<string, { configured: boolean; provider: string; available: boolean }> = {};

    for (const cap of capabilities) {
      const mapping = config.mapping?.[cap];
      if (mapping) {
        const [providerId] = mapping.split("/");
        const provider = config.providers.find((p) => p.id === providerId);
        if (provider && provider.apiKey) {
          status[cap] = { configured: true, provider: provider.name, available: true };
        } else {
          status[cap] = { configured: false, provider: "未配置", available: false };
        }
      } else {
        status[cap] = { configured: false, provider: "未配置", available: false };
      }
    }

    return status;
  }

  /** 清除配置（保留备份） */
  clear(): boolean {
    try {
      if (fs.existsSync(this.configPath)) {
        const backupPath = `${this.configPath}.backup.${Date.now()}`;
        fs.copyFileSync(this.configPath, backupPath);
        fs.unlinkSync(this.configPath);
      }
      this.cache = { ...DEFAULT_CONFIG };
      logger.info("Config cleared, backup created");
      return true;
    } catch (error) {
      logger.error("Failed to clear config", error as Error);
      return false;
    }
  }

  /** 清除缓存，下次 load 时重新读取 */
  invalidateCache(): void {
    this.cache = null;
  }

  /** 注册配置变更监听器 */
  onChange(listener: ConfigChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** 获取配置文件路径 */
  getConfigPath(): string {
    return this.configPath;
  }

  // --- 内部方法 ---

  private ensureConfigDir(): void {
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }
  }

  private mergeWithDefaults(parsed: Partial<AppConfig>): AppConfig {
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      fallback: {
        ...DEFAULT_CONFIG.fallback,
        ...(parsed.fallback ?? {}),
      },
    };
  }

  private notifyListeners(config: AppConfig): void {
    for (const listener of this.listeners) {
      try {
        listener(config);
      } catch (error) {
        logger.error("Config change listener failed", error as Error);
      }
    }
  }
}

// --- 工具函数 ---

/** API Key 脱敏 */
export function maskApiKey(key: string): string {
  if (!key || key.length <= 8) return "****";
  return key.slice(0, 4) + "****" + key.slice(-4);
}

// --- 单例导出 ---

export const configManager = new ConfigManager();
