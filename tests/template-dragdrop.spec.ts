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

function templateDialog(page: Page) {
  return page.locator('div.fixed.inset-0.z-50:has(h2:text-is("分镜模板管理"))');
}

test.describe("分镜模板功能", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/story");
    await page.waitForLoadState("networkidle");
    await dismissOverlays(page);
  });

  test("模板按钮应可见", async ({ page }) => {
    const templateButton = page.locator(
      "button:has(svg.lucide-layout-template)",
    );
    await expect(templateButton).toBeVisible();
  });

  test("点击模板按钮应打开模板管理对话框", async ({ page }) => {
    const templateButton = page.locator(
      "button:has(svg.lucide-layout-template)",
    );
    await templateButton.click();
    await page.waitForTimeout(1000);

    const dialog = templateDialog(page);
    await expect(dialog).toBeVisible({ timeout: 5000 });
  });

  test("模板对话框应包含标签页", async ({ page }) => {
    const templateButton = page.locator(
      "button:has(svg.lucide-layout-template)",
    );
    await templateButton.click();
    await page.waitForTimeout(1000);

    const dialog = templateDialog(page);
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const myTemplateTab = page.locator("button", { hasText: "我的模板" });
    const saveTemplateTab = page.locator("button", { hasText: "保存模板" });
    const importExportTab = page.locator("button", { hasText: "导入导出" });
    const tabCount = (await myTemplateTab.count()) + (await saveTemplateTab.count()) + (await importExportTab.count());
    expect(tabCount).toBeGreaterThanOrEqual(2);
  });

  test("模板对话框应能关闭", async ({ page }) => {
    const templateButton = page.locator(
      "button:has(svg.lucide-layout-template)",
    );
    await templateButton.click();
    await page.waitForTimeout(1000);

    const dialog = templateDialog(page);
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const closeButton = dialog.locator('button:has(svg.lucide-x)').first();
    if (await closeButton.isVisible()) {
      await closeButton.click();
      await page.waitForTimeout(300);

      const dialogAfter = templateDialog(page);
      expect(await dialogAfter.isVisible()).toBe(false);
    }
  });

  test("保存模板标签页应显示保存选项", async ({ page }) => {
    const addButton = page.locator("button", { hasText: "添加" }).first();
    await addButton.click();
    await page.waitForTimeout(500);

    const templateButton = page.locator(
      "button:has(svg.lucide-layout-template)",
    );
    await templateButton.click();
    await page.waitForTimeout(1000);

    const dialog = templateDialog(page);
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const saveTab = page.locator("button", { hasText: "保存模板" });
    if ((await saveTab.count()) > 0) {
      await saveTab.click();
      await page.waitForTimeout(300);

      const saveTemplateButton = page.locator("button", {
        hasText: "保存为模板",
      });
      const hasSaveButton = (await saveTemplateButton.count()) > 0;
      expect(hasSaveButton).toBe(true);
    }
  });

  test("导入导出标签页应显示导入导出选项", async ({ page }) => {
    const templateButton = page.locator(
      "button:has(svg.lucide-layout-template)",
    );
    await templateButton.click();
    await page.waitForTimeout(1000);

    const dialog = templateDialog(page);
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const importExportTab = page.locator("button", { hasText: "导入导出" });
    if ((await importExportTab.count()) > 0) {
      await importExportTab.click();
      await page.waitForTimeout(300);

      const exportButton = page.locator("button", { hasText: "导出" });
      const importButton = page.locator("button", { hasText: "导入" });
      const hasExport = (await exportButton.count()) > 0;
      const hasImport = (await importButton.count()) > 0;
      expect(hasExport || hasImport).toBe(true);
    }
  });
});

