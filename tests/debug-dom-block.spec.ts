import { test, expect } from "@playwright/test";
import { navigateTo, waitForAppReady, dismissOverlays } from "./helpers/page-helpers";
import { installElectronMock } from "./helpers/electron-mock";

test.describe("DOM 阻塞诊断", () => {
  test("Story 页面：检查 inert 和阻塞元素", async ({ page }) => {
    await installElectronMock(page);
    await navigateTo(page, "/story");
    await dismissOverlays(page);
    await page.waitForTimeout(1000);

    // Check for inert elements
    const inertInfo = await page.evaluate(() => {
      const inertElements = document.querySelectorAll("[inert]");
      const results: string[] = [];
      inertElements.forEach((el) => {
        results.push(`<${el.tagName} class="${el.className?.toString().slice(0, 80)}" inert>`);
      });

      // Also check for aria-hidden="true" on body or main
      const bodyAriaHidden = document.body.getAttribute("aria-hidden");
      const mainAriaHidden = document.querySelector("main")?.getAttribute("aria-hidden");

      // Check for elements with pointer-events: none
      const allElements = document.querySelectorAll("*");
      const pointerEventsNone: string[] = [];
      allElements.forEach((el) => {
        const style = window.getComputedStyle(el);
        if (style.pointerEvents === "none") {
          pointerEventsNone.push(`<${el.tagName} class="${el.className?.toString().slice(0, 60)}">`);
        }
      });

      // Check for fixed position elements that might be overlays
      const fixedElements: string[] = [];
      allElements.forEach((el) => {
        const style = window.getComputedStyle(el);
        if (style.position === "fixed" && style.display !== "none" && style.visibility !== "hidden") {
          const rect = el.getBoundingClientRect();
          if (rect.width > 100 && rect.height > 100) {
            fixedElements.push(`<${el.tagName} class="${el.className?.toString().slice(0, 60)}" ${rect.width}x${rect.height}>`);
          }
        }
      });

      return {
        inertCount: inertElements.length,
        inertElements: results,
        bodyAriaHidden,
        mainAriaHidden,
        pointerEventsNoneCount: pointerEventsNone.length,
        pointerEventsNone: pointerEventsNone.slice(0, 10),
        fixedElementsCount: fixedElements.length,
        fixedElements: fixedElements.slice(0, 10),
      };
    });

    console.log("=== Story Page DOM Diagnostics ===");
    console.log(JSON.stringify(inertInfo, null, 2));

    // Now click the input and check again
    const input = page.locator('input[placeholder="分镜项目标题..."]');
    await input.click({ timeout: 5000 });

    const afterClickInfo = await page.evaluate(() => {
      const inertElements = document.querySelectorAll("[inert]");
      const results: string[] = [];
      inertElements.forEach((el) => {
        results.push(`<${el.tagName} class="${el.className?.toString().slice(0, 80)}" inert>`);
      });

      const bodyAriaHidden = document.body.getAttribute("aria-hidden");
      const mainAriaHidden = document.querySelector("main")?.getAttribute("aria-hidden");

      // Check if input is focusable
      const input = document.querySelector('input[placeholder="分镜项目标题..."]') as HTMLInputElement;
      const activeEl = document.activeElement;
      const inputFocused = activeEl === input;

      // Check if there's a dialog open
      const dialogs = document.querySelectorAll('[role="dialog"]');
      const dialogInfo: string[] = [];
      dialogs.forEach((d) => {
        const style = window.getComputedStyle(d);
        dialogInfo.push(`visible=${style.display !== "none" && style.visibility !== "hidden"}, display=${style.display}, visibility=${style.visibility}`);
      });

      return {
        inertCount: inertElements.length,
        inertElements: results,
        bodyAriaHidden,
        mainAriaHidden,
        inputFocused,
        dialogCount: dialogs.length,
        dialogInfo,
      };
    });

    console.log("=== After Click Diagnostics ===");
    console.log(JSON.stringify(afterClickInfo, null, 2));

    expect(true).toBe(true);
  });
});
