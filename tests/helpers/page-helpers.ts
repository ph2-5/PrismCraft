import type { Page } from "@playwright/test";
import { installElectronMock } from "./electron-mock";

export async function dismissOverlays(page: Page) {
  const overlay = page.locator("div.fixed.inset-0.z-50").first();
  if (await overlay.isVisible({ timeout: 1000 }).catch(() => false)) {
    const skipBtn = overlay.locator("button", { hasText: "跳过" }).first();
    if (await skipBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await skipBtn.click({ force: true });
      await page.waitForTimeout(300);
      return;
    }
    const closeBtn = overlay.locator("button").first();
    if (await closeBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await closeBtn.click({ force: true });
      await page.waitForTimeout(300);
      return;
    }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  }
  const dialog = page.locator('[role="dialog"]:not([data-nextjs-dialog])').first();
  if (await dialog.isVisible({ timeout: 500 }).catch(() => false)) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
  }
}

export async function waitForAppReady(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.locator("main").first().waitFor({ state: "visible", timeout: 15000 });
}

export async function navigateTo(page: Page, path: string, options?: { withElectronMock?: boolean }) {
  if (options?.withElectronMock) {
    await installElectronMock(page);
  }
  await page.goto(path);
  await waitForAppReady(page);
  await dismissOverlays(page);
}

export async function hasElectronAPI(page: Page): Promise<boolean> {
  return page.evaluate(() => !!(window as any).electronAPI);
}

export function skipWithoutElectron() {
  return process.env.SKIP_ELECTRON_TESTS === "1";
}
