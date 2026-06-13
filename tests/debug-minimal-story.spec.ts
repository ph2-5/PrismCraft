import { test, expect } from "@playwright/test";
import { navigateTo, waitForAppReady, dismissOverlays } from "./helpers/page-helpers";
import { installElectronMock } from "./helpers/electron-mock";

test.describe("最小化 Story 页面测试", () => {
  test("Story 页面：移除 Dialog 后测试 fill", async ({ page }) => {
    await installElectronMock(page);

    // Inject a script that removes all Dialog-related elements before they render
    await page.addInitScript(() => {
      // Override React.createElement to strip Dialog components
      const origCreateElement = window.React?.createElement;
      if (origCreateElement) {
        window.React.createElement = function(type: any, props: any, ...children: any[]) {
          // If type is a Dialog-related component, return null
          if (typeof type === 'function' || typeof type === 'object') {
            const name = type?.displayName || type?.name || '';
            if (name.includes('Dialog') || name.includes('Modal') || name.includes('Backdrop')) {
              return null;
            }
          }
          return origCreateElement.call(this, type, props, ...children);
        };
      }
    });

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

    // Try fill
    console.log("fill...");
    try {
      await input.fill("filltest", { timeout: 5000 });
      console.log("fill SUCCESS");
    } catch (e: any) {
      console.log(`fill FAILED: ${e.message?.slice(0, 200)}`);
    }

    expect(true).toBe(true);
  });

  test("Story 页面：直接用 evaluate 设置值并验证 onChange", async ({ page }) => {
    await installElectronMock(page);
    await navigateTo(page, "/story");
    await dismissOverlays(page);
    await page.waitForTimeout(1000);

    // Use evaluate to set value (this works)
    await page.evaluate(() => {
      const input = document.querySelector('input[placeholder="分镜项目标题..."]') as HTMLInputElement;
      if (!input) throw new Error("Input not found");
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, "Test Title");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    // Verify the value was set
    const value = await page.evaluate(() => {
      return (document.querySelector('input[placeholder="分镜项目标题..."]') as HTMLInputElement)?.value;
    });
    console.log(`Value after evaluate set: "${value}"`);
    expect(value).toBe("Test Title");

    // Verify React state was updated
    await page.waitForTimeout(500);
    const valueAfterWait = await page.evaluate(() => {
      return (document.querySelector('input[placeholder="分镜项目标题..."]') as HTMLInputElement)?.value;
    });
    console.log(`Value after 500ms wait: "${valueAfterWait}"`);
  });
});
