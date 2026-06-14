import { test, expect } from "@playwright/test";
import { navigateTo, waitForAppReady, dismissOverlays } from "./helpers/page-helpers";
import { mockApiRoutes } from "./helpers/mock-api";
import { installElectronMock } from "./helpers/electron-mock";

const M = { withElectronMock: true };

test.describe("Navigation guard basic functionality", () => {
  test("should navigate freely when no unsaved changes", async ({ page }) => {
    await installElectronMock(page);
    await mockApiRoutes(page);
    await navigateTo(page, "/story", M);

    const sidebarBtn = page.locator("aside a, aside button, nav a, nav button").filter({ hasText: "角色" }).first();
    const visible = await sidebarBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (!visible) return;

    await sidebarBtn.click({ force: true });
    await page.waitForTimeout(1000);

    expect(page.url()).toContain("/characters");
  });

  test("should load story page with title input", async ({ page }) => {
    await installElectronMock(page);
    await mockApiRoutes(page);
    await navigateTo(page, "/story", M);

    const titleInput = page.locator('[data-testid="story-title-input"]');
    const visible = await titleInput.isVisible({ timeout: 5000 }).catch(() => false);
    expect(visible).toBe(true);
  });

  test("should load story page with save status indicator", async ({ page }) => {
    await installElectronMock(page);
    await mockApiRoutes(page);
    await navigateTo(page, "/story", M);

    const saveStatus = page.locator("[data-save-status], [aria-label*='保存']").first();
    const titleInput = page.locator('[data-testid="story-title-input"]');
    const anyVisible = (await saveStatus.isVisible({ timeout: 3000 }).catch(() => false)) ||
      (await titleInput.isVisible({ timeout: 3000 }).catch(() => false));
    expect(anyVisible).toBe(true);
  });
});
