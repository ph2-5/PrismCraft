/**
 * Task 2A.10 — Outfit → Variant 迁移入口
 *
 * 单例 Promise 模式，避免重复迁移。
 * 参考实现：src/modules/asset/props/services/migrate-outfits.ts
 */

import { createIdempotentMigration } from "@/shared-logic/migration";
import { migrateOutfitsToVariants } from "./variant-crud";
import { errorLogger } from "@/shared/error-logger";

const migration = createIdempotentMigration(
  migrateOutfitsToVariants,
  (err) => errorLogger.warn("[VariantMigration] 服装数据迁移失败", err),
);

/**
 * 初始化服装 → 变体迁移（幂等）。
 * 多次调用返回同一个 Promise（单例）。
 * 失败后允许重试（重置 Promise）。
 *
 * @returns 迁移的记录数
 */
export const initializeVariantMigration = migration.initialize;

/** 仅测试用：重置单例状态 */
export const _resetVariantMigrationState = migration.resetState;
