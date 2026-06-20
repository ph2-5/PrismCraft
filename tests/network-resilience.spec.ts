import { test, expect, type Page } from "@playwright/test";
import { installElectronMock } from "./helpers/electron-mock";
import { captureConsoleErrors } from "./helpers/console-errors";

/**
 * 网络故障韧性测试
 *
 * 验证当 API 请求失败时，页面不会崩溃到白屏、不产生未捕获异常，
 * 且仍能渲染基本 UI 结构（正常应用或 ErrorBoundary 错误卡片）。
 *
 * 注意：
 * 1. 不使用 navigateTo/waitForAppReady，因为 waitForAppReady 内部调用
 *    waitForLoadState("networkidle")，当所有 API 路由返回 500 时该状态永不达到。
 * 2. 使用函数匹配器而非 glob 模式拦截 API 请求，因为 glob 会匹配 Vite 模块路径
 *    （如 src/infrastructure/api/client.ts），导致 JS 模块加载失败、React 无法挂载。
 *    函数匹配器仅拦截路径以 /api/ 开头的真实 API 端点。
 */
function isApiEndpoint(url: string): boolean {
  try {
    const path = new URL(url).pathname;
    return path.startsWith("/api/");
  } catch {
    return false;
  }
}

async function fulfill500(route: import("@playwright/test").Route) {
  await route.fulfill({
    status: 500,
    contentType: "application/json",
    body: JSON.stringify({ success: false, error: "Internal Server Error" }),
  });
}

async function navigateToWithApiFailure(page: Page, path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  // 等待 main 元素或 ErrorBoundary 卡片出现（应用已挂载或已降级到错误页）
  await Promise.race([
    page.locator("main").first().waitFor({ state: "visible", timeout: 30000 }),
    page.locator("[class*='min-h-screen']").first().waitFor({ state: "visible", timeout: 30000 }),
  ]);
  // 给应用一些时间处理失败的 API 响应
  await page.waitForTimeout(1500);
}

/**
 * 验证页面已渲染了有效内容（非白屏）。
 * 有效内容 = main 元素（正常应用）或 ErrorBoundary 卡片（降级错误页）。
 */
async function expectPageRendered(page: Page) {
  const mainVisible = await page.locator("main").first().isVisible().catch(() => false);
  const errorCardVisible = await page
    .locator("[class*='min-h-screen']")
    .first()
    .isVisible()
    .catch(() => false);
  expect(mainVisible || errorCardVisible, "Page should render either main content or error boundary (not blank)").toBe(true);
}

test.describe("Network Failure Resilience", () => {
  test.beforeEach(async ({ page }) => {
    await installElectronMock(page);

    // 拦截真实 API 端点（路径以 /api/ 开头）并返回 500 错误
    // 使用函数匹配器避免拦截 Vite 模块加载（如 /src/infrastructure/api/client.ts）
    await page.route("**/api/**", async (route) => {
      const url = route.request().url();
      if (isApiEndpoint(url)) {
        await fulfill500(route);
      } else {
        await route.continue();
      }
    });

    // 拦截外部资源请求并返回网络错误
    await page.route("**/external-api/**", (route) => route.abort("failed"));
  });

  test("should render home page without crash when API fails", async ({ page }) => {
    const getErrors = captureConsoleErrors(page);
    await navigateToWithApiFailure(page, "/");
    await expectPageRendered(page);

    const criticalErrors = getErrors().filter(
      (e) => !e.includes("500") && !e.includes("Internal Server Error"),
    );
    expect(criticalErrors, criticalErrors.join("\n")).toHaveLength(0);
  });

  test("should render story page without crash when API fails", async ({ page }) => {
    const getErrors = captureConsoleErrors(page);
    await navigateToWithApiFailure(page, "/story");
    await expectPageRendered(page);

    const criticalErrors = getErrors().filter(
      (e) => !e.includes("500") && !e.includes("Internal Server Error"),
    );
    expect(criticalErrors, criticalErrors.join("\n")).toHaveLength(0);
  });

  test("should render characters page without crash when API fails", async ({ page }) => {
    const getErrors = captureConsoleErrors(page);
    await navigateToWithApiFailure(page, "/characters");
    await expectPageRendered(page);

    const criticalErrors = getErrors().filter(
      (e) => !e.includes("500") && !e.includes("Internal Server Error"),
    );
    expect(criticalErrors, criticalErrors.join("\n")).toHaveLength(0);
  });

  test("should render settings page without crash when API fails", async ({ page }) => {
    const getErrors = captureConsoleErrors(page);
    await navigateToWithApiFailure(page, "/settings");
    await expectPageRendered(page);

    const criticalErrors = getErrors().filter(
      (e) => !e.includes("500") && !e.includes("Internal Server Error"),
    );
    expect(criticalErrors, criticalErrors.join("\n")).toHaveLength(0);
  });

  test("should render video-tasks page without crash when API fails", async ({ page }) => {
    const getErrors = captureConsoleErrors(page);
    await navigateToWithApiFailure(page, "/video-tasks");
    await expectPageRendered(page);

    const criticalErrors = getErrors().filter(
      (e) => !e.includes("500") && !e.includes("Internal Server Error"),
    );
    expect(criticalErrors, criticalErrors.join("\n")).toHaveLength(0);
  });

  test("should render asset-library page without crash when API fails", async ({ page }) => {
    const getErrors = captureConsoleErrors(page);
    await navigateToWithApiFailure(page, "/asset-library");
    await expectPageRendered(page);

    const criticalErrors = getErrors().filter(
      (e) => !e.includes("500") && !e.includes("Internal Server Error"),
    );
    expect(criticalErrors, criticalErrors.join("\n")).toHaveLength(0);
  });
});

test.describe("Slow Network Response Resilience", () => {
  test("should handle delayed API responses without crash", async ({ page }) => {
    await installElectronMock(page);

    // 模拟慢速 API（延迟 2 秒响应）— 仅拦截真实 API 端点
    await page.route("**/api/**", async (route) => {
      const url = route.request().url();
      if (!isApiEndpoint(url)) {
        await route.continue();
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, data: null }),
      });
    });

    const getErrors = captureConsoleErrors(page);
    await page.goto("/settings", { waitUntil: "domcontentloaded" });
    await Promise.race([
      page.locator("main").first().waitFor({ state: "visible", timeout: 30000 }),
      page.locator("[class*='min-h-screen']").first().waitFor({ state: "visible", timeout: 30000 }),
    ]);
    // 等待慢速 API 响应处理完成
    await page.waitForTimeout(3000);

    const criticalErrors = getErrors();
    expect(criticalErrors, criticalErrors.join("\n")).toHaveLength(0);
  });
});
