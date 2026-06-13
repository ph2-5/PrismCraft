import { test, expect } from "@playwright/test";
import { navigateTo, waitForAppReady, dismissOverlays, fillInput, clickButtonByText } from "./helpers/page-helpers";
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
        return { success: true, data: data?.data };
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

        const queryResult = await api.dbQuery("SELECT title FROM stories WHERE id = ?", [testId]);
        const insertedTitle = queryResult?.data?.[0]?.title;

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

        const queryResult = await api.dbQuery(
          "SELECT title FROM stories WHERE id IN (?, ?) ORDER BY id",
          [testId1, testId2],
        );

        await api.dbRun("DELETE FROM stories WHERE id IN (?, ?)", [testId1, testId2]);

        return {
          success: true,
          count: queryResult?.data?.length,
          titles: queryResult?.data?.map((r: any) => r.title),
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

        const queryResult = await api.dbQuery(
          "SELECT count(*) as cnt FROM stories WHERE id = ?",
          [testId],
        );
        const count = queryResult?.data?.[0]?.cnt || 0;

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
  test("should persist character data across navigation", async ({ page }) => {
    await navigateTo(page, "/characters");
    await dismissOverlays(page);

    await page.locator('input[placeholder="输入角色名称..."]').fill("Persistent Character");
    await page.locator("button", { hasText: "保存角色" }).click({ force: true });
    await page.waitForTimeout(1000);

    await navigateTo(page, "/");
    await page.waitForTimeout(500);
    await navigateTo(page, "/characters");
    await dismissOverlays(page);
    await page.waitForTimeout(1000);

    const persistedItem = page.locator("text=Persistent Character");
    const charVisible = await persistedItem.isVisible({ timeout: 5000 }).catch(() => false);
    expect(charVisible).toBe(true);
  });

  test("should persist scene data across navigation", async ({ page }) => {
    await navigateTo(page, "/scenes");
    await dismissOverlays(page);

    await page.locator('input[placeholder="输入场景名称..."]').fill("Persistent Scene");
    await page.locator("button", { hasText: "保存场景" }).click({ force: true });
    await page.waitForTimeout(1000);

    await navigateTo(page, "/");
    await page.waitForTimeout(500);
    await navigateTo(page, "/scenes");
    await dismissOverlays(page);
    await page.waitForTimeout(1000);

    const persistedItem = page.locator("text=Persistent Scene");
    const sceneVisible = await persistedItem.isVisible({ timeout: 5000 }).catch(() => false);
    expect(sceneVisible).toBe(true);
  });

  test("should persist story data across reload", async ({ page }) => {
    await navigateTo(page, "/story");
    await dismissOverlays(page);
    await page.waitForTimeout(1000);

    await fillInput(page, 'input[placeholder="分镜项目标题..."]', "Persistent Story");
    await page.waitForTimeout(300);

    await clickButtonByText(page, "添加");
    await page.waitForTimeout(800);

    await clickButtonByText(page, "保存");
    await page.waitForTimeout(1000);

    await page.reload();
    await waitForAppReady(page);
    await page.waitForTimeout(1000);

    const titleValue = await page.evaluate(() => {
      const input = document.querySelector('input[placeholder="分镜项目标题..."]') as HTMLInputElement;
      return input?.value ?? "";
    });
    expect(titleValue).toBe("Persistent Story");
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
    await navigateTo(page, "/");
    await dismissOverlays(page);

    const exportButton = page.locator("button", { hasText: "导出数据" });
    await expect(exportButton).toBeVisible();

    // Click export and verify the flow completes without error
    // In browser mock mode, saveFileDialog returns a filePath and writeFile succeeds,
    // so the Electron file-save path is exercised (not the Blob URL fallback).
    await exportButton.click({ force: true });
    await page.waitForTimeout(2000);

    // Verify no error toast appeared
    const errorToast = page.locator("[data-sonner-toast][data-type='error'], .toast-error");
    const hasError = await errorToast.isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasError).toBe(false);
  });
});
