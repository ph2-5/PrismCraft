/**
 * R168: 纯图标按钮必须有 aria-label
 *
 * 回归规则目的：
 *   纯图标按钮（按钮内仅含图标无文字）必须提供 aria-label，使屏幕阅读器
 *   能朗读按钮用途。使用 <IconButton> 组件（强制 aria-label prop）或在
 *   <button> 上手动添加 aria-label。
 *
 * 被测代码：
 *   src/shared/presentation/IconButton.tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Trash2, X } from "lucide-react";
import { IconButton } from "../IconButton";

describe("R168: 纯图标按钮必须有 aria-label", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("IconButton 渲染时包含 aria-label", () => {
    render(
      <IconButton aria-label="删除" onClick={vi.fn()}>
        <Trash2 />
      </IconButton>,
    );
    const button = screen.getByRole("button", { name: "删除" });
    expect(button).not.toBeNull();
    expect(button.getAttribute("aria-label")).toBe("删除");
  });

  it("IconButton 的 aria-label 可被屏幕阅读器识别（accessible name）", () => {
    render(
      <IconButton aria-label="关闭">
        <X />
      </IconButton>,
    );
    // getByRole({ name }) 使用 accessible name 计算
    expect(screen.getByRole("button", { name: "关闭" })).not.toBeNull();
  });

  it("不同 aria-label 值产生不同的 accessible name", () => {
    render(
      <div>
        <IconButton aria-label="删除">
          <Trash2 />
        </IconButton>
        <IconButton aria-label="关闭">
          <X />
        </IconButton>
      </div>,
    );
    expect(screen.getByRole("button", { name: "删除" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "关闭" })).not.toBeNull();
  });

  it("IconButton 透传 onClick 事件", () => {
    const onClick = vi.fn();
    render(
      <IconButton aria-label="删除" onClick={onClick}>
        <Trash2 />
      </IconButton>,
    );
    screen.getByRole("button", { name: "删除" }).click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("IconButton 默认 type='button'（避免意外提交表单）", () => {
    render(
      <IconButton aria-label="操作">
        <Trash2 />
      </IconButton>,
    );
    const button = screen.getByRole("button", { name: "操作" });
    expect(button.getAttribute("type")).toBe("button");
  });

  it("IconButton 支持 disabled 状态", () => {
    const onClick = vi.fn();
    render(
      <IconButton aria-label="删除" disabled onClick={onClick}>
        <Trash2 />
      </IconButton>,
    );
    const button = screen.getByRole("button", { name: "删除" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    button.click();
    expect(onClick).not.toHaveBeenCalled();
  });

  it("IconButtonProps 类型中 aria-label 是必填字段", async () => {
    const { readFile } = await import("fs/promises");
    const { join } = await import("path");
    const source = await readFile(
      join(process.cwd(), "src/shared/presentation/IconButton.tsx"),
      "utf-8",
    );
    const ifaceMatch = source.match(/export interface IconButtonProps[\s\S]*?\n\}/);
    expect(ifaceMatch).not.toBeNull();
    const iface = ifaceMatch![0];
    // 必填：`"aria-label": string;` （不允许 ? 修饰符）
    expect(iface).toMatch(/["']aria-label["']:\s*string\s*;/);
    expect(iface).not.toMatch(/["']aria-label["']\?\s*:/);
  });
});
