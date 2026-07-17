/**
 * Task 2A.10 — Outfit → Variant 迁移入口
 *
 * 单例 Promise 模式，避免重复迁移。
 * 参考实现：src/modules/asset/props/services/migrate-outfits.ts
 */

import { migrateOutfitsToVariants } from "./variant-crud";
import { errorLogger } from "@/shared/error-logger";

let migrationPromise: Promise<number> | null = null;

/**
 * 初始化服装 → 变体迁移（幂等）。
 * 多次调用返回同一个 Promise（单例）。
 * 失败后允许重试（重置 Promise）。
 *
 * @returns 迁移的记录数
 */
export async function initializeVariantMigration(): Promise<number> {
  if (migrationPromise !== null) {
    return migrationPromise;
  }
  migrationPromise = migrateOutfitsToVariants().catch((err) => {
    errorLogger.warn("[VariantMigration] 服装数据迁移失败", err);
    migrationPromise = null;
    return 0;
  });
  return migrationPromise;
}

/** 仅测试用：重置单例状态 */
export function _resetVariantMigrationState(): void {
  migrationPromise = null;
}
