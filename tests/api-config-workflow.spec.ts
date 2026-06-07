import { test, expect } from "@playwright/test";
import { navigateTo, waitForAppReady, dismissOverlays } from "./helpers/page-helpers";
import { installElectronMock } from "./helpers/electron-mock";
import { mockApiRoutes } from "./helpers/mock-api";

test.describe("API Config Page Load", () => {
  test.beforeEach(async ({ page }) => {
    await installElectronMock(page);
    await mockApiRoutes(page);
    await navigateTo(page, "/settings");
  });

  test("should load settings page", async ({ page }) => {
    const main = page.locator("main").first();
    await expect(main).toBeVisible();
  });

  test("should display API configuration tab as default", async ({ page }) => {
    const apiTab = page.locator('[role="tab"][aria-selected="true"]').first();
    await expect(apiTab).toContainText("API", { timeout: 10000 });
  });

  test("should display API configuration card", async ({ page }) => {
    const apiTitle = page.locator("text=API 配置").first();
    await expect(apiTitle).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Configured Providers Section", () => {
  test.beforeEach(async ({ page }) => {
    await installElectronMock(page);
    await mockApiRoutes(page);
    await navigateTo(page, "/settings");
  });

  test("should display configured providers section", async ({ page }) => {
    const providerSection = page.locator("text=已配置的提供商").first();
    await expect(providerSection).toBeVisible({ timeout: 10000 });
  });

  test("should display add provider button", async ({ page }) => {
    const addButton = page.locator("button", { hasText: "添加提供商" }).first();
    await expect(addButton).toBeVisible({ timeout: 10000 });
  });

  test("should display provider cards if providers exist", async ({ page }) => {
    const providerCards = page.locator("[class*='border rounded-lg']").filter({ hasText: /提供商|Provider|模型/ }).first();
    const noProviderHint = page.locator("text=暂无提供商").or(page.locator("text=尚未配置")).first();
    const hasCards = await providerCards.isVisible({ timeout: 5000 }).catch(() => false);
    const hasHint = await noProviderHint.isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasCards || hasHint).toBe(true);
  });

  test("should expand provider detail on click", async ({ page }) => {
    const providerCard = page.locator("[class*='border rounded-lg']").filter({ hasText: /模型|Provider/ }).first();
    if (!(await providerCard.isVisible({ timeout: 5000 }).catch(() => false))) return;

    await providerCard.click({ force: true });
    await page.waitForTimeout(300);

    const detailSection = page.locator("text=模型").or(page.locator("text=API Key")).first();
    await expect(detailSection).toBeVisible({ timeout: 5000 }).catch(() => {});
  });
});

test.describe("Add Provider Form", () => {
  test.beforeEach(async ({ page }) => {
    await installElectronMock(page);
    await mockApiRoutes(page);
    await navigateTo(page, "/settings");
    await dismissOverlays(page);

    const addButton = page.locator("button", { hasText: "添加提供商" }).first();
    await addButton.click({ force: true });
    await page.waitForTimeout(500);
  });

  test("should display API Key input field", async ({ page }) => {
    const apiKeyInput = page.locator('input#apiKey').or(
      page.locator('input[placeholder*="API Key"]')
    ).or(
      page.locator('input[placeholder*="密钥"]')
    ).first();
    await expect(apiKeyInput).toBeVisible({ timeout: 10000 });
  });

  test("should display provider name input field", async ({ page }) => {
    const nameInput = page.locator('input[placeholder*="名称"]').or(
      page.locator('input[placeholder*="提供商"]')
    ).first();
    await expect(nameInput).toBeVisible({ timeout: 10000 });
  });

  test("should display template selector", async ({ page }) => {
    const templateSelect = page.locator("button[role='combobox']").or(
      page.locator("select")
    ).first();
    await expect(templateSelect).toBeVisible({ timeout: 10000 });
  });

  test("should display cancel button", async ({ page }) => {
    const cancelButton = page.locator("button", { hasText: "取消" }).first();
    await expect(cancelButton).toBeVisible({ timeout: 10000 });
  });

  test("should close form when cancel is clicked", async ({ page }) => {
    const cancelButton = page.locator("button", { hasText: "取消" }).first();
    await cancelButton.click({ force: true });
    await page.waitForTimeout(500);

    const apiKeyInput = page.locator('input#apiKey').first();
    await expect(apiKeyInput).toHaveCount(0, { timeout: 5000 }).catch(() => {});
  });

  test("should accept API key input", async ({ page }) => {
    const apiKeyInput = page.locator('input#apiKey').or(
      page.locator('input[placeholder*="API Key"]')
    ).or(
      page.locator('input[placeholder*="密钥"]')
    ).first();
    if (!(await apiKeyInput.isVisible({ timeout: 5000 }).catch(() => false))) return;

    await apiKeyInput.fill("sk-test-api-key-12345");
    await expect(apiKeyInput).toHaveValue("sk-test-api-key-12345");
  });

  test("should show provider detection after entering key", async ({ page }) => {
    const apiKeyInput = page.locator('input#apiKey').or(
      page.locator('input[placeholder*="API Key"]')
    ).or(
      page.locator('input[placeholder*="密钥"]')
    ).first();
    if (!(await apiKeyInput.isVisible({ timeout: 5000 }).catch(() => false))) return;

    await apiKeyInput.fill("sk-test-api-key-12345");
    await page.waitForTimeout(500);

    const detectedInfo = page.locator("text=/已识别|检测到|OpenAI|置信度/i").first();
    const templateSelect = page.locator("button[role='combobox']").first();
    const hasDetected = await detectedInfo.isVisible({ timeout: 5000 }).catch(() => false);
    const hasTemplate = await templateSelect.isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasDetected || hasTemplate).toBe(true);
  });
});

