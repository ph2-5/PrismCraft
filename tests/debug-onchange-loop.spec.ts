import { test, expect } from "@playwright/test";
import { navigateTo, waitForAppReady, dismissOverlays } from "./helpers/page-helpers";
import { installElectronMock } from "./helpers/electron-mock";

test.describe("onChange 无限循环诊断", () => {
  test("Story 页面：监控 onChange 调用次数", async ({ page }) => {
    // Add init script to monitor onChange calls
    await page.addInitScript(() => {
      // Intercept input event listeners
      const origAddEventListener = EventTarget.prototype.addEventListener;
      let inputEventCount = 0;
      EventTarget.prototype.addEventListener = function(type: string, listener: any, options?: any) {
        if (type === 'input' && this instanceof HTMLInputElement) {
          const origListener = listener;
          const wrappedListener = function(this: any, event: Event) {
            inputEventCount++;
            if (inputEventCount > 100) {
              console.error(`[INFINITE-LOOP] input event called ${inputEventCount} times! Last value: ${(event.target as HTMLInputElement).value}`);
              debugger; // This will pause execution
              return;
            }
            return origListener.call(this, event);
          };
          return origAddEventListener.call(this, type, wrappedListener, options);
        }
        return origAddEventListener.call(this, type, listener, options);
      };

      // Also monitor React state updates
      let stateUpdateCount = 0;
      const origCreateElement = window.React?.createElement;
      // We can't easily intercept React setState, but we can monitor DOM mutations

      // Monitor DOM mutations on the input
      const inputObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === 'attributes') {
            const target = mutation.target as HTMLElement;
            if (target.tagName === 'INPUT' && mutation.attributeName === 'value') {
              console.log(`[DOM-MUTATION] input value changed to: ${(target as HTMLInputElement).value}`);
            }
          }
        }
      });

      // Start observing after DOM is ready
      document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
          const inputs = document.querySelectorAll('input[placeholder="分镜项目标题..."]');
          inputs.forEach(input => {
            inputObserver.observe(input, { attributes: true, attributeFilter: ['value'] });
          });
        }, 3000);
      });
    });

    await installElectronMock(page);
    await navigateTo(page, "/story");
    await dismissOverlays(page);
    await page.waitForTimeout(1000);

    // Use evaluate to set value (this works)
    await page.evaluate(() => {
      const input = document.querySelector('input[placeholder="分镜项目标题..."]') as HTMLInputElement;
      if (!input) throw new Error("Input not found");
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, "Test");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    // Wait and check
    await page.waitForTimeout(2000);

    // Check the value
    const value = await page.evaluate(() => {
      return (document.querySelector('input[placeholder="分镜项目标题..."]') as HTMLInputElement)?.value;
    });
    console.log(`Value after evaluate set: "${value}"`);

    // Check console for infinite loop warnings
    const logs: string[] = [];
    page.on("console", (msg) => {
      if (msg.text().includes("INFINITE-LOOP") || msg.text().includes("DOM-MUTATION")) {
        logs.push(msg.text());
      }
    });

    expect(true).toBe(true);
  });

  test("Story 页面：用 evaluate 触发 input 事件后检查 JS 是否存活", async ({ page }) => {
    await installElectronMock(page);
    await navigateTo(page, "/story");
    await dismissOverlays(page);
    await page.waitForTimeout(1000);

    // Click the input first
    const input = page.locator('input[placeholder="分镜项目标题..."]');
    await input.click({ timeout: 5000 });

    // Use evaluate to dispatch a single keydown event
    const jsAliveAfterKeydown = await page.evaluate(() => {
      const input = document.querySelector('input[placeholder="分镜项目标题..."]') as HTMLInputElement;
      if (!input) return "no input";

      // Dispatch keydown event for 'a'
      const keydownEvent = new KeyboardEvent('keydown', {
        key: 'a',
        code: 'KeyA',
        keyCode: 65,
        which: 65,
        bubbles: true,
        cancelable: true,
      });
      input.dispatchEvent(keydownEvent);

      return Date.now();
    });
    console.log(`JS alive after keydown dispatch: ${jsAliveAfterKeydown}`);

    // Wait a bit and check again
    await page.waitForTimeout(1000);
    const jsAliveAfterWait = await page.evaluate(() => Date.now()).catch(() => "DEAD");
    console.log(`JS alive after 1s wait: ${jsAliveAfterWait}`);

    // Now try dispatching input event
    const jsAliveAfterInput = await page.evaluate(() => {
      const input = document.querySelector('input[placeholder="分镜项目标题..."]') as HTMLInputElement;
      if (!input) return "no input";

      // Set value and dispatch input event
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, "a");
      input.dispatchEvent(new Event("input", { bubbles: true }));

      return Date.now();
    });
    console.log(`JS alive after input dispatch: ${jsAliveAfterInput}`);

    await page.waitForTimeout(1000);
    const jsAliveAfterInputWait = await page.evaluate(() => Date.now()).catch(() => "DEAD");
    console.log(`JS alive after input + 1s wait: ${jsAliveAfterInputWait}`);

    expect(true).toBe(true);
  });
});
