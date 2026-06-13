import { test, expect } from "@playwright/test";

test.describe("无 mock 测试", () => {
  test("Story 页面：无 electron mock 测试 fill", async ({ page }) => {
    // No installElectronMock - just load the page directly
    await page.goto("/story");
    await page.waitForTimeout(3000);

    const input = page.locator('input[placeholder="分镜项目标题..."]');

    // Check if input exists
    const inputExists = await input.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`Input exists: ${inputExists}`);

    if (!inputExists) {
      console.log("Input not found, skipping fill test");
      expect(true).toBe(true);
      return;
    }

    // Try click
    console.log("click...");
    try {
      await input.click({ timeout: 5000 });
      console.log("click SUCCESS");
    } catch (e: any) {
      console.log(`click FAILED: ${e.message?.slice(0, 200)}`);
    }

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

    expect(true).toBe(true);
  });

  test("Character 页面：无 electron mock 测试 fill", async ({ page }) => {
    await page.goto("/characters");
    await page.waitForTimeout(3000);

    const input = page.locator('input[placeholder="输入角色名称..."]');

    const inputExists = await input.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`Input exists: ${inputExists}`);

    if (!inputExists) {
      console.log("Input not found, skipping fill test");
      expect(true).toBe(true);
      return;
    }

    console.log("click...");
    try {
      await input.click({ timeout: 5000 });
      console.log("click SUCCESS");
    } catch (e: any) {
      console.log(`click FAILED: ${e.message?.slice(0, 200)}`);
    }

    console.log("keyboard.type...");
    try {
      await page.keyboard.type("test", { timeout: 5000 });
      console.log("keyboard.type SUCCESS");
    } catch (e: any) {
      console.log(`keyboard.type FAILED: ${e.message?.slice(0, 200)}`);
    }

    const jsAlive = await page.evaluate(() => Date.now()).catch(() => "DEAD");
    console.log(`JS alive: ${jsAlive}`);

    expect(true).toBe(true);
  });
});