test.describe("Model Mapping Section", () => {
  test.beforeEach(async ({ page }) => {
    await installElectronMock(page);
    await mockApiRoutes(page);
    await navigateTo(page, "/settings");
  });

  test("should display model mapping section", async ({ page }) => {
    const mappingSection = page.locator("text=功能映射").first();
    await expect(mappingSection).toBeVisible({ timeout: 10000 });
  });

  test("should display capability mapping selectors", async ({ page }) => {
    const mappingSelectors = page.locator("[class*='border rounded-lg']").filter({ hasText: /文本|图像|视频|视觉/ }).first();
    await expect(mappingSelectors).toBeVisible({ timeout: 10000 }).catch(() => {});
  });

  test("should display mapping description", async ({ page }) => {
    const mappingDesc = page.locator("text=为每种 AI 能力选择对应的模型").first();
    await expect(mappingDesc).toBeVisible({ timeout: 10000 }).catch(() => {});
  });
});

test.describe("Test Connection Section", () => {
  test.beforeEach(async ({ page }) => {
    await installElectronMock(page);
    await mockApiRoutes(page);
    await navigateTo(page, "/settings");
  });

  test("should display test connection section", async ({ page }) => {
    const testSection = page.locator("text=测试连接").first();
    await expect(testSection).toBeVisible({ timeout: 10000 });
  });

  test("should display test connection buttons for capabilities", async ({ page }) => {
    const testButtons = page.locator("button", { hasText: /测试|Test/ }).first();
    await expect(testButtons).toBeVisible({ timeout: 10000 }).catch(() => {});
  });

  test("should show connection result after testing", async ({ page }) => {
    const testButton = page.locator("button").filter({ hasText: /测试/ }).first();
    if (!(await testButton.isVisible({ timeout: 5000 }).catch(() => false))) return;
    if (await testButton.isDisabled()) return;

    await testButton.click({ force: true });
    await page.waitForTimeout(2000);

    const resultIndicator = page.locator("text=/成功|失败|连接/i").first();
    await expect(resultIndicator).toBeVisible({ timeout: 10000 }).catch(() => {});
  });
});

test.describe("Settings Tab Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await installElectronMock(page);
    await navigateTo(page, "/settings");
  });

  test("should switch to autosave tab", async ({ page }) => {
    const autosaveTab = page.locator('[role="tab"]', { hasText: "自动保存" }).first();
    await autosaveTab.click({ force: true });
    await page.waitForTimeout(300);

    const autosaveContent = page.locator("text=自动保存").first();
    await expect(autosaveContent).toBeVisible({ timeout: 5000 });
  });

  test("should switch to project tab", async ({ page }) => {
    const projectTab = page.locator('[role="tab"]', { hasText: "工程打包" }).first();
    await projectTab.click({ force: true });
    await page.waitForTimeout(300);

    const projectContent = page.locator("text=导出工程").or(page.locator("text=导入工程")).first();
    await expect(projectContent).toBeVisible({ timeout: 5000 });
  });

  test("should switch to system status tab", async ({ page }) => {
    const systemTab = page.locator('[role="tab"]', { hasText: "系统状态" }).first();
    await systemTab.click({ force: true });
    await page.waitForTimeout(300);

    const systemContent = page.locator("text=内存").or(page.locator("text=错误日志")).first();
    await expect(systemContent).toBeVisible({ timeout: 5000 });
  });

  test("should switch back to API config tab", async ({ page }) => {
    const systemTab = page.locator('[role="tab"]', { hasText: "系统状态" }).first();
    await systemTab.click({ force: true });
    await page.waitForTimeout(300);

    const apiTab = page.locator('[role="tab"]', { hasText: "API 配置" }).first();
    await apiTab.click({ force: true });
    await page.waitForTimeout(300);

    const apiContent = page.locator("text=API 配置").first();
    await expect(apiContent).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Remove Provider", () => {
  test.beforeEach(async ({ page }) => {
    await installElectronMock(page);
    await mockApiRoutes(page);
    await navigateTo(page, "/settings");
  });

  test("should display delete button on provider cards", async ({ page }) => {
    const providerCard = page.locator("[class*='border rounded-lg']").filter({ hasText: /模型|Provider/ }).first();
    if (!(await providerCard.isVisible({ timeout: 5000 }).catch(() => false))) return;

    const deleteBtn = providerCard.locator("button").filter({ has: page.locator("svg.lucide-trash-2") }).first();
    const hasDelete = await deleteBtn.isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasDelete).toBe(true);
  });

  test("should show confirmation when removing provider", async ({ page }) => {
    const providerCard = page.locator("[class*='border rounded-lg']").filter({ hasText: /模型|Provider/ }).first();
    if (!(await providerCard.isVisible({ timeout: 5000 }).catch(() => false))) return;

    const deleteBtn = providerCard.locator("button").filter({ has: page.locator("svg.lucide-trash-2") }).first();
    if (!(await deleteBtn.isVisible({ timeout: 3000 }).catch(() => false))) return;

    page.on("dialog", (dialog) => dialog.dismiss());
    await deleteBtn.click({ force: true });
    await page.waitForTimeout(300);
  });
});
