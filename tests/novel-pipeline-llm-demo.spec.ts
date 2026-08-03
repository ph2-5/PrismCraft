/**
 * Novel Pipeline LLM 实操测试
 *
 * 用途：实操故事创作模式，对 LLM 相关功能（分段、实体提取、分镜拆解）进行端到端测试
 * 不测试视频生成，只针对 LLM 相关功能。
 *
 * 运行方式：
 *   npx playwright test tests/novel-pipeline-llm-demo.spec.ts --config playwright.novel-demo.config.ts
 *
 * 输出：tests/screenshots/ 目录下的截图
 */

import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";

const SCREENSHOT_DIR = path.resolve(__dirname, "screenshots");
const TEST_STORY_PATH = path.resolve(__dirname, "fixtures", "test-story.txt");
const ELECTRON_MAIN = path.resolve(__dirname, "..", "electron", "dist", "main.js");

const LLM_TIMEOUT = 240_000; // 单次 LLM 调用最长 4 分钟（推理模型可能较慢）
const NAV_TIMEOUT = 30_000;

function log(stage: string, message: string) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] [${stage}] ${message}`);
}

async function screenshot(page: Page, name: string) {
  const filePath = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: false });
  log("SHOT", `已保存截图: ${filePath}`);
}

async function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** 调试辅助：打印页面上所有可见按钮文字 */
async function dumpVisibleButtons(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    return btns
      .filter((b) => b.offsetParent !== null)
      .map((b) => b.textContent?.trim() || "")
      .filter((t) => t.length > 0)
      .slice(0, 30);
  });
}

test.describe("Novel Pipeline LLM 实操", () => {
  test.setTimeout(25 * 60 * 1000); // 整体 25 分钟超时

  let app: ElectronApplication;
  let page: Page;

  test.beforeAll(async () => {
            log("INIT", "准备目录与测试数据...");
            fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
            if (!fs.existsSync(TEST_STORY_PATH)) {
              throw new Error(`测试故事文件不存在: ${TEST_STORY_PATH}`);
            }
            if (!fs.existsSync(ELECTRON_MAIN)) {
              throw new Error(`Electron 主进程未构建: ${ELECTRON_MAIN}`);
            }
            const storyText = fs.readFileSync(TEST_STORY_PATH, "utf-8");
            log("INIT", `测试故事长度: ${storyText.length} 字符`);

            log("INIT", "启动 Electron 应用...");
            app = await electron.launch({
              args: [ELECTRON_MAIN],
              env: {
                ...process.env,
                NODE_ENV: "test",
              },
              timeout: 60_000,
              logger: {
                error: (msg: string) => log("ELECTRON_ERROR", msg.slice(0, 800)),
                warn: (msg: string) => log("ELECTRON_WARN", msg.slice(0, 500)),
                info: (msg: string) => log("ELECTRON_INFO", msg.slice(0, 500)),
                debug: () => {},
              },
              stdout: (msg: string) => {
                const trimmed = msg.trim();
                if (trimmed) log("STDOUT", trimmed.slice(0, 500));
              },
              stderr: (msg: string) => {
                const trimmed = msg.trim();
                if (trimmed) log("STDERR", trimmed.slice(0, 500));
              },
            });

    page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded", { timeout: NAV_TIMEOUT });
    await wait(3000);
    log("INIT", "应用已启动，第一个窗口已加载");

    // 捕获渲染进程 console 消息（便于排查 LLM 调用错误）
    page.on("console", (msg) => {
      const type = msg.type();
      const text = msg.text();
      if (type === "error" || type === "warning" || type === "info") {
        log("CONSOLE", `[${type}] ${text.slice(0, 500)}`);
      }
    });
    // 捕获 page error
    page.on("pageerror", (err) => {
      log("PAGEERROR", `${err.message.slice(0, 500)}`);
    });
    // 捕获网络响应（重点观察 HTTP 400/403 的 body）
    page.on("response", async (response) => {
      const status = response.status();
      if (status >= 400) {
        const url = response.url();
        let bodyText = "";
        try {
          const body = await response.text();
          bodyText = body.slice(0, 500);
        } catch (e) {
          bodyText = `(body read failed: ${e instanceof Error ? e.message : String(e)})`;
        }
        log("HTTP_ERR", `${status} ${url} | body: ${bodyText}`);
      }
    });
  });

  test.afterAll(async () => {
    if (app) {
      log("CLEANUP", "关闭 Electron 应用...");
      await app.close().catch(() => {});
    }
  });

  test("完整 LLM 流程：导入 → 分段 → 实体提取 → 分镜拆解", async () => {
    // ---------- Step 1: 进入故事创作页面（API Key 已在 config.json 中持久化） ----------
    log("STEP1", "导航到故事创作页面 /story...");
    await page.goto("http://localhost:3000/story", { timeout: NAV_TIMEOUT, waitUntil: "domcontentloaded" });
    await wait(3000);
    await screenshot(page, "01-story-page-entry");

    // 关闭新手引导 Modal（全局 Welcome Modal "跳过"/"完成" + Novel Onboarding "跳过引导"/"开始使用"）
    // 最多尝试 5 次循环 dismiss，确保多层 Modal 都被关闭
    for (let attempt = 0; attempt < 5; attempt++) {
      const modalVisible = await page.locator('.modal-overlay').first().isVisible({ timeout: 500 }).catch(() => false);
      if (!modalVisible) {
        log("STEP1", `第 ${attempt + 1} 次检查：无 Modal 可见，退出循环`);
        break;
      }
      log("STEP1", `第 ${attempt + 1} 次检测到 Modal，尝试关闭...`);

      // 优先点击"跳过引导"/"跳过"按钮
      const skipBtn = page.locator('.modal-overlay button:has-text("跳过引导"), .modal-overlay button:has-text("跳过"), .modal-overlay button:has-text("Skip")').first();
      if (await skipBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        log("STEP1", "点击跳过按钮...");
        await skipBtn.click({ timeout: 3000 }).catch(() => {});
        await wait(800);
        continue;
      }
      // 其次点击"开始使用"/"完成"按钮
      const finishBtn = page.locator('.modal-overlay button:has-text("开始使用"), .modal-overlay button:has-text("完成"), .modal-overlay button:has-text("Finish")').first();
      if (await finishBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        log("STEP1", "点击完成/开始使用按钮...");
        await finishBtn.click({ timeout: 3000 }).catch(() => {});
        await wait(800);
        continue;
      }
      // 再点击"下一步"按钮（可能需要多步才能完成）
      const nextStepBtn = page.locator('.modal-overlay button:has-text("下一步"), .modal-overlay button:has-text("Next")').first();
      if (await nextStepBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        log("STEP1", "点击下一步按钮...");
        await nextStepBtn.click({ timeout: 3000 }).catch(() => {});
        await wait(800);
        continue;
      }
      // 最后兜底：点击 X 关闭按钮（aria-label 含"跳过"/"关闭"/"Close"）
      const closeBtn = page.locator('.modal-overlay button[aria-label]').first();
      if (await closeBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        log("STEP1", "点击 Modal X 关闭按钮...");
        await closeBtn.click({ timeout: 3000 }).catch(() => {});
        await wait(800);
        continue;
      }
      // 实在不行，按 Escape 键
      log("STEP1", "无可用按钮，按 Escape 键...");
      await page.keyboard.press("Escape").catch(() => {});
      await wait(800);
    }
    await wait(1000);
    await screenshot(page, "01b-onboarding-dismissed");

    // 处理模式选择器（如果存在）
    const modeStandardBtn = page.locator('button:has-text("标准"), button:has-text("Standard")').first();
    if (await modeStandardBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      log("STEP1", "检测到模式选择器，选择标准模式...");
      await modeStandardBtn.click({ timeout: 5000 });
      await wait(2000);
      await screenshot(page, "02-mode-selected");
    } else {
      log("STEP1", "未检测到模式选择器，继续...");
    }

    // ---------- Step 1.5: 验证 API Key 配置状态 ----------
    log("STEP1.5", "验证 API Key 配置状态...");
    try {
      const configStatus = await page.evaluate(async () => {
        try {
          // 调用 checkConfigStatus 检查配置
          const { checkConfigStatus } = await import("@/shared/api-config");
          const status = await checkConfigStatus();
          return {
            success: true,
            allConfigured: status.allConfigured,
            configuredCount: status.configuredCount,
            totalCount: status.totalCount,
            missing: status.missing,
            capabilities: {
              text: status.capabilities.text,
              image: status.capabilities.image,
              vision: status.capabilities.vision,
              video: status.capabilities.video,
            },
          };
        } catch (e) {
          return { success: false, error: e instanceof Error ? e.message : String(e) };
        }
      }).catch((e) => ({ success: false, error: `evaluate failed: ${e.message}` }));

      log("STEP1.5", `配置状态: ${JSON.stringify(configStatus).slice(0, 800)}`);

      // 直接调用 HTTP API 检查 config 文件内容
      const httpConfig = await page.evaluate(async () => {
        try {
          const resp = await fetch("http://localhost:30100/api/config/get", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key: "ai_animation_studio_api_config" }),
          });
          if (!resp.ok) return { success: false, error: `HTTP ${resp.status}` };
          const data = await resp.json();
          return {
            success: true,
            hasData: !!data?.data?.value,
            dataKeys: data?.data?.value ? Object.keys(data.data.value) : [],
            mapping: data?.data?.value?.mapping,
            providersCount: data?.data?.value?.providers?.length ?? 0,
            firstProviderId: data?.data?.value?.providers?.[0]?.id,
            firstProviderApiKey: data?.data?.value?.providers?.[0]?.apiKey?.slice(0, 30) + "...",
          };
        } catch (e) {
          return { success: false, error: e instanceof Error ? e.message : String(e) };
        }
      }).catch((e) => ({ success: false, error: `evaluate failed: ${e.message}` }));

      log("STEP1.5", `HTTP 配置查询: ${JSON.stringify(httpConfig).slice(0, 800)}`);
    } catch (e) {
      log("STEP1.5", `配置状态检查失败: ${e instanceof Error ? e.message : String(e)}`);
    }
    await screenshot(page, "01c-config-status-check");

    // ---------- Step 2: 导入故事文本 ----------
    log("STEP2", "导入测试故事文本...");
    const textarea = page.locator("textarea").first();
    await textarea.waitFor({ state: "visible", timeout: 10_000 });
    await textarea.fill("", { timeout: 5000 });
    await textarea.fill(fs.readFileSync(TEST_STORY_PATH, "utf-8"), { timeout: 10_000 });
    await wait(1000);
    await screenshot(page, "03-story-text-pasted");

    // 点击"开始分段"按钮
    const startSegmentBtn = page.locator('button:has-text("开始分段")').first();
    await startSegmentBtn.waitFor({ state: "visible", timeout: 5000 });
    await startSegmentBtn.click({ timeout: 5000 });
    log("STEP2", "已触发 AI 分段，等待 LLM 响应...");

    // 等待 AI 分段完成（占位分段立即出现，真实分段需要等 LLM）
    // 等待 "处理中..." 提示消失（isProcessing=false）
    let processingGone = false;
    const processingStart = Date.now();
    while (Date.now() - processingStart < LLM_TIMEOUT) {
      const processingVisible = await page.locator('text=/处理中|Processing/').first().isVisible({ timeout: 500 }).catch(() => false);
      if (!processingVisible) {
        processingGone = true;
        break;
      }
      await wait(3000);
      log("STEP2", `等待 LLM 分段中... (${Math.round((Date.now() - processingStart) / 1000)}s)`);
    }
    if (!processingGone) {
      log("STEP2", "LLM 分段超时，但占位分段已存在，继续...");
    }
    await wait(2000);
    await screenshot(page, "04-segmentation-result");
    log("STEP2", "分段完成");

    // ---------- Step 3: 进入角色提取阶段 ----------
    log("STEP3", "点击下一步进入角色提取...");
    const nextBtn1 = page.locator('button:has-text("下一步")').first();
    await nextBtn1.waitFor({ state: "visible", timeout: 5000 });
    await nextBtn1.click({ timeout: 5000 }).catch(() => {});
    await wait(2000);
    await screenshot(page, "05-character-extraction-trigger");

    // 等待角色提取完成
    let characterFound = false;
    const charStart = Date.now();
    while (Date.now() - charStart < LLM_TIMEOUT) {
      const charVisible = await page.locator('text=/林晚|沈墨|赵锐|周瑶/').first().isVisible({ timeout: 500 }).catch(() => false);
      const processingVisible = await page.locator('text=/处理中|Processing/').first().isVisible({ timeout: 500 }).catch(() => false);
      if (charVisible) {
        characterFound = true;
        break;
      }
      if (!processingVisible && !charVisible) {
        // 处理已结束但仍未找到角色 — 可能是 LLM 返回失败
        log("STEP3", "处理已结束但未找到角色，等待额外 5s 再检查...");
        await wait(5000);
        const retry = await page.locator('text=/林晚|沈墨|赵锐|周瑶/').first().isVisible({ timeout: 500 }).catch(() => false);
        if (retry) {
          characterFound = true;
        }
        break;
      }
      await wait(3000);
      log("STEP3", `等待 LLM 提取角色中... (${Math.round((Date.now() - charStart) / 1000)}s)`);
    }
    await wait(2000);
    await screenshot(page, "06-character-extraction-result");
    log("STEP3", `角色提取${characterFound ? "完成" : "未检测到角色（可能 LLM 失败）"}`);

    // ---------- Step 4: 进入场景提取阶段 ----------
    log("STEP4", "点击下一步进入场景提取...");
    const nextBtn2 = page.locator('button:has-text("下一步")').first();
    await nextBtn2.click({ timeout: 5000 }).catch(() => {});
    await wait(2000);
    await screenshot(page, "07-scene-extraction-trigger");

    let sceneFound = false;
    const sceneStart = Date.now();
    while (Date.now() - sceneStart < LLM_TIMEOUT) {
      const sceneVisible = await page.locator('text=/曙光号|指挥室|会议室|太空站|Kepler/').first().isVisible({ timeout: 500 }).catch(() => false);
      const processingVisible = await page.locator('text=/处理中|Processing/').first().isVisible({ timeout: 500 }).catch(() => false);
      if (sceneVisible) {
        sceneFound = true;
        break;
      }
      if (!processingVisible && !sceneVisible) {
        log("STEP4", "处理已结束但未找到场景，等待额外 5s 再检查...");
        await wait(5000);
        const retry = await page.locator('text=/曙光号|指挥室|会议室|太空站|Kepler/').first().isVisible({ timeout: 500 }).catch(() => false);
        if (retry) sceneFound = true;
        break;
      }
      await wait(3000);
      log("STEP4", `等待 LLM 提取场景中... (${Math.round((Date.now() - sceneStart) / 1000)}s)`);
    }
    await wait(2000);
    await screenshot(page, "08-scene-extraction-result");
    log("STEP4", `场景提取${sceneFound ? "完成" : "未检测到场景（可能 LLM 失败）"}`);

    // ---------- Step 5: 进入分镜拆解阶段 ----------
    log("STEP5", "点击下一步进入分镜拆解...");
    const nextBtn3 = page.locator('button:has-text("下一步")').first();
    await nextBtn3.click({ timeout: 5000 }).catch(() => {});
    await wait(2000);
    await screenshot(page, "09-shot-breakdown-trigger");

    let shotFound = false;
    const shotStart = Date.now();
    while (Date.now() - shotStart < LLM_TIMEOUT) {
      const shotVisible = await page.locator('text=/分镜|镜头|景别|机位/').first().isVisible({ timeout: 500 }).catch(() => false);
      const processingVisible = await page.locator('text=/处理中|Processing/').first().isVisible({ timeout: 500 }).catch(() => false);
      if (shotVisible) {
        shotFound = true;
        break;
      }
      if (!processingVisible && !shotVisible) {
        log("STEP5", "处理已结束但未找到分镜，等待额外 5s 再检查...");
        await wait(5000);
        const retry = await page.locator('text=/分镜|镜头|景别|机位/').first().isVisible({ timeout: 500 }).catch(() => false);
        if (retry) shotFound = true;
        break;
      }
      await wait(3000);
      log("STEP5", `等待 LLM 拆解分镜中... (${Math.round((Date.now() - shotStart) / 1000)}s)`);
    }
    await wait(3000);
    await screenshot(page, "10-shot-breakdown-result");
    log("STEP5", `分镜拆解${shotFound ? "完成" : "未检测到分镜（可能 LLM 失败）"}`);

    // ---------- Step 6: 最终状态检查 ----------
    log("STEP6", "检查最终状态...");
    await wait(3000);
    await screenshot(page, "11-final-state");

    // 滚动主工作区到底部
    const mainArea = page.locator("main").first();
    await mainArea.evaluate((el) => el.scrollTo(0, el.scrollHeight)).catch(() => {});
    await wait(1000);
    await screenshot(page, "12-final-scrolled");

    // 保存最终状态文本
    const pageText = await page.locator("main").first().innerText().catch(() => "");
    log("STEP6", `主工作区最终文本长度: ${pageText.length} 字符`);

    const stateLogPath = path.join(SCREENSHOT_DIR, "final-state.txt");
    fs.writeFileSync(stateLogPath, pageText, "utf-8");
    log("STEP6", `最终状态文本已保存: ${stateLogPath}`);

    // 保存页面上所有可见按钮文字（便于排查 UI 状态）
    const visibleBtns = await dumpVisibleButtons(page);
    const btnLogPath = path.join(SCREENSHOT_DIR, "visible-buttons.txt");
    fs.writeFileSync(btnLogPath, visibleBtns.join("\n"), "utf-8");
    log("STEP6", `可见按钮列表已保存: ${btnLogPath}`);

    log("DONE", "测试完成！截图已保存到 tests/screenshots/");
    expect(pageText.length).toBeGreaterThan(0);
  });
});
