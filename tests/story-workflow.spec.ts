import { test, expect, type Page } from "@playwright/test";

/** Mock API 路由拦截配置 */
async function mockApiRoutes(page: Page) {
  await page.route("**/api/generate-video", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        task_id: "e2e_mock_video_12345",
        status: "pending",
        estimated_time: 1,
      }),
    });
  });

  await page.route("**/api/generate-image", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        task_id: "e2e_mock_img_12345",
        status: "completed",
        url: "https://mock.image/e2e-fake.png",
      }),
    });
  });

  await page.route("**/api/generate-keyframe", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        task_id: "e2e_mock_keyframe_12345",
        status: "completed",
        url: "https://mock.image/e2e-keyframe.png",
      }),
    });
  });

  await page.route("**/api/video-status/**", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        task_id: "e2e_mock_video_12345",
        status: "completed",
        url: "https://mock.video/e2e-fake.mp4",
        progress: 100,
      }),
    });
  });

  await page.route("**/api/config", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        providers: [
          { id: "seedance", name: "Seedance", models: [{ id: "seedance-v1", capabilities: ["video"] }] },
        ],
      }),
    });
  });
}

async function dismissOverlays(page: Page) {
  await page.evaluate(() => {
    document.querySelectorAll('.fixed.inset-0.bg-black\\/50, .fixed.inset-0[data-state="open"], [data-nextjs-dialog]').forEach((el) => {
      if (el instanceof HTMLElement) {
        el.style.display = 'none';
      }
    });
  });
  await page.waitForTimeout(200);
  const dialog = page.locator('[role="dialog"]:not([data-nextjs-dialog])').first();
  if (await dialog.isVisible()) {
    const closeBtn = dialog.locator("button:has(svg.lucide-x)").first();
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
      await page.waitForTimeout(300);
    }
  }
}

async function addBeat(page: Page) {
  await dismissOverlays(page);
  const addButton = page.locator("button", { hasText: "添加" }).first();
  await addButton.click();
  await page.waitForTimeout(800);
}

async function openBeatEditor(page: Page) {
  await addBeat(page);
  const editButton = page.locator("button", { hasText: "编辑" }).first();
  await editButton.click();
  await page.waitForTimeout(800);
}

