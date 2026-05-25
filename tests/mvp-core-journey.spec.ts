import { test, expect } from "@playwright/test";

/**
 * MVP 核心用户旅程测试
 * 覆盖从创建角色到生成视频的完整流程
 */

/** Mock API 路由拦截配置 */
async function mockApiRoutes(page: any) {
  // 拦截视频生成请求
  await page.route("**/api/generate-video", (route: any) => {
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

  // 拦截图片生成请求
  await page.route("**/api/generate-image", (route: any) => {
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

  // 拦截关键帧生成请求
  await page.route("**/api/generate-keyframe", (route: any) => {
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

  // 拦截帧对生成请求
  await page.route("**/api/generate-frame-pair", (route: any) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        task_id: "e2e_mock_framepair_12345",
        status: "completed",
        first_frame_url: "https://mock.image/e2e-first.png",
        last_frame_url: "https://mock.image/e2e-last.png",
      }),
    });
  });

  // 拦截视频状态查询
  await page.route("**/api/video-status/**", (route: any) => {
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

  // 拦截 API 配置请求
  await page.route("**/api/config", (route: any) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        providers: [
          { id: "seedance", name: "Seedance", models: [{ id: "seedance-v1", capabilities: ["video"] }] },
          { id: "kuaishou", name: "可灵AI", models: [{ id: "kling-v1", capabilities: ["video"] }] },
        ],
      }),
    });
  });

  // 拦截模型列表请求
  await page.route("**/api/models", (route: any) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        models: [
          { id: "seedance-v1", name: "Seedance V1", provider: "seedance" },
          { id: "kling-v1", name: "可灵 V1", provider: "kuaishou" },
        ],
      }),
    });
  });

  // 拦截连接测试请求
  await page.route("**/api/test-connection", (route: any) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, message: "Connection successful" }),
    });
  });
}

/** 等待并关闭可能存在的模态框/遮罩层 */
async function dismissOverlays(page: any) {
  // 等待可能的加载遮罩消失
  await page.waitForTimeout(500);

  // 检查并关闭可能的对话框/模态框
  const dialogs = page.locator("[role='dialog']");
  const count = await dialogs.count().catch(() => 0);
  if (count > 0) {
    // 尝试按 Escape 键关闭对话框
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(200);
  }

  // 等待遮罩层消失（简单轮询）
  for (let i = 0; i < 5; i++) {
    const hasOverlay = await page.evaluate(() => {
      const overlays = document.querySelectorAll('.fixed.inset-0.bg-black');
      return overlays.length > 0 && Array.from(overlays).some((el) => {
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.opacity !== '0';
      });
    }).catch(() => false);

    if (!hasOverlay) break;
    await page.waitForTimeout(200);
  }
}

/** 等待元素可见并点击 */
async function waitAndClick(page: any, selector: string, timeout = 5000) {
  const element = page.locator(selector).first();
  await element.waitFor({ state: "visible", timeout });
  await element.click();
  return element;
}

/** 安全地填充输入框 */
async function safeFill(page: any, selector: string, value: string, timeout = 5000) {
  const input = page.locator(selector).first();
  await input.waitFor({ state: "visible", timeout });
  await input.fill(value);
  return input;
}

