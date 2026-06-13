import { test, expect } from "@playwright/test";
import { navigateTo, waitForAppReady, dismissOverlays } from "./helpers/page-helpers";
import { installElectronMock } from "./helpers/electron-mock";

test.describe("fill() 超时精确诊断", () => {
  test("Story 页面：逐步测试 Playwright 操作", async ({ page }) => {
    await installElectronMock(page);
    await navigateTo(page, "/story");
    await dismissOverlays(page);
    await page.waitForTimeout(1000);

    const input = page.locator('input[placeholder="分镜项目标题..."]');

    // Step 1: click
    console.log("[Step 1] click()...");
    await input.click({ timeout: 5000 });
    console.log("[Step 1] click() SUCCESS");

    // Step 2: check focus
    const isFocused = await page.evaluate(() => {
      return document.activeElement?.getAttribute("placeholder") === "分镜项目标题...";
    });
    console.log(`[Step 2] isFocused: ${isFocused}`);

    // Step 3: try pressSequentially with short timeout
    console.log("[Step 3] pressSequentially('test')...");
    try {
      await input.pressSequentially("test", { timeout: 5000 });
      console.log("[Step 3] pressSequentially SUCCESS");
    } catch (e: any) {
      console.log(`[Step 3] pressSequentially FAILED: ${e.message?.slice(0, 200)}`);
    }

    // Step 4: try keyboard.type after evaluate focus
    console.log("[Step 4] evaluate focus + keyboard.type...");
    await page.evaluate(() => {
      const input = document.querySelector('input[placeholder="分镜项目标题..."]') as HTMLInputElement;
      if (input) input.focus();
    });
    try {
      await page.keyboard.type("hello", { timeout: 5000 });
      console.log("[Step 4] keyboard.type SUCCESS");
    } catch (e: any) {
      console.log(`[Step 4] keyboard.type FAILED: ${e.message?.slice(0, 200)}`);
    }

    // Step 5: try fill with force (if supported)
    console.log("[Step 5] fill()...");
    try {
      await input.fill("filltest", { timeout: 5000 });
      console.log("[Step 5] fill() SUCCESS");
    } catch (e: any) {
      console.log(`[Step 5] fill() FAILED: ${e.message?.slice(0, 200)}`);
    }

    // Step 6: Check if there's a continuous re-render happening
    console.log("[Step 6] Checking for continuous re-renders...");
    const renderCount = await page.evaluate(() => {
      return new Promise<number>((resolve) => {
        let count = 0;
        const input = document.querySelector('input[placeholder="分镜项目标题..."]') as HTMLInputElement;
        if (!input) { resolve(0); return; }
        const observer = new MutationObserver(() => { count++; });
        observer.observe(input, { attributes: true, attributeFilter: ["class", "style", "value"] });
        setTimeout(() => {
          observer.disconnect();
          resolve(count);
        }, 2000);
      });
    });
    console.log(`[Step 6] MutationObserver count in 2s: ${renderCount}`);

    // Step 7: Check if there's a continuous re-render on parent
    const parentRenderCount = await page.evaluate(() => {
      return new Promise<number>((resolve) => {
        let count = 0;
        const input = document.querySelector('input[placeholder="分镜项目标题..."]') as HTMLInputElement;
        if (!input?.parentElement) { resolve(0); return; }
        const observer = new MutationObserver(() => { count++; });
        observer.observe(input.parentElement, { attributes: true, childList: true, subtree: true });
        setTimeout(() => {
          observer.disconnect();
          resolve(count);
        }, 2000);
      });
    });
    console.log(`[Step 7] Parent MutationObserver count in 2s: ${parentRenderCount}`);

    // Step 8: Check for requestAnimationFrame loop
    const rafCount = await page.evaluate(() => {
      return new Promise<number>((resolve) => {
        let count = 0;
        let stopped = false;
        function tick() {
          if (stopped) return;
          count++;
          requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
        setTimeout(() => {
          stopped = true;
          resolve(count);
        }, 1000);
      });
    });
    console.log(`[Step 8] requestAnimationFrame count in 1s: ${rafCount}`);

    // Step 9: Check DOM stability - does the input element reference change?
    const stabilityCheck = await page.evaluate(() => {
      return new Promise<{ sameRef: boolean; changes: number }>((resolve) => {
        const input1 = document.querySelector('input[placeholder="分镜项目标题..."]');
        let changes = 0;
        let sameRef = true;
        const interval = setInterval(() => {
          const currentInput = document.querySelector('input[placeholder="分镜项目标题..."]');
          if (currentInput !== input1) {
            sameRef = false;
            changes++;
          }
        }, 100);
        setTimeout(() => {
          clearInterval(interval);
          resolve({ sameRef, changes });
        }, 2000);
      });
    });
    console.log(`[Step 9] DOM stability: sameRef=${stabilityCheck.sameRef}, changes=${stabilityCheck.changes}`);

    // Step 10: Try fill after stopping all animations
    console.log("[Step 10] fill() after stopping animations...");
    await page.evaluate(() => {
      document.getAnimations().forEach(a => a.cancel());
    });
    try {
      await input.fill("afterstop", { timeout: 5000 });
      console.log("[Step 10] fill() SUCCESS after stopping animations");
    } catch (e: any) {
      console.log(`[Step 10] fill() FAILED after stopping animations: ${e.message?.slice(0, 200)}`);
    }

    // Force pass so we can see all logs
    expect(true).toBe(true);
  });
});
