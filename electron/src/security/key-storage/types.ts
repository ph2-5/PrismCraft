/**
 * security/key-storage/types.ts
 *
 * 密钥存储模块 - 核心类型定义
 *
 * 设计原则：
 * - 策略模式：所有存储后端实现统一接口
 * - 本地优先：默认使用 Electron safeStorage
 * - 云端就绪：加密数据可安全同步（无 masterKey 则无法解密）
 */

/** 存储操作结果 */
export type StorageResult<T = void> =
  | { ok: true; value: T }
  | { ok: false; error: string };

/** 存储策略接口 - 所有后端必须实现 */
export interface KeyStorageStrategy {
  /** 策略唯一标识 */
  readonly name: string;

  /** 策略优先级（数值越小优先级越高） */
  readonly priority: number;

  /** 检测当前环境是否支持此策略 */
  isAvailable(): boolean;

  /** 保存密钥 */
  save(key: string, value: string): Promise<StorageResult>;

  /** 读取密钥 */
  load(key: string): Promise<StorageResult<string | null>>;

  /** 删除密钥 */
  delete(key: string): Promise<StorageResult>;

  /** 列出所有已存储的密钥名称 */
  list(): Promise<StorageResult<string[]>>;

  /** 清空所有密钥 */
  clear(): Promise<StorageResult>;
}

/** 加密数据包格式（用于文件存储策略） */
export interface EncryptedDataPacket {
  /** 加密算法标识 */
  alg: string;
  /** 初始化向量（Base64） */
  iv: string;
  /** 认证标签（Base64，GCM 模式） */
  tag: string;
  /** 密文（Base64） */
  ciphertext: string;
  /** 加密时间（ISO 8601） */
  createdAt: string;
  /** 加密策略名称 */
  strategy: string;
}

/** 密钥存储管理器配置 */
export interface KeyStorageConfig {
  /** 加密数据文件路径 */
  encryptedDataPath?: string;
  /** 是否在启动时自动迁移明文配置 */
  autoMigrate?: boolean;
  /** 强制使用指定策略（调试用） */
  forceStrategy?: string;
}

/** 迁移结果 */
export interface MigrationResult {
  /** 是否执行了迁移 */
  migrated: boolean;
  /** 迁移的密钥数量 */
  keysMigrated: number;
  /** 使用的策略 */
  strategy: string;
  /** 迁移耗时（ms） */
  duration: number;
}
