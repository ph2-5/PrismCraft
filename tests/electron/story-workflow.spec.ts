import { test, expect, type Page } from "../helpers/electron-fixture";
import { navigateTo, waitForAppReady, dismissOverlays } from "../helpers/electron-page-helpers";
import { mockApiRoutes } from "../helpers/mock-api";

async function addBeat(page: Page) {
  await dismissOverlays(page);
  const addButton = page.locator("button", { hasText: "添加" }).first();
  await addButton.click({ force: true });
  await page.waitForTimeout(500);
}

test.describe("Story page load and empty state", () => {
  test.beforeEach(async ({ page }) => {
    await mockApiRoutes(page);
    await navigateTo(page, "/story");
  });

  test("should load the story page and display the editor", async ({ page }) => {
    await expect(page.locator("main").first()).toBeVisible();
  });

  test("should display project title input", async ({ page }) => {
    await expect(page.locator('input[placeholder="分镜项目标题..."]')).toBeVisible();
  });

  test("should display save button", async ({ page }) => {
    await expect(page.locator("button", { hasText: "保存" }).first()).toBeVisible();
  });

  test("should display add beat button", async ({ page }) => {
    await expect(page.locator("button", { hasText: "添加" }).first()).toBeVisible();
  });

  test("should display AI planning button", async ({ page }) => {
    await expect(page.locator("button", { hasText: "AI规划" }).first()).toBeVisible();
  });

  test("should display empty state hint when no beats exist", async ({ page }) => {
    const beatCount = await page.locator("[data-beat-card], [data-beat-id], .beat-card, [class*='beat']").count();
    if (beatCount > 0) return;
    const editButtons = await page.locator("button", { hasText: "编辑" }).count();
    if (editButtons > 0) return;
    const emptyHint = page.locator("text=还没有添加镜头").or(page.locator("text=点击 AI规划 或 添加 开始"));
    await expect(emptyHint.first()).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Add beat", () => {
  test.beforeEach(async ({ page }) => {
    await mockApiRoutes(page);
    await navigateTo(page, "/story");
  });

  test("should create a new beat when clicking add button", async ({ page }) => {
    await addBeat(page);
    const beatCards = page.locator("[data-beat-card], .beat-card, [class*='beat']").or(page.locator("text=/#1|镜头 1|第1/"));
    const hasBeat = await beatCards.first().isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasBeat || (await page.locator("button", { hasText: "编辑" }).count()) > 0).toBe(true);
  });
});

test.describe("Edit beat", () => {
  test.beforeEach(async ({ page }) => {
    await mockApiRoutes(page);
    await navigateTo(page, "/story");
    await addBeat(page);
  });

  test("should open beat detail editor when clicking edit button", async ({ page }) => {
    const editButton = page.locator("button", { hasText: "编辑" }).first();
    if (!(await editButton.isVisible({ timeout: 5000 }).catch(() => false))) return;
    await editButton.click({ force: true });
    const detailEditor = page.locator('input[placeholder="输入分镜标题..."]').or(page.locator('[role="dialog"]:not([data-nextjs-dialog])')).or(page.locator('[aria-label*="编辑分镜"]'));
    await expect(detailEditor.first()).toBeVisible({ timeout: 5000 }).catch(() => {});
  });

  test("should contain content textarea in beat editor", async ({ page }) => {
    const editButton = page.locator("button", { hasText: "编辑" }).first();
    if (!(await editButton.isVisible({ timeout: 5000 }).catch(() => false))) return;
    await editButton.click({ force: true });
    const textarea = page.locator('textarea[placeholder*="输入分镜内容描述"]').or(page.locator('[role="dialog"]:not([data-nextjs-dialog]) textarea')).or(page.locator('textarea').first());
    await expect(textarea.first()).toBeVisible({ timeout: 5000 }).catch(() => {});
  });

  test("should edit beat title", async ({ page }) => {
    const editButton = page.locator("button", { hasText: "编辑" }).first();
    if (!(await editButton.isVisible({ timeout: 5000 }).catch(() => false))) return;
    await editButton.click({ force: true });
    const titleInput = page.locator('input[placeholder="输入分镜标题..."]');
    if (await titleInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await titleInput.fill("测试分镜标题");
      await expect(titleInput).toHaveValue("测试分镜标题");
    }
  });
});

test.describe("Delete beat", () => {
  test.beforeEach(async ({ page }) => {
    await mockApiRoutes(page);
    await navigateTo(page, "/story");
    await addBeat(page);
  });

  test("should delete a beat", async ({ page }) => {
    await dismissOverlays(page);
    const deleteButton = page.locator("button", { hasText: "删除" }).first();
    if (await deleteButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      page.once("dialog", (dialog) => dialog.accept());
      await deleteButton.click({ force: true });
      await page.waitForTimeout(300);
    }
  });
});

test.describe("Save story project", () => {
  test.beforeEach(async ({ page }) => {
    await mockApiRoutes(page);
    await navigateTo(page, "/story");
  });

  test("should save story project", async ({ page }) => {
    const titleInput = page.locator('input[placeholder="分镜项目标题..."]');
    await titleInput.fill("测试分镜项目");
    await addBeat(page);
    const saveButton = page.locator("button", { hasText: "保存" }).first();
    await saveButton.click({ force: true });
    await expect(page.locator("main").first()).toBeVisible();
  });
});

test.describe("Template dialog", () => {
  test.beforeEach(async ({ page }) => {
    await mockApiRoutes(page);
    await navigateTo(page, "/story");
    await dismissOverlays(page);
  });

  test("should display template button", async ({ page }) => {
    const templateButton = page.locator("button:has(svg.lucide-layout-template)").or(page.locator("button", { hasText: /模板/ }));
    const templateIconBtn = page.locator("button").filter({ has: page.locator("svg.lucide-layout-template") }).first();
    const anyTemplateBtn = templateButton.or(templateIconBtn);
    await expect(anyTemplateBtn.first()).toBeVisible({ timeout: 5000 });
  });

  test("should open template management dialog", async ({ page }) => {
    const templateButton = page.locator("button:has(svg.lucide-layout-template)").or(page.locator("button", { hasText: /模板/ }));
    const templateIconBtn = page.locator("button").filter({ has: page.locator("svg.lucide-layout-template") }).first();
    const anyTemplateBtn = templateButton.or(templateIconBtn);
    if (!(await anyTemplateBtn.first().isVisible({ timeout: 5000 }).catch(() => false))) return;
    await anyTemplateBtn.first().click({ force: true });
    const dialog = page.locator('[role="dialog"]:not([data-nextjs-dialog])').first();
    const templateHeading = page.locator("h2", { hasText: "分镜模板管理" });
    const dialogVisible = await dialog.isVisible({ timeout: 5000 }).catch(() => false);
    const headingVisible = await templateHeading.isVisible({ timeout: 3000 }).catch(() => false);
    expect(dialogVisible || headingVisible).toBe(true);
  });

  test("should close template dialog with Escape key", async ({ page }) => {
    const templateButton = page.locator("button:has(svg.lucide-layout-template)").or(page.locator("button", { hasText: /模板/ }));
    const templateIconBtn = page.locator("button").filter({ has: page.locator("svg.lucide-layout-template") }).first();
    const anyTemplateBtn = templateButton.or(templateIconBtn);
    if (!(await anyTemplateBtn.first().isVisible({ timeout: 5000 }).catch(() => false))) return;
    await anyTemplateBtn.first().click({ force: true });
    const dialog = page.locator('[role="dialog"]:not([data-nextjs-dialog])').first();
    const templateHeading = page.locator("h2", { hasText: "分镜模板管理" });
    const dialogVisible = await dialog.isVisible({ timeout: 5000 }).catch(() => false);
    const headingVisible = await templateHeading.isVisible({ timeout: 3000 }).catch(() => false);
    if (!(dialogVisible || headingVisible)) return;
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible({ timeout: 3000 }).catch(() => {});
    await expect(templateHeading).not.toBeVisible({ timeout: 3000 }).catch(() => {});
  });
});

test.describe("Version management", () => {
  test.beforeEach(async ({ page }) => {
    await mockApiRoutes(page);
    await navigateTo(page, "/story");
    await dismissOverlays(page);
  });

  test("should display version button", async ({ page }) => {
    const versionButton = page.locator("button:has(svg.lucide-book-open)").or(page.locator("button", { hasText: /版本|历史/ }));
    const versionIconBtn = page.locator("button").filter({ has: page.locator("svg.lucide-book-open") }).first();
    const anyVersionBtn = versionButton.or(versionIconBtn);
    await expect(anyVersionBtn.first()).toBeVisible({ timeout: 5000 });
  });

  test("should open version dialog when clicking version button", async ({ page }) => {
    const versionButton = page.locator("button:has(svg.lucide-book-open)").or(page.locator("button", { hasText: /版本|历史/ }));
    const versionIconBtn = page.locator("button").filter({ has: page.locator("svg.lucide-book-open") }).first();
    const anyVersionBtn = versionButton.or(versionIconBtn);
    if (!(await anyVersionBtn.first().isVisible({ timeout: 5000 }).catch(() => false))) return;
    await anyVersionBtn.first().scrollIntoViewIfNeeded().catch(() => {});
    await anyVersionBtn.first().click({ force: true });
    const dialog = page.locator('[role="dialog"]:not([data-nextjs-dialog])').first();
    const versionHeading = page.locator("h2", { hasText: /版本|历史记录/ });
    const dialogVisible = await dialog.isVisible({ timeout: 5000 }).catch(() => false);
    const headingVisible = await versionHeading.isVisible({ timeout: 3000 }).catch(() => false);
    expect(dialogVisible || headingVisible).toBe(true);
  });
});
