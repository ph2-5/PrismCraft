import type { Page } from "@playwright/test";

/**
 * 已知的非关键错误模式，不应阻塞测试。
 *
 * 这些错误通常由 dev server 慢启动、外部 API 不可达、
 * 或浏览器扩展/环境差异引起，与被测代码无关。
 */
export const IGNORED_ERROR_PATTERNS = [
  /favicon/i,
  /manifest/i,
  /service-worker/i,
  /ResizeObserver/i,
  /Loading chunk/i,
  /hydration/i,
  /Next\.js/i,
  /webpack/i,
  /HMR/i,
  /Fast Refresh/i,
  /\[SyncSchema\]/,
  /Schema update should be done/,
  // 网络类错误：dev server 慢启动或 API provider 不可达时偶发
  /net::ERR/i,
  /ERR_CONNECTION_REFUSED/i,
  /Failed to fetch/i,
  /NetworkError/i,
  /ERR_NAME_NOT_RESOLVED/i,
  /localhost.*refused/i,
  // 404 资源错误：not-found 页面测试中，缺失资源返回 404 是预期行为
  /Failed to load resource.*404/i,
  /the server responded with a status of 404/i,
  // PerfMonitor 慢查询警告：dev 环境下 SQLite 首次查询较慢，非关键错误
  /\[PerfMonitor\]/i,
  /db_query.*took \d+ms/i,
  /WARNING.*took \d+ms/i,
];

/**
 * 判断控制台/页面错误是否为关键错误（需阻塞测试）。
 */
export function isCriticalError(msg: string): boolean {
  return !IGNORED_ERROR_PATTERNS.some((p) => p.test(msg));
}

/**
 * 在页面上安装控制台错误和页面错误捕获。
 *
 * 返回一个函数，调用时可获取已收集的关键错误列表。
 *
 * 用法：
 * ```ts
 * const getErrors = captureConsoleErrors(page);
 * // ... 执行测试操作 ...
 * const criticalErrors = getErrors();
 * expect(criticalErrors, criticalErrors.join("\n")).toHaveLength(0);
 * ```
 */
export function captureConsoleErrors(page: Page): () => string[] {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });

  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  return () => {
    const all = [...consoleErrors, ...pageErrors];
    return all.filter(isCriticalError);
  };
}
