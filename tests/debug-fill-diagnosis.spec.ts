import { test, expect } from "@playwright/test";
import { navigateTo, waitForAppReady, dismissOverlays } from "./helpers/page-helpers";
import { installElectronMock } from "./helpers/electron-mock";
import { mockApiRoutes } from "./helpers/mock-api";

interface DiagnosticsResult {
  exists: boolean;
  visible: boolean;
  enabled: boolean;
  editable: boolean;
  rect: { x: number; y: number; width: number; height: number } | null;
  elementAtCenter: string | null;
  pointerEvents: string | null;
  computedPointerEvents: string | null;
  hasInert: boolean;
  ancestorHasInert: boolean;
  zIndex: string | null;
  position: string | null;
  hasTransition: boolean;
  transitionProperty: string | null;
  hasAnimation: boolean;
  animationName: string | null;
  opacity: string | null;
  visibility: string | null;
  display: string | null;
  overflow: string | null;
  tagName: string | null;
  type: string | null;
  readOnly: boolean;
  disabled: boolean;
  tabIndex: string | null;
  ariaHidden: boolean;
  ancestorAriaHidden: boolean;
}

async function runDiagnostics(page: import("@playwright/test").Page, selector: string): Promise<DiagnosticsResult> {
  return page.evaluate((sel) => {
    const input = document.querySelector(sel) as HTMLInputElement | null;

    if (!input) {
      return {
        exists: false,
        visible: false,
        enabled: false,
        editable: false,
        rect: null,
        elementAtCenter: null,
        pointerEvents: null,
        computedPointerEvents: null,
        hasInert: false,
        ancestorHasInert: false,
        zIndex: null,
        position: null,
        hasTransition: false,
        transitionProperty: null,
        hasAnimation: false,
        animationName: null,
        opacity: null,
        visibility: null,
        display: null,
        overflow: null,
        tagName: null,
        type: null,
        readOnly: false,
        disabled: false,
        tabIndex: null,
        ariaHidden: false,
        ancestorAriaHidden: false,
      } satisfies DiagnosticsResult;
    }

    const rect = input.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const elementAtPoint = document.elementFromPoint(centerX, centerY);

    const computed = window.getComputedStyle(input);
    const transitionDuration = computed.transitionDuration;
    const hasActiveTransition =
      transitionDuration !== "0s" && transitionDuration !== "" && transitionDuration !== "all 0s ease 0s";

    let ancestorHasInert = false;
    let ancestorAriaHidden = false;
    let parent: HTMLElement | null = input.parentElement;
    while (parent) {
      if (parent.inert) ancestorHasInert = true;
      if (parent.getAttribute("aria-hidden") === "true") ancestorAriaHidden = true;
      parent = parent.parentElement;
    }

    const animations = input.getAnimations();
    const hasActiveAnimation = animations.length > 0;
    const animNames = animations.map((a) => a.animationName || a.constructor.name).join(", ");

    return {
      exists: true,
      visible: rect.width > 0 && rect.height > 0,
      enabled: !input.disabled,
      editable: !input.readOnly,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      elementAtCenter: elementAtPoint
        ? `<${elementAtPoint.tagName.toLowerCase()}>` +
          (elementAtPoint === input ? " [SAME AS INPUT]" : " [DIFFERENT!]") +
          (elementAtPoint.id ? ` id="${elementAtPoint.id}"` : "") +
          (elementAtPoint.className ? ` class="${(elementAtPoint.className as string).substring(0, 80)}"` : "")
        : null,
      pointerEvents: input.style.pointerEvents || null,
      computedPointerEvents: computed.pointerEvents,
      hasInert: input.inert,
      ancestorHasInert,
      zIndex: computed.zIndex,
      position: computed.position,
      hasTransition: hasActiveTransition,
      transitionProperty: computed.transitionProperty,
      hasAnimation: hasActiveAnimation,
      animationName: animNames || null,
      opacity: computed.opacity,
      visibility: computed.visibility,
      display: computed.display,
      overflow: computed.overflow,
      tagName: input.tagName.toLowerCase(),
      type: input.type,
      readOnly: input.readOnly,
      disabled: input.disabled,
      tabIndex: input.tabIndex >= 0 ? String(input.tabIndex) : null,
      ariaHidden: input.getAttribute("aria-hidden") === "true",
      ancestorAriaHidden,
    } satisfies DiagnosticsResult;
  }, selector);
}

