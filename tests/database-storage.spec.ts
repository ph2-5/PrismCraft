import { test, expect } from "@playwright/test";
import { navigateTo, waitForAppReady, dismissOverlays, hasElectronAPI } from "./helpers/page-helpers";
import { installElectronMock } from "./helpers/electron-mock";

test.beforeEach(async ({ page }) => {
  await installElectronMock(page);
});

test.describe("Database Storage", () => {
  test("Electron API should be available", async ({ page }) => {
    await navigateTo(page, "/");

    const hasAPIDirect = await page.evaluate(() => !!(window as any).electronAPI);
    expect(hasAPIDirect).toBe(true);
  });

  test("should query database with SELECT count(*) FROM stories", async ({ page }) => {
    await navigateTo(page, "/");

    const result = await page.evaluate(async () => {
      try {
        const api = (window as any).electronAPI;
        if (!api?.dbQuery) return { success: false, error: "No dbQuery API" };
        const data = await api.dbQuery("SELECT count(*) as cnt FROM stories", []);
        return { success: true, data };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    });

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });

  test("should write, read, and delete a record", async ({ page }) => {
    await navigateTo(page, "/");

    const result = await page.evaluate(async () => {
      try {
        const api = (window as any).electronAPI;
        if (!api?.dbRun || !api?.dbQuery) return { success: false, error: "Missing API" };

        const testId = `test_${Date.now()}`;
        await api.dbRun(
          "INSERT INTO stories (id, title, created_at, updated_at) VALUES (?, ?, strftime('%s','now'), strftime('%s','now'))",
          [testId, "E2E Test Story"],
        );

        const query = await api.dbQuery("SELECT title FROM stories WHERE id = ?", [testId]);
        const insertedTitle = query?.[0]?.title;

        await api.dbRun("DELETE FROM stories WHERE id = ?", [testId]);

        return { success: true, insertedTitle };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    });

    expect(result.success).toBe(true);
    expect(result.insertedTitle).toBe("E2E Test Story");
  });

  test("should execute batch INSERT in a transaction", async ({ page }) => {
    await navigateTo(page, "/");

    const result = await page.evaluate(async () => {
      try {
        const api = (window as any).electronAPI;
        if (!api?.dbTransaction || !api?.dbQuery || !api?.dbRun) return { success: false, error: "Missing API" };

        const testId1 = `tx_test_${Date.now()}_1`;
        const testId2 = `tx_test_${Date.now()}_2`;

        await api.dbTransaction([
          {
            sql: "INSERT INTO stories (id, title, created_at, updated_at) VALUES (?, ?, strftime('%s','now'), strftime('%s','now'))",
            params: [testId1, "Tx Test 1"],
          },
          {
            sql: "INSERT INTO stories (id, title, created_at, updated_at) VALUES (?, ?, strftime('%s','now'), strftime('%s','now'))",
            params: [testId2, "Tx Test 2"],
          },
        ]);

        const query = await api.dbQuery(
          "SELECT title FROM stories WHERE id IN (?, ?) ORDER BY id",
          [testId1, testId2],
        );

        await api.dbRun("DELETE FROM stories WHERE id IN (?, ?)", [testId1, testId2]);

        return {
          success: true,
          count: query?.length,
          titles: query?.map((r: any) => r.title),
        };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    });

    expect(result.success).toBe(true);
    expect(result.count).toBe(2);
    expect(result.titles).toContain("Tx Test 1");
    expect(result.titles).toContain("Tx Test 2");
  });

  test("should rollback transaction on failure", async ({ page }) => {
    await navigateTo(page, "/");

    const result = await page.evaluate(async () => {
      try {
        const api = (window as any).electronAPI;
        if (!api?.dbTransaction || !api?.dbQuery) return { success: false, error: "Missing API" };

        const testId = `rollback_test_${Date.now()}`;

        try {
          await api.dbTransaction([
            {
              sql: "INSERT INTO stories (id, title, created_at, updated_at) VALUES (?, ?, strftime('%s','now'), strftime('%s','now'))",
              params: [testId, "Rollback Test"],
            },
            {
              sql: "INSERT INTO nonexistent_table_xyz (id) VALUES (?)",
              params: ["should_fail"],
            },
          ]);
        } catch {}

        const query = await api.dbQuery(
          "SELECT count(*) as cnt FROM stories WHERE id = ?",
          [testId],
        );
        const count = query?.[0]?.cnt || 0;

        return { success: true, remainingCount: count };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    });

    expect(result.success).toBe(true);
    expect(result.remainingCount).toBe(0);
  });
});

test.describe("Data Persistence", () => {
  test.skip(({ browserName }) => true, "Requires real Electron app - run with test:e2e:electron");

  test("should persist character data across navigation", async ({ page }) => {
    await navigateTo(page, "/characters");
    await dismissOverlays(page);

    const createButton = page.locator("button", { hasText: "创建新角色" });
    await createButton.click();
    await page.waitForTimeout(500);

    await page.locator('input[placeholder="输入角色名称..."]').fill("Persistent Character");
    await page.locator("button", { hasText: "保存角色" }).click();
    await waitForAppReady(page);

    await navigateTo(page, "/");
    await navigateTo(page, "/characters");
    await dismissOverlays(page);

    const persistedItem = page.locator("text=Persistent Character");
    expect(await persistedItem.count()).toBeGreaterThan(0);
  });

  test("should persist scene data across navigation", async ({ page }) => {
    await navigateTo(page, "/scenes");
    await dismissOverlays(page);

    const createButton = page.locator("button", { hasText: "创建新场景" });
    await createButton.click();
    await page.waitForTimeout(500);

    await page.locator('input[placeholder="输入场景名称..."]').fill("Persistent Scene");
    await page.locator("button", { hasText: "保存场景" }).click();
    await waitForAppReady(page);

    await navigateTo(page, "/");
    await navigateTo(page, "/scenes");
    await dismissOverlays(page);

    const persistedItem = page.locator("text=Persistent Scene");
    expect(await persistedItem.count()).toBeGreaterThan(0);
  });

  test("should persist story data across reload", async ({ page }) => {
    await navigateTo(page, "/story");
    await dismissOverlays(page);

    const titleInput = page.locator('input[placeholder="分镜项目标题..."]');
    await titleInput.fill("Persistent Story");

    const addButton = page.locator("button", { hasText: "添加" }).first();
    await addButton.click();
    await page.waitForTimeout(500);

    const saveButton = page.locator("button", { hasText: "保存" }).first();
    await saveButton.click();
    await waitForAppReady(page);

    await page.reload();
    await waitForAppReady(page);

    const titleInputAfter = page.locator('input[placeholder="分镜项目标题..."]');
    await expect(titleInputAfter).toHaveValue("Persistent Story");
  });
});

test.describe("Data Export", () => {
  test("should show export data button", async ({ page }) => {
    await navigateTo(page, "/");
    await dismissOverlays(page);

    const exportButton = page.locator("button", { hasText: "导出数据" });
    await expect(exportButton).toBeVisible();
  });

  test("should trigger download on export data click", async ({ page }) => {
    test.skip(true, "Requires real Electron app - run with test:e2e:electron");
    await navigateTo(page, "/");
    await dismissOverlays(page);

    const downloadPromise = page.waitForEvent("download", { timeout: 5000 }).catch(() => null);

    const exportButton = page.locator("button", { hasText: "导出数据" });
    await exportButton.click();

    const download = await downloadPromise;
    if (download) {
      expect(download.suggestedFilename()).toBeTruthy();
    }
  });
});
