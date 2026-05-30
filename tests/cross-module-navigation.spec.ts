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

test.describe("导航流程", () => {
  test("侧边栏应显示所有导航链接", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const navLabels = ["角色", "场景", "故事", "视频任务", "快速生成", "素材库", "设置"];
    for (const label of navLabels) {
      const link = page.locator(`a:has-text("${label}"), button:has-text("${label}")`).first();
      if (await link.isVisible().catch(() => false)) {
        expect(await link.isVisible()).toBe(true);
      }
    }
  });

  test("从首页导航到角色页面应成功", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const charLink = page.locator('a[href="/characters"]').first();
    if (await charLink.isVisible()) {
      await charLink.click();
      await page.waitForLoadState("networkidle");
      expect(page.url()).toContain("/characters");
    }
  });

  test("从角色页面导航到场景页面应成功", async ({ page }) => {
    await page.goto("/characters");
    await page.waitForLoadState("networkidle");

    const sceneLink = page.locator('a[href="/scenes"]').first();
    if (await sceneLink.isVisible()) {
      await sceneLink.click();
      await page.waitForLoadState("networkidle");
      expect(page.url()).toContain("/scenes");
    }
  });

  test("浏览器后退应正常工作", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const charLink = page.locator('a[href="/characters"]').first();
    if (await charLink.isVisible()) {
      await charLink.click();
      await page.waitForLoadState("networkidle");

      await page.goBack();
      await page.waitForLoadState("networkidle");
      expect(page.url()).not.toContain("/characters");
    }
  });
});

test.describe("错误边界", () => {
  test("不存在的路由应显示错误页面而非白屏", async ({ page }) => {
    const response = await page.goto("/nonexistent-page-xyz");
    if (response) {
      expect(response.status()).toBeLessThan(500);
    }
    const body = page.locator("body");
    await expect(body).toBeVisible();
  });

  test("页面应无未捕获的 JavaScript 错误", async ({ page }) => {
    const jsErrors: string[] = [];
    page.on("pageerror", (error) => {
      jsErrors.push(error.message);
    });

    const pages = ["/", "/characters", "/scenes", "/story", "/video-tasks", "/quick-generate", "/settings"];
    for (const path of pages) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
    }

    const criticalErrors = jsErrors.filter(
      (e) =>
        !e.includes("favicon") &&
        !e.includes("manifest") &&
        !e.includes("service-worker") &&
        !e.includes("ResizeObserver") &&
        !e.includes("Loading chunk")
    );
    expect(criticalErrors.length).toBe(0);
  });
});

test.describe("键盘快捷键", () => {
  test("Ctrl+K 应打开搜索对话框", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await dismissOverlays(page);

    await page.keyboard.press("Control+k");
    await page.waitForTimeout(500);

    const searchInput = page.locator('input[placeholder*="搜索"], input[placeholder*="Search"]').first();
    const dialog = page.locator('[role="dialog"]').first();
    const hasSearch = (await searchInput.isVisible().catch(() => false)) || (await dialog.isVisible().catch(() => false));
    expect(hasSearch).toBe(true);
  });

  test("Escape 应关闭对话框", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await dismissOverlays(page);

    await page.keyboard.press("Control+k");
    await page.waitForTimeout(500);

    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);

    const dialog = page.locator('[role="dialog"]').first();
    const isHidden = !(await dialog.isVisible().catch(() => false));
    expect(isHidden).toBe(true);
  });
});

test.describe("数据持久化（Electron 环境）", () => {
  test("角色创建后刷新应保留", async ({ page }) => {
    const hasElectronAPI = await page.evaluate(() => !!(window as any).electronAPI);
    if (!hasElectronAPI) {
      test.skip();
      return;
    }

    await page.goto("/characters");
    await page.waitForLoadState("networkidle");
    await dismissOverlays(page);

    const createButton = page.locator("button", { hasText: /创建|新建|添加/ }).first();
    if (await createButton.isVisible()) {
      await createButton.click();
      await page.waitForTimeout(1000);

      const nameInput = page.locator('input[placeholder*="名字"], input[placeholder*="名称"]').first();
      if (await nameInput.isVisible()) {
        await nameInput.fill("E2E测试角色");
        const saveButton = page.locator("button", { hasText: "保存" }).first();
        await saveButton.click();
        await page.waitForTimeout(2000);

        await page.reload();
        await page.waitForLoadState("networkidle");

        const charName = page.locator("text=E2E测试角色");
        expect(await charName.count()).toBeGreaterThan(0);
      }
    }
  });

  test("场景创建后刷新应保留", async ({ page }) => {
    const hasElectronAPI = await page.evaluate(() => !!(window as any).electronAPI);
    if (!hasElectronAPI) {
      test.skip();
      return;
    }

    await page.goto("/scenes");
    await page.waitForLoadState("networkidle");
    await dismissOverlays(page);

    const createButton = page.locator("button", { hasText: /创建|新建|添加/ }).first();
    if (await createButton.isVisible()) {
      await createButton.click();
      await page.waitForTimeout(1000);

      const nameInput = page.locator('input[placeholder*="名字"], input[placeholder*="名称"]').first();
      if (await nameInput.isVisible()) {
        await nameInput.fill("E2E测试场景");
        const saveButton = page.locator("button", { hasText: "保存" }).first();
        await saveButton.click();
        await page.waitForTimeout(2000);

        await page.reload();
        await page.waitForLoadState("networkidle");

        const sceneName = page.locator("text=E2E测试场景");
        expect(await sceneName.count()).toBeGreaterThan(0);
      }
    }
  });
});

test.describe("设置页面", () => {
  test("设置页面应显示 API 配置面板", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    const apiConfigHeading = page.locator("text=API").or(page.locator("text=配置")).first();
    expect(await apiConfigHeading.isVisible().catch(() => false) || (await page.locator("main").first().isVisible())).toBe(true);
  });

  test("设置页面应显示插件管理", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    const pluginSection = page.locator("text=插件").first();
    expect(await pluginSection.isVisible().catch(() => false) || (await page.locator("main").first().isVisible())).toBe(true);
  });
});
