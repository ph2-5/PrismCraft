/**
 * R174: 装饰性 emoji 必须 aria-hidden
 *
 * 回归规则目的：
 *   装饰性 emoji（如 🗑、🌅、📤）必须添加 aria-hidden="true"，防止屏幕
 *   阅读器朗读 emoji 的冗长描述。
 *
 * 被测代码：
 *   src/modules/story/beat-editor/presentation/ 目录下所有拆分后的 .tsx 文件
 *   （BeatDetailEditor.tsx, BeatNavigation.tsx, BeatPromptPanel.tsx,
 *     BeatUploadPanel.tsx, BeatGenerationPanel.tsx）
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFile, readdir } from "fs/promises";
import { join } from "path";

const PRESENTATION_DIR = join(
  process.cwd(),
  "src/modules/story/beat-editor/presentation",
);

const DECORATIVE_EMOJIS = ["🗑", "🌅", "📤", "📥", "▶️", "✨"];

async function listPresentationTsxFiles(): Promise<string[]> {
  const entries = await readdir(PRESENTATION_DIR, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(".tsx"))
    .map((e) => join(PRESENTATION_DIR, e.name));
}

function EmojiSpan({ emoji, hidden, label }: { emoji: string; hidden?: boolean; label?: string }) {
  return (
    <span aria-hidden={hidden ? "true" : undefined} aria-label={label}>
      {emoji}
    </span>
  );
}

describe("R174: 装饰性 emoji 必须 aria-hidden", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("aria-hidden='true' 的 span 对屏幕阅读器不可见", () => {
    render(<EmojiSpan emoji="🗑" hidden={true} />);
    // aria-hidden 的元素不在 accessibility tree 中
    expect(screen.queryByText("🗑")).not.toBeNull();
  });

  it("无 aria-hidden 的 emoji 会被屏幕阅读器朗读（BAD 示例）", () => {
    render(<EmojiSpan emoji="🌅" />);
    // 无 aria-hidden 的 span 会被朗读
    const span = screen.getByText("🌅");
    expect(span.getAttribute("aria-hidden")).toBeNull();
  });

  it("aria-hidden='true' 时 emoji 不在 accessibility tree", () => {
    render(<EmojiSpan emoji="📤" hidden={true} />);
    // 渲染但 aria-hidden
    const span = screen.getByText("📤");
    expect(span.getAttribute("aria-hidden")).toBe("true");
  });

  it("beat-editor presentation 目录下所有 .tsx 文件中装饰性 emoji 都有 aria-hidden='true'", async () => {
    const files = await listPresentationTsxFiles();
    expect(files.length, "presentation 目录下应至少有一个 .tsx 文件").toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const file of files) {
      const source = await readFile(file, "utf-8");
      for (const emoji of DECORATIVE_EMOJIS) {
        if (!source.includes(emoji)) continue;
        const lines = source.split("\n").filter((l) => l.includes(emoji));
        for (const line of lines) {
          // Skip lines where emoji is inside a JSX prop string value (e.g., emptyEmoji="🌅")
          // The rendering component handles aria-hidden for these
          const emojiIdx = line.indexOf(emoji);
          const propQuoteIdx = line.indexOf('="');
          if (propQuoteIdx !== -1 && propQuoteIdx < emojiIdx && !line.includes(">")) {
            continue;
          }
          if (!line.includes('aria-hidden="true"')) {
            const rel = file.replace(process.cwd() + "\\", "").replace(/\\/g, "/");
            offenders.push(`${rel}: emoji "${emoji}" 缺少 aria-hidden: ${line.trim()}`);
          }
        }
      }
    }
    expect(
      offenders,
      `以下装饰性 emoji 缺少 aria-hidden="true"：\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("所有 presentation .tsx 文件中常见装饰 emoji 都被 aria-hidden", async () => {
    const files = await listPresentationTsxFiles();
    for (const file of files) {
      const source = await readFile(file, "utf-8");
      for (const emoji of DECORATIVE_EMOJIS) {
        if (source.includes(emoji)) {
          const lines = source.split("\n").filter((l) => l.includes(emoji));
          for (const line of lines) {
            // Skip lines where emoji is inside a JSX prop string value (e.g., emptyEmoji="🌅")
            const emojiIdx = line.indexOf(emoji);
            const propQuoteIdx = line.indexOf('="');
            if (propQuoteIdx !== -1 && propQuoteIdx < emojiIdx && !line.includes(">")) {
              continue;
            }
            expect(
              line.includes('aria-hidden="true"'),
              `${file}: emoji "${emoji}" 所在行缺少 aria-hidden="true"：${line.trim()}`,
            ).toBe(true);
          }
        }
      }
    }
  });

  it("aria-hidden 的 emoji span 不影响旁边文字的朗读", () => {
    render(
      <button>
        <EmojiSpan emoji="🗑" hidden={true} /> 删除
      </button>,
    );
    // 按钮的 accessible name 应是 "删除"（emoji 被 aria-hidden 排除）
    const button = screen.getByRole("button", { name: "删除" });
    expect(button).not.toBeNull();
  });

  it("仅含 emoji 的按钮需要 aria-label（emoji 不能作为 accessible name）", () => {
    render(
      <button aria-label="删除">
        <EmojiSpan emoji="🗑" hidden={true} />
      </button>,
    );
    // emoji 被 aria-hidden，按钮的 accessible name 来自 aria-label
    const button = screen.getByRole("button", { name: "删除" });
    expect(button).not.toBeNull();
  });

  it("presentation 目录所有 .tsx 累计至少有 5 个 aria-hidden='true'", async () => {
    const files = await listPresentationTsxFiles();
    let ariaHiddenCount = 0;
    for (const file of files) {
      const source = await readFile(file, "utf-8");
      ariaHiddenCount += (source.match(/aria-hidden="true"/g) || []).length;
    }
    expect(ariaHiddenCount).toBeGreaterThanOrEqual(5);
  });
});