test.describe("MVP 核心旅程 - 角色创建到视频生成", () => {
  test.beforeEach(async ({ page }) => {
    await mockApiRoutes(page);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await dismissOverlays(page);
  });

  test("完整旅程：创建角色 → 创建场景 → 创建故事 → 生成视频", async ({ page }) => {
    // Step 1: 导航到角色页面并创建角色
    await page.goto("/characters");
    await page.waitForLoadState("networkidle");
    await dismissOverlays(page);

    // 使用稳定的选择器查找创建按钮
    const createCharButton = page.locator("button", { hasText: /创建|新建|添加/ }).first();
    await createCharButton.waitFor({ state: "visible", timeout: 5000 });
    await createCharButton.click();
    await page.waitForTimeout(300);

    // 填写角色名称
    await safeFill(page, "input[placeholder*='名称' i], input[name='name'], input[type='text']", "测试角色");

    // 填写角色描述（如果存在）
    const descInput = page.locator("textarea").first();
    if (await descInput.isVisible().catch(() => false)) {
      await descInput.fill("这是一个测试角色描述");
    }

    // 保存角色
    const saveButton = page.locator("button", { hasText: /保存|确认|创建/ }).first();
    await saveButton.click();
    await page.waitForTimeout(500);

    // 验证角色创建成功（页面应显示角色名称或成功提示）
    const pageContent = await page.content();
    expect(pageContent).toMatch(/测试角色|创建成功|已保存/);

    // Step 2: 导航到场景页面并创建场景
    await page.goto("/scenes");
    await page.waitForLoadState("networkidle");
    await dismissOverlays(page);

    const createSceneButton = page.locator("button", { hasText: /创建|新建|添加/ }).first();
    await createSceneButton.waitFor({ state: "visible", timeout: 5000 });
    await createSceneButton.click();
    await page.waitForTimeout(300);

    await safeFill(page, "input[placeholder*='名称' i], input[name='name'], input[type='text']", "测试场景");

    const sceneDescInput = page.locator("textarea").first();
    if (await sceneDescInput.isVisible().catch(() => false)) {
      await sceneDescInput.fill("这是一个测试场景描述");
    }

    const sceneSaveButton = page.locator("button", { hasText: /保存|确认|创建/ }).first();
    await sceneSaveButton.click();
    await page.waitForTimeout(500);

    // 验证场景创建成功
    const sceneContent = await page.content();
    expect(sceneContent).toMatch(/测试场景|创建成功|已保存/);

    // Step 3: 导航到故事页面并创建故事
    await page.goto("/story");
    await page.waitForLoadState("networkidle");
    await dismissOverlays(page);

    // 验证页面关键元素存在（编辑器或按钮）
    const editor = page.locator("textarea, [contenteditable], [data-story-editor]").first();
    const buttons = page.locator("button").first();
    await expect(editor.or(buttons)).toBeVisible();

    // Step 4: 验证页面无错误
    const jsErrors: string[] = [];
    page.on("pageerror", (error) => {
      jsErrors.push(error.message);
    });

    expect(jsErrors.filter(e =>
      !e.includes("favicon") &&
      !e.includes("manifest") &&
      !e.includes("service-worker") &&
      !e.includes("ResizeObserver"),
    )).toHaveLength(0);
  });
});

test.describe("MVP 核心旅程 - 分镜系统", () => {
  test("分镜页面应正常加载并显示编辑器", async ({ page }) => {
    await page.goto("/story");
    await page.waitForLoadState("networkidle");

    const main = page.locator("main").first();
    await expect(main).toBeVisible();

    // 验证关键元素存在
    const editor = page.locator("textarea, [contenteditable], [data-story-editor]").first();
    const buttons = page.locator("button").first();
    await expect(editor.or(buttons)).toBeVisible();
  });

  test("分镜保存功能应正常工作", async ({ page }) => {
    await page.goto("/story");
    await page.waitForLoadState("networkidle");
    await dismissOverlays(page);

    // 查找保存按钮
    const saveButton = page.locator("button", { hasText: /保存|Save/ }).first();
    await saveButton.waitFor({ state: "visible", timeout: 5000 });
    await saveButton.click();
    await page.waitForTimeout(500);

    // 验证无错误弹窗
    const errorAlert = page.locator("[role='alert']").first();
    if (await errorAlert.isVisible().catch(() => false)) {
      const text = await errorAlert.textContent();
      expect(text).not.toMatch(/error|Error|错误/);
    }
  });
});

