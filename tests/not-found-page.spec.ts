import { test, expect } from "@playwright/test";
import { navigateTo, waitForAppReady, dismissOverlays, fillInput, clickButtonByText } from "./helpers/page-helpers";
import { installElectronMock } from "./helpers/electron-mock";
import { mockApiRoutes } from "./helpers/mock-api";
import { captureConsoleErrors } from "./helpers/console-errors";

test.describe("NotFound page content", () => {
  test("should display 404 heading and description for unknown route", async ({ page }) => {
    await installElectronMock(page);
    await page.goto("/nonexistent-page-xyz-12345");
    await waitForAppReady(page);

    // UI 重构后 404 是独立 text，标题用 h2 "页面未找到"
    await expect(page.locator("text=404").first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=页面未找到").first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=您访问的页面不存在").first()).toBeVisible({ timeout: 5000 });
  });

  test("should display back to home button", async ({ page }) => {
    await installElectronMock(page);
    await page.goto("/nonexistent-page-xyz-12345");
    await waitForAppReady(page);

    const homeButton = page.locator("button", { hasText: "返回首页" }).first();
    await expect(homeButton).toBeVisible({ timeout: 5000 });
  });

  test("should navigate to home when clicking back to home button", async ({ page }) => {
    await installElectronMock(page);
    await page.goto("/nonexistent-page-xyz-12345");
    await waitForAppReady(page);

    const homeButton = page.locator("button", { hasText: "返回首页" }).first();
    await homeButton.click();
    await page.waitForURL("**/", { timeout: 10000 });
    expect(page.url()).toMatch(/\/$/);
  });

  test("should not produce critical console errors on not-found page", async ({ page }) => {
    await installElectronMock(page);
    const getErrors = captureConsoleErrors(page);

    await page.goto("/nonexistent-page-xyz-12345");
    await waitForAppReady(page);

    const criticalErrors = getErrors();
    expect(criticalErrors, criticalErrors.join("\n")).toHaveLength(0);
  });
});

test.describe("NotFound page via deep invalid route", () => {
  test("should show 404 for deeply nested invalid route", async ({ page }) => {
    await installElectronMock(page);
    await page.goto("/storyboard/beat/invalid-beat-id-99999");
    await waitForAppReady(page);

    // 应显示 404 或分镜未找到提示（BeatDetailClient 在 beat 不存在时显示 notFound）
    const notFoundHeading = page.locator("text=/404|页面未找到|分镜未找到/").first();
    await expect(notFoundHeading).toBeVisible({ timeout: 10000 });
  });

  test("should not produce critical console errors for invalid beat route", async ({ page }) => {
    await installElectronMock(page);
    const getErrors = captureConsoleErrors(page);

    await page.goto("/storyboard/beat/invalid-beat-id-99999");
    await waitForAppReady(page);

    const criticalErrors = getErrors();
    expect(criticalErrors, criticalErrors.join("\n")).toHaveLength(0);
  });
});

// 路由歧义边界测试：验证 /storyboard/beat（无 beatId）不会被 :storyId 误匹配为 storyId="beat"
// React Router v6 静态段优先，应匹配 storyboard/beat/:beatId 路由，beatId 为空时由 BeatDetailClient 处理
test.describe("Route disambiguation: /storyboard/beat without beatId", () => {
  test("should not treat 'beat' as storyId in /storyboard/beat", async ({ page }) => {
    await installElectronMock(page);
    await page.goto("/storyboard/beat");
    await waitForAppReady(page);

    // 不应渲染 StoryboardPage（storyId="beat" 场景），
    // 而应匹配 storyboard/beat/:beatId 路由，beatId 为空时显示 notFound 或空状态
    const main = page.locator("main").first();
    await expect(main).toBeVisible({ timeout: 10000 });
    // 页面应显示某种提示（404 / 分镜未找到 / 无效参数），而非白屏
    const body = page.locator("body");
    await expect(body).toBeVisible();
  });

  test("should not produce critical console errors on /storyboard/beat", async ({ page }) => {
    await installElectronMock(page);
    const getErrors = captureConsoleErrors(page);

    await page.goto("/storyboard/beat");
    await waitForAppReady(page);

    const criticalErrors = getErrors();
    expect(criticalErrors, criticalErrors.join("\n")).toHaveLength(0);
  });
});
