/**
 * security/key-storage/key-storage.ts
 *
 * 密钥存储管理器 - 统一入口
 *
 * 职责：
 * - 管理所有存储策略的注册和选择
 * - 自动选择最优可用策略
 * - 提供简洁的 API 给外部使用
 * - 支持从明文配置自动迁移
 */

import type {
  KeyStorageStrategy,
  StorageResult,
} from "./types";
import { SafeStorageStrategy } from "./strategies/safe-storage.strategy";
import { PlaintextFallbackStrategy } from "./strategies/plaintext-fallback.strategy";
import { getLogger } from "../../logging/logger";

const logger = getLogger("key-storage");

class KeyStorageManager {
  private strategies: KeyStorageStrategy[] = [];
  private activeStrategy: KeyStorageStrategy | null = null;
  private initialized = false;

  /** 注册存储策略 */
  register(strategy: KeyStorageStrategy): void {
    this.strategies.push(strategy);
    // 按优先级排序
    this.strategies.sort((a, b) => a.priority - b.priority);
    // 重置活动策略，强制重新选择
    this.activeStrategy = null;
  }

  /** 获取指定名称的策略 */
  getStrategy(name: string): KeyStorageStrategy | undefined {
    return this.strategies.find((s) => s.name === name);
  }

  /** 获取所有已注册策略 */
  getAllStrategies(): KeyStorageStrategy[] {
    return [...this.strategies];
  }

  /** 获取当前活动策略 */
  getActiveStrategy(): KeyStorageStrategy | null {
    return this.activeStrategy;
  }

  /** 初始化 - 自动选择最优策略 */
  async initialize(): Promise<StorageResult> {
    if (this.initialized && this.activeStrategy) {
      return { ok: true, value: undefined };
    }

    for (const strategy of this.strategies) {
      if (strategy.isAvailable()) {
        this.activeStrategy = strategy;
        this.initialized = true;
        logger.info(`Using strategy: ${strategy.name}`);
        return { ok: true, value: undefined };
      }
    }

    return {
      ok: false,
      error: "No key storage strategy available",
    };
  }

  /** 保存密钥 */
  async save(key: string, value: string): Promise<StorageResult> {
    const strategy = await this.ensureStrategy();
    if (!strategy) {
      return { ok: false, error: "No storage strategy available" };
    }
    return strategy.save(key, value);
  }

  /** 读取密钥 */
  async load(key: string): Promise<StorageResult<string | null>> {
    const strategy = await this.ensureStrategy();
    if (!strategy) {
      return { ok: false, error: "No storage strategy available" };
    }
    return strategy.load(key);
  }

  /** 删除密钥 */
  async delete(key: string): Promise<StorageResult> {
    const strategy = await this.ensureStrategy();
    if (!strategy) {
      return { ok: false, error: "No storage strategy available" };
    }
    return strategy.delete(key);
  }

  /** 列出所有密钥 */
  async list(): Promise<StorageResult<string[]>> {
    const strategy = await this.ensureStrategy();
    if (!strategy) {
      return { ok: false, error: "No storage strategy available" };
    }
    return strategy.list();
  }

  /** 清空所有密钥 */
  async clear(): Promise<StorageResult> {
    const strategy = await this.ensureStrategy();
    if (!strategy) {
      return { ok: false, error: "No storage strategy available" };
    }
    return strategy.clear();
  }

  // --- 内部方法 ---

  private async ensureStrategy(): Promise<KeyStorageStrategy | null> {
    if (!this.initialized) {
      const result = await this.initialize();
      if (!result.ok) {
        logger.error(`Init failed: ${result.error}`);
        return null;
      }
    }
    return this.activeStrategy;
  }
}

// --- 单例导出 ---

/** 全局密钥存储管理器实例 */
export const keyStorage = new KeyStorageManager();

// 注册默认策略
keyStorage.register(new SafeStorageStrategy());
keyStorage.register(new PlaintextFallbackStrategy());

export { KeyStorageManager };
export type { KeyStorageStrategy, StorageResult, MigrationResult, EncryptedDataPacket } from "./types";
