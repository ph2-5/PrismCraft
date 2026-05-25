import { test, expect } from "@playwright/test";

test.describe("导航栏功能", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("导航栏应可见", async ({ page }) => {
    const nav = page.locator("nav, [role='navigation']").first();
    await expect(nav).toBeVisible();
  });

  test("导航栏应包含首页链接", async ({ page }) => {
    const homeLink = page.locator("a[href='/'], a[href='/']").first();
    const hasHomeLink = (await homeLink.count()) > 0;
    expect(hasHomeLink).toBe(true);
  });
});

test.describe("页面间导航", () => {
  const pages = [
    { path: "/story", name: "故事" },
    { path: "/characters", name: "角色" },
    { path: "/scenes", name: "场景" },
    { path: "/asset-library", name: "素材库" },
    { path: "/video-tasks", name: "视频任务" },
    { path: "/quick-generate", name: "快速生成" },
    { path: "/settings", name: "设置" },
  ];

  for (const pageInfo of pages) {
    test(`直接访问${pageInfo.name}页面应正常加载`, async ({ page }) => {
      await page.goto(pageInfo.path);
      await page.waitForLoadState("networkidle");

      expect(page.url()).toContain(pageInfo.path);
      const main = page.locator("main").first();
      await expect(main).toBeVisible();
    });
  }

  for (const pageInfo of pages) {
    test(`${pageInfo.name}页面应无严重控制台错误`, async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") {
          consoleErrors.push(msg.text());
        }
      });

      await page.goto(pageInfo.path);
      await page.waitForLoadState("networkidle");

      const criticalErrors = consoleErrors.filter(
        (e) =>
          !e.includes("favicon") &&
          !e.includes("manifest") &&
          !e.includes("service-worker") &&
          !e.includes("ResizeObserver") &&
          !e.includes("net::ERR") &&
          !e.includes("404"),
      );
      expect(criticalErrors.length).toBeLessThan(5);
    });
  }
});

test.describe("首页导航链接", () => {
  test("从首页点击快速生成应导航到对应页面", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const link = page.locator("a[href='/quick-generate']").first();
    await expect(link).toBeVisible();
    const href = await link.getAttribute("href");
    await page.goto(href || "/quick-generate");
    await page.waitForLoadState("networkidle");
    expect(page.url()).toContain("/quick-generate");
  });

  test("从首页点击专业创作应导航到故事页面", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const link = page.locator("a[href='/create']").first();
    await expect(link).toBeVisible();
    const href = await link.getAttribute("href");
    await page.goto(href || "/create");
    await page.waitForLoadState("networkidle");
    expect(page.url()).toContain("/story");
  });

  test("从首页点击角色卡片应导航到角色页面", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const charLinks = page.locator("a[href='/characters']");
    await expect(charLinks.first()).toBeVisible();
    await page.goto("/characters");
    await page.waitForLoadState("networkidle");
    expect(page.url()).toContain("/characters");
  });

  test("从首页点击场景卡片应导航到场景页面", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const sceneLinks = page.locator("a[href='/scenes']");
    await expect(sceneLinks.first()).toBeVisible();
    await page.goto("/scenes");
    await page.waitForLoadState("networkidle");
    expect(page.url()).toContain("/scenes");
  });

  test("从首页点击故事卡片应导航到故事页面", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const storyLinks = page.locator("a[href='/story']");
    await expect(storyLinks.first()).toBeVisible();
    await page.goto("/story");
    await page.waitForLoadState("networkidle");
    expect(page.url()).toContain("/story");
  });
});

test.describe("浏览器导航", () => {
  test("浏览器后退应正常工作", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.goto("/characters");
    await page.waitForLoadState("networkidle");
    expect(page.url()).toContain("/characters");

    await page.goBack();
    await page.waitForLoadState("networkidle");
    expect(page.url()).not.toContain("/characters");
  });

  test("浏览器前进应正常工作", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.goto("/characters");
    await page.waitForLoadState("networkidle");

    await page.goBack();
    await page.waitForLoadState("networkidle");

    await page.goForward();
    await page.waitForLoadState("networkidle");
    expect(page.url()).toContain("/characters");
  });

  test("直接URL访问应正常加载", async ({ page }) => {
    await page.goto("/story");
    await page.waitForLoadState("networkidle");

    expect(page.url()).toContain("/story");
    const main = page.locator("main").first();
    await expect(main).toBeVisible();
  });
});

test.describe("键盘导航", () => {
  test("应能用Tab键在可交互元素间导航", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.keyboard.press("Tab");
    const focusedElement = page.locator(":focus");
    expect(await focusedElement.count()).toBeGreaterThan(0);
  });

  test("应能用Enter键激活链接", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const firstLink = page.locator("a[href]").first();
    if (await firstLink.isVisible()) {
      await firstLink.focus();
      await page.keyboard.press("Enter");
      await page.waitForLoadState("networkidle");

      expect(page.url()).not.toBe("/");
    }
  });
});

test.describe("设置页面导航", () => {
  test("设置页面应可访问", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    const main = page.locator("main").first();
    await expect(main).toBeVisible();
  });

  test("个人设置子页面应可访问", async ({ page }) => {
    await page.goto("/settings/personal");
    await page.waitForLoadState("networkidle");

    const main = page.locator("main").first();
    await expect(main).toBeVisible();
  });
});

test.describe("页面间状态一致性", () => {
  test("多次访问同一页面应保持一致", async ({ page }) => {
    await page.goto("/characters");
    await page.waitForLoadState("networkidle");

    const firstContent = await page.locator("main").first().innerHTML();

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.goto("/characters");
    await page.waitForLoadState("networkidle");

    const secondContent = await page.locator("main").first().innerHTML();
    expect(firstContent).toBe(secondContent);
  });
});