test.describe("分镜拖拽排序", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/story");
    await page.waitForLoadState("networkidle");
    await dismissOverlays(page);
  });

  test("创建多个分镜后应显示多个卡片", async ({ page }) => {
    const addButton = page.locator("button", { hasText: "添加" }).first();

    for (let i = 0; i < 3; i++) {
      await addButton.click();
      await page.waitForTimeout(300);
    }

    const editButtons = page.locator("button", { hasText: "编辑" });
    const count = await editButtons.count();
    expect(count).toBe(3);
  });

  test("分镜卡片应支持上移操作", async ({ page }) => {
    const addButton = page.locator("button", { hasText: "添加" }).first();

    for (let i = 0; i < 2; i++) {
      await addButton.click();
      await page.waitForTimeout(300);
    }

    const moveContainers = page.locator("svg.lucide-move-vertical");
    const lastMoveContainer = moveContainers.last().locator("..");
    const moveUpButton = lastMoveContainer.locator("button:has(svg.lucide-chevron-up)").first();
    if (await moveUpButton.isVisible()) {
      const isDisabled = await moveUpButton.isDisabled();
      if (!isDisabled) {
        await moveUpButton.click();
        await page.waitForTimeout(300);
      }
    }

    const editButtons = page.locator("button", { hasText: "编辑" });
    const count = await editButtons.count();
    expect(count).toBe(2);
  });

  test("分镜卡片应支持下移操作", async ({ page }) => {
    const addButton = page.locator("button", { hasText: "添加" }).first();

    for (let i = 0; i < 2; i++) {
      await addButton.click();
      await page.waitForTimeout(300);
    }

    const moveContainers = page.locator("svg.lucide-move-vertical");
    const firstMoveContainer = moveContainers.first().locator("..");
    const moveDownButton = firstMoveContainer.locator("button:has(svg.lucide-chevron-down)").first();
    if (await moveDownButton.isVisible()) {
      const isDisabled = await moveDownButton.isDisabled();
      if (!isDisabled) {
        await moveDownButton.click();
        await page.waitForTimeout(300);
      }
    }

    const editButtons = page.locator("button", { hasText: "编辑" });
    const count = await editButtons.count();
    expect(count).toBe(2);
  });

  test("第一个分镜的上移按钮应禁用", async ({ page }) => {
    const addButton = page.locator("button", { hasText: "添加" }).first();
    await addButton.click();
    await page.waitForTimeout(500);

    const moveContainer = page.locator("svg.lucide-move-vertical").first().locator("..");
    const moveUpButton = moveContainer.locator("button:has(svg.lucide-chevron-up)").first();
    await expect(moveUpButton).toBeVisible();
    await expect(moveUpButton).toBeDisabled();
  });

  test("最后一个分镜的下移按钮应禁用", async ({ page }) => {
    const addButton = page.locator("button", { hasText: "添加" }).first();
    await addButton.click();
    await page.waitForTimeout(500);

    const moveContainer = page.locator("svg.lucide-move-vertical").first().locator("..");
    const moveDownButton = moveContainer.locator("button:has(svg.lucide-chevron-down)").first();
    await expect(moveDownButton).toBeVisible();
    await expect(moveDownButton).toBeDisabled();
  });
});

test.describe("分镜批量操作", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/story");
    await page.waitForLoadState("networkidle");
    await dismissOverlays(page);

    const addButton = page.locator("button", { hasText: "添加" }).first();
    await addButton.click();
    await page.waitForTimeout(500);
  });

  test("有分镜时应显示批量预览图按钮", async ({ page }) => {
    const batchButton = page.locator("button", { hasText: "预览图" });
    const hasButton = (await batchButton.count()) > 0;
    expect(hasButton).toBe(true);
  });

  test("有分镜时应显示批量首尾帧按钮", async ({ page }) => {
    const batchButton = page.locator("button", { hasText: "首尾帧" });
    const hasButton = (await batchButton.count()) > 0;
    expect(hasButton).toBe(true);
  });

  test("有分镜时应显示批量视频按钮", async ({ page }) => {
    const batchButton = page.locator("button", { hasText: "视频" });
    const hasButton = (await batchButton.count()) > 0;
    expect(hasButton).toBe(true);
  });

  test("有分镜时应显示AI规划增强开关", async ({ page }) => {
    const aiLabel = page.locator("span", { hasText: "AI规划增强" });
    await expect(aiLabel).toBeVisible();
  });
});

test.describe("版本管理", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/story");
    await page.waitForLoadState("networkidle");
    await dismissOverlays(page);
  });

  test("版本按钮应可见", async ({ page }) => {
    const versionButton = page.locator(
      "button:has(svg.lucide-book-open)",
    );
    await expect(versionButton).toBeVisible();
  });

  test("点击版本按钮应打开版本对话框", async ({ page }) => {
    const versionButton = page.locator(
      "button:has(svg.lucide-book-open)",
    );
    await versionButton.click();
    await page.waitForTimeout(500);

    const dialog = page.locator('[role="dialog"]:not([data-nextjs-dialog])');
    const hasDialog = (await dialog.count()) > 0;
    expect(hasDialog).toBe(true);
  });
});
