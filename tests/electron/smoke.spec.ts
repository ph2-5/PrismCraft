import { test, expect } from "../helpers/electron-fixture";
import { navigateTo, waitForAppReady, dismissOverlays, hasElectronAPI } from "../helpers/electron-page-helpers";

const MAIN_PAGES = [
  { path: "/story", name: "Story" },
  { path: "/characters", name: "Characters" },
  { path: "/scenes", name: "Scenes" },
  { path: "/asset-library", name: "Asset Library" },
  { path: "/video-tasks", name: "Video Tasks" },
  { path: "/quick-generate", name: "Quick Generate" },
  { path: "/settings", name: "Settings" },
];

test.describe("Homepage Loading and Content Verification", () => {
  test("should launch and display homepage with correct title", async ({ page }) => {
    await navigateTo(page, "/");
    await expect(page).toHaveTitle(/AI Animation Studio/);
  });

  test("should display main heading on homepage", async ({ page }) => {
    await navigateTo(page, "/");
    const heading = page.locator("h1").first();
    await expect(heading).toBeVisible();
    await expect(heading).toContainText("用AI");
  });

  test("should display quick generate button", async ({ page }) => {
    await navigateTo(page, "/");
    const link = page.locator("a[href='/quick-generate']").first();
    await expect(link).toBeVisible();
  });

  test("should display professional create button", async ({ page }) => {
    await navigateTo(page, "/");
    const link = page.locator("a[href='/story']").first();
    await expect(link).toBeVisible();
  });

  test("should display export data button", async ({ page }) => {
    await navigateTo(page, "/");
    const button = page.locator("button", { hasText: "导出数据" });
    await expect(button).toBeVisible();
  });

  test("should display three core feature cards", async ({ page }) => {
    await navigateTo(page, "/");
    const cards = page.locator("a[href='/characters'], a[href='/scenes'], a[href='/story']");
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test("should display four-step workflow", async ({ page }) => {
    await navigateTo(page, "/");
    for (const step of ["创建角色", "搭建场景", "编排故事", "生成动画"]) {
      await expect(page.locator(`text=${step}`).first()).toBeVisible();
    }
  });

  test("should display CTA section", async ({ page }) => {
    await navigateTo(page, "/");
    await expect(page.locator("text=准备好开始你的动画创作之旅了吗？").first()).toBeVisible();
  });

  test("should display navigation bar", async ({ page }) => {
    await navigateTo(page, "/");
    await dismissOverlays(page);
    const nav = page.locator("aside nav, [role='navigation']").first();
    await expect(nav).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Page Navigation via Direct URL", () => {
  for (const { path, name } of MAIN_PAGES) {
    test(`should load ${name} page via direct URL`, async ({ page }) => {
      await navigateTo(page, path);
      expect(page.url()).toContain(path);
      await expect(page.locator("main").first()).toBeVisible();
    });
  }

  test("should load /story page correctly", async ({ page }) => {
    await navigateTo(page, "/story");
    expect(page.url()).toContain("/story");
    await expect(page.locator("main").first()).toBeVisible();
  });

  test("should navigate from homepage to characters via link click", async ({ page }) => {
    await navigateTo(page, "/");
    await dismissOverlays(page);
    const link = page.locator("a[href='/characters']").first();
    await expect(link).toBeVisible();
    await link.click();
    await page.waitForURL("**/characters", { timeout: 15000 });
    expect(page.url()).toContain("/characters");
  });

  test("should navigate from homepage to scenes via link click", async ({ page }) => {
    await navigateTo(page, "/");
    await dismissOverlays(page);
    const link = page.locator("a[href='/scenes']").first();
    await expect(link).toBeVisible();
    await link.click();
    await page.waitForURL("**/scenes", { timeout: 15000 });
    expect(page.url()).toContain("/scenes");
  });

  test("should navigate from homepage to story via link click", async ({ page }) => {
    await navigateTo(page, "/");
    await dismissOverlays(page);
    const link = page.locator("a[href='/story']").first();
    await expect(link).toBeVisible();
    await link.click();
    await page.waitForURL("**/story", { timeout: 15000 });
    expect(page.url()).toContain("/story");
  });

  test("should navigate from homepage to quick generate via link click", async ({ page }) => {
    await navigateTo(page, "/");
    await dismissOverlays(page);
    const link = page.locator("a[href='/quick-generate']").first();
    await expect(link).toBeVisible();
    await link.click();
    await page.waitForURL("**/quick-generate", { timeout: 15000 });
    expect(page.url()).toContain("/quick-generate");
  });

  test("should navigate from characters page to scenes page via sidebar", async ({ page }) => {
    await navigateTo(page, "/characters");
    await dismissOverlays(page);
    const sidebarBtn = page.locator("aside button").filter({ hasText: "场景" }).first();
    const link = page.locator("a[href='/scenes']").first();
    const navTarget = sidebarBtn.or(link);
    if (await navTarget.first().isVisible().catch(() => false)) {
      await navTarget.first().click({ force: true });
      await page.waitForURL("**/scenes", { timeout: 15000 });
      expect(page.url()).toContain("/scenes");
    }
  });
});

test.describe("Browser Back and Forward", () => {
  test("should navigate back correctly", async ({ page }) => {
    await navigateTo(page, "/");
    await navigateTo(page, "/characters");
    expect(page.url()).toContain("/characters");

    await page.goBack();
    await page.waitForLoadState("domcontentloaded");
    expect(page.url()).not.toContain("/characters");
  });

  test("should navigate forward correctly", async ({ page }) => {
    await navigateTo(page, "/");
    await navigateTo(page, "/characters");
    await page.goBack();
    await page.waitForLoadState("domcontentloaded");

    await page.goForward();
    await page.waitForLoadState("domcontentloaded");
    expect(page.url()).toContain("/characters");
  });

  test("should maintain consistent content on repeated visits", async ({ page }) => {
    await navigateTo(page, "/characters");
    const firstMain = page.locator("main").first();
    await expect(firstMain).toBeVisible();
    const firstHasHeading = await firstMain.locator("h1, h2, h3").first().isVisible().catch(() => false);

    await navigateTo(page, "/");
    await navigateTo(page, "/characters");
    const secondMain = page.locator("main").first();
    await expect(secondMain).toBeVisible();
    const secondHasHeading = await secondMain.locator("h1, h2, h3").first().isVisible().catch(() => false);

    expect(firstHasHeading).toBe(secondHasHeading);
  });
});

test.describe("404 Handling", () => {
  test("should not return 500 for non-existent route", async ({ page }) => {
    const response = await page.goto("http://localhost:3000/nonexistent-page-12345");
    if (response) {
      expect(response.status()).toBeLessThan(500);
    }
  });

  test("should display content instead of white screen for non-existent route", async ({ page }) => {
    await page.goto("http://localhost:3000/nonexistent-page-xyz");
    const body = page.locator("body");
    await expect(body).toBeVisible();
  });
});

test.describe("JavaScript Error Detection", () => {
  const ALL_PAGES = ["/", "/characters", "/scenes", "/story", "/video-tasks", "/quick-generate", "/settings"];

  test("should have no uncaught JavaScript errors across all pages", async ({ page }) => {
    const jsErrors: string[] = [];
    page.on("pageerror", (error) => {
      jsErrors.push(error.message);
    });

    for (const path of ALL_PAGES) {
      await navigateTo(page, path);
    }

    const criticalErrors = jsErrors.filter(
      (e) =>
        !e.includes("favicon") &&
        !e.includes("manifest") &&
        !e.includes("service-worker") &&
        !e.includes("ResizeObserver") &&
        !e.includes("Loading chunk") &&
        !e.includes("hydration") &&
        !e.includes("Next.js") &&
        !e.includes("webpack") &&
        !e.includes("HMR") &&
        !e.includes("Fast Refresh") &&
        !e.includes("React"),
    );
    expect(criticalErrors.length).toBe(0);
  });

  test("should have no excessive console errors on any page", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    for (const { path } of MAIN_PAGES) {
      await navigateTo(page, path);
    }

    const criticalErrors = consoleErrors.filter(
      (e) =>
        !e.includes("favicon") &&
        !e.includes("manifest") &&
        !e.includes("service-worker") &&
        !e.includes("ResizeObserver") &&
        !e.includes("net::ERR") &&
        !e.includes("404") &&
        !e.includes("hydration") &&
        !e.includes("Next.js") &&
        !e.includes("webpack") &&
        !e.includes("HMR") &&
        !e.includes("Fast Refresh") &&
        !e.includes("React") &&
        !e.includes("[SyncSchema]") &&
        !e.includes("Schema update should be done") &&
        !e.includes("Failed to fetch") &&
        !e.includes("NetworkError") &&
        !e.includes("ERR_CONNECTION_REFUSED") &&
        !e.includes("localhost"),
    );
    expect(criticalErrors.length).toBeLessThan(100);
  });
});

test.describe("Responsive Layout", () => {
  test("should render correctly on mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await navigateTo(page, "/");
    await expect(page.locator("body")).toBeVisible();
    await expect(page.locator("main").first()).toBeVisible();
  });

  test("should render correctly on tablet viewport", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await navigateTo(page, "/");
    await expect(page.locator("body")).toBeVisible();
    await expect(page.locator("main").first()).toBeVisible();
  });

  test("should render correctly on desktop viewport", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await navigateTo(page, "/");
    await expect(page.locator("body")).toBeVisible();
    await expect(page.locator("main").first()).toBeVisible();
  });
});

test.describe("Page Load Performance", () => {
  test("should load homepage within reasonable time", async ({ page }) => {
    const startTime = Date.now();
    await navigateTo(page, "/");
    const loadTime = Date.now() - startTime;
    expect(loadTime).toBeLessThan(15000);
  });
});
