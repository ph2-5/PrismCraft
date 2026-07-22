/**
 * R165: Coming-Soon Page Titles MUST Use t() (i18n), Not Hardcoded Strings
 *
 * 回归规则目的：
 *   src/app/coming-soon/*.tsx 中渲染 <ComingSoon title={...} /> 的页面必须传入
 *   t("sidebar.<page>") 作为 title，不能硬编码中文/英文字符串。descriptionKey
 *   也必须是 i18n key。这保持 sidebar 标签与页面标题同步，并支持 locale 切换。
 *
 * 被测代码：
 *   src/app/coming-soon/{Login,Mobile,Workspace,Workflow,
 *     TemplateMarket}Page.tsx
 *
 * 注意：AgentPage 已升级为真实 Agent UI（src/modules/agent/presentation/AgentPage.tsx），
 *      不再使用 ComingSoon 组件，因此从本测试中移除。
 * 注意：ComposerPage 已被 ./modules/video-compose/page 替换为真实功能页，
 *      StoryPage 已被 ./app/story/page（StoryPipelineShell）替换为真实功能页，
 *      因此两者从本测试中移除。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFile } from "fs/promises";
import { join } from "path";

const { mockT, mockComingSoon } = vi.hoisted(() => ({
  mockT: vi.fn((key: string) => key),
  mockComingSoon: vi.fn(({ title, descriptionKey }: { icon: string; title: string; descriptionKey: string }) => (
    <div data-testid="coming-soon">
      <span data-testid="cs-title">{title}</span>
      <span data-testid="cs-desc-key">{descriptionKey}</span>
    </div>
  )),
}));

vi.mock("@/shared/constants/messages", () => ({
  t: mockT,
}));

vi.mock("@/shared/constants", () => ({
  t: mockT,
}));

vi.mock("@/shared/presentation/ComingSoon", () => ({
  ComingSoon: mockComingSoon,
}));

// coming-soon 页面清单（AgentPage 已升级为真实 UI，不再在此列表；PluginsPage 已移至 src/app/plugins/page.tsx；
// ComposerPage 与 StoryPage 已被真实功能页替换，不再在此列表）
const COMING_SOON_PAGES = [
  { file: "src/app/coming-soon/LoginPage.tsx", expectedKey: "sidebar.login" },
  { file: "src/app/coming-soon/MobilePage.tsx", expectedKey: "sidebar.mobile" },
  { file: "src/app/coming-soon/WorkspacePage.tsx", expectedKey: "sidebar.workspace" },
  { file: "src/app/coming-soon/WorkflowPage.tsx", expectedKey: "sidebar.workflow" },
  { file: "src/app/coming-soon/TemplateMarketPage.tsx", expectedKey: "sidebar.templateMarket" },
];

describe("R165: coming-soon 页面 title 必须用 t() 国际化", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("LoginPage 渲染时 title 来自 t('sidebar.login')", async () => {
    const { default: LoginPage } = await import("../LoginPage");
    render(<LoginPage />);
    expect(mockT).toHaveBeenCalledWith("sidebar.login");
    expect(screen.getByTestId("cs-title").textContent).toBe("sidebar.login");
  });

  it("MobilePage 渲染时 title 来自 t('sidebar.mobile')", async () => {
    const { default: MobilePage } = await import("../MobilePage");
    render(<MobilePage />);
    expect(mockT).toHaveBeenCalledWith("sidebar.mobile");
  });

  it("WorkspacePage 渲染时 title 来自 t('sidebar.workspace')", async () => {
    const { default: WorkspacePage } = await import("../WorkspacePage");
    render(<WorkspacePage />);
    expect(mockT).toHaveBeenCalledWith("sidebar.workspace");
  });

  it("WorkflowPage 渲染时 title 来自 t('sidebar.workflow')", async () => {
    const { default: WorkflowPage } = await import("../WorkflowPage");
    render(<WorkflowPage />);
    expect(mockT).toHaveBeenCalledWith("sidebar.workflow");
  });

  it("TemplateMarketPage 渲染时 title 来自 t('sidebar.templateMarket')", async () => {
    const { default: TemplateMarketPage } = await import("../TemplateMarketPage");
    render(<TemplateMarketPage />);
    expect(mockT).toHaveBeenCalledWith("sidebar.templateMarket");
  });

  it("所有 coming-soon 页面源码 title prop 是 t(...) 调用而非字符串字面量", async () => {
    const TITLE_LITERAL_REGEX = /title\s*=\s*["'][^"']+["']/;
    const TITLE_T_CALL_REGEX = /title\s*=\s*\{?\s*t\(\s*["']sidebar\./;
    for (const { file } of COMING_SOON_PAGES) {
      const source = await readFile(join(process.cwd(), file), "utf-8");
      // 不应有硬编码字符串 title
      expect(
        TITLE_LITERAL_REGEX.test(source),
        `${file} 不应硬编码 title 字符串字面量`,
      ).toBe(false);
      // 必须用 t("sidebar.xxx") 调用
      expect(
        TITLE_T_CALL_REGEX.test(source),
        `${file} 必须用 t("sidebar.xxx") 调用作为 title`,
      ).toBe(true);
    }
  });

  it("所有 coming-soon 页面 descriptionKey 是 i18n key（以 'comingSoon.' 开头）", async () => {
    const DESC_KEY_REGEX = /descriptionKey\s*=\s*["']comingSoon\./;
    for (const { file } of COMING_SOON_PAGES) {
      const source = await readFile(join(process.cwd(), file), "utf-8");
      expect(
        DESC_KEY_REGEX.test(source),
        `${file} descriptionKey 必须以 "comingSoon." 开头`,
      ).toBe(true);
    }
  });
});
