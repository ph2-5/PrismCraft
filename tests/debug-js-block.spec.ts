import { test, expect } from "@playwright/test";
import { navigateTo, waitForAppReady, dismissOverlays } from "./helpers/page-helpers";
import { installElectronMock } from "./helpers/electron-mock";

test.describe("JS 主线程阻塞诊断", () => {
  test("Story 页面：keyboard.type 是否阻塞 JS", async ({ page }) => {
    await installElectronMock(page);
    await navigateTo(page, "/story");
    await dismissOverlays(page);
    await page.waitForTimeout(1000);

    const input = page.locator('input[placeholder="分镜项目标题..."]');

    // Click the input first
    await input.click({ timeout: 5000 });
    console.log("click done");

    // Verify input is focused
    const isFocused = await page.evaluate(() => {
      return document.activeElement?.getAttribute("placeholder") === "分镜项目标题...";
    });
    console.log(`input focused: ${isFocused}`);

    // Try a single key press with very short timeout
    console.log("pressing 'a'...");
    try {
      await page.keyboard.press("a", { timeout: 3000 });
      console.log("press 'a' SUCCESS");
    } catch (e: any) {
      console.log(`press 'a' FAILED: ${e.message?.slice(0, 300)}`);
    }

    // Check if JS is still responsive after the failed press
    const jsAlive = await page.evaluate(() => Date.now()).catch(() => "DEAD");
    console.log(`JS alive after press: ${jsAlive}`);

    // Try keyboard.type with just 1 char
    console.log("typing 'b'...");
    try {
      await page.keyboard.type("b", { timeout: 3000 });
      console.log("type 'b' SUCCESS");
    } catch (e: any) {
      console.log(`type 'b' FAILED: ${e.message?.slice(0, 300)}`);
    }

    // Check JS again
    const jsAlive2 = await page.evaluate(() => Date.now()).catch(() => "DEAD");
    console.log(`JS alive after type: ${jsAlive2}`);

    // Try fill
    console.log("fill...");
    try {
      await input.fill("test", { timeout: 3000 });
      console.log("fill SUCCESS");
    } catch (e: any) {
      console.log(`fill FAILED: ${e.message?.slice(0, 300)}`);
    }

    // Check JS again
    const jsAlive3 = await page.evaluate(() => Date.now()).catch(() => "DEAD");
    console.log(`JS alive after fill: ${jsAlive3}`);

    expect(true).toBe(true);
  });

  test("Character 页面：对照测试", async ({ page }) => {
    await installElectronMock(page);
    await navigateTo(page, "/characters");

    const input = page.locator('input[placeholder="输入角色名称..."]');

    await input.click({ timeout: 5000 });
    console.log("click done");

    try {
      await page.keyboard.press("a", { timeout: 3000 });
      console.log("press 'a' SUCCESS");
    } catch (e: any) {
      console.log(`press 'a' FAILED: ${e.message?.slice(0, 300)}`);
    }

    try {
      await page.keyboard.type("b", { timeout: 3000 });
      console.log("type 'b' SUCCESS");
    } catch (e: any) {
      console.log(`type 'b' FAILED: ${e.message?.slice(0, 300)}`);
    }

    try {
      await input.fill("test", { timeout: 3000 });
      console.log("fill SUCCESS");
    } catch (e: any) {
      console.log(`fill FAILED: ${e.message?.slice(0, 300)}`);
    }

    expect(true).toBe(true);
  });
});