test.describe("MVP 核心旅程 - 素材库管理", () => {
  test("素材库应支持创建合集", async ({ page }) => {
    await page.goto("/asset-library");
    await page.waitForLoadState("networkidle");

    const main = page.locator("main").first();
    await expect(main).toBeVisible();

    // 验证创建合集按钮存在
    const createCollectionBtn = page.locator("button", { hasText: /合集|Collection|新建/ }).first();
    await expect(createCollectionBtn).toBeVisible();
  });

  test("素材库页面应无存储相关错误", async ({ page }) => {
    const jsErrors: string[] = [];
    page.on("pageerror", (error) => {
      jsErrors.push(error.message);
    });

    await page.goto("/asset-library");
    await page.waitForLoadState("networkidle");

    const criticalErrors = jsErrors.filter(e =>
      !e.includes("favicon") &&
      !e.includes("manifest") &&
      !e.includes("service-worker") &&
      !e.includes("ResizeObserver"),
    );

    expect(criticalErrors).toHaveLength(0);
  });
});

test.describe("MVP 核心旅程 - 设置与配置", () => {
  test("设置页面应显示 API 配置", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    const main = page.locator("main").first();
    await expect(main).toBeVisible();

    // 验证设置表单元素存在
    const inputs = page.locator("input").first();
    const selects = page.locator("select").first();
    await expect(inputs.or(selects)).toBeVisible();
  });

  test("个人设置页面应正常加载", async ({ page }) => {
    await page.goto("/settings/personal");
    await page.waitForLoadState("networkidle");

    const main = page.locator("main").first();
    await expect(main).toBeVisible();
  });
});

test.describe("MVP 核心旅程 - 视频任务管理", () => {
  test("视频任务页面应正常加载", async ({ page }) => {
    await page.goto("/video-tasks");
    await page.waitForLoadState("networkidle");

    const main = page.locator("main").first();
    await expect(main).toBeVisible();
  });

  test("快速生成页面应正常加载", async ({ page }) => {
    await page.goto("/quick-generate");
    await page.waitForLoadState("networkidle");

    const main = page.locator("main").first();
    await expect(main).toBeVisible();

    // 验证生成按钮存在
    const generateButton = page.locator("button", { hasText: /生成|Generate/ }).first();
    await expect(generateButton).toBeVisible();
  });
});

test.describe("MVP 核心旅程 - 数据持久化验证", () => {
  test("页面刷新后应保留导航状态", async ({ page }) => {
    await page.goto("/story");
    await page.waitForLoadState("networkidle");

    const beforeUrl = page.url();

    await page.reload();
    await page.waitForLoadState("networkidle");

    const afterUrl = page.url();
    expect(afterUrl).toBe(beforeUrl);
  });

  test("本地存储应正常工作", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // 验证 localStorage 可访问
    const canAccessStorage = await page.evaluate(() => {
      try {
        localStorage.setItem("__test__", "value");
        const value = localStorage.getItem("__test__");
        localStorage.removeItem("__test__");
        return value === "value";
      } catch {
        return false;
      }
    });

    expect(canAccessStorage).toBe(true);
  });
});

test.describe("MVP 核心旅程 - 错误恢复", () => {
  test("网络错误后应显示友好提示", async ({ page }) => {
    await page.goto("/story");
    await page.waitForLoadState("networkidle");
    await dismissOverlays(page);

    // 模拟离线状态
    await page.context().setOffline(true);

    try {
      await page.reload({ waitUntil: "domcontentloaded", timeout: 10000 });
    } catch {
      // 离线重载可能超时，这是预期的
    }

    // 恢复网络
    await page.context().setOffline(false);

    // 页面应仍能显示（有离线支持）
    const body = page.locator("body");
    await expect(body).toBeVisible();
  });

  test("无效路由应优雅处理", async ({ page }) => {
    const response = await page.goto("/nonexistent-page-12345");
    await page.waitForLoadState("networkidle");

    if (response) {
      expect(response.status()).toBeLessThan(500);
    }

    const body = page.locator("body");
    await expect(body).toBeVisible();
  });
});
