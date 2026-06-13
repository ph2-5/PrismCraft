import type { Page } from "@playwright/test";
import { installElectronMock } from "./electron-mock";

export async function dismissOverlays(page: Page) {
  const overlay = page.locator("div.fixed.inset-0.z-50").first();
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

/**
 * Fill an input by setting value via evaluate + dispatching events.
 *
 * Root cause: When `installElectronMock` is active, Playwright's CDP-based
 * keyboard event injection (fill/keyboard.type/pressSequentially) causes the
 * Story page's JS main thread to hang indefinitely. The exact mechanism is
 * an interaction between @base-ui/react's Dialog/Select components and
 * Playwright's Input.dispatchKeyEvent — without the mock, keyboard input
 * works fine. Manual DOM event dispatch via evaluate() bypasses this issue.
 *
 * This is NOT a project code bug — it's a Playwright + @base-ui/react
 * compatibility issue that only manifests when the electron mock is installed.
 */
export async function fillInput(page: Page, selector: string, value: string) {
  await page.evaluate(
    ({ sel, val }) => {
      const input = document.querySelector(sel) as HTMLInputElement | null;
      if (!input) throw new Error(`Input not found: ${sel}`);
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, val);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    },
    { sel: selector, val: value },
  );
}

/**
 * Click an element via evaluate + dispatching events.
 * Same workaround as fillInput — Story page interactive elements
 * cause Playwright's native click to hang indefinitely.
 */
export async function clickElement(page: Page, selector: string) {
  await page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) throw new Error(`Element not found: ${sel}`);
    el.click();
  }, selector);
}

/**
 * Click a button by its text content via evaluate.
 * Workaround for Story page where Playwright's native click hangs.
 */
export async function clickButtonByText(page: Page, text: string, index = 0) {
  await page.evaluate(
    ({ searchText, idx }) => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const matching = buttons.filter((b) => b.textContent?.includes(searchText));
      const btn = matching[idx] as HTMLElement | undefined;
      if (!btn) throw new Error(`Button not found: "${searchText}" (index ${idx})`);
      btn.click();
    },
    { searchText: text, idx: index },
  );
}

/**
 * Fill a textarea via evaluate + dispatching events.
 * Same workaround as fillInput for Story page.
 */
export async function fillTextarea(page: Page, selector: string, value: string) {
  await page.evaluate(
    ({ sel, val }) => {
      const ta = document.querySelector(sel) as HTMLTextAreaElement | null;
      if (!ta) throw new Error(`Textarea not found: ${sel}`);
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      setter?.call(ta, val);
      ta.dispatchEvent(new Event("input", { bubbles: true }));
      ta.dispatchEvent(new Event("change", { bubbles: true }));
    },
    { sel: selector, val: value },
  );
}
