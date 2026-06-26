/**
 * R164: Modal MUST Focus Its Container on Open (tabIndex={-1}) for Screen Readers
 *
 * 回归规则目的：
 *   Modal（src/shared/presentation/Modal.tsx）在 open=false→true 切换时必须
 *   调用 modalRef.current?.focus()，使对话框容器获得键盘焦点。容器必须有
 *   tabIndex={-1}（普通 div 不可编程聚焦）。这是 WAI-ARIA 对屏幕阅读器用户
 *   的要求：没有容器焦点，SR 停留在触发元素，模态内容不会被朗读。
 *
 * 被测代码：
 *   src/shared/presentation/Modal.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { readFile } from "fs/promises";
import { join } from "path";
import { Modal } from "../Modal";

describe("R164: Modal 打开时必须聚焦容器（tabIndex={-1}）", () => {
  let addEventListenerSpy: ReturnType<typeof vi.spyOn>;
  let removeEventListenerSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    addEventListenerSpy = vi.spyOn(window, "addEventListener");
    removeEventListenerSpy = vi.spyOn(window, "removeEventListener");
  });

  afterEach(() => {
    addEventListenerSpy.mockRestore();
    removeEventListenerSpy.mockRestore();
  });

  it("容器元素 tabIndex=-1（可编程聚焦）", () => {
    render(
      <Modal open={true} onClose={vi.fn()} ariaLabel="对话框">
        <div>内容</div>
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("tabindex")).toBe("-1");
  });

  it("open=true 时容器获得 document.activeElement 焦点", () => {
    render(
      <Modal open={true} onClose={vi.fn()} ariaLabel="对话框">
        <div>内容</div>
      </Modal>,
    );
    const dialog = screen.getByRole("dialog") as HTMLElement;
    // 等待 effect 运行（同步 effect 在 render 后立即执行）
    expect(document.activeElement).toBe(dialog);
  });

  it("open=false→true 切换后焦点移动到容器", () => {
    const { rerender } = render(
      <Modal open={false} onClose={vi.fn()} ariaLabel="对话框">
        <div>内容</div>
      </Modal>,
    );
    // 初始 activeElement 不是 dialog（dialog 不存在）
    expect(screen.queryByRole("dialog")).toBeNull();

    rerender(
      <Modal open={true} onClose={vi.fn()} ariaLabel="对话框">
        <div>内容</div>
      </Modal>,
    );

    const dialog = screen.getByRole("dialog") as HTMLElement;
    expect(document.activeElement).toBe(dialog);
  });

  it("open=true 时注册 keydown 监听器（用于 Escape）", () => {
    render(
      <Modal open={true} onClose={vi.fn()} ariaLabel="对话框">
        <div>内容</div>
      </Modal>,
    );
    // 验证有 keydown 事件被注册
    const keydownRegistrations = addEventListenerSpy.mock.calls.filter(
      (call: unknown[]) => call[0] === "keydown",
    );
    expect(keydownRegistrations.length).toBeGreaterThanOrEqual(1);
  });

  it("open=false 时不注册 keydown 监听器", () => {
    render(
      <Modal open={false} onClose={vi.fn()} ariaLabel="对话框">
        <div>内容</div>
      </Modal>,
    );
    const keydownRegistrations = addEventListenerSpy.mock.calls.filter(
      (call: unknown[]) => call[0] === "keydown",
    );
    expect(keydownRegistrations.length).toBe(0);
  });

  it("Escape 键触发 onClose", () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose} ariaLabel="对话框">
        <div>内容</div>
      </Modal>,
    );
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closeOnEscape=false 时不响应 Escape", () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose} closeOnEscape={false} ariaLabel="对话框">
        <div>内容</div>
      </Modal>,
    );
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("unmount 时移除 keydown 监听器（无泄漏）", () => {
    const { unmount } = render(
      <Modal open={true} onClose={vi.fn()} ariaLabel="对话框">
        <div>内容</div>
      </Modal>,
    );
    const registeredBefore = addEventListenerSpy.mock.calls.filter(
      (call: unknown[]) => call[0] === "keydown",
    ).length;
    expect(registeredBefore).toBeGreaterThanOrEqual(1);

    unmount();

    const removed = removeEventListenerSpy.mock.calls.filter(
      (call: unknown[]) => call[0] === "keydown",
    ).length;
    expect(removed).toBeGreaterThanOrEqual(1);
  });

  it("Modal.tsx 源码包含 modalRef.current?.focus() 调用", async () => {
    const source = await readFile(
      join(process.cwd(), "src/shared/presentation/Modal.tsx"),
      "utf-8",
    );
    expect(source).toMatch(/modalRef\.current\?\.focus\(\)/);
  });

  it("Modal.tsx 源码容器 JSX 包含 tabIndex={-1}", async () => {
    const source = await readFile(
      join(process.cwd(), "src/shared/presentation/Modal.tsx"),
      "utf-8",
    );
    expect(source).toMatch(/tabIndex=\{-1\}/);
  });
});
