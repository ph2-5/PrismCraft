import type { Meta, StoryObj } from "@storybook/react";
import { MarkdownRenderer } from "./MarkdownRenderer";

const meta: Meta<typeof MarkdownRenderer> = {
  title: "Agent/MarkdownRenderer",
  component: MarkdownRenderer,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof MarkdownRenderer>;

export const PlainText: Story = {
  args: { content: "这是一段普通文本，展示 MarkdownRenderer 的基本渲染能力。" },
};

export const CodeBlock: Story = {
  args: {
    content: "```typescript\nfunction greet(name: string): string {\n  return `Hello, ${name}!`;\n}\n```",
  },
};

export const BoldAndInline: Story = {
  args: {
    content: "这是 **粗体文本** 和 `行内代码` 的混合示例。",
  },
};

export const Headings: Story = {
  args: {
    content: "# 一级标题\n## 二级标题\n### 三级标题\n正文内容。",
  },
};

export const Lists: Story = {
  args: {
    content: "- 无序列表项 1\n- 无序列表项 2\n- 无序列表项 3\n\n1. 有序列表项 1\n2. 有序列表项 2",
  },
};

export const Mixed: Story = {
  args: {
    content: [
      "# 混合示例",
      "",
      "这是包含 **多种格式** 的段落，包括 `行内代码`。",
      "",
      "## 代码块",
      "```python",
      "def main():",
      "    print('Hello, World!')",
      "```",
      "",
      "## 列表",
      "- 项目 A",
      "- 项目 B",
    ].join("\n"),
  },
};
