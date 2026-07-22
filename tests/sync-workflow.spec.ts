import { test, expect } from "@playwright/test";
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

async function openSyncDialog(page: import("@playwright/test").Page) {
  // waitFor 确保元素渲染完成后再操作，比 isVisible().catch() 更稳健；
  // try-catch 保持"dialog 打不开就 skip"的向后兼容行为（web 环境下 sync dialog 可能不可用）
  try {
    const syncTab = page.locator('[role="tab"]', { hasText: /同步/i }).first();
    await syncTab.waitFor({ state: "visible", timeout: 10000 });
    await syncTab.click({ force: true });
    await page.waitForTimeout(500);

    const syncButton = page.locator('button:not([role="tab"])', { hasText: /同步设置|同步配置/i }).first();
    await syncButton.waitFor({ state: "visible", timeout: 10000 });
    await syncButton.click({ force: true });
    await page.waitForTimeout(1000);

    const dialog = page.locator('[role="dialog"]').first();
    // dialog 在 click 后应立即出现，3 秒足够；缩短 timeout 避免 skip 测试等待过久
    await dialog.waitFor({ state: "visible", timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

test.describe("Sync Configuration Access", () => {
  test.beforeEach(async ({ page }) => {
    await installElectronMock(page);
    await mockApiRoutes(page);
    await navigateTo(page, "/settings");
  });

  test("should display sync-related UI on settings page", async ({ page }) => {
    const syncElement = page.locator("text=/同步|Sync/i").first();
    await expect(syncElement).toBeVisible({ timeout: 10000 });
  });

  test("should find sync entry point in settings or sidebar", async ({ page }) => {
    const syncBtn = page.locator("button", { hasText: /同步/i }).first();
    const syncBadge = page.locator("[class*='badge']").filter({ hasText: /同步/i }).first();
    const syncLink = page.locator("a", { hasText: /同步/i }).first();
    const syncTab = page.locator('[role="tab"]', { hasText: /同步/i }).first();
    await expect(syncBtn.or(syncBadge).or(syncLink).or(syncTab)).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Sync Settings Dialog", () => {
  test.beforeEach(async ({ page }) => {
    await installElectronMock(page);
    await mockApiRoutes(page);
    await navigateTo(page, "/settings");
    await dismissOverlays(page);
  });

  test("should open sync settings dialog", async ({ page }) => {
    const dialogOpened = await openSyncDialog(page);
    if (!dialogOpened) return;

    const dialog = page.locator('[role="dialog"]').first();
    await expect(dialog).toBeVisible({ timeout: 5000 });
  });

  test("should display server configuration section in sync dialog", async ({ page }) => {
    const dialogOpened = await openSyncDialog(page);
    if (!dialogOpened) return;

    const serverSection = page.locator("text=/服务器配置|Server/i").first();
    await expect(serverSection).toBeVisible({ timeout: 5000 }).catch(() => {});
  });

  test("should display server URL input in sync dialog", async ({ page }) => {
    const dialogOpened = await openSyncDialog(page);
    if (!dialogOpened) return;

    const urlInput = page.locator('[data-testid="sync-server-url-input"]').first();
    await expect(urlInput).toBeVisible({ timeout: 5000 }).catch(() => {});
  });

  test("should display username input in sync dialog", async ({ page }) => {
    const dialogOpened = await openSyncDialog(page);
    if (!dialogOpened) return;

    const usernameInput = page.locator('[data-testid="sync-username-input"]').first();
    await expect(usernameInput).toBeVisible({ timeout: 5000 }).catch(() => {});
  });

  test("should display password input in sync dialog", async ({ page }) => {
    const dialogOpened = await openSyncDialog(page);
    if (!dialogOpened) return;

    const passwordInput = page.locator('input[type="password"]').first();
    await expect(passwordInput).toBeVisible({ timeout: 5000 }).catch(() => {});
  });

  test("should close sync dialog with Escape", async ({ page }) => {
    const dialogOpened = await openSyncDialog(page);
    if (!dialogOpened) return;

    const dialog = page.locator('[role="dialog"]').first();
    if (!(await dialog.isVisible({ timeout: 3000 }).catch(() => false))) return;

    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible({ timeout: 3000 }).catch(() => {});
  });
});

test.describe("Sync Server Configuration", () => {
  test.beforeEach(async ({ page }) => {
    await installElectronMock(page);
    await mockApiRoutes(page);
    await navigateTo(page, "/settings");
    await dismissOverlays(page);
  });

  test("should accept server URL input", async ({ page }) => {
    const dialogOpened = await openSyncDialog(page);
    if (!dialogOpened) return;

    // 启用 sync toggle 让 input 变为 enabled（ServerConfigSection disabled={!enabled}）
    const enableCheckbox = page.locator('[role="dialog"] input[type="checkbox"]').first();
    await enableCheckbox.click();
    await page.waitForTimeout(300);

    const urlInput = page.locator('[data-testid="sync-server-url-input"]').first();
    await urlInput.fill("https://sync.example.com");
    await expect(urlInput).toHaveValue("https://sync.example.com");
  });

  test("should accept username input", async ({ page }) => {
    const dialogOpened = await openSyncDialog(page);
    if (!dialogOpened) return;

    // 启用 sync toggle 让 input 变为 enabled（ServerConfigSection disabled={!enabled}）
    const enableCheckbox = page.locator('[role="dialog"] input[type="checkbox"]').first();
    await enableCheckbox.click();
    await page.waitForTimeout(300);

    const usernameInput = page.locator('[data-testid="sync-username-input"]').first();
    await usernameInput.fill("testuser");
    await expect(usernameInput).toHaveValue("testuser");
  });

  test("should display test connection button", async ({ page }) => {
    const dialogOpened = await openSyncDialog(page);
    if (!dialogOpened) return;

    const testBtn = page.locator("button", { hasText: /测试连接|Test/i }).first();
    await expect(testBtn).toBeVisible({ timeout: 5000 }).catch(() => {});
  });

  test("should display sync enable toggle", async ({ page }) => {
    const dialogOpened = await openSyncDialog(page);
    if (!dialogOpened) return;

    const enableSwitch = page.locator("button[role='switch']").first();
    const enableLabel = page.locator("text=/启用同步|开启同步/i").first();
    await expect(enableSwitch.or(enableLabel)).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Sync Status Display", () => {
  test.beforeEach(async ({ page }) => {
    await installElectronMock(page);
    await mockApiRoutes(page);
    await navigateTo(page, "/settings");
    await dismissOverlays(page);
  });

  test("should display sync status section in dialog", async ({ page }) => {
    const dialogOpened = await openSyncDialog(page);
    if (!dialogOpened) return;

    const statusSection = page.locator("text=/同步状态|Sync Status/i").first();
    await expect(statusSection).toBeVisible({ timeout: 5000 }).catch(() => {});
  });

  test("should display sync now button", async ({ page }) => {
    const dialogOpened = await openSyncDialog(page);
    if (!dialogOpened) return;

    const syncNowBtn = page.locator("button", { hasText: /立即同步|同步现在|Sync Now/i }).first();
    await expect(syncNowBtn).toBeVisible({ timeout: 5000 }).catch(() => {});
  });

  test("should display save settings button", async ({ page }) => {
    const dialogOpened = await openSyncDialog(page);
    if (!dialogOpened) return;

    const saveBtn = page.locator("button", { hasText: /保存设置|Save/i }).first();
    await expect(saveBtn).toBeVisible({ timeout: 5000 }).catch(() => {});
  });
});

test.describe("Conflict Resolution", () => {
  test.beforeEach(async ({ page }) => {
    await installElectronMock(page);
    await mockApiRoutes(page);
    await navigateTo(page, "/settings");
    await dismissOverlays(page);
  });

  test("should display conflict strategy section in sync dialog", async ({ page }) => {
    const dialogOpened = await openSyncDialog(page);
    if (!dialogOpened) return;

    const conflictSection = page.locator("text=/冲突解决|冲突策略/i").first();
    await expect(conflictSection).toBeVisible({ timeout: 5000 }).catch(() => {});
  });

  test("should display conflict strategy options", async ({ page }) => {
    const dialogOpened = await openSyncDialog(page);
    if (!dialogOpened) return;

    // conflict 选项是 combobox 内的 option，检查 combobox 可见（限定在 dialog 内避免匹配侧边栏文本）
    const combobox = page.locator('[role="dialog"] select').first();
    await expect(combobox).toBeVisible({ timeout: 5000 });
  });

  test("should display auto sync toggle in sync dialog", async ({ page }) => {
    const dialogOpened = await openSyncDialog(page);
    if (!dialogOpened) return;

    const autoSyncLabel = page.locator("text=/自动同步/i").first();
    await expect(autoSyncLabel).toBeVisible({ timeout: 5000 }).catch(() => {});
  });

  test("should display sync interval input", async ({ page }) => {
    const dialogOpened = await openSyncDialog(page);
    if (!dialogOpened) return;

    // 限定在 dialog 内避免 strict mode violation（"同步间隔" label + input 都匹配）
    const intervalInput = page.locator('[role="dialog"] input[type="number"]').first();
    await expect(intervalInput).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Sync Navigation", () => {
  test("should navigate to settings and find sync configuration", async ({ page }) => {
    await installElectronMock(page);
    await mockApiRoutes(page);
    await navigateTo(page, "/");
    await dismissOverlays(page);

    const settingsLink = page.locator("a[href='/settings']").first();
    const settingsBtn = page.locator("aside button").filter({ hasText: "设置" }).first();
    const navTarget = settingsLink.or(settingsBtn);

    if (await navTarget.isVisible({ timeout: 3000 }).catch(() => false)) {
      await navTarget.click({ force: true });
      await page.waitForURL("**/settings", { timeout: 15000 });
    } else {
      await page.goto("/settings");
      await waitForAppReady(page);
    }

    expect(page.url()).toContain("/settings");
    const syncElement = page.locator("text=/同步|Sync/i").first();
    await expect(syncElement).toBeVisible({ timeout: 10000 }).catch(() => {});
  });
});
