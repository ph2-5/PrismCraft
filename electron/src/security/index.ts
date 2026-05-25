/**
 * security/index.ts
 *
 * 安全模块 - 统一导出
 */

export { keyStorage, KeyStorageManager } from "./key-storage/key-storage";
export type {
  KeyStorageStrategy,
  StorageResult,
  MigrationResult,
  EncryptedDataPacket,
  KeyStorageConfig,
} from "./key-storage/types";

export { ssrfGuard, SsrfGuard } from "./ssrf-guard/ssrf-guard";
export type { SsrfValidationResult, SsrfGuardConfig } from "./ssrf-guard/ssrf-guard";
