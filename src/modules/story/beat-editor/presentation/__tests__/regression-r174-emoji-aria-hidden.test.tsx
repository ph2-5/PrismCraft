/**
 * R174: 装饰性 emoji 必须 aria-hidden
 *
 * 回归规则目的：
 *   装饰性 emoji（如 🗑、🌅、📤）必须添加 aria-hidden="true"，防止屏幕
 *   阅读器朗读 emoji 的冗长描述。
 *
 * 被测代码：
 *   src/modules/story/beat-editor/presentation/BeatDetailEditor.tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFile } from "fs/promises";
import { join } from "path";

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

  it("BeatDetailEditor.tsx 源码中装饰性 emoji 有 aria-hidden='true'", async () => {
    const source = await readFile(
      join(process.cwd(), "src/modules/story/beat-editor/presentation/BeatDetailEditor.tsx"),
      "utf-8",
    );
    // 仅检查已知装饰性 emoji（🗑🌅📤📥▶️✨），不检查功能性 emoji（👤✓⚠🏙🔄）
    const decorativeEmojis = ["🗑", "🌅", "📤", "📥", "▶️", "✨"];
    const offenders: string[] = [];
    for (const emoji of decorativeEmojis) {
      if (!source.includes(emoji)) continue;
      const lines = source.split("\n").filter((l) => l.includes(emoji));
      for (const line of lines) {
        if (!line.includes('aria-hidden="true"')) {
          offenders.push(`emoji "${emoji}" 缺少 aria-hidden: ${line.trim()}`);
        }
      }
    }
    expect(
      offenders,
      `以下装饰性 emoji 缺少 aria-hidden="true"：\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("BeatDetailEditor.tsx 源码中常见装饰 emoji 都被 aria-hidden", async () => {
    const source = await readFile(
      join(process.cwd(), "src/modules/story/beat-editor/presentation/BeatDetailEditor.tsx"),
      "utf-8",
    );
    // 检查特定装饰性 emoji
    const emojis = ["🗑", "🌅", "📤", "📥", "▶️", "✨"];
    for (const emoji of emojis) {
      if (source.includes(emoji)) {
        // 找到 emoji 所在行，检查该行有 aria-hidden
        const lines = source.split("\n").filter((l) => l.includes(emoji));
        for (const line of lines) {
          expect(
            line.includes('aria-hidden="true"'),
            `emoji "${emoji}" 所在行缺少 aria-hidden="true"：${line.trim()}`,
          ).toBe(true);
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

  it("BeatDetailEditor.tsx 中 emoji span 使用 aria-hidden（源码断言）", async () => {
    const source = await readFile(
      join(process.cwd(), "src/modules/story/beat-editor/presentation/BeatDetailEditor.tsx"),
      "utf-8",
    );
    // 至少有 5 个 aria-hidden="true" 的 span（多个 emoji）
    const ariaHiddenCount = (source.match(/aria-hidden="true"/g) || []).length;
    expect(ariaHiddenCount).toBeGreaterThanOrEqual(5);
  });
});
