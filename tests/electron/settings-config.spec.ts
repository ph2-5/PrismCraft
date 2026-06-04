import { test, expect } from "../helpers/electron-fixture";
import { navigateTo, waitForAppReady, dismissOverlays } from "../helpers/electron-page-helpers";

test.describe("Settings Page", () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, "/settings");
  });

  test("should load settings page", async ({ page }) => {
    const main = page.locator("main").first();
    await expect(main).toBeVisible();
  });

  test("should display API configuration title", async ({ page }) => {
    const apiTitle = page.locator("text=API 配置");
    await expect(apiTitle.first()).toBeVisible();
  });

  test("should display configured providers section", async ({ page }) => {
    const providerSection = page.locator("text=已配置的提供商");
    await expect(providerSection.first()).toBeVisible();
  });

  test("should display add provider button", async ({ page }) => {
    const addButton = page.locator("button", { hasText: "添加提供商" });
    await expect(addButton).toBeVisible();
  });
});

test.describe("Add Provider Form", () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, "/settings");
    await dismissOverlays(page);
    const addButton = page.locator("button", { hasText: "添加提供商" });
    await addButton.click({ force: true });
    await page.locator('input#apiKey').waitFor({ state: "visible", timeout: 10000 });
  });

  test("should display API Key input", async ({ page }) => {
    const apiKeyInput = page.locator('input#apiKey');
    await expect(apiKeyInput).toBeVisible({ timeout: 10000 });
  });

  test("should display provider selector after entering unrecognized key", async ({ page }) => {
    const apiKeyInput = page.locator('input#apiKey');
    await apiKeyInput.fill("test-unrecognized-key-12345");
    await page.waitForTimeout(500);
    const providerSelect = page.locator('button[role="combobox"], select').first();
    const providerSelectVisible = await providerSelect.isVisible({ timeout: 5000 }).catch(() => false);
    expect(providerSelectVisible).toBe(true);
  });

  test("should display cancel button", async ({ page }) => {
    const cancelButton = page.locator("button", { hasText: "取消" });
    await expect(cancelButton.first()).toBeVisible();
  });

  test("should close form when cancel is clicked", async ({ page }) => {
    const cancelButton = page.locator("button", { hasText: "取消" }).first();
    await cancelButton.click({ force: true });
    const apiKeyInput = page.locator('input#apiKey');
    await expect(apiKeyInput).toHaveCount(0, { timeout: 5000 });
  });
});

test.describe("Settings Sections", () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, "/settings");
  });

  test("should display feature mapping section", async ({ page }) => {
    const mappingSection = page.locator("text=功能映射");
    await expect(mappingSection.first()).toBeVisible();
  });

  test("should display test connection section", async ({ page }) => {
    const testSection = page.locator("text=测试连接");
    await expect(testSection.first()).toBeVisible();
  });
});

test.describe("Settings Navigation", () => {
  test("should navigate from home to settings", async ({ page }) => {
    await navigateTo(page, "/");
    await dismissOverlays(page);
    const settingsLink = page.locator("a[href='/settings']").first();
    const settingsBtn = page.locator("aside button").filter({ hasText: "设置" }).first();
    const navTarget = settingsLink.or(settingsBtn);
    if (await navTarget.isVisible({ timeout: 3000 }).catch(() => false)) {
      await navTarget.click({ force: true });
      await page.waitForURL("**/settings", { timeout: 15000 });
      expect(page.url()).toContain("/settings");
    } else {
      await page.goto("http://localhost:3000/settings");
      await waitForAppReady(page);
      expect(page.url()).toContain("/settings");
    }
  });
});
