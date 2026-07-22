/**
 * 幂等迁移工厂 — 统一的单例 Promise 迁移模式。
 *
 * 背景：asset/props 和 character/variants 各自实现了相同的
 * "单例 Promise + 失败重试" 迁移初始化逻辑。本工厂提取该模式，
 * 由各模块传入具体的迁移函数和错误回调。
 *
 * 设计约束（shared-logic 层）：
 *  - 零外部依赖（仅允许本目录内相对导入）
 *  - 不依赖 logger；错误通过 onError 回调由调用方处理
 *  - 所有类型自包含
 */

/** 幂等迁移实例 */
export interface IdempotentMigration {
  /** 执行迁移（幂等，多次调用返回同一个 Promise） */
  initialize: () => Promise<number>;
  /** 重置单例状态（仅用于测试） */
  resetState: () => void;
}

/**
 * 创建幂等迁移实例。
 *
 * 行为：
 *  - 首次调用 initialize() 时执行 migrationFn，并缓存 Promise
 *  - 后续调用返回同一个 Promise（单例）
 *  - migrationFn 失败时调用 onError，重置 Promise 允许重试，返回 0
 *
 * @param migrationFn 迁移函数，返回迁移的记录数
 * @param onError 错误回调（由调用方处理日志）
 * @returns 幂等迁移实例
 */
export function createIdempotentMigration(
  migrationFn: () => Promise<number>,
  onError: (err: unknown) => void,
): IdempotentMigration {
  let migrationPromise: Promise<number> | null = null;

  async function initialize(): Promise<number> {
    if (migrationPromise !== null) {
      return migrationPromise;
    }
    migrationPromise = migrationFn().catch((err: unknown) => {
      onError(err);
      migrationPromise = null;
      return 0;
    });
    return migrationPromise;
  }

  function resetState(): void {
    migrationPromise = null;
  }

  return { initialize, resetState };
}
