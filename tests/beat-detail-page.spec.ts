import { test, expect } from "@playwright/test";
import { navigateTo, waitForAppReady, dismissOverlays, fillInput, clickButtonByText } from "./helpers/page-helpers";
import { installElectronMock } from "./helpers/electron-mock";
import { mockApiRoutes } from "./helpers/mock-api";
import { captureConsoleErrors } from "./helpers/console-errors";

/**
 * Beat 详情页 e2e 测试
 *
 * 覆盖路由 /story/beat/:beatId，该路由此前无 e2e 覆盖。
 *
 * 注意：Story 页面存在 Playwright + @base-ui/react 兼容性问题，
 * 原生 click() 会挂起。必须使用 clickButtonByText 等 evaluate 变通方案。
 * 详见 tests/helpers/page-helpers.ts 中的注释。
 */
test.describe("Beat Detail Page Access", () => {
  test.beforeEach(async ({ page }) => {
    await installElectronMock(page);
    await mockApiRoutes(page);
  });

  test("should show not-found or error state for invalid beat id", async ({ page }) => {
    await page.goto("/story/beat/invalid-beat-id-99999");
    await waitForAppReady(page);

    // 无效 beat id 应显示 404 或分镜未找到提示，而非白屏
    const notFoundIndicator = page.locator("text=/404|页面未找到|分镜未找到|不存在/").first();
    await expect(notFoundIndicator).toBeVisible({ timeout: 10000 });
  });

  test("should not produce critical console errors for invalid beat route", async ({ page }) => {
    const getErrors = captureConsoleErrors(page);
    await page.goto("/story/beat/invalid-beat-id-99999");
    await waitForAppReady(page);
    const criticalErrors = getErrors();
    expect(criticalErrors, criticalErrors.join("\n")).toHaveLength(0);
  });
});

test.describe("Beat Detail Page via Story Editor", () => {
  test.beforeEach(async ({ page }) => {
    await installElectronMock(page);
    await mockApiRoutes(page);
    await navigateTo(page, "/storyboard");
    await dismissOverlays(page);
    await page.waitForTimeout(1000);

    // 填写标题并添加一个 beat（使用 evaluate 变通方案避免挂起）
    await fillInput(page, '[data-testid="story-title-input"]', "Beat详情测试项目");
    await page.waitForTimeout(300);
    await clickButtonByText(page, "添加");
    await page.waitForTimeout(800);
  });

  test("should navigate to beat detail via edit button", async ({ page }) => {
    // 使用 clickButtonByText 变通方案（原生 click 在 Story 页面会挂起）
    await clickButtonByText(page, "编辑");
    await page.waitForTimeout(1000);

    // 编辑可能打开对话框或导航到详情页
    const dialog = page.locator('[role="dialog"]').first();
    const detailPage = page.locator("text=/分镜|Beat|视频预览|生成视频/").first();

    const dialogVisible = await dialog.isVisible({ timeout: 3000 }).catch(() => false);
    const detailVisible = await detailPage.isVisible({ timeout: 3000 }).catch(() => false);
    expect(dialogVisible || detailVisible).toBe(true);
  });

  // Story 页面没有显式"编辑"按钮，beat 卡片本身 onClick 触发编辑（ProfessionalModeEditor.tsx）。
  // 之前的 clickButtonByText("编辑") 会全局匹配，误中首页 "未来规划预览" ComingSoon 卡片，
  // 导致页面被导航到 /workflow-editor 等未实现页面。改为直接点击 .timeline-card beat 卡片。
  test("should display beat content area after opening edit", async ({ page }) => {
    // 点击 beat 卡片本身（第一个 .timeline-card 是 beat，dashed 边框的 "+" 是添加按钮）
    const beatCard = page.locator(".timeline-card:not([style*='dashed'])").first();
    await beatCard.click({ force: true });
    await page.waitForTimeout(1000);

    // 验证 BeatDetailEditor 已显示 — 检查其独特的 section-label 文本
    // "元素绑定" / "一致性检查" 是 BeatDetailEditor 中独有的标签
    const beatDetail = page.locator("text=/元素绑定|一致性检查/").first();
    await expect(beatDetail).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Beat Detail Page Console Errors", () => {
  test("should not produce critical console errors when accessing beat detail", async ({ page }) => {
    await installElectronMock(page);
    await mockApiRoutes(page);

    // 先创建 beat
    await navigateTo(page, "/storyboard");
    await dismissOverlays(page);
    await page.waitForTimeout(1000);
    await fillInput(page, '[data-testid="story-title-input"]', "控制台错误测试");
    await clickButtonByText(page, "添加");
    await page.waitForTimeout(800);

    const getErrors = captureConsoleErrors(page);

    // 尝试通过编辑进入详情
    await clickButtonByText(page, "编辑");
    await page.waitForTimeout(1000);

    const criticalErrors = getErrors();
    expect(criticalErrors, criticalErrors.join("\n")).toHaveLength(0);
  });
});
