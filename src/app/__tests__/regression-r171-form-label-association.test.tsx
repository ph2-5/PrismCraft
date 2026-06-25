/**
 * R171: 表单控件必须有 label 关联
 *
 * 回归规则目的：
 *   表单控件（<input>、<select>、<textarea>）必须有可见 label 关联
 *   （<label htmlFor={id}> + id）或 aria-label/aria-labelledby。
 *
 * 被测代码：
 *   验证规则模式（通过渲染示例 + 源码扫描 SearchDialog）
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { readFile } from "fs/promises";
import { join } from "path";

function LabeledInput({ id, label, value, onChange }: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </>
  );
}

function AriaLabelInput({ ariaLabel, value, onChange }: {
  ariaLabel: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="text"
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

describe("R171: 表单控件必须有 label 关联", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("label + htmlFor 关联的 input 可被 getByLabelText 查询", () => {
    render(<LabeledInput id="name" label="名称" value="" onChange={vi.fn()} />);
    const input = screen.getByLabelText("名称");
    expect(input).not.toBeNull();
    expect(input.getAttribute("id")).toBe("name");
  });

  it("aria-label 的 input 可被 getByLabelText 查询", () => {
    render(<AriaLabelInput ariaLabel="搜索" value="" onChange={vi.fn()} />);
    const input = screen.getByLabelText("搜索");
    expect(input).not.toBeNull();
  });

  it("label htmlFor 指向正确的 input id", () => {
    render(<LabeledInput id="email" label="邮箱" value="" onChange={vi.fn()} />);
    const input = screen.getByLabelText("邮箱") as HTMLInputElement;
    const label = document.querySelector("label");
    expect(label?.getAttribute("for")).toBe("email");
    expect(input.getAttribute("id")).toBe("email");
  });

  it("aria-label 提供无障碍名称（getByRole 查询）", () => {
    render(<AriaLabelInput ariaLabel="用户名" value="" onChange={vi.fn()} />);
    const input = screen.getByRole("textbox", { name: "用户名" });
    expect(input).not.toBeNull();
  });

  it("onChange 事件正常触发", () => {
    const onChange = vi.fn();
    render(<LabeledInput id="test" label="测试" value="" onChange={onChange} />);
    const input = screen.getByLabelText("测试");
    fireEvent.change(input, { target: { value: "hello" } });
    expect(onChange).toHaveBeenCalledWith("hello");
  });

  it("SearchDialog.tsx 的 input 有 aria-label", async () => {
    const source = await readFile(
      join(process.cwd(), "src/shared/presentation/SearchDialog.tsx"),
      "utf-8",
    );
    // SearchDialog 的搜索 input 用 aria-label 而非可见 label（搜索框通用模式）
    expect(source).toMatch(/<input/);
    expect(source).toMatch(/aria-label=/);
  });

  it("label 文本可被屏幕阅读器朗读", () => {
    render(<LabeledInput id="pw" label="密码" value="" onChange={vi.fn()} />);
    // getByLabelText 使用 accessible name 关联算法
    const input = screen.getByLabelText("密码");
    expect(input.getAttribute("type")).toBe("text");
  });

  it("aria-label 优先级高于 placeholder（无障碍名称计算）", () => {
    render(
      <input type="text" aria-label="无障碍名称" placeholder="占位符" />,
    );
    // aria-label 优先于 placeholder 作为 accessible name
    const input = screen.getByLabelText("无障碍名称");
    expect(input).not.toBeNull();
    // placeholder 不是 accessible name
    expect(screen.queryByLabelText("占位符")).toBeNull();
  });
});
