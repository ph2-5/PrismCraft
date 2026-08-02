/**
 * tryWithFallback — 统一错误处理工具（P2.1 抽取）
 *
 * 消除项目中重复的 `try { ... } catch (err) { errorLogger.warn(scope, err); return fallback }` 模式。
 * 适用于"失败不阻塞主流程"的非关键路径，如：刷新历史列表、加载次要数据、读取缓存等。
 *
 * 关键路径（失败应抛出）请勿使用此工具，直接 try/catch 并向上传播错误。
 */

import { errorLogger } from "@/shared/error-logger";

/**
 * 执行 fn，失败时记录 warn 日志并返回 fallback。
 *
 * @param fn 要执行的函数（同步或异步）
 * @param fallback 失败时返回的兜底值
 * @param scope 日志标识，通常为模块名 + 操作名，如 "[useAgent] 刷新历史会话列表失败"
 * @returns fn 的成功结果，或 fallback
 *
 * @example
 * // 之前
 * try { return await refreshHistory(); }
 * catch (err) { errorLogger.warn("[useAgent] 刷新历史会话列表失败", err); return []; }
 * // 之后
 * return await tryWithFallback(refreshHistory, [], "[useAgent] 刷新历史会话列表失败");
 */
export async function tryWithFallback<T>(
  fn: () => Promise<T>,
  fallback: T,
  scope: string,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    errorLogger.warn(scope, err);
    return fallback;
  }
}

/**
 * 同步版本的 tryWithFallback。
 */
export function tryWithFallbackSync<T>(fn: () => T, fallback: T, scope: string): T {
  try {
    return fn();
  } catch (err) {
    errorLogger.warn(scope, err);
    return fallback;
  }
}
