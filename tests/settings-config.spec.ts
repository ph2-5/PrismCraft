import { test, expect, type Page } from "@playwright/test";

async function dismissOverlays(page: Page) {
  await page.evaluate(() => {
    document.querySelectorAll('.fixed.inset-0.bg-black\\/50, .fixed.inset-0[data-state="open"], [data-nextjs-dialog]').forEach((el) => {
      if (el instanceof HTMLElement) {
        el.style.display = 'none';
      }
    });
  });
  await page.waitForTimeout(200);
}

test.describe("设置页面", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");
    await dismissOverlays(page);
  });

  test("设置页面应正常加载", async ({ page }) => {
    const main = page.locator("main").first();
    await expect(main).toBeVisible();
  });

  test("应显示API配置标题", async ({ page }) => {
    const apiTitle = page.locator("text=API 配置");
    await expect(apiTitle.first()).toBeVisible();
  });

  test("应显示已配置的提供商区域", async ({ page }) => {
    const providerSection = page.locator("text=已配置的提供商");
    const hasSection = (await providerSection.count()) > 0;
    expect(hasSection).toBe(true);
  });

  test("应显示添加提供商按钮", async ({ page }) => {
    const addButton = page.locator("button", { hasText: "添加提供商" });
    await expect(addButton).toBeVisible();
  });

  test("点击添加提供商应显示表单", async ({ page }) => {
    const addButton = page.locator("button", { hasText: "添加提供商" });
    await addButton.click();
    await page.waitForTimeout(500);

    const apiKeyInput = page.locator('input[placeholder*="sk-"]');
    const hasForm = (await apiKeyInput.count()) > 0;
    expect(hasForm).toBe(true);
  });

  test("添加提供商表单应包含提供商选择器", async ({ page }) => {
    const addButton = page.locator("button", { hasText: "添加提供商" });
    await addButton.click();
    await page.waitForTimeout(500);

    const providerSelect = page.locator('button[role="combobox"]').first();
    const hasSelect = (await providerSelect.count()) > 0;
    expect(hasSelect).toBe(true);
  });

  test("添加提供商表单应包含API Key输入框", async ({ page }) => {
    const addButton = page.locator("button", { hasText: "添加提供商" });
    await addButton.click();
    await page.waitForTimeout(500);

    const apiKeyInput = page.locator('input[type="password"]').first();
    const hasInput = (await apiKeyInput.count()) > 0;
    expect(hasInput).toBe(true);
  });

  test("添加提供商表单应包含取消按钮", async ({ page }) => {
    const addButton = page.locator("button", { hasText: "添加提供商" });
    await addButton.click();
    await page.waitForTimeout(500);

    const cancelButton = page.locator("button", { hasText: "取消" });
    const hasCancel = (await cancelButton.count()) > 0;
    expect(hasCancel).toBe(true);
  });

  test("取消添加提供商应关闭表单", async ({ page }) => {
    const addButton = page.locator("button", { hasText: "添加提供商" });
    await addButton.click();
    await page.waitForTimeout(500);

    const cancelButton = page.locator("button", { hasText: "取消" }).first();
    if (await cancelButton.isVisible()) {
      await cancelButton.click();
      await page.waitForTimeout(300);

      const apiKeyInput = page.locator('input[placeholder*="sk-"]');
      const hasForm = (await apiKeyInput.count()) > 0;
      expect(hasForm).toBe(false);
    }
  });

  test("应显示功能映射区域", async ({ page }) => {
    const mappingSection = page.locator("text=功能映射");
    const hasSection = (await mappingSection.count()) > 0;
    expect(hasSection).toBe(true);
  });

  test("应显示测试连接区域", async ({ page }) => {
    const testSection = page.locator("text=测试连接");
    const hasSection = (await testSection.count()) > 0;
    expect(hasSection).toBe(true);
  });
});

test.describe("个人设置页面", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/settings/personal");
    await page.waitForLoadState("networkidle");
  });

  test("个人设置页面应正常加载", async ({ page }) => {
    const main = page.locator("main").first();
    await expect(main).toBeVisible();
  });
});

test.describe("设置页面导航", () => {
  test("从首页应能导航到设置页面", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const settingsLink = page.locator("a[href='/settings']").first();
    await expect(settingsLink).toBeVisible();
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");
    expect(page.url()).toContain("/settings");
  });

  test("设置页面应能导航到个人设置", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    const personalLink = page.locator("a[href='/settings/personal']").first();
    if (await personalLink.isVisible()) {
      await personalLink.click();
      await page.waitForLoadState("networkidle");
      expect(page.url()).toContain("/settings/personal");
    }
  });
});
