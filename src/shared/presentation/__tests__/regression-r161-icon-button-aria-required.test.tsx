/**
 * R161: IconButton MUST Require aria-label (No Unlabeled Icon-Only Buttons)
 *
 * 回归规则目的：
 *   IconButton（src/shared/presentation/IconButton.tsx）的 IconButtonProps
 *   必须将 aria-label 声明为必填（string 类型，不可选）。组件必须把 aria-label
 *   透传到底层 <button>，使屏幕阅读器能读到无障碍名称。这是 IconButton 存在的
 *   唯一目的（相对原生 button 强制 a11y 名称契约）。
 *
 * 被测代码：
 *   src/shared/presentation/IconButton.tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFile } from "fs/promises";
import { join } from "path";
import { Trash2, X } from "lucide-react";
import { IconButton, type IconButtonProps } from "../IconButton";

describe("R161: IconButton 必须强制 aria-label prop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("渲染的 button 元素包含传入的 aria-label", () => {
    render(
      <IconButton aria-label="删除" onClick={vi.fn()}>
        <Trash2 />
      </IconButton>,
    );
    const button = screen.getByRole("button", { name: "删除" });
    expect(button).not.toBeNull();
    expect(button.getAttribute("aria-label")).toBe("删除");
  });

  it("aria-label='关闭' 可被屏幕阅读器识别（accessible name）", () => {
    render(
      <IconButton aria-label="关闭">
        <X />
      </IconButton>,
    );
    // getByRole({ name }) 使用 accessible name 计算，验证 SR 能读到
    const button = screen.getByRole("button", { name: "关闭" });
    expect(button).not.toBeNull();
  });

  it("默认 variant='ghost' 应用 btn btn-ghost 类名", () => {
    render(
      <IconButton aria-label="操作">
        <Trash2 />
      </IconButton>,
    );
    const button = screen.getByRole("button", { name: "操作" });
    expect(button.className).toContain("btn-ghost");
  });

  it("variant='primary' 应用 btn-primary 类名", () => {
    render(
      <IconButton aria-label="提交" variant="primary">
        <Trash2 />
      </IconButton>,
    );
    const button = screen.getByRole("button", { name: "提交" });
    expect(button.className).toContain("btn-primary");
  });

  it("默认 type='button'（避免意外触发表单提交）", () => {
    render(
      <IconButton aria-label="操作">
        <Trash2 />
      </IconButton>,
    );
    const button = screen.getByRole("button", { name: "操作" });
    expect(button.getAttribute("type")).toBe("button");
  });

  it("透传额外的 button props（disabled, onClick, title）", () => {
    const onClick = vi.fn();
    render(
      <IconButton aria-label="删除" disabled title="删除该项" onClick={onClick}>
        <Trash2 />
      </IconButton>,
    );
    const button = screen.getByRole("button", { name: "删除" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("title")).toBe("删除该项");
    button.click();
    expect(onClick).not.toHaveBeenCalled(); // disabled 不触发
  });

  it("className 在 variant 类名之后追加", () => {
    render(
      <IconButton aria-label="删除" className="btn-xs h-6 w-6">
        <Trash2 />
      </IconButton>,
    );
    const button = screen.getByRole("button", { name: "删除" });
    expect(button.className).toContain("btn btn-ghost");
    expect(button.className).toContain("btn-xs");
    expect(button.className).toContain("h-6 w-6");
  });

  it("IconButtonProps 类型中 aria-label 是必填（源码断言）", async () => {
    const source = await readFile(
      join(process.cwd(), "src/shared/presentation/IconButton.tsx"),
      "utf-8",
    );
    // 在 interface IconButtonProps 块内，aria-label 应为 "aria-label": string;
    // 不应是 "aria-label"?: string; 或 "aria-label": string | undefined;
    const ifaceMatch = source.match(
      /export interface IconButtonProps[\s\S]*?\n\}/,
    );
    expect(ifaceMatch).not.toBeNull();
    const iface = ifaceMatch![0];
    // 必填：`"aria-label": string;` （不允许 ? 修饰符）
    expect(iface).toMatch(/["']aria-label["']:\s*string\s*;/);
    // 不允许可选形式
    expect(iface).not.toMatch(/["']aria-label["']\?\s*:/);
    // 不允许 undefined 联合类型
    expect(iface).not.toMatch(/["']aria-label["']:\s*string\s*\|\s*undefined/);
  });

  it("TypeScript 编译期会拒绝缺省 aria-label（编译时强制）", () => {
    // 这个测试验证类型层面的约束：缺省 aria-label 应被 TypeScript 拒绝。
    // 我们通过构造"如果调用方省略 aria-label，TS 会报错"的等价断言：
    // 检查 IconButtonProps 必填字段，aria-label 不在 Optional 段。
    // 由于 vitest 不做类型检查，这里通过类型断言间接验证：
    // IconButtonProps 必须包含 aria-label: string 键
    type AssertRequired = IconButtonProps extends { "aria-label": string }
      ? true
      : false;
    const assertion: AssertRequired = true;
    expect(assertion).toBe(true);
  });
});
