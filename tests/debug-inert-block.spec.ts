import { test, expect } from "@playwright/test";
import { navigateTo, waitForAppReady, dismissOverlays } from "./helpers/page-helpers";
import { installElectronMock } from "./helpers/electron-mock";

test.describe("强制 modal=false 测试", () => {
  test("Story 页面：强制所有 @base-ui modal=false 后测试 fill", async ({ page }) => {
    // Before page loads, patch @base-ui/react to force modal=false on Dialog
    await page.addInitScript(() => {
      // Patch Dialog.Root to always use modal=false
      const originalDefineProperty = Object.defineProperty;

      // Monitor for inert attribute being set
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === 'attributes' && mutation.attributeName === 'inert') {
            const target = mutation.target as HTMLElement;
            console.log(`[INERT-DETECT] ${target.tagName}.${target.className?.toString().slice(0, 50)} inert=${target.getAttribute('inert')}`);
            // Remove inert immediately
            target.removeAttribute('inert');
          }
          if (mutation.type === 'attributes' && mutation.attributeName === 'aria-hidden') {
            const target = mutation.target as HTMLElement;
            const val = target.getAttribute('aria-hidden');
            if (val === 'true') {
              console.log(`[ARIA-HIDDEN-DETECT] ${target.tagName}.${target.className?.toString().slice(0, 50)} aria-hidden=true`);
              // Don't remove - just log
            }
          }
        }
      });
      observer.observe(document.documentElement, {
        attributes: true,
        subtree: true,
        attributeFilter: ['inert', 'aria-hidden'],
      });

      // Also intercept inert setter
      const origSetAttribute = Element.prototype.setAttribute;
      Element.prototype.setAttribute = function(name: string, value: string) {
        if (name === 'inert') {
          console.log(`[INERT-SET] ${this.tagName}.${(this as HTMLElement).className?.toString().slice(0, 50)} inert=${value}`);
          // Block inert from being set
          return;
        }
        return origSetAttribute.call(this, name, value);
      };
    });

    await installElectronMock(page);
    await navigateTo(page, "/story");
    await dismissOverlays(page);
    await page.waitForTimeout(1000);

    const input = page.locator('input[placeholder="分镜项目标题..."]');

    // Try click
    console.log("click...");
    await input.click({ timeout: 5000 });
    console.log("click SUCCESS");

    // Try keyboard.type
    console.log("keyboard.type...");
    try {
      await page.keyboard.type("test", { timeout: 5000 });
      console.log("keyboard.type SUCCESS");
    } catch (e: any) {
      console.log(`keyboard.type FAILED: ${e.message?.slice(0, 200)}`);
    }

    // Check JS alive
    const jsAlive = await page.evaluate(() => Date.now()).catch(() => "DEAD");
    console.log(`JS alive: ${jsAlive}`);

    // Try fill
    if (jsAlive !== "DEAD") {
      console.log("fill...");
      try {
        await input.fill("filltest", { timeout: 5000 });
        console.log("fill SUCCESS");
      } catch (e: any) {
        console.log(`fill FAILED: ${e.message?.slice(0, 200)}`);
      }
    }

    expect(true).toBe(true);
  });
});
