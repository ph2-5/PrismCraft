import { test, expect } from "@playwright/test";
import { navigateTo, dismissOverlays } from "./helpers/page-helpers";
import { installElectronMock } from "./helpers/electron-mock";
import { mockApiRoutes } from "./helpers/mock-api";

test("debug: Story input - fill vs click+type", async ({ page }) => {
  await installElectronMock(page);
  await mockApiRoutes(page);
  await navigateTo(page, "/story");
  await expect(page.locator("main").first()).toBeVisible();
  await dismissOverlays(page);
  await page.waitForTimeout(1500);

  const storyInput = page.locator('input[placeholder="分镜项目标题..."]');
  await storyInput.waitFor({ state: "visible", timeout: 5000 });

  // Test 1: click works
  await storyInput.click({ timeout: 5000 });
  console.log("Click: OK");

  // Test 2: type after click
  await page.keyboard.type("Hello", { timeout: 5000 });
  const typedValue = await page.evaluate(() => {
    return (document.querySelector('input[placeholder="分镜项目标题..."]') as HTMLInputElement)?.value;
  });
  console.log("Value after click+type:", typedValue);

  // Clear the input
  await page.evaluate(() => {
    const input = document.querySelector('input[placeholder="分镜项目标题..."]') as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, "");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForTimeout(300);

  // Test 3: fill with timeout
  try {
    await storyInput.fill("FillTest", { timeout: 10000 });
    console.log("Fill: OK");
    const fillValue = await page.evaluate(() => {
      return (document.querySelector('input[placeholder="分镜项目标题..."]') as HTMLInputElement)?.value;
    });
    console.log("Value after fill:", fillValue);
  } catch (e) {
    console.log("Fill FAILED:", (e as Error).message.substring(0, 500));
  }

  // Test 4: pressSequentially
  await storyInput.click({ timeout: 5000 });
  try {
    await storyInput.pressSequentially("SeqTest", { timeout: 10000 });
    console.log("pressSequentially: OK");
    const seqValue = await page.evaluate(() => {
      return (document.querySelector('input[placeholder="分镜项目标题..."]') as HTMLInputElement)?.value;
    });
    console.log("Value after pressSequentially:", seqValue);
  } catch (e) {
    console.log("pressSequentially FAILED:", (e as Error).message.substring(0, 500));
  }
});