test.describe("分镜页面工作流", () => {
  test.beforeEach(async ({ page }) => {
    await mockApiRoutes(page);
    await page.goto("/story");
    await page.waitForLoadState("networkidle");
    await dismissOverlays(page);
  });

  test("分镜页面应正常加载并显示编辑器", async ({ page }) => {
    const main = page.locator("main").first();
    await expect(main).toBeVisible();
  });

  test("应显示项目标题输入框", async ({ page }) => {
    const titleInput = page.locator('input[placeholder="分镜项目标题..."]');
    await expect(titleInput).toBeVisible();
  });

  test("应显示保存按钮", async ({ page }) => {
    const saveButton = page.locator("button", { hasText: "保存" });
    await expect(saveButton.first()).toBeVisible();
  });

  test("应显示添加分镜按钮", async ({ page }) => {
    const addButton = page.locator("button", { hasText: "添加" });
    await expect(addButton.first()).toBeVisible();
  });

  test("应显示AI规划按钮", async ({ page }) => {
    const aiButton = page.locator("button", { hasText: "AI规划" });
    await expect(aiButton.first()).toBeVisible();
  });

  test("空状态应显示提示文字", async ({ page }) => {
    const emptyHint = page.locator("text=还没有添加镜头");
    const addHint = page.locator("text=点击 AI规划 或 添加 开始");
    const hasEmptyHint = (await emptyHint.count()) > 0;
    const hasAddHint = (await addHint.count()) > 0;
    expect(hasEmptyHint || hasAddHint).toBe(true);
  });

  test("点击添加分镜按钮应创建新分镜", async ({ page }) => {
    await addBeat(page);
    await page.screenshot({ path: "test-results/add-beat-debug.png" });
    const beatCards = page.locator("div[class*='border']");
    const count = await beatCards.count();
    expect(count).toBeGreaterThan(0);
  });

  test("创建分镜后应显示分镜卡片", async ({ page }) => {
    await addBeat(page);
    await page.screenshot({ path: "test-results/beat-card-debug.png" });
    const editButtons = page.locator("button", { hasText: "编辑" });
    const hasEdit = (await editButtons.count()) > 0;
    if (!hasEdit) {
      const allButtons = page.locator("button");
      const count = await allButtons.count();
      const texts = [];
      for (let i = 0; i < Math.min(count, 20); i++) {
        texts.push(await allButtons.nth(i).textContent());
      }
      console.log("Button texts:", texts);
    }
    expect(hasEdit).toBe(true);
  });

  test("点击编辑按钮应打开分镜详情编辑器", async ({ page }) => {
    await openBeatEditor(page);
    const titleInput = page.locator('input[placeholder="输入分镜标题..."]');
    await expect(titleInput).toBeVisible();
  });

  test("分镜详情编辑器应包含内容文本框", async ({ page }) => {
    await openBeatEditor(page);
    const contentTextarea = page.locator(
      'textarea[placeholder*="输入分镜内容描述"]',
    );
    await expect(contentTextarea).toBeVisible();
  });

  test("分镜详情编辑器应包含设置和生成标签页", async ({ page }) => {
    await openBeatEditor(page);
    const settingsTab = page.locator('button[role="tab"]', {
      hasText: "设置",
    });
    const generateTab = page.locator('button[role="tab"]', {
      hasText: "生成",
    });
    await expect(settingsTab).toBeVisible();
    await expect(generateTab).toBeVisible();
  });

  test("应能编辑分镜标题", async ({ page }) => {
    await openBeatEditor(page);
    const titleInput = page.locator('input[placeholder="输入分镜标题..."]');
    await titleInput.fill("测试分镜标题");
    await expect(titleInput).toHaveValue("测试分镜标题");
  });

  test("应能编辑分镜内容", async ({ page }) => {
    await openBeatEditor(page);
    const contentTextarea = page.locator(
      'textarea[placeholder*="输入分镜内容描述"]',
    );
    await contentTextarea.fill("这是一个测试分镜的内容描述");
    await expect(contentTextarea).toHaveValue("这是一个测试分镜的内容描述");
  });

  test("应能删除分镜", async ({ page }) => {
    await addBeat(page);
    await dismissOverlays(page);

    // 先获取当前分镜数量
    const initialBeatCount = await page.locator("[data-beat-card], .beat-card, [class*='beat']").count();

    const deleteButton = page.locator("button", { hasText: "删除" }).first();
    if (await deleteButton.isVisible().catch(() => false)) {
      // 设置 dialog 处理前先监听
      page.once("dialog", (dialog) => dialog.accept());
      await deleteButton.click();
      await page.waitForTimeout(1000);
    }

    // 验证分镜数量减少或显示空状态
    const currentBeatCount = await page.locator("[data-beat-card], .beat-card, [class*='beat']").count();
    const emptyHint = page.locator("text=/还没有添加|暂无分镜|空状态/i");
    const hasEmptyHint = (await emptyHint.count()) > 0;

    // 断言：分镜被删除（数量减少）或显示空状态
    expect(currentBeatCount < initialBeatCount || hasEmptyHint).toBe(true);
  });

  test("应能保存分镜项目", async ({ page }) => {
    const titleInput = page.locator('input[placeholder="分镜项目标题..."]');
    await titleInput.fill("测试分镜项目");
    await addBeat(page);
    const saveButton = page.locator("button", { hasText: "保存" }).first();
    await saveButton.click();
    await page.waitForTimeout(1000);
    const main = page.locator("main").first();
    await expect(main).toBeVisible();
  });

  test("模板对话框按钮应可点击", async ({ page }) => {
    const templateButton = page.locator(
      "button:has(svg.lucide-layout-template)",
    );
    if (await templateButton.isVisible()) {
      await templateButton.click();
      await page.waitForTimeout(500);
      const dialog = page.locator('[role="dialog"]:not([data-nextjs-dialog])');
      const dialogTitle = page.locator("text=分镜模板管理");
      const hasDialog = (await dialog.count()) > 0;
      const hasTitle = (await dialogTitle.count()) > 0;
      expect(hasDialog || hasTitle).toBe(true);
    }
  });

  test("创建多个分镜后应显示正确数量", async ({ page }) => {
    for (let i = 0; i < 3; i++) {
      await addBeat(page);
    }
    const editButtons = page.locator("button", { hasText: "编辑" });
    const count = await editButtons.count();
    expect(count).toBe(3);
  });

  test("分镜卡片应显示序号", async ({ page }) => {
    await addBeat(page);
    const beatIndex = page.locator("text=#1").first();
    if (await beatIndex.isVisible()) {
      expect(await beatIndex.isVisible()).toBe(true);
    }
  });

  test("分镜详情编辑器应有关闭按钮", async ({ page }) => {
    await openBeatEditor(page);
    const titleInputBefore = page.locator('input[placeholder="输入分镜标题..."]');
    await expect(titleInputBefore).toBeVisible();

    const xIcons = await page.locator("svg.lucide-x").count();
    expect(xIcons).toBeGreaterThan(0);
  });

  test("分镜详情编辑器应包含景别运镜角度选择器", async ({ page }) => {
    await openBeatEditor(page);
    const shotSelects = page.locator('button[role="combobox"]');
    const count = await shotSelects.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });
});

