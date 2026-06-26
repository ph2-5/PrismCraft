/**
 * R167: 自定义模态框必须使用 Modal 组件或补 role/aria-modal
 *
 * 回归规则目的：
 *   渲染模态对话框（fixed inset-0 overlay + 居中面板）时必须使用统一 <Modal>
 *   组件（内置 role="dialog" aria-modal="true"），或手动补齐 ARIA 语义。
 *   裸 div overlay 无 ARIA 语义，屏幕阅读器无法识别为对话框。
 *
 * 被测代码：
 *   src/shared/presentation/Modal.tsx
 *   src/shared/presentation/SearchDialog.tsx（手动补齐 ARIA 的示例）
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFile } from "fs/promises";
import { join } from "path";
import { Modal } from "../Modal";

describe("R167: 自定义模态框必须使用 Modal 组件或补 role/aria-modal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Modal 组件渲染 role='dialog'", () => {
    render(
      <Modal open={true} onClose={vi.fn()} ariaLabel="测试对话框">
        <div>内容</div>
      </Modal>,
    );
    expect(screen.getByRole("dialog")).not.toBeNull();
  });

  it("Modal 组件渲染 aria-modal='true'", () => {
    render(
      <Modal open={true} onClose={vi.fn()} ariaLabel="对话框">
        <div>内容</div>
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
  });

  it("Modal 组件 ariaLabel 透传为 aria-label", () => {
    render(
      <Modal open={true} onClose={vi.fn()} ariaLabel="删除确认">
        <div>内容</div>
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-label")).toBe("删除确认");
  });

  it("Modal 组件 open=false 时不渲染", () => {
    const { container } = render(
      <Modal open={false} onClose={vi.fn()} ariaLabel="对话框">
        <div>内容</div>
      </Modal>,
    );
    expect(container.firstChild).toBeNull();
  });

  it("SearchDialog.tsx 使用 fixed inset-0 时补齐了 role='dialog' aria-modal='true'", async () => {
    // SearchDialog 不使用 <Modal> 组件（自定义布局），但手动补齐了 ARIA 语义
    const source = await readFile(
      join(process.cwd(), "src/shared/presentation/SearchDialog.tsx"),
      "utf-8",
    );
    expect(source).toMatch(/fixed inset-0/);
    expect(source).toMatch(/role="dialog"/);
    expect(source).toMatch(/aria-modal="true"/);
  });

  it("SearchDialog.tsx 补齐了 aria-label（屏幕阅读器可识别）", async () => {
    const source = await readFile(
      join(process.cwd(), "src/shared/presentation/SearchDialog.tsx"),
      "utf-8",
    );
    expect(source).toMatch(/aria-label=\{/);
  });

  it("ThemeSwitcher overlay 使用 role='presentation'（非模态，不适用 R167）", async () => {
    // ThemeSwitcher 的 fixed inset-0 是下拉菜单的 overlay，非模态对话框
    // 使用 role="presentation" 是正确的（不是 role="dialog"）
    const source = await readFile(
      join(process.cwd(), "src/shared/presentation/ThemeSwitcher.tsx"),
      "utf-8",
    );
    expect(source).toMatch(/fixed inset-0/);
    expect(source).toMatch(/role="presentation"/);
  });

  it("Modal.tsx 源码包含 role='dialog' 和 aria-modal='true'", async () => {
    const source = await readFile(
      join(process.cwd(), "src/shared/presentation/Modal.tsx"),
      "utf-8",
    );
    expect(source).toMatch(/role="dialog"/);
    expect(source).toMatch(/aria-modal="true"/);
  });
});
