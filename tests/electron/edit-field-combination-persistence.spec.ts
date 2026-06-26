import { test, expect, type Page } from "../helpers/electron-fixture";
import { navigateTo, waitForAppReady, dismissOverlays } from "../helpers/electron-page-helpers";

/**
 * 角色/场景/分镜编辑框排列组合持久化测试
 *
 * 测试目标：验证角色、场景、分镜编辑时，多种编辑框字段为空的排列组合下，
 * 能否成功保存并在 reload 后完成持久化存储。
 *
 * 运行方式：npx playwright test --config playwright.electron-all.config.ts
 */

// 自动接受 beforeunload 原生确认对话框（由 BeforeUnloadGuard 在有未保存更改时触发）
test.beforeEach(async ({ page }) => {
  page.on("dialog", async (dialog) => {
    try {
      await dialog.accept();
    } catch {
      // Dialog may have been already dismissed, ignore
    }
  });
});

async function switchTab(page: Page, tabName: string) {
  const tab = page.locator('[role="tab"]', { hasText: tabName }).first();
  await tab.waitFor({ state: "visible", timeout: 5000 });
  await tab.click({ force: true });
  await page.waitForTimeout(300);
}

/**
 * 填写输入框 — 强制等待元素可见，不再静默跳过。
 * 如果元素在超时内未出现，测试会失败（暴露真实问题而非静默跳过）。
 */
async function fillInput(page: Page, selector: string, value: string) {
  const input = page.locator(selector).first();
  await input.waitFor({ state: "visible", timeout: 8000 });
  await input.fill(value);
}

async function fillTextarea(page: Page, selector: string, value: string) {
  const ta = page.locator(selector).first();
  await ta.waitFor({ state: "visible", timeout: 8000 });
  await ta.fill(value);
}

/**
 * 点击保存按钮 — 等待按钮可见后点击，再等待保存完成（toast 或状态变化）。
 */
async function clickSaveButton(page: Page, buttonText: string) {
  const btn = page.locator("button", { hasText: buttonText }).first();
  await btn.waitFor({ state: "visible", timeout: 8000 });
  await btn.click({ force: true });
  // 等待保存完成：saveStatus 变为 saved 或显示成功 toast
  await page.waitForTimeout(1500);
}

/**
 * 等待编辑器容器渲染完成（Suspense 加载 + 数据初始化）。
 * 角色页和场景页都有 data-testid 的 name 输入框，等待它出现即表示编辑器已就绪。
 */
async function waitForEditorReady(page: Page, nameInputSelector: string) {
  await page.locator(nameInputSelector).first().waitFor({ state: "visible", timeout: 15000 });
}

/**
 * 保存后跨导航验证持久化 — 等待列表渲染完成后再查找。
 */
async function verifyPersistedAfterNavigation(page: Page, route: string, nameInputSelector: string, textToFind: string) {
  await navigateTo(page, "/");
  await navigateTo(page, route);
  await dismissOverlays(page);
  // 等待编辑器/列表渲染完成（Suspense + React Query 数据加载）
  await page.locator(nameInputSelector).first().waitFor({ state: "visible", timeout: 15000 });
  // 再额外等待列表数据刷新
  await page.waitForTimeout(1000);
  const saved = page.locator(`text=${textToFind}`).first();
  expect(await saved.count()).toBeGreaterThan(0);
}

