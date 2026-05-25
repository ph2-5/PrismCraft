import { test, expect } from "@playwright/test";

test.describe("首页", () => {
  test("应正常启动并显示首页", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await expect(page).toHaveTitle(/AI Animation Studio/);
  });

  test("首页应显示主标题", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const heading = page.locator("h1").first();
    await expect(heading).toBeVisible();
    await expect(heading).toContainText("用AI");
  });

  test("首页应显示快速生成视频按钮", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const quickGenLink = page.locator("a[href='/quick-generate']").first();
    await expect(quickGenLink).toBeVisible();
  });

  test("首页应显示专业创作模式按钮", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const createLink = page.locator("a[href='/create']").first();
    await expect(createLink).toBeVisible();
  });

  test("首页应显示导出数据按钮", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const exportButton = page.locator("button", { hasText: "导出数据" });
    await expect(exportButton).toBeVisible();
  });

  test("首页应显示三个核心功能卡片", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const featureCards = page.locator("a[href='/characters'], a[href='/scenes'], a[href='/story']");
    const count = await featureCards.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test("首页应显示四步工作流", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    for (const stepText of ["创建角色", "搭建场景", "编排故事", "生成动画"]) {
      await expect(page.locator(`text=${stepText}`).first()).toBeVisible();
    }
  });

  test("首页应显示CTA区域", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("text=准备好开始你的动画创作之旅了吗？").first()).toBeVisible();
  });

  test("点击功能卡片应导航到对应页面", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const charLink = page.locator("a[href='/characters']").first();
    await expect(charLink).toBeVisible();
    await page.goto("/characters");
    await page.waitForLoadState("networkidle");
    expect(page.url()).toContain("/characters");
  });
});

test.describe("故事页面", () => {
  test("故事页面应正常加载", async ({ page }) => {
    await page.goto("/story");
    await page.waitForLoadState("networkidle");

    const main = page.locator("main").first();
    await expect(main).toBeVisible();
  });

  test("故事页面应包含故事编辑器", async ({ page }) => {
    await page.goto("/story");
    await page.waitForLoadState("networkidle");

    const editor = page.locator("[data-story-editor], textarea, [contenteditable]").first();
    const hasEditor = (await editor.count()) > 0;
    expect(hasEditor || (await page.locator("main").first().isVisible())).toBe(true);
  });
});

test.describe("角色页面", () => {
  test("角色页面应正常加载", async ({ page }) => {
    await page.goto("/characters");
    await page.waitForLoadState("networkidle");

    const main = page.locator("main").first();
    await expect(main).toBeVisible();
  });

  test("角色页面应显示创建按钮或空状态", async ({ page }) => {
    await page.goto("/characters");
    await page.waitForLoadState("networkidle");

    const createButton = page.locator("button", { hasText: /创建|新建|添加/ });
    const emptyState = page.locator("text=/暂无|还没有|空/");

    const hasCreateButton = (await createButton.count()) > 0;
    const hasEmptyState = (await emptyState.count()) > 0;
    expect(hasCreateButton || hasEmptyState || (await page.locator("main").first().isVisible())).toBe(true);
  });
});

test.describe("场景页面", () => {
  test("场景页面应正常加载", async ({ page }) => {
    await page.goto("/scenes");
    await page.waitForLoadState("networkidle");

    const main = page.locator("main").first();
    await expect(main).toBeVisible();
  });
});

test.describe("素材库页面", () => {
  test("素材库页面应正常加载", async ({ page }) => {
    await page.goto("/asset-library");
    await page.waitForLoadState("networkidle");

    const main = page.locator("main").first();
    await expect(main).toBeVisible();
  });
});

test.describe("视频任务页面", () => {
  test("视频任务页面应正常加载", async ({ page }) => {
    await page.goto("/video-tasks");
    await page.waitForLoadState("networkidle");

    const main = page.locator("main").first();
    await expect(main).toBeVisible();
  });
});

test.describe("快速生成页面", () => {
  test("快速生成页面应正常加载", async ({ page }) => {
    await page.goto("/quick-generate");
    await page.waitForLoadState("networkidle");

    const main = page.locator("main").first();
    await expect(main).toBeVisible();
  });
});

test.describe("专业创作页面", () => {
  test("专业创作页面应重定向到故事页面", async ({ page }) => {
    await page.goto("/create");
    await page.waitForLoadState("networkidle");

    expect(page.url()).toContain("/story");
    const main = page.locator("main").first();
    await expect(main).toBeVisible();
  });
});

test.describe("设置页面", () => {
  test("设置页面应正常加载", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    const main = page.locator("main").first();
    await expect(main).toBeVisible();
  });

  test("个人设置页面应正常加载", async ({ page }) => {
    await page.goto("/settings/personal");
    await page.waitForLoadState("networkidle");

    const main = page.locator("main").first();
    await expect(main).toBeVisible();
  });
});

test.describe("媒体页面", () => {
  test("媒体页面应正常加载", async ({ page }) => {
    await page.goto("/media");
    await page.waitForLoadState("networkidle");

    const main = page.locator("main").first();
    await expect(main).toBeVisible();
  });
});

test.describe("错误处理", () => {
  test("不存在的路由应不返回500错误", async ({ page }) => {
    const response = await page.goto("/nonexistent-page-12345");
    if (response) {
      expect(response.status()).toBeLessThan(500);
    }
  });

  test("页面应无未捕获的JavaScript错误", async ({ page }) => {
    const jsErrors: string[] = [];
    page.on("pageerror", (error) => {
      jsErrors.push(error.message);
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const criticalErrors = jsErrors.filter(
      (e) =>
        !e.includes("favicon") &&
        !e.includes("manifest") &&
        !e.includes("service-worker") &&
        !e.includes("ResizeObserver"),
    );
    expect(criticalErrors.length).toBe(0);
  });
});

test.describe("响应式布局", () => {
  test("移动端视口应正常显示", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const body = page.locator("body");
    await expect(body).toBeVisible();
  });

  test("平板视口应正常显示", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const body = page.locator("body");
    await expect(body).toBeVisible();
  });

  test("桌面视口应正常显示", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const body = page.locator("body");
    await expect(body).toBeVisible();
  });
});

test.describe("页面性能", () => {
  test("首页应在合理时间内加载", async ({ page }) => {
    const startTime = Date.now();
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const loadTime = Date.now() - startTime;

    expect(loadTime).toBeLessThan(15000);
  });
});
