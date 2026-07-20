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
