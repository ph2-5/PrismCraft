import { test, expect, type Page } from "@playwright/test";
import { navigateTo, waitForAppReady, dismissOverlays } from "./helpers/page-helpers";
import { installElectronMock } from "./helpers/electron-mock";
import { mockApiRoutes } from "./helpers/mock-api";
import { captureConsoleErrors } from "./helpers/console-errors";

/**
 * 全站视觉回归测试（Playwright 截图快照）
 *
 * 背景：3D 白模透出 bug（透明 canvas 透出背后分镜画布）暴露了测试盲区——
 * 现有 9929 单元测试 + 功能 e2e 均无像素级断言，视觉层缺陷无自动化防线。
 *
 * 覆盖：router.tsx 全部核心页面（mock 空态/初始态，数据稳定）+ 404 页。
 * 基线更新：npx playwright test tests/visual-regression.spec.ts --update-snapshots
 *
 * 稳定性策略：
 * - 固定 viewport（config 1280x720）+ animations: "disabled"（禁 CSS 动画）
 * - mock API + electron mock（无网络/版本波动）
 * - 截图前等待 networkidle + 500ms（懒加载/Suspense 落定）
 * - maxDiffPixelRatio 0.02 容忍字体渲染跨环境差异
 */
const PAGES: Array<{ name: string; path: string; skip?: boolean }> = [
  { name: "home", path: "/" },
  { name: "characters", path: "/characters" },
  { name: "scenes", path: "/scenes" },
  { name: "storyboard", path: "/storyboard" },
  { name: "asset-library", path: "/asset-library" },
  { name: "video-tasks", path: "/video-tasks" },
  { name: "quick-generate", path: "/quick-generate" },
  { name: "story", path: "/story" },
  { name: "agent", path: "/agent" },
  { name: "composer", path: "/composer" },
  { name: "workflow", path: "/workflow" },
  { name: "cost-tracking", path: "/cost-tracking" },
  { name: "plugins", path: "/plugins" },
  { name: "settings", path: "/settings" },
];

async function setupPage(page: Page, path: string) {
  await installElectronMock(page);
  await mockApiRoutes(page);
  await navigateTo(page, path);
  await waitForAppReady(page);
  await dismissOverlays(page);
  // 懒加载 + Suspense + 动画落定
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(600);
}

test.describe("Visual regression - 全站核心页面", () => {
  for (const { name, path } of PAGES) {
    test(`${name} (${path})`, async ({ page }) => {
      const getErrors = captureConsoleErrors(page);
      await setupPage(page, path);

      // 页面非白屏（有可见主体内容）
      await expect(page.locator("main, [role='region'], .fade-in").first()).toBeVisible({ timeout: 15000 });

      await expect(page).toHaveScreenshot(`${name}.png`);

      const criticalErrors = getErrors();
      expect(criticalErrors, criticalErrors.join("\n")).toHaveLength(0);
    });
  }
});

test.describe("Visual regression - 404 页", () => {
  test("not-found (deep invalid route)", async ({ page }) => {
    await setupPage(page, "/storyboard/beat/definitely-not-a-real-beat-99999");
    await expect(page).toHaveScreenshot("not-found.png");
  });
});
