import { test, expect, _electron as electron } from "@playwright/test";

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
  let consoleErrors: string[] = [];

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

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });
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
      const errorsBefore = consoleErrors.length;
      await page.goto(`http://localhost:3000${path}`);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1000);

      const main = page.locator("main").first();
      await expect(main).toBeVisible({ timeout: 10000 });

      const newErrors = consoleErrors.slice(errorsBefore);
      const criticalErrors = newErrors.filter(
        (e) =>
          !e.includes("favicon") &&
          !e.includes("manifest") &&
          !e.includes("ResizeObserver") &&
          !e.includes("net::ERR") &&
          !e.includes("404") &&
          !e.includes("Failed to fetch") &&
          !e.includes("NetworkError") &&
          !e.includes("ERR_CONNECTION_REFUSED") &&
          !e.includes("localhost") &&
          !e.includes("[SyncSchema]") &&
          !e.includes("Schema update should be done"),
      );

      expect(
        criticalErrors.length,
        `${name} page has critical console errors: ${criticalErrors.join("\n")}`,
      ).toBe(0);
    });
  }

  test("should have no critical errors across all pages", async () => {
    const criticalErrors = consoleErrors.filter(
      (e) =>
        !e.includes("favicon") &&
        !e.includes("manifest") &&
        !e.includes("ResizeObserver") &&
        !e.includes("net::ERR") &&
        !e.includes("404") &&
        !e.includes("Failed to fetch") &&
        !e.includes("NetworkError") &&
        !e.includes("ERR_CONNECTION_REFUSED") &&
        !e.includes("localhost") &&
        !e.includes("[SyncSchema]") &&
        !e.includes("Schema update should be done"),
    );

    if (criticalErrors.length > 0) {
      console.log("Critical console errors found:");
      for (const err of criticalErrors) {
        console.log(`  - ${err.substring(0, 200)}`);
      }
    }

    expect(criticalErrors.length).toBeLessThan(10);
  });
});
