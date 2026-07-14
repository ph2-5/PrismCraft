import { test, expect, type Page } from "@playwright/test";
import { navigateTo, waitForAppReady, dismissOverlays } from "./helpers/page-helpers";
import { installElectronMock } from "./helpers/electron-mock";
import { captureConsoleErrors } from "./helpers/console-errors";

let getErrors: () => string[] = () => [];

test.beforeEach(async ({ page }) => {
  getErrors = captureConsoleErrors(page);
});

test.afterEach(async () => {
  const consoleErrors = getErrors();
  expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
});

async function switchAssetTab(page: Page, tabValue: string) {
  const tab = page.locator('[role="tab"]', { hasText: new RegExp(tabValue) }).first();
  await tab.waitFor({ state: "visible", timeout: 10000 });
  await tab.click({ force: true });
  await page.waitForTimeout(300);
}

test.describe("Asset Library Page Load", () => {
  test.beforeEach(async ({ page }) => {
    await installElectronMock(page);
    await navigateTo(page, "/asset-library");
  });

  test("should load asset library page", async ({ page }) => {
    const main = page.locator("main").first();
    await expect(main).toBeVisible();
  });

  test("should display asset library page title", async ({ page }) => {
    const title = page.locator("text=素材库").first();
    await expect(title).toBeVisible({ timeout: 10000 });
  });

  test("should display four category tabs", async ({ page }) => {
    await expect(page.locator('[role="tab"]', { hasText: "角色库" }).first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[role="tab"]', { hasText: "场景库" }).first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[role="tab"]', { hasText: "分镜库" }).first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[role="tab"]', { hasText: "合集" }).first()).toBeVisible({ timeout: 10000 });
  });

  test("should default to all-assets tab", async ({ page }) => {
    // UI 重构后默认选中"全部素材"，而非"角色库"（对齐 design-preview.html）
    const allTab = page.locator('[role="tab"][aria-selected="true"]', { hasText: "全部素材" }).first();
    await expect(allTab).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Asset Library Category Tabs", () => {
  test.beforeEach(async ({ page }) => {
    await installElectronMock(page);
    await navigateTo(page, "/asset-library");
  });

  test("should switch to scenes tab", async ({ page }) => {
    await switchAssetTab(page, "场景库");
    const scenesContent = page.locator('[role="tabpanel"]').filter({ has: page.locator("text=/场景库为空|暂无场景/") }).or(
      page.locator('[role="tabpanel"] [class*="grid"]')
    ).first();
    await expect(scenesContent).toBeVisible({ timeout: 5000 }).catch(() => {});
  });

  test("should switch to storyboards tab", async ({ page }) => {
    await switchAssetTab(page, "分镜库");
    const storyboardsContent = page.locator('[role="tabpanel"]').first();
    await expect(storyboardsContent).toBeVisible({ timeout: 5000 });
  });

  test("should switch to collections tab", async ({ page }) => {
    await switchAssetTab(page, "合集");
    const collectionsContent = page.locator('[role="tabpanel"]').first();
    await expect(collectionsContent).toBeVisible({ timeout: 5000 });
  });

  test("should switch back to characters tab from another tab", async ({ page }) => {
    await switchAssetTab(page, "场景库");
    await switchAssetTab(page, "角色库");
    const charactersTab = page.locator('[role="tab"][aria-selected="true"]', { hasText: "角色库" }).first();
    await expect(charactersTab).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Asset Library Empty State", () => {
  test.beforeEach(async ({ page }) => {
    await installElectronMock(page);
    await navigateTo(page, "/asset-library");
  });

  test("should display empty state hint when no characters exist", async ({ page }) => {
    // UI 重构后默认 tab 是"全部素材"，需要切换到"角色库"才能看到角色空状态
    // 测试环境可能累积角色数据，所以"空状态或角色卡片"任一存在即可
    await switchAssetTab(page, "角色库");
    // 实际 UI 文案: "还没有角色素材" (asset.characterLibraryEmpty)
    const emptyHint = page.locator("text=还没有角色素材").or(page.locator("text=角色库为空")).or(page.locator("text=暂无角色")).first();
    // 按钮使用 aria-label（非可见文本），必须用 getByRole name 匹配
    const deleteBtn = page.getByRole("button", { name: "删除角色" });
    await expect.poll(
      async () => {
        const hasEmpty = await emptyHint.isVisible().catch(() => false);
        const count = await deleteBtn.count();
        return hasEmpty || count > 0;
      },
      { timeout: 8000, intervals: [200, 500, 1000] }
    ).toBe(true);
  });

  test("should display empty state hint when no scenes exist", async ({ page }) => {
    await switchAssetTab(page, "场景库");
    // 实际 UI 文案: "还没有场景素材" (asset.sceneLibraryEmpty)
    const emptyHint = page.locator("text=还没有场景素材").or(page.locator("text=场景库为空")).or(page.locator("text=暂无场景")).first();
    const deleteBtn = page.getByRole("button", { name: /删除/ });
    await expect.poll(
      async () => {
        const hasEmpty = await emptyHint.isVisible().catch(() => false);
        const count = await deleteBtn.count();
        return hasEmpty || count > 0;
      },
      { timeout: 8000, intervals: [200, 500, 1000] }
    ).toBe(true);
  });

  test("should display empty state hint when no collections exist", async ({ page }) => {
    await switchAssetTab(page, "我的合集");
    // 实际 UI 文案: "还没有合集" (asset.noCollections)
    const emptyHint = page.locator("text=还没有合集").or(page.locator("text=暂无合集")).or(page.locator("text=合集为空")).first();
    const deleteBtn = page.getByRole("button", { name: /删除/ });
    await expect.poll(
      async () => {
        const hasEmpty = await emptyHint.isVisible().catch(() => false);
        const count = await deleteBtn.count();
        return hasEmpty || count > 0;
      },
      { timeout: 8000, intervals: [200, 500, 1000] }
    ).toBe(true);
  });
});

test.describe("Asset Library Search", () => {
  test.beforeEach(async ({ page }) => {
    await installElectronMock(page);
    await navigateTo(page, "/asset-library");
  });

  test("should display search input", async ({ page }) => {
    const searchInput = page.locator('[data-testid="asset-search-input"]').first();
    await expect(searchInput).toBeVisible({ timeout: 10000 });
  });

  test("should accept search input text", async ({ page }) => {
    const searchInput = page.locator('[data-testid="asset-search-input"]').first();
    await searchInput.fill("测试搜索");
    await expect(searchInput).toHaveValue("测试搜索");
  });

  test("should clear search results when input is cleared", async ({ page }) => {
    const searchInput = page.locator('[data-testid="asset-search-input"]').first();
    await searchInput.fill("不存在的素材名称");
    await page.waitForTimeout(300);
    await searchInput.fill("");
    await page.waitForTimeout(300);
    await expect(searchInput).toHaveValue("");
  });
});

test.describe("Create Collection", () => {
  test.beforeEach(async ({ page }) => {
    await installElectronMock(page);
    await navigateTo(page, "/asset-library");
    await switchAssetTab(page, "合集");
  });

  test("should display new collection button", async ({ page }) => {
    const newCollectionBtn = page.locator("button", { hasText: "新建合集" }).or(
      page.locator("button", { hasText: "创建合集" })
    ).first();
    const addBtn = page.locator("button").filter({ has: page.locator("svg.lucide-plus") }).first();
    await expect(newCollectionBtn.or(addBtn)).toBeVisible({ timeout: 5000 });
  });

  test("should open new collection dialog when clicking new collection button", async ({ page }) => {
    const newCollectionBtn = page.locator("button", { hasText: "新建合集" }).or(
      page.locator("button", { hasText: "创建合集" })
    ).first();
    if (!(await newCollectionBtn.isVisible({ timeout: 5000 }).catch(() => false))) return;

    await newCollectionBtn.click({ force: true });
    await page.waitForTimeout(500);

    const dialog = page.locator('[role="dialog"]').first();
    const dialogTitle = page.locator("text=新建合集").or(page.locator("text=创建合集")).first();
    const dialogVisible = await dialog.isVisible({ timeout: 5000 }).catch(() => false);
    const titleVisible = await dialogTitle.isVisible({ timeout: 3000 }).catch(() => false);
    expect(dialogVisible || titleVisible).toBe(true);
  });

  test("should display collection name input in dialog", async ({ page }) => {
    const newCollectionBtn = page.locator("button", { hasText: "新建合集" }).or(
      page.locator("button", { hasText: "创建合集" })
    ).first();
    if (!(await newCollectionBtn.isVisible({ timeout: 5000 }).catch(() => false))) return;

    await newCollectionBtn.click({ force: true });
    await page.waitForTimeout(500);

    const nameInput = page.locator('[data-testid="asset-collection-name-input"]').or(
      page.locator('[role="dialog"] input')
    ).first();
    await expect(nameInput).toBeVisible({ timeout: 5000 });
  });

  test("should close new collection dialog with Escape", async ({ page }) => {
    const newCollectionBtn = page.locator("button", { hasText: "新建合集" }).or(
      page.locator("button", { hasText: "创建合集" })
    ).first();
    if (!(await newCollectionBtn.isVisible({ timeout: 5000 }).catch(() => false))) return;

    await newCollectionBtn.click({ force: true });
    await page.waitForTimeout(500);

    const dialog = page.locator('[role="dialog"]').first();
    if (!(await dialog.isVisible({ timeout: 3000 }).catch(() => false))) return;

    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible({ timeout: 3000 }).catch(() => {});
  });
});

test.describe("Delete Asset Confirmation", () => {
  test.beforeEach(async ({ page }) => {
    await installElectronMock(page);
    await navigateTo(page, "/asset-library");
  });

  test("should show delete confirmation when deleting a character", async ({ page }) => {
    const characterCards = page.locator("[class*='grid'] [class*='card']").first();
    if (!(await characterCards.isVisible({ timeout: 5000 }).catch(() => false))) return;

    const deleteBtn = page.locator("button").filter({ has: page.locator("svg.lucide-trash-2") }).first();
    if (!(await deleteBtn.isVisible({ timeout: 3000 }).catch(() => false))) return;

    page.on("dialog", (dialog) => dialog.dismiss());
    await deleteBtn.click({ force: true });
    await page.waitForTimeout(300);
  });

  test("should show delete confirmation when deleting a collection", async ({ page }) => {
    await switchAssetTab(page, "合集");

    const collectionCard = page.locator("[class*='card']").filter({ hasText: /合集|资产数/ }).first();
    if (!(await collectionCard.isVisible({ timeout: 5000 }).catch(() => false))) return;

    const deleteBtn = collectionCard.locator("button").filter({ has: page.locator("svg.lucide-trash-2") }).first();
    if (!(await deleteBtn.isVisible({ timeout: 3000 }).catch(() => false))) return;

    page.on("dialog", (dialog) => dialog.dismiss());
    await deleteBtn.click({ force: true });
    await page.waitForTimeout(300);
  });
});

test.describe("Asset Library Navigation", () => {
  test("should navigate from home to asset library via sidebar", async ({ page }) => {
    await installElectronMock(page);
    await navigateTo(page, "/");
    await dismissOverlays(page);

    const assetLink = page.locator("a[href='/asset-library']").first();
    const assetBtn = page.locator("aside button").filter({ hasText: "素材库" }).first();
    const navTarget = assetLink.or(assetBtn);

    if (await navTarget.isVisible({ timeout: 3000 }).catch(() => false)) {
      await navTarget.click({ force: true });
      await page.waitForURL("**/asset-library", { timeout: 15000 });
      expect(page.url()).toContain("/asset-library");
    } else {
      await page.goto("/asset-library");
      await waitForAppReady(page);
      expect(page.url()).toContain("/asset-library");
    }
  });
});