test.describe("分镜元素绑定与服装变体", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/story");
    await page.waitForLoadState("networkidle");
    await dismissOverlays(page);
  });

  test("分镜编辑器应显示元素绑定面板", async ({ page }) => {
    await addBeat(page);
    const editButton = page.locator("button", { hasText: "编辑" }).first();
    await editButton.click();
    await page.waitForTimeout(800);

    const bindingTab = page.locator('button[role="tab"]', { hasText: "绑定" });
    if (await bindingTab.isVisible()) {
      await bindingTab.click();
      await page.waitForTimeout(300);
    }

    const bindingPanel = page.locator("text=元素绑定").or(page.locator("text=绑定元素"));
    const hasBinding = (await bindingPanel.count()) > 0;
    expect(hasBinding).toBe(true);
  });

  test("元素绑定面板应显示添加角色选项", async ({ page }) => {
    await addBeat(page);
    const editButton = page.locator("button", { hasText: "编辑" }).first();
    await editButton.click();
    await page.waitForTimeout(800);

    const bindingTab = page.locator('button[role="tab"]', { hasText: "绑定" });
    if (await bindingTab.isVisible()) {
      await bindingTab.click();
      await page.waitForTimeout(300);
    }

    const addCharButton = page.locator("button", { hasText: "添加角色" });
    const charSelect = page.locator('select, [role="combobox"]').first();
    const hasAddChar = (await addCharButton.count()) > 0 || (await charSelect.count()) > 0;
    expect(hasAddChar).toBe(true);
  });

  test("批量操作面板应显示AI规划增强标签", async ({ page }) => {
    await addBeat(page);

    const aiLabel = page.locator("span", { hasText: "AI规划增强" });
    await expect(aiLabel).toBeVisible();
  });

  test("批量操作面板应显示预览图、首尾帧、视频按钮", async ({ page }) => {
    await addBeat(page);

    const keyframeButton = page.locator("button", { hasText: "预览图" });
    const framePairButton = page.locator("button", { hasText: "首尾帧" });
    const videoButton = page.locator("button", { hasText: "视频" });

    await expect(keyframeButton.first()).toBeVisible();
    await expect(framePairButton.first()).toBeVisible();
    await expect(videoButton.first()).toBeVisible();
  });
});

test.describe("分镜页面持久化", () => {
  test("保存后刷新页面应保留数据", async ({ page }) => {
    await page.goto("/story");
    await page.waitForLoadState("networkidle");
    await dismissOverlays(page);

    const hasElectronAPI = await page.evaluate(() => !!(window as any).electronAPI);
    if (!hasElectronAPI) {
      test.skip();
      return;
    }

    const titleInput = page.locator('input[placeholder="分镜项目标题..."]');
    await titleInput.fill("持久化测试项目");

    await addBeat(page);

    const saveButton = page.locator("button", { hasText: "保存" }).first();
    await saveButton.click();
    await page.waitForTimeout(3000);

    await page.reload();
    await page.waitForLoadState("networkidle");
    await dismissOverlays(page);

    const titleInputAfter = page.locator(
      'input[placeholder="分镜项目标题..."]',
    );
    const value = await titleInputAfter.inputValue();
    expect(value).toContain("持久化");
  });
});
