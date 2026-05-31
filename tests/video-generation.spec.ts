import { test, expect } from "@playwright/test";
import { navigateTo, waitForAppReady } from "./helpers/page-helpers";
import { mockApiRoutes } from "./helpers/mock-api";

test.describe("Quick Generate Page", () => {
  test.beforeEach(async ({ page }) => {
    await mockApiRoutes(page);
  });

  test("should display prompt input", async ({ page }) => {
    await navigateTo(page, "/quick-generate");
    const input = page.locator("textarea, input[type='text'], [contenteditable]").first();
    await expect(input).toBeVisible();
  });

  test("should display generate button", async ({ page }) => {
    await navigateTo(page, "/quick-generate");
    const generateButton = page.locator("button", { hasText: /生成|创建|开始/ }).first();
    await expect(generateButton).toBeVisible();
  });
});

test.describe("Video Tasks Page", () => {
  test("should display task list area or empty state", async ({ page }) => {
    await navigateTo(page, "/video-tasks");
    const taskList = page.locator("[data-task-list], .task-list, .video-task").first();
    const emptyState = page.locator("text=/暂无|还没有|空|去创建/").first();
    await expect(taskList.or(emptyState).first()).toBeVisible();
  });
});

test.describe("Settings API Configuration", () => {
  test("should display API configuration on settings page", async ({ page }) => {
    await navigateTo(page, "/settings");
    const apiConfig = page.locator("text=/API|配置|设置|provider/").first();
    await expect(apiConfig).toBeVisible();
  });
});

test.describe("Image Upload", () => {
  test("should display upload button on characters page", async ({ page }) => {
    await navigateTo(page, "/characters");
    const uploadButton = page.locator("button", { hasText: /上传|选择图片|添加图片/ }).first();
    const fileInput = page.locator("input[type='file']").first();
    await expect(uploadButton.or(fileInput).first()).toBeVisible();
  });

  test("should display upload button on scenes page", async ({ page }) => {
    await navigateTo(page, "/scenes");
    const uploadButton = page.locator("button", { hasText: /上传|选择图片|添加图片/ }).first();
    const fileInput = page.locator("input[type='file']").first();
    await expect(uploadButton.or(fileInput).first()).toBeVisible();
  });
});

test.describe("Asset Library", () => {
  test("should load asset library page", async ({ page }) => {
    await navigateTo(page, "/asset-library");
    const main = page.locator("main").first();
    await expect(main).toBeVisible();
  });
});

test.describe("Page Load Performance", () => {
  const pages = ["/", "/story", "/characters", "/scenes", "/settings", "/video-tasks"];

  for (const path of pages) {
    test(`should load ${path} within 10 seconds`, async ({ page }) => {
      const startTime = Date.now();
      await page.goto(path);
      await waitForAppReady(page);
      const loadTime = Date.now() - startTime;
      expect(loadTime).toBeLessThan(10000);
    });
  }
});
