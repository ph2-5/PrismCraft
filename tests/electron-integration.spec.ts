import { test, expect, _electron as electron } from "@playwright/test";

test.describe("Electron Integration Tests", () => {
  let app: electron.ElectronApplication;
  let page: electron.Page;

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

  test("should query database", async () => {
    const result = await page.evaluate(async () => {
      return await (window as any).electronAPI.dbQuery("SELECT count(*) as cnt FROM stories", []);
    });
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });

  test("should run database operations", async () => {
    const testId = "test-" + Date.now();
    const insertResult = await page.evaluate(async (id) => {
      return await (window as any).electronAPI.dbRun(
        "INSERT INTO stories (id, title) VALUES (?, ?)",
        [id, "Test Story"]
      );
    }, testId);
    expect(insertResult.success).toBe(true);

    const deleteResult = await page.evaluate(async (id) => {
      return await (window as any).electronAPI.dbRun("DELETE FROM stories WHERE id = ?", [id]);
    }, testId);
    expect(deleteResult.success).toBe(true);
  });

  test("should execute transactions", async () => {
    const result = await page.evaluate(async () => {
      return await (window as any).electronAPI.dbTransaction([
        { sql: "SELECT count(*) as cnt FROM stories", params: [] },
      ]);
    });
    expect(result.success).toBe(true);
  });

  test("should get platform info", async () => {
    const platform = await page.evaluate(() => (window as any).electronAPI.platform);
    expect(platform).toBe("win32");
  });

  test("should get config", async () => {
    const value = await page.evaluate(() => (window as any).electronAPI.getConfig("test-key"));
    expect(value).toBeNull();
  });
});
