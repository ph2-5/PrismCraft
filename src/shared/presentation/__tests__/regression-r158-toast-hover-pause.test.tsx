/**
 * R158: Toast Hover Pause MUST Use useRef + useState Pattern (Single Timer, No Double Timing)
 *
 * 回归规则目的：
 *   ToastItem（src/shared/presentation/Toast.tsx）的自动消失计时器必须由单一
 *   useState(paused) + useRef(remainingRef) + useRef(startedAtRef) + useRef(timerRef)
 *   驱动。hover 时暂停计时器并暂停进度条动画；离开后用剩余时间重新调度。
 *   ToastProvider.showToast 不得为同一 toast 注册独立的 setTimeout，避免双重计时器
 *   导致 hover 暂停失效。
 *
 * 历史问题：
 *   早期实现 Provider 端注册了自己的 setTimeout(onClose, duration)，与 ToastItem
 *   内部计时器并存；hover 暂停了 ToastItem 计时器，但 Provider 端计时器照常触发，
 *   导致 toast 在 hover 状态下仍被关闭。
 *
 * 被测代码：
 *   src/shared/presentation/Toast.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, fireEvent } from "@testing-library/react";
import React from "react";

const { mockT } = vi.hoisted(() => ({
  mockT: vi.fn((key: string, params?: Record<string, unknown>) => {
    if (key === "toast.times" && params?.count) return `(${params.count}次)`;
    if (key === "aria.dismissNotification") return "关闭通知";
    return key;
  }),
}));

vi.mock("@/shared/constants/messages", () => ({
  t: mockT,
}));

vi.mock("@/shared/utils/toast-bridge", () => ({
  TOAST_EVENT: "app:toast",
  emitToast: vi.fn(),
}));

vi.mock("lucide-react", () => ({
  X: () => <span data-testid="icon-x">×</span>,
  CheckCircle: () => <span data-testid="icon-check">✓</span>,
  AlertCircle: () => <span data-testid="icon-alert">!</span>,
  Info: () => <span data-testid="icon-info">i</span>,
  AlertTriangle: () => <span data-testid="icon-warn">⚠</span>,
}));

import { ToastProvider, useToast } from "../Toast";

function ToastTrigger({ type, title, message, duration }: { type: "success" | "error" | "warning" | "info"; title: string; message?: string; duration?: number }) {
  const { showToast } = useToast();
  React.useEffect(() => {
    showToast({ type, title, message, duration });
  }, [type, title, message, duration, showToast]);
  return null;
}

describe("R158: Toast hover 暂停必须用 useRef + useState 单计时器模式", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("默认状态下进度条 animationPlayState 为 running", () => {
    render(
      <ToastProvider>
        <ToastTrigger type="success" title="保存成功" message="ok" duration={3000} />
      </ToastProvider>,
    );

    act(() => { vi.advanceTimersByTime(0); });

    const progressBar = document.querySelector("[style*='toast-progress']") as HTMLElement;
    expect(progressBar).not.toBeNull();
    expect(progressBar.style.animationPlayState).toBe("running");
  });

  it("hover 时进度条 animationPlayState 切换为 paused", () => {
    render(
      <ToastProvider>
        <ToastTrigger type="info" title="提示" message="hi" duration={4000} />
      </ToastProvider>,
    );

    act(() => { vi.advanceTimersByTime(0); });

    const toastCard = document.querySelector("[class*='rounded-xl']") as HTMLElement;
    expect(toastCard).not.toBeNull();

    act(() => {
      fireEvent.mouseEnter(toastCard);
    });

    const progressBar = document.querySelector("[style*='toast-progress']") as HTMLElement;
    expect(progressBar.style.animationPlayState).toBe("paused");
  });

  it("hover 期间 advanceTimersByTime 超过 duration 不触发 onClose（计时器暂停）", () => {
    // 直接通过 ToastItem 的 onClose 行为来验证：观察 toast 是否消失
    const { container } = render(
      <ToastProvider>
        <ToastTrigger type="warning" title="警告" duration={2000} />
      </ToastProvider>,
    );

    act(() => { vi.advanceTimersByTime(0); });

    expect(container.querySelectorAll("[class*='rounded-xl']").length).toBe(1);

    const toastCard = container.querySelector("[class*='rounded-xl']") as HTMLElement;
    act(() => {
      fireEvent.mouseEnter(toastCard);
    });

    // hover 期间推进 5s（duration=2s）—— 不应消失
    act(() => { vi.advanceTimersByTime(5000); });

    expect(container.querySelectorAll("[class*='rounded-xl']").length).toBe(1);
  });

  it("hover 后离开，剩余时间到达后才触发 onClose", () => {
    const { container } = render(
      <ToastProvider>
        <ToastTrigger type="error" title="失败" message="no" duration={3000} />
      </ToastProvider>,
    );

    act(() => { vi.advanceTimersByTime(0); });

    const toastCard = container.querySelector("[class*='rounded-xl']") as HTMLElement;

    // hover 推进 1s（paused 不消耗，剩余仍 3s）
    act(() => {
      fireEvent.mouseEnter(toastCard);
    });
    act(() => { vi.advanceTimersByTime(1000); });

    // 离开后只推进 1s —— 不应消失（消耗 1s，剩余 2s）
    act(() => {
      fireEvent.mouseLeave(toastCard);
    });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(container.querySelectorAll("[class*='rounded-xl']").length).toBe(1);

    // 再推进 2s（累计消耗 3s，达到 duration）—— 应进入 exiting 状态
    act(() => { vi.advanceTimersByTime(2000); });
    const exitingToasts = container.querySelectorAll(".opacity-0");
    expect(exitingToasts.length).toBeGreaterThanOrEqual(1);

    // 再推进 500ms（exit transition）→ toast 从 DOM 移除
    act(() => { vi.advanceTimersByTime(500); });
    expect(container.querySelectorAll("[class*='rounded-xl']").length).toBe(0);
  });

  it("未 hover 时按 duration 自动消失", () => {
    const { container } = render(
      <ToastProvider>
        <ToastTrigger type="success" title="成功" duration={2000} />
      </ToastProvider>,
    );

    act(() => { vi.advanceTimersByTime(0); });
    expect(container.querySelectorAll("[class*='rounded-xl']").length).toBe(1);

    act(() => { vi.advanceTimersByTime(1999); });
    // duration 未到，toast 仍在
    expect(container.querySelectorAll("[class*='rounded-xl']").length).toBe(1);

    act(() => { vi.advanceTimersByTime(2); });
    // duration 到 → onClose 被调用 → toast 进入 exiting 状态（仍有 opacity-0 类）
    const exitingToasts = container.querySelectorAll(".opacity-0");
    expect(exitingToasts.length).toBeGreaterThanOrEqual(1);

    // 再推进 400ms（exit transition）→ toast 从 DOM 移除
    act(() => { vi.advanceTimersByTime(500); });
    expect(container.querySelectorAll("[class*='rounded-xl']").length).toBe(0);
  });

  it("ToastProvider.showToast 不应为同一 toast 注册独立的 setTimeout", () => {
    // 通过 spy window.setTimeout 观察：showToast 调用后，
    // 不应再有针对 onClose 的额外 setTimeout（ToastItem 内部的除外）。
    // 这里我们验证：render ToastProvider + showToast 后，
    // ToastItem 的 effect 是唯一注册 onClose 的地方。
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");

    render(
      <ToastProvider>
        <ToastTrigger type="info" title="测试" duration={5000} />
      </ToastProvider>,
    );

    act(() => { vi.advanceTimersByTime(0); });

    // ToastItem 内部应有 setTimeout（onClose 调度）
    // 但 ToastProvider.showToast 不应再注册针对同一 toast 的 setTimeout
    // 我们检查：所有 setTimeout 调用中，duration 为 5000 的至多一个
    // （即 ToastItem 的那个），不应有两个 5000ms 的并行计时器
    const callsWithDuration5000 = setTimeoutSpy.mock.calls.filter(
      ([, delay]) => delay === 5000,
    );
    expect(callsWithDuration5000.length).toBeLessThanOrEqual(1);

    setTimeoutSpy.mockRestore();
  });

  it("duration=0 时不应自动消失（用于持久 toast）", () => {
    const { container } = render(
      <ToastProvider>
        <ToastTrigger type="info" title="持久" duration={0} />
      </ToastProvider>,
    );

    act(() => { vi.advanceTimersByTime(0); });
    expect(container.querySelectorAll("[class*='rounded-xl']").length).toBe(1);

    act(() => { vi.advanceTimersByTime(60000); });
    expect(container.querySelectorAll("[class*='rounded-xl']").length).toBe(1);
  });

  it("多次 hover/leave 切换不丢失剩余时间", () => {
    const { container } = render(
      <ToastProvider>
        <ToastTrigger type="success" title="测试" duration={3000} />
      </ToastProvider>,
    );

    act(() => { vi.advanceTimersByTime(0); });
    const toastCard = container.querySelector("[class*='rounded-xl']") as HTMLElement;

    // 每轮：hover 500ms（暂停不消耗），leave，再推进 500ms（消耗 500ms）
    // 3 轮后累计消耗 1500ms，剩余 1500ms
    for (let i = 0; i < 3; i++) {
      act(() => { fireEvent.mouseEnter(toastCard); });
      act(() => { vi.advanceTimersByTime(500); });
      act(() => { fireEvent.mouseLeave(toastCard); });
      act(() => { vi.advanceTimersByTime(500); });
    }

    // 累计消耗 1500ms，剩余 1500ms —— 推进 1400ms 不应消失
    act(() => { vi.advanceTimersByTime(1400); });
    expect(container.querySelectorAll("[class*='rounded-xl']").length).toBe(1);

    // 再推进 200ms（达到剩余 1500ms）—— duration 到 → onClose 被调用 → toast 进入 exiting 状态
    act(() => { vi.advanceTimersByTime(200); });
    const exitingToasts = container.querySelectorAll(".opacity-0");
    expect(exitingToasts.length).toBeGreaterThanOrEqual(1);

    // 再推进 500ms（exit transition）→ toast 从 DOM 移除
    act(() => { vi.advanceTimersByTime(500); });
    expect(container.querySelectorAll("[class*='rounded-xl']").length).toBe(0);
  });

  it("Toast 源码包含 paused/remainingRef/startedAtRef/timerRef 关键状态", () => {
    // 行为级断言：通过 hover 时的 animationPlayState 切换验证 paused state 存在
    render(
      <ToastProvider>
        <ToastTrigger type="info" title="key" duration={1000} />
      </ToastProvider>,
    );

    act(() => { vi.advanceTimersByTime(0); });

    const toastCard = document.querySelector("[class*='rounded-xl']") as HTMLElement;
    const progressBar = document.querySelector("[style*='toast-progress']") as HTMLElement;

    // 初始 running
    expect(progressBar.style.animationPlayState).toBe("running");

    // hover → paused
    act(() => { fireEvent.mouseEnter(toastCard); });
    expect(progressBar.style.animationPlayState).toBe("paused");

    // leave → running
    act(() => { fireEvent.mouseLeave(toastCard); });
    expect(progressBar.style.animationPlayState).toBe("running");
  });
});