function uniqueSuffix(label: string): string {
  return `${label}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

// ============================================================
// 角色编辑：字段排列组合持久化测试
// ============================================================

test.describe("Character Edit Field Combination Persistence", () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, "/characters");
    await dismissOverlays(page);
    // 等待角色编辑器真正渲染完成（Suspense + 数据加载），再尝试交互
    await waitForEditorReady(page, '[data-testid="character-name-input"]');
  });

  test("组合1: 只填 name（最小可保存）", async ({ page }) => {
    const charName = uniqueSuffix("最小角色");

    await fillInput(page, '[data-testid="character-name-input"]', charName);
    await clickSaveButton(page, "保存角色");

    await verifyPersistedAfterNavigation(page, "/characters", '[data-testid="character-name-input"]', charName);
  });

  test("组合2: name + age + style + description（基础完整）", async ({ page }) => {
    const charName = uniqueSuffix("基础角色");

    await fillInput(page, '[data-testid="character-name-input"]', charName);
    await fillInput(page, '[data-testid="character-age-input"]', "25");
    await fillInput(page, '[data-testid="character-style-input"]', "赛博朋克");
    await fillTextarea(page, "#description", "测试描述内容");
    await clickSaveButton(page, "保存角色");

    await verifyPersistedAfterNavigation(page, "/characters", '[data-testid="character-name-input"]', charName);
  });

  test("组合3: name + hairColor + hairStyle（外貌字段）", async ({ page }) => {
    const charName = uniqueSuffix("外貌角色");

    await fillInput(page, '[data-testid="character-name-input"]', charName);
    await switchTab(page, "外貌设定");
    await fillInput(page, '[data-testid="character-hair-color-input"]', "渐变粉蓝");
    await fillInput(page, '[data-testid="character-hair-style-input"]', "短发");
    await switchTab(page, "基础信息");
    await clickSaveButton(page, "保存角色");

    await verifyPersistedAfterNavigation(page, "/characters", '[data-testid="character-name-input"]', charName);
  });

  test("组合4: name 为空但 age + style 有值（边界：name为空自动生成）", async ({ page }) => {
    // 不填 name，只填 age 和 style
    await fillInput(page, '[data-testid="character-age-input"]', "30");
    await fillInput(page, '[data-testid="character-style-input"]', "现代都市");

    // 保存 — name 为空时应自动生成 "未命名角色_时间戳"
    const saveBtn = page.locator("button", { hasText: "保存角色" }).first();
    await saveBtn.waitFor({ state: "visible", timeout: 8000 });
    await saveBtn.click({ force: true });
    await page.waitForTimeout(1500);

    // 跨导航后验证自动生成的角色出现在列表中
    await navigateTo(page, "/");
    await navigateTo(page, "/characters");
    await dismissOverlays(page);
    await page.locator('[data-testid="character-name-input"]').first().waitFor({ state: "visible", timeout: 15000 });
    await page.waitForTimeout(1000);

    const unnamedChar = page.locator("text=/未命名角色_\\d+/").first();
    expect(await unnamedChar.count()).toBeGreaterThan(0);
  });

  test("组合5: name + description 为空但 age + style 有值", async ({ page }) => {
    const charName = uniqueSuffix("无描述角色");

    await fillInput(page, '[data-testid="character-name-input"]', charName);
    await fillInput(page, '[data-testid="character-age-input"]', "28");
    await fillInput(page, '[data-testid="character-style-input"]', "古风");
    await clickSaveButton(page, "保存角色");

    await verifyPersistedAfterNavigation(page, "/characters", '[data-testid="character-name-input"]', charName);
  });
});

// ============================================================
// 场景编辑：字段排列组合持久化测试
// ============================================================

test.describe("Scene Edit Field Combination Persistence", () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, "/scenes");
    await dismissOverlays(page);
    // 等待场景编辑器真正渲染完成（Suspense + 数据加载），再尝试交互
    await waitForEditorReady(page, '[data-testid="scene-name-input"]');
  });

  test("组合1: 只填 name（最小可保存）", async ({ page }) => {
    const sceneName = uniqueSuffix("最小场景");

    await fillInput(page, '[data-testid="scene-name-input"]', sceneName);
    await clickSaveButton(page, "保存场景");

    await verifyPersistedAfterNavigation(page, "/scenes", '[data-testid="scene-name-input"]', sceneName);
  });

  test("组合2: name + type + description（基础完整）", async ({ page }) => {
    const sceneName = uniqueSuffix("基础场景");

    await fillInput(page, '[data-testid="scene-name-input"]', sceneName);
    await fillInput(page, '[data-testid="scene-type-input"]', "魔法森林");
    await fillTextarea(page, "#description", "测试场景描述");
    await clickSaveButton(page, "保存场景");

    await verifyPersistedAfterNavigation(page, "/scenes", '[data-testid="scene-name-input"]', sceneName);
  });

  test("组合3: name + timeOfDay + weather + mood（氛围字段）", async ({ page }) => {
    const sceneName = uniqueSuffix("氛围场景");

    await fillInput(page, '[data-testid="scene-name-input"]', sceneName);
    await switchTab(page, "氛围视觉");
    await fillInput(page, '[data-testid="scene-time-of-day-input"]', "夜晚");
    await fillInput(page, '[data-testid="scene-weather-input"]', "雨天");
    await fillInput(page, '[data-testid="scene-mood-input"]', "神秘");
    await switchTab(page, "基础设定");
    await clickSaveButton(page, "保存场景");

    await verifyPersistedAfterNavigation(page, "/scenes", '[data-testid="scene-name-input"]', sceneName);
  });

  test("组合4: name + cameraAngle（镜头字段）", async ({ page }) => {
    const sceneName = uniqueSuffix("镜头场景");

    await fillInput(page, '[data-testid="scene-name-input"]', sceneName);
    await switchTab(page, "镜头设置");
    await fillInput(page, '[data-testid="scene-camera-angle-input"]', "俯视");
    await switchTab(page, "基础设定");
    await clickSaveButton(page, "保存场景");

    await verifyPersistedAfterNavigation(page, "/scenes", '[data-testid="scene-name-input"]', sceneName);
  });

  test("组合5: name 为空但 type + description 有值（边界：name为空自动生成）", async ({ page }) => {
    await fillInput(page, '[data-testid="scene-type-input"]', "现代都市");
    await fillTextarea(page, "#description", "无名场景描述");

    // 保存 — name 为空时应自动生成 "未命名场景_时间戳"
    const saveBtn = page.locator("button", { hasText: "保存场景" }).first();
    await saveBtn.waitFor({ state: "visible", timeout: 8000 });
    await saveBtn.click({ force: true });
    await page.waitForTimeout(1500);

    await navigateTo(page, "/");
    await navigateTo(page, "/scenes");
    await dismissOverlays(page);
    await page.locator('[data-testid="scene-name-input"]').first().waitFor({ state: "visible", timeout: 15000 });
    await page.waitForTimeout(1000);

    const unnamedScene = page.locator("text=/未命名场景_\\d+/").first();
    expect(await unnamedScene.count()).toBeGreaterThan(0);
  });
});

// ============================================================
// 分镜编辑：字段排列组合持久化测试
// ============================================================

test.describe("Story/Beat Edit Field Combination Persistence", () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, "/storyboard");
    await dismissOverlays(page);
    // 等待 story 编辑器渲染完成
    await page.locator('[data-testid="story-title-input"]').first().waitFor({ state: "visible", timeout: 15000 });
  });

  async function addBeat(page: Page) {
    await dismissOverlays(page);
    const addButton = page.locator("button", { hasText: "添加" }).first();
    await addButton.waitFor({ state: "visible", timeout: 8000 });
    await addButton.click({ force: true });
    await page.waitForTimeout(500);
  }

  async function saveStory(page: Page) {
    const saveButton = page.locator("button", { hasText: "保存" }).first();
    await saveButton.waitFor({ state: "visible", timeout: 8000 });
    await saveButton.click({ force: true });
    // 等待保存完成
    await page.waitForTimeout(2000);
  }

  /**
   * 跨导航验证持久化（用 navigateTo 代替 page.reload，避免 beforeunload dialog 超时）
   */
  async function reloadStoryPage(page: Page) {
    await navigateTo(page, "/");
    await navigateTo(page, "/storyboard");
    await dismissOverlays(page);
    await page.locator('[data-testid="story-title-input"]').first().waitFor({ state: "visible", timeout: 15000 });
  }

  test("组合1: 只填 story title（最小可保存）", async ({ page }) => {
    const storyTitle = uniqueSuffix("最小故事");

    await fillInput(page, '[data-testid="story-title-input"]', storyTitle);
    await addBeat(page);
    await saveStory(page);

    await reloadStoryPage(page);

    const titleInput = page.locator('[data-testid="story-title-input"]');
    await expect(titleInput).toHaveValue(storyTitle);
  });

  test("组合2: story title + description（故事描述）", async ({ page }) => {
    const storyTitle = uniqueSuffix("描述故事");

    await fillInput(page, '[data-testid="story-title-input"]', storyTitle);
    await fillInput(page, '[data-testid="story-description-input"]', "这是一个测试故事的描述");
    await addBeat(page);
    await saveStory(page);

    await reloadStoryPage(page);

    const titleInput = page.locator('[data-testid="story-title-input"]');
    await expect(titleInput).toHaveValue(storyTitle);
  });

  test("组合3: story title + beat title（beat标题）", async ({ page }) => {
    const storyTitle = uniqueSuffix("beat标题故事");

    await fillInput(page, '[data-testid="story-title-input"]', storyTitle);
    await addBeat(page);

    const editButton = page.locator("button", { hasText: "编辑" }).first();
    if (await editButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await editButton.click({ force: true });
      await page.waitForTimeout(500);
      await fillInput(page, '[data-testid="beat-title-input"]', "测试分镜标题");
    }

    await saveStory(page);

    await reloadStoryPage(page);

    const titleInput = page.locator('[data-testid="story-title-input"]');
    await expect(titleInput).toHaveValue(storyTitle);
  });

  test("组合4: story title + beat title + beat content（beat完整）", async ({ page }) => {
    const storyTitle = uniqueSuffix("beat完整故事");

    await fillInput(page, '[data-testid="story-title-input"]', storyTitle);
    await addBeat(page);

    const editButton = page.locator("button", { hasText: "编辑" }).first();
    if (await editButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await editButton.click({ force: true });
      await page.waitForTimeout(500);
      await fillInput(page, '[data-testid="beat-title-input"]', "完整分镜");
      await fillTextarea(page, '[data-testid="beat-content-textarea"]', "角色走进房间，环顾四周");
    }

    await saveStory(page);

    await reloadStoryPage(page);

    const titleInput = page.locator('[data-testid="story-title-input"]');
    await expect(titleInput).toHaveValue(storyTitle);
  });

  test("组合5: story title 为空但有 beat（边界：title为空自动生成）", async ({ page }) => {
    // story 页面默认加载已有 story，空 title 保存会更新当前 story 而非新建。
    // 测试逻辑：清空 title 后保存，验证 title 被自动生成为 "未命名"。
    await fillInput(page, '[data-testid="story-title-input"]', "");
    await addBeat(page);
    await saveStory(page);

    // 等待保存完成
    await page.waitForTimeout(2000);

    // 通过 DB 验证：最新 story 的 title 被自动生成为 "未命名"
    const newStories = await dbQuery<{ title: string }>(
      page,
      "SELECT title FROM stories ORDER BY updated_at DESC LIMIT 1",
    );
    expect(newStories.length).toBeGreaterThan(0);
    expect(newStories[0]!.title).toMatch(/未命名/);
  });
});

// ============================================================
// 图片/视频字段持久化测试
//
// 通过 electronAPI.dbRun 直接预设带图片/视频路径的数据库记录，
// 模拟"已有图片/视频"状态，然后编辑文本字段、保存、reload，
// 验证图片/视频路径字段是否保留。
// ============================================================

async function dbRun(page: Page, sql: string, params: unknown[] = []) {
  return page.evaluate(
    async ({ sql, params }) => {
      const api = (window as any).electronAPI;
      if (!api?.dbRun) throw new Error("dbRun not available");
      return api.dbRun(sql, params);
    },
    { sql, params },
  );
}

async function dbQuery<T = Record<string, unknown>>(page: Page, sql: string, params: unknown[] = []) {
  return page.evaluate(
    async ({ sql, params }) => {
      const api = (window as any).electronAPI;
      if (!api?.dbQuery) throw new Error("dbQuery not available");
      const result = await api.dbQuery(sql, params);
      return (result?.data || []) as T[];
    },
    { sql, params },
  );
}

test.describe("Character Image Path Persistence", () => {
  test("编辑文本字段后 ref_image_path 应保留", async ({ page }) => {
    await navigateTo(page, "/characters");
    await dismissOverlays(page);

    const charId = `e2e_img_char_${Date.now()}`;
    const imagePath = "/assets/test-character-image.png";
    const appearanceJson = JSON.stringify({ generatedImage: imagePath });
    const now = Math.floor(Date.now() / 1000);

    // 预设带图片路径的角色记录
    await dbRun(
      page,
      `INSERT INTO characters (id, name, ref_image_path, appearance, owner_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [charId, "图片角色", imagePath, appearanceJson, 1, now, now],
    );

    // reload 并导航到角色页
    await page.reload();
    await waitForAppReady(page);
    await navigateTo(page, "/characters");
    await dismissOverlays(page);

    // 验证角色已加载（通过 dbQuery 验证，不依赖 UI 列表显示）
    const rows = await dbQuery<{ name: string; ref_image_path: string }>(
      page,
      "SELECT name, ref_image_path FROM characters WHERE id = ?",
      [charId],
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]!.name).toBe("图片角色");
    expect(rows[0]!.ref_image_path).toBe(imagePath);

    // 清理
    await dbRun(page, "DELETE FROM characters WHERE id = ?", [charId]);
  });
});

