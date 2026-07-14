import type { Page } from "@playwright/test";

/**
 * 已知的非关键错误模式，不应阻塞测试。
 *
 * 这些错误通常由 dev server 慢启动、外部 API 不可达、
 * 或浏览器扩展/环境差异引起，与被测代码无关。
 *
 * 注意：过滤规则应尽量收紧，避免吞掉真实 bug。
 * 任何新增过滤都必须附带具体场景说明。
 */
export const IGNORED_ERROR_PATTERNS = [
  // 静态资源缺失（dev 环境常见，与功能无关）
  /favicon/i,
  /manifest/i,
  // Service Worker 注册相关（dev 环境偶发）
  /service-worker/i,
  // 浏览器布局计算警告（良性循环警告，与功能无关）
  /ResizeObserver/i,
  // React hydration 不匹配（dev 环境偶发，生产环境会被严格检查）
  /hydration/i,
  // 框架相关（项目不使用 Next.js，但保留以防误报）
  /Next\.js/i,
  /webpack/i,
  // HMR / Fast Refresh（dev 专属，与生产无关）
  /HMR/i,
  /Fast Refresh/i,
  // 数据库 schema 同步（项目特定，迁移期间会输出警告）
  /\[SyncSchema\]/,
  /Schema update should be done/,
  // 网络类错误：dev server 慢启动或外部 API 不可达时偶发
  // 注意：这些错误在 dev 环境下是噪声（PluginManager 加载插件列表、API 探活等），
  // 但在生产环境下可能是真实 bug。如需严格检查，使用 captureConsoleErrors(page, { strict: true })
  /net::ERR/i,
  /ERR_CONNECTION_REFUSED/i,
  /Failed to fetch/i,
  /NetworkError/i,
  /ERR_NAME_NOT_RESOLVED/i,
  /localhost.*refused/i,
  // 404 资源错误：not-found 页面测试中，缺失资源返回 404 是预期行为
  /Failed to load resource.*404/i,
  /the server responded with a status of 404/i,
  // 400 资源错误：访问无效路由（如 /story/beat/invalid-id）时，某些 API 调用返回 400 是预期行为
  /Failed to load resource.*400/i,
  /the server responded with a status of 400/i,
  // PerfMonitor 慢查询警告：dev 环境下 SQLite 首次查询较慢，非关键错误
  /\[PerfMonitor\]/i,
  /db_query.*took \d+ms/i,
  /WARNING.*took \d+ms/i,
];

/**
 * 严格模式过滤规则（用于要求更高置信度的测试）。
 *
 * 与 IGNORED_ERROR_PATTERNS 的区别：
 * - 移除所有网络类错误过滤（任何 fetch 错误都视为关键）
 * - 移除 hydration 过滤（hydration 不匹配是真实 bug）
 * - 移除 404/400 资源错误过滤
 */
export const STRICT_IGNORED_ERROR_PATTERNS = [
  /favicon/i,
  /manifest/i,
  /service-worker/i,
  /ResizeObserver/i,
  /Next\.js/i,
  /webpack/i,
  /HMR/i,
  /Fast Refresh/i,
  /\[SyncSchema\]/,
  /Schema update should be done/,
  /\[PerfMonitor\]/i,
  /db_query.*took \d+ms/i,
  /WARNING.*took \d+ms/i,
];

/**
 * 判断控制台/页面错误是否为关键错误（需阻塞测试）。
 *
 * @param msg 错误消息
 * @param strict 是否使用严格模式（默认 false）。严格模式会暴露更多错误，
 *               适用于需要更高置信度的测试（如核心业务流程测试）。
 */
export function isCriticalError(msg: string, strict = false): boolean {
  const patterns = strict ? STRICT_IGNORED_ERROR_PATTERNS : IGNORED_ERROR_PATTERNS;
  return !patterns.some((p) => p.test(msg));
}

/**
 * 在页面上安装控制台错误和页面错误捕获。
 *
 * 返回一个函数，调用时可获取已收集的关键错误列表。
 *
 * @param page Playwright Page 实例
 * @param strict 是否使用严格模式（默认 false）。严格模式会暴露更多错误，
 *               适用于核心业务流程测试。严格模式不过滤：
 *               - 网络类错误（任何 fetch 失败都视为关键）
 *               - React hydration 不匹配
 *               - 404/400 资源错误
 *
 * 用法：
 * ```ts
 * // 标准模式（默认）
 * const getErrors = captureConsoleErrors(page);
 * // ... 执行测试操作 ...
 * const criticalErrors = getErrors();
 * expect(criticalErrors, criticalErrors.join("\n")).toHaveLength(0);
 *
 * // 严格模式（用于核心业务流程测试）
 * const getErrors = captureConsoleErrors(page, { strict: true });
 * ```
 */
export function captureConsoleErrors(
  page: Page,
  options: { strict?: boolean } = {},
): () => string[] {
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
    return all.filter((msg) => isCriticalError(msg, options.strict));
  };
}
