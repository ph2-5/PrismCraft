import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";

const { mockInfo, mockToastHelpers, mockT } = vi.hoisted(() => ({
  mockInfo: vi.fn(),
  mockToastHelpers: vi.fn(() => ({ info: mockInfo })),
  // t 默认行为：原样返回 key（便于断言）
  mockT: vi.fn((key: string) => key),
}));

vi.mock("@/shared/presentation/Toast", () => ({
  useToastHelpers: mockToastHelpers,
}));

vi.mock("@/shared/constants/messages", () => ({
  t: mockT,
}));

import { useGlobalKeyboardActions } from "../use-global-keyboard-actions";

describe("useGlobalKeyboardActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // 清理可能残留的事件监听器
    document.removeEventListener("app:save", () => {});
    document.removeEventListener("app:undo", () => {});
    document.removeEventListener("app:redo", () => {});
  });

  it("应订阅 app:save / app:undo / app:redo 三个事件", () => {
    const addSpy = vi.spyOn(document, "addEventListener");
    renderHook(() => useGlobalKeyboardActions());
    const types = addSpy.mock.calls.map((c) => c[0]);
    expect(types).toContain("app:save");
    expect(types).toContain("app:undo");
    expect(types).toContain("app:redo");
    addSpy.mockRestore();
  });

  it("派发 app:save 时应调用 onSave 回调", () => {
    const onSave = vi.fn();
    renderHook(() => useGlobalKeyboardActions({ onSave }));
    document.dispatchEvent(new CustomEvent("app:save"));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("派发 app:undo 且提供了 onUndo 时应调用 onUndo（不显示 toast）", () => {
    const onUndo = vi.fn();
    renderHook(() => useGlobalKeyboardActions({ onUndo }));
    document.dispatchEvent(new CustomEvent("app:undo"));
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(mockInfo).not.toHaveBeenCalled();
  });

  it("派发 app:undo 但未提供 onUndo 时应显示 undoNotSupported toast", () => {
    renderHook(() => useGlobalKeyboardActions({}));
    document.dispatchEvent(new CustomEvent("app:undo"));
    expect(mockInfo).toHaveBeenCalledWith("keyboard.undoNotSupported");
  });

  it("派发 app:redo 但未提供 onRedo 时应显示 redoNotSupported toast", () => {
    renderHook(() => useGlobalKeyboardActions({}));
    document.dispatchEvent(new CustomEvent("app:redo"));
    expect(mockInfo).toHaveBeenCalledWith("keyboard.redoNotSupported");
  });

  it("派发 app:redo 且提供了 onRedo 时应调用 onRedo（不显示 toast）", () => {
    const onRedo = vi.fn();
    renderHook(() => useGlobalKeyboardActions({ onRedo }));
    document.dispatchEvent(new CustomEvent("app:redo"));
    expect(onRedo).toHaveBeenCalledTimes(1);
    expect(mockInfo).not.toHaveBeenCalled();
  });

  it("卸载时应移除所有事件监听器", () => {
    const removeSpy = vi.spyOn(document, "removeEventListener");
    const { unmount } = renderHook(() => useGlobalKeyboardActions({}));
    unmount();
    const removedTypes = removeSpy.mock.calls.map((c) => c[0]);
    expect(removedTypes).toContain("app:save");
    expect(removedTypes).toContain("app:undo");
    expect(removedTypes).toContain("app:redo");
    removeSpy.mockRestore();
  });

  it("options 更新后 onSave 回调应使用最新引用（通过 ref 转发）", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(
      ({ onSave }) => useGlobalKeyboardActions({ onSave }),
      { initialProps: { onSave: first } },
    );
    document.dispatchEvent(new CustomEvent("app:save"));
    expect(first).toHaveBeenCalledTimes(1);

    rerender({ onSave: second });
    document.dispatchEvent(new CustomEvent("app:save"));
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledTimes(1);
  });

  it("未提供任何 options 时调用 app:save 不应抛出", () => {
    renderHook(() => useGlobalKeyboardActions());
    expect(() => document.dispatchEvent(new CustomEvent("app:save"))).not.toThrow();
  });
});
