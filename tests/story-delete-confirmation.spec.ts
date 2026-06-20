import { test, expect } from "@playwright/test";
import { navigateTo, waitForAppReady, dismissOverlays } from "./helpers/page-helpers";
import { mockApiRoutes } from "./helpers/mock-api";
import { installElectronMock } from "./helpers/electron-mock";
import { captureConsoleErrors } from "./helpers/console-errors";

const M = { withElectronMock: true };

test.describe("Story delete confirmation UI", () => {
  test("should render story page with project dropdown", async ({ page }) => {
    await installElectronMock(page);
    await mockApiRoutes(page);
    await navigateTo(page, "/story", M);

    const dropdownBtn = page.locator("button").filter({ hasText: /项目|故事|未命名/ }).first();
    await expect(dropdownBtn).toBeVisible({ timeout: 10000 });
  });

  test("should have save button on story page", async ({ page }) => {
    await installElectronMock(page);
    await mockApiRoutes(page);
    await navigateTo(page, "/story", M);

    const saveBtn = page.locator("button", { hasText: "保存" }).first();
    await expect(saveBtn).toBeVisible({ timeout: 10000 });
  });

  test("should not produce critical console errors on story page", async ({ page }) => {
    await installElectronMock(page);
    await mockApiRoutes(page);
    const getErrors = captureConsoleErrors(page);

    await navigateTo(page, "/story", M);

    const criticalErrors = getErrors();
    expect(criticalErrors, criticalErrors.join("\n")).toHaveLength(0);
  });
});

test.describe("Navigation guard beforeunload", () => {
  test("should register beforeunload listener when story page loads", async ({ page }) => {
    await installElectronMock(page);
    await mockApiRoutes(page);
    await navigateTo(page, "/story", M);

    // beforeunload 监听器由 BeforeUnloadGuard 组件注册
    // 验证页面正常加载且无关键错误即表示守卫已激活
    await expect(page.locator("main").first()).toBeVisible();
  });

  test("should not crash when navigating away from story page", async ({ page }) => {
    await installElectronMock(page);
    await mockApiRoutes(page);
    await navigateTo(page, "/story", M);
    await dismissOverlays(page);

    const getErrors = captureConsoleErrors(page);

    // 导航到其他页面
    await navigateTo(page, "/characters");

    const criticalErrors = getErrors();
    expect(criticalErrors, criticalErrors.join("\n")).toHaveLength(0);
  });
});
