import { test, expect, _electron as electron } from "@playwright/test";
import { captureConsoleErrors } from "./helpers/console-errors";

const MAIN_PAGES = [
  { path: "/", name: "Home" },
  { path: "/story", name: "Story" },
  { path: "/characters", name: "Characters" },
  { path: "/scenes", name: "Scenes" },
  { path: "/asset-library", name: "Asset Library" },
  { path: "/video-tasks", name: "Video Tasks" },
  { path: "/quick-generate", name: "Quick Generate" },
  { path: "/settings", name: "Settings" },
];

test.describe("Electron Page Loading", () => {
  let app: electron.ElectronApplication;
  let page: electron.Page;
  let getErrors: () => string[] = () => [];

  test.beforeAll(async () => {
    app = await electron.launch({
      args: ["./electron/dist/main.js"],
      env: {
        ...process.env,
        NODE_ENV: "test",
      },
    });
    page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");

    getErrors = captureConsoleErrors(page);
  });

  test.afterAll(async () => {
    await app.close();
  });

  test("should launch Electron app", async () => {
    const windowCount = app.windows().length;
    expect(windowCount).toBeGreaterThanOrEqual(1);
  });

  test("should have electronAPI available", async () => {
    const hasAPI = await page.evaluate(() => !!(window as any).electronAPI);
    expect(hasAPI).toBe(true);
  });

  for (const { path, name } of MAIN_PAGES) {
    test(`should load ${name} page without critical errors`, async () => {
      const errorsBefore = getErrors().length;
      await page.goto(`http://localhost:3000${path}`);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1000);

      const main = page.locator("main").first();
      await expect(main).toBeVisible({ timeout: 10000 });

      const newErrors = getErrors().slice(errorsBefore);

      expect(
        newErrors.length,
        `${name} page has critical console errors: ${newErrors.join("\n")}`,
      ).toBe(0);
    });
  }

  test("should have no critical errors across all pages", async () => {
    const criticalErrors = getErrors();

    if (criticalErrors.length > 0) {
      console.log("Critical console errors found:");
      for (const err of criticalErrors) {
        console.log(`  - ${err.substring(0, 200)}`);
      }
    }

    expect(criticalErrors.length, `Critical errors: ${criticalErrors.join("\n")}`).toBe(0);
  });
});
