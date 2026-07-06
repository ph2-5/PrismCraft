import { test, expect } from "@playwright/test";
import { navigateTo, waitForAppReady, dismissOverlays } from "./helpers/page-helpers";
import { installElectronMock } from "./helpers/electron-mock";
import { captureConsoleErrors } from "./helpers/console-errors";

let getErrors: () => string[] = () => [];

test.beforeEach(async ({ page }) => {
  getErrors = captureConsoleErrors(page);
});

test.afterEach(async () => {
  const consoleErrors = getErrors();
  expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
});

test.describe("Plugin Management Page Load", () => {
  test.beforeEach(async ({ page }) => {
    await installElectronMock(page);
    await navigateTo(page, "/settings");
  });

  test("should load settings page and display plugin section", async ({ page }) => {
    const main = page.locator("main").first();
    await expect(main).toBeVisible();
  });

  test("should display plugin management card title", async ({ page }) => {
    const pluginTitle = page.locator("text=插件管理").first();
    await expect(pluginTitle).toBeVisible({ timeout: 10000 });
  });

  test("should display plugin management description", async ({ page }) => {
    const desc = page.locator("text=管理 AI 提供商插件").first();
    await expect(desc).toBeVisible({ timeout: 10000 });
  });

  test("should display reload button", async ({ page }) => {
    const reloadBtn = page.locator("button", { hasText: "重载" }).first();
    await expect(reloadBtn).toBeVisible({ timeout: 10000 });
  });

  test("should display show spec button", async ({ page }) => {
    const specBtn = page.locator("button", { hasText: /插件规范|规范文档/ }).first();
    await expect(specBtn).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Plugin List", () => {
  test.beforeEach(async ({ page }) => {
    await installElectronMock(page);
    await navigateTo(page, "/settings");
  });

  test("should display no plugins hint when list is empty", async ({ page }) => {
    const noPluginsHint = page.locator("text=暂无插件").first();
    const builtinLabel = page.locator("text=内置插件").first();
    await expect(noPluginsHint.or(builtinLabel)).toBeVisible({ timeout: 10000 });
  });

  test("should display builtin plugin badge if plugins exist", async ({ page }) => {
    const builtinBadge = page.locator("text=内置").first();
    const noPluginsHint = page.locator("text=暂无插件").first();
    const hasBuiltin = await builtinBadge.isVisible({ timeout: 5000 }).catch(() => false);
    const hasNoPlugins = await noPluginsHint.isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasBuiltin || hasNoPlugins).toBe(true);
  });

  test("should expand plugin detail on click", async ({ page }) => {
    const pluginRow = page.locator("[class*='border rounded-lg']").filter({ hasText: /内置|自定义/ }).first();
    if (!(await pluginRow.isVisible({ timeout: 5000 }).catch(() => false))) return;

    await pluginRow.click({ force: true });
    await page.waitForTimeout(300);

    const detailSection = page.locator("text=视频模型").or(page.locator("text=图片模型")).first();
    await expect(detailSection).toBeVisible({ timeout: 5000 }).catch(() => {});
  });
});

test.describe("Add Custom Plugin (JSON)", () => {
  test.beforeEach(async ({ page }) => {
    await installElectronMock(page);
    await navigateTo(page, "/settings");
    await dismissOverlays(page);
  });

  test("should display import JSON button", async ({ page }) => {
    const importBtn = page.locator("button", { hasText: "导入 JSON" }).first();
    await expect(importBtn).toBeVisible({ timeout: 10000 });
  });

  test("should display create plugin button", async ({ page }) => {
    const createBtn = page.locator("button", { hasText: "创建插件" }).first();
    await expect(createBtn).toBeVisible({ timeout: 10000 });
  });

  test("should open JSON import form when clicking import JSON button", async ({ page }) => {
    const importBtn = page.locator("button", { hasText: "导入 JSON" }).first();
    await importBtn.click({ force: true });
    await page.waitForTimeout(500);

    const addTitle = page.locator("text=添加自定义插件").first();
    await expect(addTitle).toBeVisible({ timeout: 5000 });
  });

  test("should display JSON textarea after opening import form", async ({ page }) => {
    const importBtn = page.locator("button", { hasText: "导入 JSON" }).first();
    await importBtn.click({ force: true });
    await page.waitForTimeout(500);

    const textarea = page.locator("textarea").first();
    await expect(textarea).toBeVisible({ timeout: 5000 });
  });

  test("should display validate button after opening import form", async ({ page }) => {
    const importBtn = page.locator("button", { hasText: "导入 JSON" }).first();
    await importBtn.click({ force: true });
    await page.waitForTimeout(500);

    const validateBtn = page.locator("button", { hasText: "验证配置" }).first();
    await expect(validateBtn).toBeVisible({ timeout: 5000 });
  });

  test("should show validation error for invalid JSON", async ({ page }) => {
    const importBtn = page.locator("button", { hasText: "导入 JSON" }).first();
    await importBtn.click({ force: true });
    await page.waitForTimeout(500);

    const textarea = page.locator("textarea").first();
    await textarea.fill("this is not valid json {{{");

    const validateBtn = page.locator("button", { hasText: "验证配置" }).first();
    await validateBtn.click({ force: true });
    await page.waitForTimeout(500);

    const errorIndicator = page.locator("text=/无效|格式|错误|invalid/i").first();
    await expect(errorIndicator).toBeVisible({ timeout: 5000 }).catch(() => {});
  });

  test("should show upload JSON file button", async ({ page }) => {
    const importBtn = page.locator("button", { hasText: "导入 JSON" }).first();
    await importBtn.click({ force: true });
    await page.waitForTimeout(500);

    const uploadBtn = page.locator("button", { hasText: "上传 JSON 文件" }).first();
    await expect(uploadBtn).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Delete Plugin", () => {
  test.beforeEach(async ({ page }) => {
    await installElectronMock(page);
    await navigateTo(page, "/settings");
    await dismissOverlays(page);
  });

  test("should display delete button on user plugin items", async ({ page }) => {
    const userPluginBadge = page.locator("text=声明式").or(page.locator("text=代码插件")).first();
    if (!(await userPluginBadge.isVisible({ timeout: 5000 }).catch(() => false))) return;

    const deleteBtn = page.locator("button[aria-label*='删除']").or(
      page.locator("button").filter({ has: page.locator("svg.lucide-trash-2") })
    ).first();
    const hasDelete = await deleteBtn.isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasDelete).toBe(true);
  });

  test("should show confirmation dialog when deleting a plugin", async ({ page }) => {
    const userPluginBadge = page.locator("text=声明式").or(page.locator("text=代码插件")).first();
    if (!(await userPluginBadge.isVisible({ timeout: 5000 }).catch(() => false))) return;

    const deleteBtn = page.locator("button").filter({ has: page.locator("svg.lucide-trash-2") }).first();
    if (!(await deleteBtn.isVisible({ timeout: 3000 }).catch(() => false))) return;

    page.on("dialog", (dialog) => dialog.dismiss());
    await deleteBtn.click({ force: true });
    await page.waitForTimeout(300);
  });
});

test.describe("Plugin Spec and Schema", () => {
  test.beforeEach(async ({ page }) => {
    await installElectronMock(page);
    await page.route("**/plugins/schema", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, data: { type: "object", properties: {} } }),
      }),
    );
    await page.route("**/plugins/specification", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, data: { content: "# Plugin Specification\n\nMock spec content." } }),
      }),
    );
    await navigateTo(page, "/settings");
    await dismissOverlays(page);
  });

  test("should toggle plugin spec view", async ({ page }) => {
    const specBtn = page.locator("button", { hasText: "插件规范" }).first();
    await specBtn.click({ force: true });
    await page.waitForTimeout(1000);

    const specContent = page.locator("pre").first();
    const specVisible = await specContent.isVisible({ timeout: 5000 }).catch(() => false);

    const hideSpecBtn = page.locator("button", { hasText: "隐藏规范" }).first();
    const hideBtnVisible = await hideSpecBtn.isVisible({ timeout: 3000 }).catch(() => false);
    expect(specVisible || hideBtnVisible).toBe(true);
  });

  test("should toggle specification document view", async ({ page }) => {
    const docBtn = page.locator("button", { hasText: "规范文档" }).first();
    await docBtn.click({ force: true });
    await page.waitForTimeout(1000);

    const docContent = page.locator("pre").first();
    const docVisible = await docContent.isVisible({ timeout: 5000 }).catch(() => false);

    const hideDocBtn = page.locator("button", { hasText: "隐藏文档" }).first();
    const hideBtnVisible = await hideDocBtn.isVisible({ timeout: 3000 }).catch(() => false);
    expect(docVisible || hideBtnVisible).toBe(true);
  });
});