async function diagnoseAndReport(
  page: import("@playwright/test").Page,
  selector: string,
  label: string,
) {
  test.step(`${label}: 检查 input 是否存在`, async () => {
    const count = await page.locator(selector).count();
    console.log(`[${label}] Input count: ${count}`);
    expect(count, `${label}: input should exist`).toBeGreaterThan(0);
  });

  const diag = await runDiagnostics(page, selector);
  console.log(`\n===== ${label} Diagnostics =====`);
  console.log(JSON.stringify(diag, null, 2));

  await test.step(`${label}: visible`, async () => {
    console.log(`[${label}] visible: ${diag.visible}`);
  });

  await test.step(`${label}: enabled`, async () => {
    console.log(`[${label}] enabled: ${diag.enabled}, disabled: ${diag.disabled}`);
  });

  await test.step(`${label}: editable`, async () => {
    console.log(`[${label}] editable: ${diag.editable}, readOnly: ${diag.readOnly}`);
  });

  await test.step(`${label}: getBoundingClientRect`, async () => {
    console.log(`[${label}] rect:`, diag.rect);
    if (diag.rect) {
      const inViewport =
        diag.rect.x >= 0 && diag.rect.y >= 0 &&
        diag.rect.x + diag.rect.width <= (page.viewportSize()?.width ?? 1280) &&
        diag.rect.y + diag.rect.height <= (page.viewportSize()?.height ?? 720);
      console.log(`[${label}] In viewport: ${inViewport}`);
    }
  });

  await test.step(`${label}: elementFromPoint (遮挡检查)`, async () => {
    console.log(`[${label}] elementAtCenter: ${diag.elementAtCenter}`);
    if (diag.elementAtCenter && !diag.elementAtCenter.includes("[SAME AS INPUT]")) {
      console.log(`[WARNING] ${label}: 另一个元素遮挡了 input!`);
    }
  });

  await test.step(`${label}: pointer-events`, async () => {
    console.log(`[${label}] inline pointer-events: ${diag.pointerEvents}, computed: ${diag.computedPointerEvents}`);
  });

  await test.step(`${label}: inert 检查`, async () => {
    console.log(`[${label}] hasInert: ${diag.hasInert}, ancestorHasInert: ${diag.ancestorHasInert}`);
  });

  await test.step(`${label}: z-index 和 position`, async () => {
    console.log(`[${label}] zIndex: ${diag.zIndex}, position: ${diag.position}`);
  });

  await test.step(`${label}: transition/animation 检查`, async () => {
    console.log(`[${label}] hasTransition: ${diag.hasTransition}, transitionProperty: ${diag.transitionProperty}`);
    console.log(`[${label}] hasAnimation: ${diag.hasAnimation}, animationName: ${diag.animationName}`);
  });

  await test.step(`${label}: 其他 CSS 属性`, async () => {
    console.log(`[${label}] opacity: ${diag.opacity}, visibility: ${diag.visibility}, display: ${diag.display}, overflow: ${diag.overflow}`);
    console.log(`[${label}] tabIndex: ${diag.tabIndex}, ariaHidden: ${diag.ariaHidden}, ancestorAriaHidden: ${diag.ancestorAriaHidden}`);
  });

  await test.step(`${label}: 尝试 Playwright click()`, async () => {
    try {
      await page.locator(selector).click({ timeout: 5000 });
      console.log(`[${label}] click(): SUCCESS`);
    } catch (e) {
      console.log(`[${label}] click(): FAILED - ${(e as Error).message.substring(0, 300)}`);
    }
  });

  await test.step(`${label}: 尝试 evaluate focus + keyboard.type`, async () => {
    try {
      await page.evaluate((sel) => {
        const input = document.querySelector(sel) as HTMLInputElement;
        if (input) input.focus();
      }, selector);
      await page.keyboard.type("test", { timeout: 5000 });
      const value = await page.evaluate((sel) => {
        return (document.querySelector(sel) as HTMLInputElement)?.value;
      }, selector);
      console.log(`[${label}] evaluate focus + keyboard.type: value="${value}"`);
      await page.evaluate((sel) => {
        const input = document.querySelector(sel) as HTMLInputElement;
        if (input) {
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
          setter?.call(input, "");
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }, selector);
      await page.waitForTimeout(200);
    } catch (e) {
      console.log(`[${label}] evaluate focus + keyboard.type: FAILED - ${(e as Error).message.substring(0, 300)}`);
    }
  });

  await test.step(`${label}: 尝试 fill() (5s timeout)`, async () => {
    try {
      await page.locator(selector).fill("FillTest", { timeout: 5000 });
      const value = await page.evaluate((sel) => {
        return (document.querySelector(sel) as HTMLInputElement)?.value;
      }, selector);
      console.log(`[${label}] fill(): SUCCESS, value="${value}"`);
    } catch (e) {
      const msg = (e as Error).message;
      console.log(`[${label}] fill(): FAILED`);
      console.log(`[${label}] fill() error (full):\n${msg}`);
    }
  });
}

test.describe("fill() 超时诊断", () => {
  test("Story 页面 input 诊断", async ({ page }) => {
    await installElectronMock(page);
    await mockApiRoutes(page);
    await navigateTo(page, "/story");
    await page.waitForTimeout(2000);

    const storyInputSelector = 'input[placeholder="分镜项目标题..."]';
    await diagnoseAndReport(page, storyInputSelector, "Story-TitleInput");
  });

  test("Character 页面 input 诊断 (对照组)", async ({ page }) => {
    await installElectronMock(page);
    await mockApiRoutes(page);
    await navigateTo(page, "/characters");
    await page.waitForTimeout(2000);

    const charNameInputSelector = 'input[placeholder="输入角色名称..."]';
    await diagnoseAndReport(page, charNameInputSelector, "Character-NameInput");
  });

  test("Story vs Character 对比：Playwright actionability 详情", async ({ page }) => {
    await installElectronMock(page);
    await mockApiRoutes(page);

    await test.step("Story 页面 actionability 检查", async () => {
      await navigateTo(page, "/story");
      await page.waitForTimeout(2000);

      const storyInput = page.locator('input[placeholder="分镜项目标题..."]');
      await storyInput.waitFor({ state: "attached", timeout: 5000 });
      console.log("[Story] input attached: true");

      const storyVisible = await storyInput.isVisible();
      console.log(`[Story] Playwright isVisible(): ${storyVisible}`);

      const storyEnabled = await storyInput.isEnabled();
      console.log(`[Story] Playwright isEnabled(): ${storyEnabled}`);

      const storyEditable = await storyInput.isEditable();
      console.log(`[Story] Playwright isEditable(): ${storyEditable}`);

      try {
        await storyInput.click({ timeout: 5000 });
        console.log("[Story] click(): SUCCESS");
      } catch (e) {
        console.log(`[Story] click(): FAILED - ${(e as Error).message.substring(0, 500)}`);
      }

      try {
        await storyInput.fill("DiagTest", { timeout: 5000 });
        console.log("[Story] fill(): SUCCESS");
      } catch (e) {
        console.log(`[Story] fill(): FAILED - ${(e as Error).message.substring(0, 500)}`);
      }
    });

    await test.step("Character 页面 actionability 检查", async () => {
      await navigateTo(page, "/characters");
      await page.waitForTimeout(2000);

      const charInput = page.locator('input[placeholder="输入角色名称..."]');
      await charInput.waitFor({ state: "attached", timeout: 5000 });
      console.log("[Character] input attached: true");

      const charVisible = await charInput.isVisible();
      console.log(`[Character] Playwright isVisible(): ${charVisible}`);

      const charEnabled = await charInput.isEnabled();
      console.log(`[Character] Playwright isEnabled(): ${charEnabled}`);

      const charEditable = await charInput.isEditable();
      console.log(`[Character] Playwright isEditable(): ${charEditable}`);

      try {
        await charInput.click({ timeout: 5000 });
        console.log("[Character] click(): SUCCESS");
      } catch (e) {
        console.log(`[Character] click(): FAILED - ${(e as Error).message.substring(0, 500)}`);
      }

      try {
        await charInput.fill("DiagTest", { timeout: 5000 });
        console.log("[Character] fill(): SUCCESS");
      } catch (e) {
        console.log(`[Character] fill(): FAILED - ${(e as Error).message.substring(0, 500)}`);
      }
    });
  });

  test("Story 页面：检查所有 input 元素的状态", async ({ page }) => {
    await installElectronMock(page);
    await mockApiRoutes(page);
    await navigateTo(page, "/story");
    await page.waitForTimeout(2000);

    const allInputs = page.locator('input[type="text"], input:not([type])');
    const count = await allInputs.count();
    console.log(`[Story] Total text inputs found: ${count}`);

    for (let i = 0; i < count; i++) {
      const input = allInputs.nth(i);
      const placeholder = await input.getAttribute("placeholder");
      const visible = await input.isVisible().catch(() => false);
      const enabled = await input.isEnabled().catch(() => false);
      const editable = await input.isEditable().catch(() => false);
      console.log(`[Story] Input[${i}]: placeholder="${placeholder}", visible=${visible}, enabled=${enabled}, editable=${editable}`);

      if (visible && enabled) {
        try {
          await input.click({ timeout: 3000 });
          console.log(`[Story] Input[${i}] click(): OK`);
        } catch (e) {
          console.log(`[Story] Input[${i}] click(): FAILED - ${(e as Error).message.substring(0, 200)}`);
        }

        try {
          await input.fill("DiagTest", { timeout: 3000 });
          console.log(`[Story] Input[${i}] fill(): OK`);
          await input.fill("", { timeout: 3000 });
        } catch (e) {
          console.log(`[Story] Input[${i}] fill(): FAILED - ${(e as Error).message.substring(0, 200)}`);
        }
      }
    }
  });

  test("Story 页面：深入检查 Playwright actionability 内部状态", async ({ page }) => {
    await installElectronMock(page);
    await mockApiRoutes(page);
    await navigateTo(page, "/story");
    await page.waitForTimeout(2000);

    const selector = 'input[placeholder="分镜项目标题..."]';

    const deepDiag = await page.evaluate((sel) => {
      const input = document.querySelector(sel) as HTMLInputElement;
      if (!input) return { error: "not found" };

      const computed = window.getComputedStyle(input);

      const getAncestorInfo = () => {
        const ancestors: Array<{
          tag: string;
          id: string;
          classes: string;
          overflow: string;
          pointerEvents: string;
          visibility: string;
          display: string;
          opacity: string;
          inert: boolean;
          ariaHidden: string | null;
        }> = [];
        let parent = input.parentElement;
        let depth = 0;
        while (parent && depth < 15) {
          const pc = window.getComputedStyle(parent);
          ancestors.push({
            tag: parent.tagName.toLowerCase(),
            id: parent.id || "",
            classes: (parent.className && typeof parent.className === "string")
              ? parent.className.substring(0, 100)
              : "",
            overflow: pc.overflow,
            pointerEvents: pc.pointerEvents,
            visibility: pc.visibility,
            display: pc.display,
            opacity: pc.opacity,
            inert: parent.inert,
            ariaHidden: parent.getAttribute("aria-hidden"),
          });
          parent = parent.parentElement;
          depth++;
        }
        return ancestors;
      };

      return {
        inputInfo: {
          tagName: input.tagName,
          type: input.type,
          disabled: input.disabled,
          readOnly: input.readOnly,
          hidden: input.hidden,
          tabIndex: input.tabIndex,
          contentEditable: input.contentEditable,
          inert: input.inert,
          ariaHidden: input.getAttribute("aria-hidden"),
          ariaDisabled: input.getAttribute("aria-disabled"),
          role: input.getAttribute("role"),
          form: input.form?.tagName || null,
        },
        computedStyle: {
          display: computed.display,
          visibility: computed.visibility,
          opacity: computed.opacity,
          pointerEvents: computed.pointerEvents,
          position: computed.position,
          zIndex: computed.zIndex,
          overflow: computed.overflow,
          clip: computed.clip,
          clipPath: computed.clipPath,
          transform: computed.transform,
          filter: computed.filter,
          userSelect: computed.userSelect,
          touchAction: computed.touchAction,
          cursor: computed.cursor,
        },
        ancestors: getAncestorInfo(),
      };
    }, selector);

    console.log("\n===== Story Input Deep Diagnostics =====");
    console.log(JSON.stringify(deepDiag, null, 2));

    const suspiciousAncestors = (deepDiag as any).ancestors?.filter(
      (a: any) =>
        a.overflow === "hidden" ||
        a.pointerEvents === "none" ||
        a.visibility === "hidden" ||
        a.visibility === "collapse" ||
        a.display === "none" ||
        parseFloat(a.opacity) < 0.1 ||
        a.inert === true ||
        a.ariaHidden === "true",
    );
    if (suspiciousAncestors?.length > 0) {
      console.log("\n[WARNING] Suspicious ancestors found:");
      console.log(JSON.stringify(suspiciousAncestors, null, 2));
    } else {
      console.log("\n[OK] No suspicious ancestors found");
    }
  });
});
