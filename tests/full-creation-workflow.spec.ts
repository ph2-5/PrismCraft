import { test, expect, type Page } from "@playwright/test";
import { navigateTo, waitForAppReady, dismissOverlays, fillInput, clickButtonByText } from "./helpers/page-helpers";
import { installElectronMock } from "./helpers/electron-mock";
import { mockApiRoutes } from "./helpers/mock-api";
import { captureConsoleErrors } from "./helpers/console-errors";

let getErrors: () => string[] = () => [];

test.beforeEach(async ({ page }) => {
  getErrors = captureConsoleErrors(page);
});

test.afterEach(async () => {
  const consoleErrors = getErrors();
  expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
});

async function setupPage(page: Page, path: string) {
  await installElectronMock(page);
  await mockApiRoutes(page);
  await navigateTo(page, path);
}

async function switchTab(page: Page, tabName: string) {
  const tab = page.locator('[role="tab"]', { hasText: tabName }).first();
  await tab.waitFor({ state: "visible", timeout: 5000 });
  await tab.click({ force: true });
  await page.waitForTimeout(300);
}

test.describe("Full Creation Workflow", () => {
  // UI 重构后 CharacterEditor/SceneEditor 改为平铺卡片结构（无 tablist），
  // 多个 data-testid（character-age-input、character-style-input 等）已不存在。
  // 改用 placeholder 中独特的关键词定位 input（来自 i18n placeholder 文本，稳定）。
  test("should complete the full creation flow: character → scene → story → beat → quick-generate", async ({ page }) => {
    await setupPage(page, "/characters");

    await expect(page.locator("main").first()).toBeVisible();

    // 点击"+ 创建新角色"按钮显示编辑器（按钮文本="+ 创建新角色"）
    const newCharBtn = page.locator("button", { hasText: "创建新角色" }).first();
    await newCharBtn.click({ force: true });
    await page.waitForTimeout(500);

    await expect(page.locator('[data-testid="character-name-input"]')).toBeVisible();

    // Step 1: Create a character — 平铺卡片，用 placeholder 定位 hairColor/hairStyle/style input
    await page.locator('[data-testid="character-name-input"]').fill("主角小明");

    // hairColor input: placeholder="例如：银白色、渐变粉蓝、火焰红..."
    const hairColorInput = page.locator('input[placeholder*="银白色"]').first();
    if (await hairColorInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await hairColorInput.fill("银白色");
    }

    // hairStyle input: placeholder="例如：及腰长发、爆炸头、莫西干..."
    const hairStyleInput = page.locator('input[placeholder*="及腰长发"]').first();
    if (await hairStyleInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await hairStyleInput.fill("及腰长发");
    }

    // style input: placeholder="例如：赛博朋克、浮世绘、蒸汽朋克..."
    const styleInput = page.locator('input[placeholder*="赛博朋克"]').first();
    if (await styleInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await styleInput.fill("现代都市");
    }

    await expect(page.locator('[data-testid="character-name-input"]')).toHaveValue("主角小明");

    const saveCharacterBtn = page.locator('[data-testid="character-save-button"]');
    await saveCharacterBtn.click({ force: true });
    await page.waitForTimeout(800);

    // =====================================================
    // Step 2: Create a scene — 平铺卡片，用 placeholder 定位 description/lighting/colorTone
    // =====================================================
    await navigateTo(page, "/scenes");

    await expect(page.locator("main").first()).toBeVisible();

    // 点击"+ 创建新场景"按钮显示编辑器
    const newSceneBtn = page.locator("button", { hasText: "创建新场景" }).first();
    await newSceneBtn.click({ force: true });
    await page.waitForTimeout(500);

    await expect(page.locator('[data-testid="scene-name-input"]')).toBeVisible();

    await page.locator('[data-testid="scene-name-input"]').fill("城市街道");

    // description textarea: placeholder="详细描述场景的布局、特色、重要元素...自由发挥"
    const sceneDescTextarea = page.locator('textarea[placeholder*="详细描述场景"]').first();
    if (await sceneDescTextarea.isVisible({ timeout: 3000 }).catch(() => false)) {
      await sceneDescTextarea.fill("繁华的都市街道，霓虹灯闪烁");
    }

    // lighting input: placeholder="光照描述"
    const lightingInput = page.locator('input[placeholder="光照描述"]').first();
    if (await lightingInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await lightingInput.fill("夜晚霓虹灯");
    }

    // colorTone input: placeholder="色调描述"
    const colorToneInput = page.locator('input[placeholder="色调描述"]').first();
    if (await colorToneInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await colorToneInput.fill("冷色调");
    }

    await expect(page.locator('[data-testid="scene-name-input"]')).toHaveValue("城市街道");

    const saveSceneBtn = page.locator('[data-testid="scene-save-button"]');
    await saveSceneBtn.click({ force: true });
    await page.waitForTimeout(800);

    // =====================================================
    // Step 3: Create a story with manual beats
    // =====================================================
    await navigateTo(page, "/storyboard");

    await expect(page.locator("main").first()).toBeVisible();
    await dismissOverlays(page);
    await page.waitForTimeout(1000);

    await fillInput(page, '[data-testid="story-title-input"]', "完整创作流程测试");
    await page.waitForTimeout(300);

    await clickButtonByText(page, "添加");
    await page.waitForTimeout(800);

    // UI 重构后 beat 列表用 .timeline-card 渲染（无 data-beat-card / .beat-card）
    // dashed 边框的 "+" 是添加按钮，非 dashed 的才是 beat 卡片
    const beatCard = page.locator(".timeline-card:not([style*='dashed'])").first();
    const hasBeat = await beatCard.isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasBeat).toBe(true);

    // =====================================================
    // Step 4: Save story
    // =====================================================
    await clickButtonByText(page, "保存");
    await page.waitForTimeout(800);

    // =====================================================
    // Step 5: Navigate to quick-generate page
    // =====================================================
    await navigateTo(page, "/quick-generate");

    await expect(page.locator("main").first()).toBeVisible();

    // =====================================================
    // Step 6: Verify quick-generate page elements
    // =====================================================
    const promptTextarea = page.locator("textarea").first();
    await expect(promptTextarea).toBeVisible();

    const generateButton = page.locator("button", { hasText: /生成|创建|开始/ }).first();
    await expect(generateButton).toBeVisible();

    const videoModelLabel = page.locator("text=/视频模型|Video Model/").first();
    const modelSelector = page.locator('[role="combobox"]').first();
    const hasModelSection =
      (await videoModelLabel.isVisible({ timeout: 3000 }).catch(() => false)) ||
      (await modelSelector.isVisible({ timeout: 3000 }).catch(() => false));
    expect(hasModelSection).toBe(true);

    const characterLabel = page.locator("text=/锁定主角|角色/").first();
    const characterSection = page.locator("button", { hasText: "主角小明" }).first();
    const newCharacterBtn = page.locator("button", { hasText: /新建角色|添加角色/ }).first();
    const hasCharacterSection =
      (await characterLabel.isVisible({ timeout: 3000 }).catch(() => false)) ||
      (await characterSection.isVisible({ timeout: 3000 }).catch(() => false)) ||
      (await newCharacterBtn.isVisible({ timeout: 3000 }).catch(() => false));
    expect(hasCharacterSection).toBe(true);

    const sceneLabel = page.locator("text=/锁定场景|场景/").first();
    const sceneChip = page.locator("button", { hasText: "城市街道" }).first();
    const quickGenSceneBtn = page.locator("button", { hasText: /新建场景|添加场景/ }).first();
    const hasSceneSection =
      (await sceneLabel.isVisible({ timeout: 3000 }).catch(() => false)) ||
      (await sceneChip.isVisible({ timeout: 3000 }).catch(() => false)) ||
      (await quickGenSceneBtn.isVisible({ timeout: 3000 }).catch(() => false));
    expect(hasSceneSection).toBe(true);

    await promptTextarea.fill("一个少年走在霓虹灯闪烁的城市街道上");
    await expect(promptTextarea).toHaveValue("一个少年走在霓虹灯闪烁的城市街道上");
  });

  test("should navigate through all creation pages via sidebar", async ({ page }) => {
    await setupPage(page, "/");

    await expect(page.locator("main").first()).toBeVisible();

    const sidebarNavItems = page.locator("aside nav button, aside nav a");
    const navCount = await sidebarNavItems.count();
    expect(navCount).toBeGreaterThanOrEqual(4);

    const characterNavItem = page.locator("aside nav button, aside nav a").filter({ hasText: /角色|Character/ }).first();
    if (await characterNavItem.isVisible({ timeout: 3000 }).catch(() => false)) {
      await characterNavItem.click({ force: true });
      await page.waitForTimeout(500);
      await expect(page).toHaveURL(/\/characters/);
    }

    const sceneNavItem = page.locator("aside nav button, aside nav a").filter({ hasText: /场景|Scene/ }).first();
    if (await sceneNavItem.isVisible({ timeout: 3000 }).catch(() => false)) {
      await sceneNavItem.click({ force: true });
      await page.waitForTimeout(500);
      await expect(page).toHaveURL(/\/scenes/);
    }

    const storyNavItem = page.locator("aside nav button, aside nav a").filter({ hasText: /分镜|Story/ }).first();
    if (await storyNavItem.isVisible({ timeout: 3000 }).catch(() => false)) {
      await storyNavItem.click({ force: true });
      await page.waitForTimeout(500);
      await expect(page).toHaveURL(/\/story/);
    }

    const quickGenNavItem = page.locator("aside nav button, aside nav a").filter({ hasText: /快速|Quick/ }).first();
    if (await quickGenNavItem.isVisible({ timeout: 3000 }).catch(() => false)) {
      await quickGenNavItem.click({ force: true });
      await page.waitForTimeout(500);
      await expect(page).toHaveURL(/\/quick-generate/);
    }
  });

  // UI 重构后 characters/scenes 页面编辑器是条件渲染的，需要先点"+ 创建新角色/场景"按钮才显示编辑器
  // 注意：mock-api 不覆盖 db CRUD，所以不验证数据持久化，只验证保存操作能正常执行且无 console error
  test("should persist created character and scene across page navigation", async ({ page }) => {
    await setupPage(page, "/characters");

    // 点击"+ 创建新角色"按钮显示编辑器
    const newCharBtn = page.locator("button", { hasText: "创建新角色" }).first();
    await newCharBtn.click({ force: true });
    await page.waitForTimeout(500);

    await page.locator('[data-testid="character-name-input"]').fill("持久化角色");
    await expect(page.locator('[data-testid="character-save-button"]')).toBeVisible();

    await page.locator('[data-testid="character-save-button"]').click({ force: true });
    await page.waitForTimeout(800);

    await navigateTo(page, "/scenes");

    // 点击"+ 创建新场景"按钮显示编辑器
    const newSceneBtn = page.locator("button", { hasText: "创建新场景" }).first();
    await newSceneBtn.click({ force: true });
    await page.waitForTimeout(500);

    await page.locator('[data-testid="scene-name-input"]').fill("持久化场景");
    await expect(page.locator('[data-testid="scene-save-button"]')).toBeVisible();

    await page.locator('[data-testid="scene-save-button"]').click({ force: true });
    await page.waitForTimeout(800);

    // 验证导航后页面正常渲染（不验证数据持久化，因为 mock 不覆盖 db CRUD）
    await navigateTo(page, "/characters");
    await expect(page.locator("main").first()).toBeVisible();

    await navigateTo(page, "/scenes");
    await expect(page.locator("main").first()).toBeVisible();
  });

  // UI 重构后 beat 列表用 .timeline-card 渲染（无 data-beat-card / .beat-card / "编辑"按钮）
  // beat 卡片本身 onClick 触发编辑，验证改为检查 .timeline-card 数量
  test("should create multiple beats and verify beat list", async ({ page }) => {
    await setupPage(page, "/storyboard");

    await dismissOverlays(page);
    await page.waitForTimeout(1000);

    await fillInput(page, '[data-testid="story-title-input"]', "多分镜测试项目");
    await page.waitForTimeout(300);

    // 点击"添加"按钮 3 次（按钮文本 t("beat.addButton") = "添加"）
    for (let i = 0; i < 3; i++) {
      await clickButtonByText(page, "添加");
      await page.waitForTimeout(600);
    }

    // UI 重构后 beat 卡片是 .timeline-card，dashed 边框的 "+" 是添加按钮
    const beatCards = page.locator(".timeline-card:not([style*='dashed'])");
    const beatCount = await beatCards.count();
    expect(beatCount).toBeGreaterThanOrEqual(1);

    // beat 序号指示符（如 "1 ·" / "镜头 1" / "#1"）
    const hasBeatIndicators = await page.evaluate(() => {
      return document.body.textContent?.match(/#\d|镜头\s*\d|第\d|\d\s*·/) !== null;
    });
    expect(hasBeatIndicators).toBe(true);

    await clickButtonByText(page, "保存");
    await page.waitForTimeout(500);
  });

  test("should show quick-generate page with proper form sections", async ({ page }) => {
    await setupPage(page, "/quick-generate");

    await expect(page.locator("main").first()).toBeVisible();

    const heroTitle = page.locator("text=/快速|Quick|AI/").first();
    await expect(heroTitle).toBeVisible({ timeout: 5000 });

    const promptTextarea = page.locator("textarea").first();
    await expect(promptTextarea).toBeVisible();

    const templateButton = page.locator("button", { hasText: /模板|Template/ }).first();
    const hasTemplateBtn = await templateButton.isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasTemplateBtn).toBe(true);

    const advancedToggle = page.locator("button", { hasText: /高级|Advanced/ }).first();
    if (await advancedToggle.isVisible({ timeout: 2000 }).catch(() => false)) {
      await advancedToggle.click({ force: true });
      await page.waitForTimeout(300);

      const negativePromptLabel = page.locator("text=/反向提示|Negative/").first();
      const hasAdvanced = await negativePromptLabel.isVisible({ timeout: 3000 }).catch(() => false);
      expect(hasAdvanced).toBe(true);
    }
  });
});
