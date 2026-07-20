import { test, expect } from "@playwright/test";
import { navigateTo, waitForAppReady } from "./helpers/page-helpers";
import { installElectronMock } from "./helpers/electron-mock";
import { mockApiRoutes } from "./helpers/mock-api";
import { captureConsoleErrors } from "./helpers/console-errors";

const M = { withElectronMock: true };

let getErrors: () => string[] = () => [];

test.beforeEach(async ({ page }) => {
  getErrors = captureConsoleErrors(page);
});

test.afterEach(async () => {
  const consoleErrors = getErrors();
  expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
});

test.describe("Composer 页面 (/composer)", () => {
  test("应成功加载并显示页面标题", async ({ page }) => {
    await installElectronMock(page);
    await mockApiRoutes(page);
    await navigateTo(page, "/composer", M);

    // VideoComposePanel 顶部应显示 "视频片段合成" 标题
    await expect(page.locator("text=视频片段合成").first()).toBeVisible({ timeout: 10000 });
  });

  test("应显示可用片段区域", async ({ page }) => {
    await installElectronMock(page);
    await mockApiRoutes(page);
    await navigateTo(page, "/composer", M);

    // 左栏可用片段区域应存在
    await expect(page.locator("text=可用片段").first()).toBeVisible({ timeout: 10000 });
  });

  test("应显示合成列表区域", async ({ page }) => {
    await installElectronMock(page);
    await mockApiRoutes(page);
    await navigateTo(page, "/composer", M);

    // 中栏合成列表区域应存在
    await expect(page.locator("text=合成列表").first()).toBeVisible({ timeout: 10000 });
  });

  test("应显示合成结果区域", async ({ page }) => {
    await installElectronMock(page);
    await mockApiRoutes(page);
    await navigateTo(page, "/composer", M);

    // 右栏合成结果区域应存在
    await expect(page.locator("text=合成结果").first()).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Compositor 页面 (/compositor)", () => {
  test("应成功加载（不显示桌面端限制提示）", async ({ page }) => {
    await installElectronMock(page);
    await mockApiRoutes(page);
    await navigateTo(page, "/compositor", M);

    // CompositorPanel 在 isElectron() 为 false 时显示此提示；
    // installElectronMock 已注入 window.electronAPI，因此该提示不应出现
    await expect(page.locator("text=编译器仅在桌面端可用")).toHaveCount(0);
    // 画布空状态提示应可见，证明 CompositorPanel 已正常渲染
    await expect(page.locator("text=从左侧拖入或点击素材到画布").first()).toBeVisible({ timeout: 10000 });
  });

  test("应显示三个素材标签页（角色/场景/道具）", async ({ page }) => {
    await installElectronMock(page);
    await mockApiRoutes(page);
    await navigateTo(page, "/compositor", M);

    // 三个 tab 标签应可见
    await expect(page.locator("text=角色").first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=场景").first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=道具").first()).toBeVisible({ timeout: 10000 });
  });

  test("应显示 P图工具区域", async ({ page }) => {
    await installElectronMock(page);
    await mockApiRoutes(page);
    await navigateTo(page, "/compositor", M);

    // 工具栏标题应可见
    await expect(page.locator("text=P图工具").first()).toBeVisible({ timeout: 10000 });
  });
});
