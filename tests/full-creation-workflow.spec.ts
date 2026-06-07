import { test, expect, type Page } from "@playwright/test";
import { navigateTo, waitForAppReady, dismissOverlays, hasElectronAPI } from "./helpers/page-helpers";
import { installElectronMock } from "./helpers/electron-mock";
import { mockApiRoutes } from "./helpers/mock-api";

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
  test("should complete the full creation flow: character → scene → story → beat → quick-generate", async ({ page }) => {
    test.skip(!(await hasElectronAPI(page)), "Requires Electron API mock");

    // =====================================================
    // Step 1: Create a character
    // =====================================================
    await setupPage(page, "/characters");

    await expect(page.locator("main").first()).toBeVisible();
    await expect(page.locator('input[placeholder="输入角色名称..."]')).toBeVisible();

    await page.locator('input[placeholder="输入角色名称..."]').fill("主角小明");
    await page.locator('input[placeholder="输入年龄..."]').fill("18");
    await page.locator('input[placeholder*="赛博朋克"]').fill("现代都市");

    await expect(page.locator('input[placeholder="输入角色名称..."]')).toHaveValue("主角小明");

    await switchTab(page, "外貌设定");
    const appearanceInput = page.locator('input[placeholder*="银白色"]').first();
    if (await appearanceInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await appearanceInput.fill("黑色短发");
    }

    await switchTab(page, "基础信息");
    await expect(page.locator('input[placeholder="输入角色名称..."]')).toHaveValue("主角小明");

    const saveCharacterBtn = page.locator("button", { hasText: "保存角色" });
    await saveCharacterBtn.click({ force: true });
    await page.waitForTimeout(800);

    // =====================================================
    // Step 2: Create a scene
    // =====================================================
    await navigateTo(page, "/scenes");

    await expect(page.locator("main").first()).toBeVisible();
    await expect(page.locator('input[placeholder="输入场景名称..."]')).toBeVisible();

    await page.locator('input[placeholder="输入场景名称..."]').fill("城市街道");
    await page.locator('input[placeholder*="赛博朋克街区"]').fill("繁华的都市街道，霓虹灯闪烁");

    await expect(page.locator('input[placeholder="输入场景名称..."]')).toHaveValue("城市街道");

    await switchTab(page, "氛围视觉");
    const atmosphereInput = page.locator('input[placeholder*="黄昏"]').first();
    if (await atmosphereInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await atmosphereInput.fill("夜晚霓虹灯");
    }

    await switchTab(page, "基础设定");
    await expect(page.locator('input[placeholder="输入场景名称..."]')).toHaveValue("城市街道");

    const saveSceneBtn = page.locator("button", { hasText: "保存场景" });
    await saveSceneBtn.click({ force: true });
    await page.waitForTimeout(800);

    // =====================================================
    // Step 3: Create a story with manual beats
    // =====================================================
    await navigateTo(page, "/story");

    await expect(page.locator("main").first()).toBeVisible();

    const titleInput = page.locator('input[placeholder="分镜项目标题..."]');
    await titleInput.fill("完整创作流程测试");
    await expect(titleInput).toHaveValue("完整创作流程测试");

    await dismissOverlays(page);

    const addBeatBtn = page.locator("button", { hasText: "添加" }).first();
    await addBeatBtn.click({ force: true });
    await page.waitForTimeout(800);

    const beatCard = page.locator("[data-beat-card], .beat-card, [class*='beat']").or(
      page.locator("text=/#1|镜头 1|第1/"),
    );
    const hasBeat = await beatCard.first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasEditButton = (await page.locator("button", { hasText: "编辑" }).count()) > 0;
    expect(hasBeat || hasEditButton).toBe(true);

    // =====================================================
    // Step 4: Edit beat - associate character and scene
    // =====================================================
    const editButton = page.locator("button", { hasText: "编辑" }).first();
    if (await editButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await editButton.click({ force: true });
      await page.waitForTimeout(500);

      const beatTitleInput = page.locator('input[placeholder="输入分镜标题..."]');
      if (await beatTitleInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        await beatTitleInput.fill("开场镜头");
        await expect(beatTitleInput).toHaveValue("开场镜头");
      }

      const beatContentTextarea = page
        .locator('textarea[placeholder*="输入分镜内容描述"]')
        .or(page.locator('[role="dialog"]:not([data-nextjs-dialog]) textarea'))
        .or(page.locator("textarea").first());
      if (await beatContentTextarea.first().isVisible({ timeout: 3000 }).catch(() => false)) {
        await beatContentTextarea.first().fill("主角走在繁华的街道上，霓虹灯映照着他的脸");
      }

      const sceneSelectTrigger = page.locator(
        'button[role="combobox"], [role="listbox"], .select-trigger',
      ).first();
      const sceneSelectLabel = page.locator("text=场景选择").or(page.locator("text=选择场景"));
      if (
        (await sceneSelectTrigger.isVisible({ timeout: 3000 }).catch(() => false)) ||
        (await sceneSelectLabel.isVisible({ timeout: 1000 }).catch(() => false))
      ) {
        if (await sceneSelectTrigger.isVisible({ timeout: 1000 }).catch(() => false)) {
          await sceneSelectTrigger.click({ force: true });
          await page.waitForTimeout(500);

          const sceneOption = page.locator('[role="option"]', { hasText: "城市街道" }).first();
          if (await sceneOption.isVisible({ timeout: 3000 }).catch(() => false)) {
            await sceneOption.click({ force: true });
          } else {
            await page.keyboard.press("Escape");
          }
        }
      }

      const characterSection = page.locator("text=角色").or(page.locator("text=关联角色")).first();
      if (await characterSection.isVisible({ timeout: 2000 }).catch(() => false)) {
        const characterChip = page.locator("button", { hasText: "主角小明" }).first();
        if (await characterChip.isVisible({ timeout: 2000 }).catch(() => false)) {
          await characterChip.click({ force: true });
        }
      }

      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    }

    const saveStoryBtn = page.locator("button", { hasText: "保存" }).first();
    await saveStoryBtn.click({ force: true });
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
    const newSceneBtn = page.locator("button", { hasText: /新建场景|添加场景/ }).first();
    const hasSceneSection =
      (await sceneLabel.isVisible({ timeout: 3000 }).catch(() => false)) ||
      (await sceneChip.isVisible({ timeout: 3000 }).catch(() => false)) ||
      (await newSceneBtn.isVisible({ timeout: 3000 }).catch(() => false));
    expect(hasSceneSection).toBe(true);

    await promptTextarea.fill("一个少年走在霓虹灯闪烁的城市街道上");
    await expect(promptTextarea).toHaveValue("一个少年走在霓虹灯闪烁的城市街道上");

    if (await characterSection.isVisible({ timeout: 2000 }).catch(() => false)) {
      await characterSection.click({ force: true });
      await page.waitForTimeout(300);
      const selectedChar = page.locator("button.border-purple-500", { hasText: "主角小明" }).first();
      const charSelected = await selectedChar.isVisible({ timeout: 2000 }).catch(() => false);
      expect(charSelected).toBe(true);
    }

    if (await sceneChip.isVisible({ timeout: 2000 }).catch(() => false)) {
      await sceneChip.click({ force: true });
      await page.waitForTimeout(300);
      const selectedScene = page.locator("button.border-blue-500", { hasText: "城市街道" }).first();
      const sceneSelected = await selectedScene.isVisible({ timeout: 2000 }).catch(() => false);
      expect(sceneSelected).toBe(true);
    }
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

  test("should persist created character and scene across page navigation", async ({ page }) => {
    test.skip(!(await hasElectronAPI(page)), "Requires Electron API mock");

    await setupPage(page, "/characters");

    await page.locator('input[placeholder="输入角色名称..."]').fill("持久化角色");
    await page.locator("button", { hasText: "保存角色" }).click({ force: true });
    await page.waitForTimeout(800);

    await navigateTo(page, "/scenes");

    await page.locator('input[placeholder="输入场景名称..."]').fill("持久化场景");
    await page.locator("button", { hasText: "保存场景" }).click({ force: true });
    await page.waitForTimeout(800);

    await navigateTo(page, "/characters");
    await expect(page.locator("main").first()).toBeVisible();
    await page.waitForTimeout(500);

    const savedCharacter = page.locator("text=持久化角色").first();
    const charVisible = await savedCharacter.isVisible({ timeout: 5000 }).catch(() => false);
    expect(charVisible).toBe(true);

    await navigateTo(page, "/scenes");
    await expect(page.locator("main").first()).toBeVisible();
    await page.waitForTimeout(500);

    const savedScene = page.locator("text=持久化场景").first();
    const sceneVisible = await savedScene.isVisible({ timeout: 5000 }).catch(() => false);
    expect(sceneVisible).toBe(true);
  });

  test("should create multiple beats and verify beat list", async ({ page }) => {
    test.skip(!(await hasElectronAPI(page)), "Requires Electron API mock");

    await setupPage(page, "/story");

    const titleInput = page.locator('input[placeholder="分镜项目标题..."]');
    await titleInput.fill("多分镜测试项目");

    await dismissOverlays(page);

    for (let i = 0; i < 3; i++) {
      const addBtn = page.locator("button", { hasText: "添加" }).first();
      await addBtn.click({ force: true });
      await page.waitForTimeout(600);
    }

    const editButtons = page.locator("button", { hasText: "编辑" });
    const editCount = await editButtons.count();
    expect(editCount).toBeGreaterThanOrEqual(1);

    const beatIndicators = page.locator("text=/#1|镜头 1|第1|#2|镜头 2|第2|#3|镜头 3|第3/");
    const beatCount = await beatIndicators.count();
    expect(beatCount).toBeGreaterThanOrEqual(1);

    const saveBtn = page.locator("button", { hasText: "保存" }).first();
    await saveBtn.click({ force: true });
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
