/**
 * Task 2A.8 — 服装数据迁移初始化
 *
 * 在应用启动后（或素材库页面首次加载时）调用，自动将 character_outfits
 * 表中的服装数据迁移到 props 表。迁移操作幂等，可重复执行。
 *
 * 调用方式：
 *   - 在素材库页面首次挂载时调用 initializePropMigration()
 *   - 或通过 UI 按钮（"导入现有服装"）触发 useMigrateOutfits hook
 *
 * 设计决策：
 *   - 不在 main process 启动时迁移，避免阻塞应用启动
 *   - 不强制迁移，保留用户选择权（可手动触发）
 *   - 迁移失败不阻塞 UI，仅记录日志
 */
import { migrateOutfitsToProps } from "./prop-crud";
import { errorLogger } from "@/shared/error-logger";

let migrationPromise: Promise<number> | null = null;

/**
 * 初始化服装数据迁移（幂等，多次调用只执行一次）
 *
 * @returns 迁移的记录数（0 表示无需迁移或已迁移过）
 */
export async function initializePropMigration(): Promise<number> {
  if (migrationPromise !== null) {
    return migrationPromise;
  }
  migrationPromise = migrateOutfitsToProps().catch((err) => {
    errorLogger.warn("[PropMigration] 服装数据迁移失败", err);
    migrationPromise = null; // 失败后允许重试
    return 0;
  });
  return migrationPromise;
}

/** 重置迁移状态（仅用于测试） */
export function _resetMigrationState(): void {
  migrationPromise = null;
}
