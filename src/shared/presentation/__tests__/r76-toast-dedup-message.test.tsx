import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import React from "react";

const { mockT } = vi.hoisted(() => ({
  mockT: vi.fn((key: string, params?: Record<string, unknown>) => {
    if (key === "toast.times" && params?.count) return `(${params.count}次)`;
    const map: Record<string, string> = {
      "toast.times": "(多次)",
    };
    return map[key] ?? key;
  }),
}));

vi.mock("@/shared/constants/messages", () => ({
  t: mockT,
}));

vi.mock("@/shared/utils/toast-bridge", () => ({
  TOAST_EVENT: "app:toast",
  emitToast: vi.fn(),
}));

vi.mock("@/shared/ui/button", () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
}));

vi.mock("lucide-react", () => ({
  X: () => <span>×</span>,
  CheckCircle: () => <span>✓</span>,
  AlertCircle: () => <span>!</span>,
  Info: () => <span>i</span>,
  AlertTriangle: () => <span>⚠</span>,
}));

import { ToastProvider, useToast } from "../Toast";

function ToastTestHelper({ toasts }: { toasts: Array<{ type: "success" | "error" | "warning" | "info"; title: string; message?: string }> }) {
  const { showToast } = useToast();

  React.useEffect(() => {
    toasts.forEach((toast) => {
      showToast({ type: toast.type, title: toast.title, message: toast.message });
    });
  }, [toasts, showToast]);

  return null;
}

describe("R76: Toast deduplication must include message content", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("two toasts with same type+title but different messages are shown separately", () => {
    render(
      <ToastProvider>
        <ToastTestHelper
          toasts={[
            { type: "error", title: "保存失败", message: "网络错误" },
            { type: "error", title: "保存失败", message: "磁盘空间不足" },
          ]}
        />
      </ToastProvider>,
    );

    act(() => { vi.advanceTimersByTime(0); });

    const toastItems = screen.getAllByRole("status")[0]!.children;
    expect(toastItems.length).toBeGreaterThanOrEqual(2);
  });

  it("two toasts with same type+title+message are merged (count incremented)", () => {
    render(
      <ToastProvider>
        <ToastTestHelper
          toasts={[
            { type: "success", title: "保存成功", message: "数据已保存" },
            { type: "success", title: "保存成功", message: "数据已保存" },
          ]}
        />
      </ToastProvider>,
    );

    act(() => { vi.advanceTimersByTime(0); });

    const statusContainer = screen.getAllByRole("status")[0]!;
    const toastItems = statusContainer.children;
    expect(toastItems.length).toBe(1);

    expect(statusContainer.textContent).toContain("2");
  });

  it("dedup window (2s) still applies", () => {
    const { rerender } = render(
      <ToastProvider>
        <ToastTestHelper
          toasts={[
            { type: "info", title: "提示", message: "相同消息" },
          ]}
        />
      </ToastProvider>,
    );

    act(() => { vi.advanceTimersByTime(0); });

    const statusContainer = screen.getAllByRole("status")[0]!;
    expect(statusContainer.children.length).toBe(1);

    act(() => { vi.advanceTimersByTime(1000); });

    rerender(
      <ToastProvider>
        <ToastTestHelper
          toasts={[
            { type: "info", title: "提示", message: "相同消息" },
          ]}
        />
      </ToastProvider>,
    );

    act(() => { vi.advanceTimersByTime(0); });

    const updatedContainer = screen.getAllByRole("status")[0]!;
    const allToasts = updatedContainer.querySelectorAll("[class*='rounded-xl']");
    expect(allToasts.length).toBe(1);
    expect(updatedContainer.textContent).toContain("2");
  });
});
