import type { Page } from "@playwright/test";

export async function dismissOverlays(page: Page) {
  // 匹配 Tailwind 风格的 overlay (div.fixed.inset-0.z-50) 和 Modal 组件 (.modal-overlay)
  const overlay = page.locator("div.fixed.inset-0.z-50, .modal-overlay").first();
  if (await overlay.isVisible({ timeout: 1000 }).catch(() => false)) {
    const skipBtn = overlay.locator("button", { hasText: "跳过" }).first();
    if (await skipBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await skipBtn.click({ force: true, timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(300);
      if (!(await overlay.isVisible({ timeout: 500 }).catch(() => false))) return;
    }
    const closeBtn = overlay.locator("button").first();
    if (await closeBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await closeBtn.click({ force: true, timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(300);
      if (!(await overlay.isVisible({ timeout: 500 }).catch(() => false))) return;
    }
    // 点击 overlay 自身关闭（Modal 组件支持 closeOnOverlayClick）
    await overlay.click({ force: true, timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(300);
    if (!(await overlay.isVisible({ timeout: 500 }).catch(() => false))) return;
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
  await page.waitForLoadState("domcontentloaded");
  await page.locator("main").first().waitFor({ state: "visible", timeout: 15000 });
}

const BASE_URL = "http://localhost:3000";

export async function navigateTo(page: Page, path: string) {
  await page.goto(`${BASE_URL}${path}`);
  await waitForAppReady(page);
  await dismissOverlays(page);
}

export async function hasElectronAPI(page: Page): Promise<boolean> {
  return page.evaluate(() => !!(window as any).electronAPI);
}
