import { describe, it, expect, vi } from "vitest";
import { emitToast, TOAST_EVENT } from "../toast-bridge";

describe("toast-bridge", () => {
  it("should dispatch CustomEvent with correct detail", () => {
    const listener = vi.fn();
    window.addEventListener(TOAST_EVENT, listener);
    emitToast("success", "操作成功", "数据已保存");
    expect(listener).toHaveBeenCalledTimes(1);
    const event = listener.mock.calls[0]![0] as CustomEvent;
    expect(event.detail).toEqual({
      type: "success",
      title: "操作成功",
      message: "数据已保存",
    });
    window.removeEventListener(TOAST_EVENT, listener);
  });

  it("should dispatch event for success type", () => {
    const listener = vi.fn();
    window.addEventListener(TOAST_EVENT, listener);
    emitToast("success", "成功");
    const event = listener.mock.calls[0]![0] as CustomEvent;
    expect(event.detail.type).toBe("success");
    window.removeEventListener(TOAST_EVENT, listener);
  });

  it("should dispatch event for error type", () => {
    const listener = vi.fn();
    window.addEventListener(TOAST_EVENT, listener);
    emitToast("error", "失败");
    const event = listener.mock.calls[0]![0] as CustomEvent;
    expect(event.detail.type).toBe("error");
    window.removeEventListener(TOAST_EVENT, listener);
  });

  it("should dispatch event for warning type", () => {
    const listener = vi.fn();
    window.addEventListener(TOAST_EVENT, listener);
    emitToast("warning", "警告");
    const event = listener.mock.calls[0]![0] as CustomEvent;
    expect(event.detail.type).toBe("warning");
    window.removeEventListener(TOAST_EVENT, listener);
  });

  it("should dispatch event for info type", () => {
    const listener = vi.fn();
    window.addEventListener(TOAST_EVENT, listener);
    emitToast("info", "提示");
    const event = listener.mock.calls[0]![0] as CustomEvent;
    expect(event.detail.type).toBe("info");
    window.removeEventListener(TOAST_EVENT, listener);
  });

  it("should dispatch event without message when message is omitted", () => {
    const listener = vi.fn();
    window.addEventListener(TOAST_EVENT, listener);
    emitToast("info", "仅标题");
    const event = listener.mock.calls[0]![0] as CustomEvent;
    expect(event.detail.message).toBeUndefined();
    window.removeEventListener(TOAST_EVENT, listener);
  });

  it("should have correct TOAST_EVENT constant value", () => {
    expect(TOAST_EVENT).toBe("app:toast");
  });

  it("should not dispatch when window is undefined", () => {
    const originalWindow = globalThis.window;
    Object.defineProperty(globalThis, "window", {
      value: undefined,
      writable: true,
      configurable: true,
    });
    expect(() => emitToast("success", "test")).not.toThrow();
    Object.defineProperty(globalThis, "window", {
      value: originalWindow,
      writable: true,
      configurable: true,
    });
  });
});