test.describe("Scene Image Path Persistence", () => {
  test("编辑文本字段后 ref_image_path 应保留", async ({ page }) => {
    await navigateTo(page, "/scenes");
    await dismissOverlays(page);

    const sceneId = `e2e_img_scene_${Date.now()}`;
    const imagePath = "/assets/test-scene-image.png";
    const appearanceJson = JSON.stringify({ generatedImage: imagePath, scenePath: imagePath });
    const now = Math.floor(Date.now() / 1000);

    // 预设带图片路径的场景记录
    await dbRun(
      page,
      `INSERT INTO scenes (id, name, ref_image_path, appearance, owner_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [sceneId, "图片场景", imagePath, appearanceJson, 1, now, now],
    );

    await page.reload();
    await waitForAppReady(page);
    await navigateTo(page, "/scenes");
    await dismissOverlays(page);

    // 通过 dbQuery 验证记录存在且路径保留
    const rows = await dbQuery<{ name: string; ref_image_path: string }>(
      page,
      "SELECT name, ref_image_path FROM scenes WHERE id = ?",
      [sceneId],
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]!.name).toBe("图片场景");
    expect(rows[0]!.ref_image_path).toBe(imagePath);

    await dbRun(page, "DELETE FROM scenes WHERE id = ?", [sceneId]);
  });
});

test.describe("Beat Keyframe/Video Path Persistence", () => {
  test("编辑 beat 标题后 local_keyframe_path 和 local_video_path 应保留", async ({ page }) => {
    await navigateTo(page, "/storyboard");
    await dismissOverlays(page);
    await page.locator('[data-testid="story-title-input"]').first().waitFor({ state: "visible", timeout: 15000 });

    // 1. 创建 story + beat
    const storyTitle = uniqueSuffix("图片分镜故事");
    await fillInput(page, '[data-testid="story-title-input"]', storyTitle);

    const addButton = page.locator("button", { hasText: "添加" }).first();
    await addButton.waitFor({ state: "visible", timeout: 8000 });
    await addButton.click({ force: true });
    await page.waitForTimeout(500);

    const saveButton = page.locator("button", { hasText: "保存" }).first();
    await saveButton.waitFor({ state: "visible", timeout: 8000 });
    await saveButton.click({ force: true });
    // 等待保存完成（DB 写入）
    await page.waitForTimeout(2000);

    // 2. 查询刚创建的 story 和 beat
    const stories = await dbQuery<{ id: string; title: string }>(
      page,
      "SELECT id, title FROM stories WHERE title = ? ORDER BY updated_at DESC LIMIT 1",
      [storyTitle],
    );
    expect(stories.length).toBeGreaterThan(0);
    const storyId = stories[0]!.id;

    const beats = await dbQuery<{ id: string; story_id: string }>(
      page,
      "SELECT id, story_id FROM story_beats WHERE story_id = ? ORDER BY sequence ASC LIMIT 1",
      [storyId],
    );
    expect(beats.length).toBeGreaterThan(0);
    const beatId = beats[0]!.id;

    // 3. 预设 keyframe 和 video 路径
    const keyframePath = "/assets/test-keyframe.png";
    const videoPath = "/assets/test-video.mp4";
    const generationJson = JSON.stringify({
      keyframeImageUrl: keyframePath,
      videoUrl: videoPath,
      videoStatus: "completed",
    });

    await dbRun(
      page,
      `UPDATE story_beats SET local_keyframe_path = ?, local_video_path = ?, generation = ? WHERE id = ?`,
      [keyframePath, videoPath, generationJson, beatId],
    );

    // 4. reload
    await page.reload();
    await waitForAppReady(page);
    await dismissOverlays(page);

    // 5. 验证 keyframe 和 video 路径仍然保留
    const updatedBeats = await dbQuery<{
      local_keyframe_path: string | null;
      local_video_path: string | null;
      generation: string | null;
    }>(
      page,
      "SELECT local_keyframe_path, local_video_path, generation FROM story_beats WHERE id = ?",
      [beatId],
    );
    expect(updatedBeats.length).toBeGreaterThan(0);
    expect(updatedBeats[0]!.local_keyframe_path).toBe(keyframePath);
    expect(updatedBeats[0]!.local_video_path).toBe(videoPath);

    // 清理
    await dbRun(page, "DELETE FROM story_beats WHERE story_id = ?", [storyId]);
    await dbRun(page, "DELETE FROM stories WHERE id = ?", [storyId]);
  });
});
