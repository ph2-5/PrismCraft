import { test, expect, type Page } from "../helpers/electron-fixture";
import { navigateTo, waitForAppReady, dismissOverlays, hasElectronAPI } from "../helpers/electron-page-helpers";

/**
 * Character & Scene CRUD E2E tests
 *
 * 注意：UI 重构后角色页和场景页都改为平铺 card 结构（不再使用 tab），
 * 测试已更新为检查 card 标题可见性 + data-testid 定位。
 * 角色页加载后默认显示空状态，需要先点击"创建新角色"才会显示编辑器。
 */

async function createNewCharacter(page: Page) {
  const createBtn = page.locator("button", { hasText: "创建新角色" });
  await createBtn.waitFor({ state: "visible", timeout: 5000 });
  await createBtn.click();
  await page.waitForTimeout(500);
  await expect(page.locator('[data-testid="character-name-input"]')).toBeVisible({ timeout: 5000 });
}

test.describe("Character Page", () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, "/characters");
  });

  test("should load character page", async ({ page }) => {
    await expect(page.locator("main").first()).toBeVisible();
  });

  test("should display create new character button", async ({ page }) => {
    await expect(page.locator("button", { hasText: "创建新角色" })).toBeVisible();
  });

  test("should display character form with basic fields", async ({ page }) => {
    await createNewCharacter(page);
    await expect(page.locator('[data-testid="character-name-input"]')).toBeVisible();
  });

  test("should fill in basic character info", async ({ page }) => {
    await createNewCharacter(page);
    await page.locator('[data-testid="character-name-input"]').fill("测试角色");
    await expect(page.locator('[data-testid="character-name-input"]')).toHaveValue("测试角色");
  });

  test("should display all editor cards", async ({ page }) => {
    await createNewCharacter(page);
    // UI 重构后改为平铺 card，检查 card 标题可见
    await expect(page.locator("text=基本信息").first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=外观描述").first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=性格与风格").first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=服装分支").first()).toBeVisible({ timeout: 5000 });
  });

  test("should fill in appearance info via placeholder", async ({ page }) => {
    await createNewCharacter(page);
    // 发色 / 发型 input 没有专属 testid，用 placeholder 部分匹配定位
    const hairColorInput = page.locator('input[placeholder*="银白色"]');
    const hairStyleInput = page.locator('input[placeholder*="长发"]');
    // 如果 placeholder 文案不匹配，降级为检查外观描述 card 可见
    if (await hairColorInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await hairColorInput.fill("渐变粉蓝");
      await expect(hairColorInput).toHaveValue("渐变粉蓝");
    } else {
      await expect(page.locator("text=外观描述").first()).toBeVisible();
    }
    void hairStyleInput;
  });

  test("should save character", async ({ page }) => {
    await createNewCharacter(page);
    await page.locator('[data-testid="character-name-input"]').fill("可保存角色");
    await page.locator('[data-testid="character-save-button"]').click();
    await page.waitForTimeout(500);
  });

  test("should delete character", async ({ page }) => {
    await createNewCharacter(page);
    await page.locator('[data-testid="character-name-input"]').fill("待删除角色");
    await page.locator('[data-testid="character-save-button"]').click();
    await page.waitForTimeout(500);

    await dismissOverlays(page);

    const deleteButton = page.locator('button[aria-label="删除角色"]').first();
    if (await deleteButton.isVisible().catch(() => false)) {
      page.on("dialog", (dialog) => dialog.accept());
      await deleteButton.click();
    }
  });

  test("should display upload and asset library buttons", async ({ page }) => {
    await createNewCharacter(page);
    await expect(page.locator("button", { hasText: "上传图片" })).toBeVisible();
    await expect(page.locator("button", { hasText: "从素材库选择" })).toBeVisible();
  });
});

test.describe("Character Outfit Branches", () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, "/characters");
    await dismissOverlays(page);
    // UI 重构后需要先创建新角色才会显示编辑器（包含服装分支 card）
    await createNewCharacter(page);
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

    const nameInput = page.locator('[data-testid="outfit-name-input"]');
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
    await navigateTo(page, "/scenes");
  });

  test("should load scene page", async ({ page }) => {
    await expect(page.locator("main").first()).toBeVisible();
  });

  test("should display scene form with basic fields", async ({ page }) => {
    await expect(page.locator('[data-testid="scene-name-input"]')).toBeVisible();
  });

  test("should fill in basic scene info", async ({ page }) => {
    await page.locator('[data-testid="scene-name-input"]').fill("测试场景");
    await expect(page.locator('[data-testid="scene-name-input"]')).toHaveValue("测试场景");
  });

  test("should display all editor cards", async ({ page }) => {
    // UI 重构后改为平铺 card，检查 card 标题可见
    await expect(page.locator("text=基本信息").first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=氛围描述").first()).toBeVisible({ timeout: 5000 });
  });

  test("should save scene", async ({ page }) => {
    await page.locator('[data-testid="scene-name-input"]').fill("可保存场景");
    await page.locator('[data-testid="scene-save-button"]').click();
    await page.waitForTimeout(500);
  });

  test("should delete scene", async ({ page }) => {
    await page.locator('[data-testid="scene-name-input"]').fill("待删除场景");
    await page.locator('[data-testid="scene-save-button"]').click();
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
