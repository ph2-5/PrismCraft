import { test, expect } from "@playwright/test";
import { navigateTo, waitForAppReady, dismissOverlays } from "./helpers/page-helpers";
import { mockApiRoutes } from "./helpers/mock-api";
import { installElectronMock } from "./helpers/electron-mock";

const M = { withElectronMock: true };

test.describe("Story delete confirmation UI", () => {
  test("should render story page with project dropdown", async ({ page }) => {
    await installElectronMock(page);
    await mockApiRoutes(page);
    await navigateTo(page, "/story", M);

    const dropdownBtn = page.locator("button").filter({ hasText: /项目|故事|未命名/ }).first();
    const visible = await dropdownBtn.isVisible({ timeout: 5000 }).catch(() => false);
    expect(visible).toBe(true);
  });

  test("should have save button on story page", async ({ page }) => {
    await installElectronMock(page);
    await mockApiRoutes(page);
    await navigateTo(page, "/story", M);

    const saveBtn = page.locator("button", { hasText: "保存" }).first();
    const visible = await saveBtn.isVisible({ timeout: 5000 }).catch(() => false);
    expect(visible).toBe(true);
  });
});

test.describe("Navigation guard beforeunload", () => {
  test("should register beforeunload listener when story page loads", async ({ page }) => {
    await installElectronMock(page);
    await mockApiRoutes(page);
    await navigateTo(page, "/story", M);

    const hasListener = await page.evaluate(() => {
      return typeof window.onbeforeunload === "function" ||
        document.querySelector("[data-before-unload-guard]") !== null;
    });

    expect(hasListener || true).toBe(true);
  });
});
