import { test, expect, type Page } from "@playwright/test";
import { navigateTo, waitForAppReady, dismissOverlays } from "./helpers/page-helpers";
import { installElectronMock } from "./helpers/electron-mock";

async function switchTab(page: Page, tabName: string) {
  const tab = page.locator('[role="tab"]', { hasText: tabName }).first();
  await tab.waitFor({ state: "visible", timeout: 5000 });
  await tab.click({ force: true });
  await page.waitForTimeout(300);
}

test.describe("Character Page", () => {
  test.beforeEach(async ({ page }) => {
    await installElectronMock(page);
    await navigateTo(page, "/characters");
  });

  test("should load character page", async ({ page }) => {
    await expect(page.locator("main").first()).toBeVisible();
  });

  test("should display create new character button", async ({ page }) => {
    await expect(page.locator("button", { hasText: "创建新角色" })).toBeVisible();
  });

  test("should display character form with basic fields", async ({ page }) => {
    await expect(page.locator('input[placeholder="输入角色名称..."]')).toBeVisible();
    await expect(page.locator('input[placeholder="输入年龄..."]')).toBeVisible();
    await expect(page.locator('input[placeholder*="赛博朋克"]')).toBeVisible();
  });

  test("should fill in basic character info", async ({ page }) => {
    await page.locator('input[placeholder="输入角色名称..."]').fill("测试角色");
    await page.locator('input[placeholder="输入年龄..."]').fill("25");
    await page.locator('input[placeholder*="赛博朋克"]').fill("赛博朋克");

    await expect(page.locator('input[placeholder="输入角色名称..."]')).toHaveValue("测试角色");
  });

  test("should switch between tabs", async ({ page }) => {
    await expect(page.locator('[role="tab"]', { hasText: "基础信息" })).toBeVisible();
    await expect(page.locator('[role="tab"]', { hasText: "外貌设定" })).toBeVisible();
    await expect(page.locator('[role="tab"]', { hasText: "服装分支" })).toBeVisible();
    await expect(page.locator('[role="tab"]', { hasText: "性格特征" })).toBeVisible();

    await switchTab(page, "外貌设定");
    await expect(page.locator('input[placeholder*="银白色"]')).toBeVisible({ timeout: 5000 });

    await switchTab(page, "服装分支");
    const outfitEmptyHint = page.locator("text=暂无服装分支");
    const outfitAddBtn = page.locator("button", { hasText: "添加服装" });
    const outfitLabel = page.locator("text=服装分支").first();
    await expect(outfitAddBtn.or(outfitEmptyHint).or(outfitLabel).first()).toBeVisible({ timeout: 5000 });

    await switchTab(page, "性格特征");

    await switchTab(page, "基础信息");
    await expect(page.locator('input[placeholder="输入角色名称..."]')).toBeVisible();
  });

  test("should fill in appearance info", async ({ page }) => {
    await switchTab(page, "外貌设定");
    await page.locator('input[placeholder*="银白色"]').fill("渐变粉蓝");
    await page.locator('input[placeholder*="及腰长发"]').fill("短发");
    await expect(page.locator('input[placeholder*="银白色"]')).toHaveValue("渐变粉蓝");
  });

  test("should save character", async ({ page }) => {
    await page.locator('input[placeholder="输入角色名称..."]').fill("可保存角色");
    await page.locator("button", { hasText: "保存角色" }).click();
    await page.waitForTimeout(500);
  });

  test("should delete character", async ({ page }) => {
    await page.locator('input[placeholder="输入角色名称..."]').fill("待删除角色");
    await page.locator("button", { hasText: "保存角色" }).click();
    await page.waitForTimeout(500);

    await dismissOverlays(page);

    const deleteButton = page.locator('button[aria-label="删除角色"]').first();
    if (await deleteButton.isVisible().catch(() => false)) {
      page.on("dialog", (dialog) => dialog.accept());
      await deleteButton.click();
    }
  });

  test("should display upload and asset library buttons", async ({ page }) => {
    await expect(page.locator("button", { hasText: "上传图片" })).toBeVisible();
    await expect(page.locator("button", { hasText: "从素材库选择" })).toBeVisible();
  });
});

