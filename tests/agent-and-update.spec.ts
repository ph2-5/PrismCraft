import { test, expect, type Page } from "@playwright/test";
import { navigateTo, waitForAppReady, dismissOverlays } from "./helpers/page-helpers";
import { installElectronMock } from "./helpers/electron-mock";
import { mockApiRoutes } from "./helpers/mock-api";
import { captureConsoleErrors } from "./helpers/console-errors";

let getErrors: () => string[] = () => [];

test.beforeEach(async ({ page }) => {
  getErrors = captureConsoleErrors(page);
});

test.afterEach(async () => {
  const consoleErrors = getErrors();
  expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
});

async function setupPage(page: Page, path: string) {
  await installElectronMock(page);
  await mockApiRoutes(page);
  await navigateTo(page, path);
}

test.describe("Agent Assistant Page", () => {
  test("should load agent page with title and input area", async ({ page }) => {
    await setupPage(page, "/agent");

    // 验证页面标题
    await expect(page.locator("h1", { hasText: "AI 助手" })).toBeVisible({ timeout: 10000 });

    // 验证输入框存在
    const textarea = page.locator("textarea");
    await expect(textarea).toBeVisible({ timeout: 5000 });

    // 验证占位符文本
    await expect(textarea).toHaveAttribute("placeholder", /请输入你的需求/);

    // 验证发送按钮存在
    await expect(page.locator("button", { hasText: "发送" })).toBeVisible({ timeout: 5000 });
  });

  test("should show empty state when no messages", async ({ page }) => {
    await setupPage(page, "/agent");

    await expect(page.locator("h1", { hasText: "AI 助手" })).toBeVisible({ timeout: 10000 });

    // 输入框应该可用
    const textarea = page.locator("textarea").first();
    await expect(textarea).toBeEnabled();

    // 输入文本
    await textarea.fill("测试消息");
    await expect(textarea).toHaveValue("测试消息");

    // 清空输入
    await textarea.clear();
    await expect(textarea).toHaveValue("");
  });

  test("should display history sidebar toggle", async ({ page }) => {
    await setupPage(page, "/agent");

    await expect(page.locator("h1", { hasText: "AI 助手" })).toBeVisible({ timeout: 10000 });

    // 验证侧边栏切换按钮存在（PanelLeft 图标按钮）
    const sidebarToggle = page.locator("button").filter({ has: page.locator("svg") }).first();
    await expect(sidebarToggle).toBeVisible({ timeout: 5000 });
  });

  test("should not have console errors on agent page", async ({ page }) => {
    await setupPage(page, "/agent");

    await waitForAppReady(page);
    await dismissOverlays(page);

    // 等待页面稳定
    await page.waitForTimeout(1000);

    // afterEach 会验证 console errors
  });
});

test.describe("Settings - Update Check", () => {
  test("should display version and update check button in system tab", async ({ page }) => {
    await setupPage(page, "/settings");

    // 切换到"系统状态"标签
    const systemTab = page.locator("[role='tab'], button", { hasText: "系统状态" }).last();
    await systemTab.waitFor({ state: "visible", timeout: 5000 });
    await systemTab.click({ force: true });
    await page.waitForTimeout(500);

    // 验证版本号显示
    await expect(page.locator("text=v1.2.2").first()).toBeVisible({ timeout: 5000 });

    // 验证"检查更新"按钮存在
    await expect(page.locator("button", { hasText: "检查更新" })).toBeVisible({ timeout: 5000 });
  });

  test("should handle check update click without errors", async ({ page }) => {
    await setupPage(page, "/settings");

    // 切换到"系统状态"标签
    const systemTab = page.locator("[role='tab'], button", { hasText: "系统状态" }).last();
    await systemTab.waitFor({ state: "visible", timeout: 5000 });
    await systemTab.click({ force: true });
    await page.waitForTimeout(500);

    // 点击"检查更新"按钮
    const checkBtn = page.locator("button", { hasText: "检查更新" }).first();
    await checkBtn.click({ force: true });

    // 等待检查完成（按钮文字变为"检查中..."然后恢复）
    await page.waitForTimeout(1000);

    // mock 返回 updateAvailable: false，应显示"已是最新版本"
    await expect(page.locator("text=已是最新版本").first()).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Home Page", () => {
  test("should load home page with main content", async ({ page }) => {
    await setupPage(page, "/");

    await waitForAppReady(page);
    await dismissOverlays(page);

    // 验证主内容区可见
    await expect(page.locator("main").first()).toBeVisible({ timeout: 10000 });
  });
});