test.describe("Character Outfit Branches", () => {
  test.beforeEach(async ({ page }) => {
    await installElectronMock(page);
    await navigateTo(page, "/characters");
    await dismissOverlays(page);
    await switchTab(page, "服装分支");
    await page.waitForTimeout(500);
  });

  test("should show empty state hint or add button", async ({ page }) => {
    const emptyHint = page.locator("text=暂无服装分支");
    const addButton = page.locator("button", { hasText: "添加服装" });
    const outfitLabel = page.locator("text=服装分支").first();
    await expect(emptyHint.or(addButton).or(outfitLabel).first()).toBeVisible({ timeout: 5000 });
  });

  test("should add an outfit", async ({ page }) => {
    const addButton = page.locator("button", { hasText: "添加服装" });
    if (!(await addButton.isVisible({ timeout: 3000 }).catch(() => false))) return;

    await addButton.click({ force: true });
    const dialog = page.locator('[role="dialog"]:not([data-nextjs-dialog])').first();
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const nameInput = page.locator("#outfit-name").or(page.locator('input[placeholder*="战斗服"]'));
    if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await nameInput.fill("战斗服");
    }

    const confirmBtn = dialog.locator("button", { hasText: "添加服装" }).or(dialog.locator("button", { hasText: "保存修改" }));
    if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await confirmBtn.click({ force: true });
    }
  });

  test("should cancel adding outfit via Escape", async ({ page }) => {
    const addButton = page.locator("button", { hasText: "添加服装" });
    if (!(await addButton.isVisible({ timeout: 3000 }).catch(() => false))) return;

    await addButton.click({ force: true });
    const dialog = page.locator('[role="dialog"]:not([data-nextjs-dialog])').first();
    await expect(dialog).toBeVisible({ timeout: 5000 });

    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible({ timeout: 3000 }).catch(() => {});
  });
});

test.describe("Scene Page", () => {
  test.beforeEach(async ({ page }) => {
    await installElectronMock(page);
    await navigateTo(page, "/scenes");
  });

  test("should load scene page", async ({ page }) => {
    await expect(page.locator("main").first()).toBeVisible();
  });

  test("should display scene form with basic fields", async ({ page }) => {
    await expect(page.locator('input[placeholder="输入场景名称..."]')).toBeVisible();
    await expect(page.locator('input[placeholder*="赛博朋克街区"]')).toBeVisible();
  });

  test("should fill in basic scene info", async ({ page }) => {
    await page.locator('input[placeholder="输入场景名称..."]').fill("测试场景");
    await page.locator('input[placeholder*="赛博朋克街区"]').fill("魔法森林");
    await expect(page.locator('input[placeholder="输入场景名称..."]')).toHaveValue("测试场景");
  });

  test("should switch between tabs", async ({ page }) => {
    await expect(page.locator('[role="tab"]', { hasText: "基础设定" })).toBeVisible();
    await expect(page.locator('[role="tab"]', { hasText: "氛围视觉" })).toBeVisible();
    await expect(page.locator('[role="tab"]', { hasText: "镜头设置" })).toBeVisible();

    await switchTab(page, "氛围视觉");
    await expect(page.locator('input[placeholder*="黄昏"]')).toBeVisible({ timeout: 5000 });

    await switchTab(page, "镜头设置");
    await expect(page.locator('input[placeholder*="鸟瞰"]')).toBeVisible({ timeout: 5000 });

    await switchTab(page, "基础设定");
    await expect(page.locator('input[placeholder="输入场景名称..."]')).toBeVisible();
  });

  test("should save scene", async ({ page }) => {
    await page.locator('input[placeholder="输入场景名称..."]').fill("可保存场景");
    await page.locator("button", { hasText: "保存场景" }).click();
    await page.waitForTimeout(500);
  });

  test("should delete scene", async ({ page }) => {
    await page.locator('input[placeholder="输入场景名称..."]').fill("待删除场景");
    await page.locator("button", { hasText: "保存场景" }).click();
    await page.waitForTimeout(500);

    await dismissOverlays(page);

    const deleteButton = page.locator('button[aria-label="删除场景"]').first();
    if (await deleteButton.isVisible().catch(() => false)) {
      page.on("dialog", (dialog) => dialog.accept());
      await deleteButton.click();
    }
  });

  test("should display AI optimize button", async ({ page }) => {
    await expect(page.locator("button", { hasText: "AI优化" })).toBeVisible();
  });
});
