/**
 * R131: PageErrorBoundary errorCount 必须在多次错误后正确累加
 *
 * 回归规则目的：
 *   src/shared/presentation/PageErrorBoundary.tsx 中的 getDerivedStateFromError
 *   必须只接受单参数 (error)，不能依赖 React 不会传入的第二参数 (prev)。
 *   errorCount 的累加必须在 componentDidCatch 中通过 this.setState((prev) => ...)
 *   完成，不能在 getDerivedStateFromError 中累加。
 *
 * 历史问题：
 *   原实现 `getDerivedStateFromError(error, prev)` 接受两个参数，但 React 只
 *   传入 error，导致 errorCount 永不累加，canRetry 永远为 true。
 *
 * 被测代码：
 *   src/shared/presentation/PageErrorBoundary.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React, { Component, type ReactNode } from "react";

const { mockT, mockErrorLogger } = vi.hoisted(() => ({
  mockT: vi.fn((key: string) => key),
  mockErrorLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("@/shared/constants/messages", () => ({
  t: mockT,
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: mockErrorLogger,
}));

vi.mock("lucide-react", () => ({
  AlertCircle: () => <span data-testid="icon-alert" />,
  RefreshCw: () => <span data-testid="icon-refresh" />,
}));

import { PageErrorBoundary } from "../PageErrorBoundary";

/**
 * 子组件：根据 prop 控制是否抛错
 * - throwKey 变化时，组件重新渲染并抛出对应错误
 * - 用于触发 ErrorBoundary 的 getDerivedStateFromError + componentDidCatch
 */
interface ThrowingChildProps {
  throwKey: string;
  shouldThrow: boolean;
}

class ThrowingChild extends Component<ThrowingChildProps> {
  render(): ReactNode {
    if (this.props.shouldThrow) {
      throw new Error(`boom-${this.props.throwKey}`);
    }
    return <div data-testid="child-ok">ok-{this.props.throwKey}</div>;
  }
}

describe("R131: PageErrorBoundary errorCount 必须正确累加", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    // React 19 在渲染错误边界捕获错误时会打印到 console.error，干扰测试输出
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("getDerivedStateFromError 应只接受单参数（length === 1）", () => {
    // React 调用签名: getDerivedStateFromError(error)
    // 如果函数接受第二参数 prev，会被误认为可以读取上次 state，但 React 不会传入
    expect(PageErrorBoundary.getDerivedStateFromError.length).toBe(1);
  });

  it("getDerivedStateFromError 返回值不应包含 errorCount（避免覆盖）", () => {
    const result = PageErrorBoundary.getDerivedStateFromError(new Error("e1"));
    // GOOD 实现：只返回 hasError 和 error，errorCount 由 componentDidCatch 累加
    expect(result).not.toHaveProperty("errorCount");
    expect(result).toHaveProperty("hasError", true);
    expect(result).toHaveProperty("error");
  });

  it("多次错误后 errorCount 正确累加（通过实例状态验证）", () => {
    // 通过 ref 直接读取 boundary 实例的 state，避免依赖 UI 间接推断
    const boundaryRef = React.createRef<PageErrorBoundary>();

    // 第一次抛错
    const { rerender } = render(
      <PageErrorBoundary ref={boundaryRef}>
        <ThrowingChild throwKey="first" shouldThrow={true} />
      </PageErrorBoundary>,
    );

    // 第一次错误后：errorCount 应为 1
    expect(boundaryRef.current!.state.hasError).toBe(true);
    expect(boundaryRef.current!.state.errorCount).toBe(1);
    expect(boundaryRef.current!.state.error?.message).toBe("boom-first");

    // 关键：先将 prop 改为 shouldThrow=false（此时 boundary 仍显示错误 UI，不渲染子组件）
    // 然后再点击 retry，避免 retry 触发的 re-render 中子组件再次抛错
    rerender(
      <PageErrorBoundary ref={boundaryRef}>
        <ThrowingChild throwKey="first" shouldThrow={false} />
      </PageErrorBoundary>,
    );
    // 此时 hasError 仍为 true（boundary 没有理由重新渲染子组件）
    expect(boundaryRef.current!.state.hasError).toBe(true);

    // 点击 retry -> setState({hasError: false}) -> re-render -> 子组件不抛错 -> hasError 保持 false
    const retryButton = screen.getByRole("button", { name: "common.retry" });
    fireEvent.click(retryButton);

    // 此时 hasError=false，errorCount 仍为 1（保留计数）
    expect(boundaryRef.current!.state.hasError).toBe(false);
    expect(boundaryRef.current!.state.errorCount).toBe(1);

    // 第二次抛错：重渲染为抛错的子组件（新 throwKey）
    rerender(
      <PageErrorBoundary ref={boundaryRef}>
        <ThrowingChild throwKey="second" shouldThrow={true} />
      </PageErrorBoundary>,
    );

    expect(boundaryRef.current!.state.hasError).toBe(true);
    expect(boundaryRef.current!.state.errorCount).toBe(2);
    expect(boundaryRef.current!.state.error?.message).toBe("boom-second");

    // 再次切换 prop 到不抛错，然后点击 retry
    rerender(
      <PageErrorBoundary ref={boundaryRef}>
        <ThrowingChild throwKey="second" shouldThrow={false} />
      </PageErrorBoundary>,
    );
    const retryButton2 = screen.getByRole("button", { name: "common.retry" });
    fireEvent.click(retryButton2);
    expect(boundaryRef.current!.state.hasError).toBe(false);
    expect(boundaryRef.current!.state.errorCount).toBe(2);

    // 第三次抛错
    rerender(
      <PageErrorBoundary ref={boundaryRef}>
        <ThrowingChild throwKey="third" shouldThrow={true} />
      </PageErrorBoundary>,
    );

    expect(boundaryRef.current!.state.hasError).toBe(true);
    expect(boundaryRef.current!.state.errorCount).toBe(3);
    expect(boundaryRef.current!.state.error?.message).toBe("boom-third");
  });

  it("errorCount 达到 MAX_RETRY_ATTEMPTS 后 canRetry 为 false（不再显示重试按钮）", () => {
    const boundaryRef = React.createRef<PageErrorBoundary>();

    const { rerender } = render(
      <PageErrorBoundary ref={boundaryRef}>
        <ThrowingChild throwKey="err1" shouldThrow={true} />
      </PageErrorBoundary>,
    );

    // 第一次错误：errorCount=1，可以重试
    expect(boundaryRef.current!.state.errorCount).toBe(1);
    expect(screen.getByRole("button", { name: "common.retry" })).toBeInTheDocument();

    // 切换 prop 到不抛错，然后点击 retry
    rerender(
      <PageErrorBoundary ref={boundaryRef}>
        <ThrowingChild throwKey="err1" shouldThrow={false} />
      </PageErrorBoundary>,
    );
    fireEvent.click(screen.getByRole("button", { name: "common.retry" }));

    // 第二次错误
    rerender(
      <PageErrorBoundary ref={boundaryRef}>
        <ThrowingChild throwKey="err2" shouldThrow={true} />
      </PageErrorBoundary>,
    );
    expect(boundaryRef.current!.state.errorCount).toBe(2);
    expect(screen.getByRole("button", { name: "common.retry" })).toBeInTheDocument();

    rerender(
      <PageErrorBoundary ref={boundaryRef}>
        <ThrowingChild throwKey="err2" shouldThrow={false} />
      </PageErrorBoundary>,
    );
    fireEvent.click(screen.getByRole("button", { name: "common.retry" }));

    // 第三次错误：errorCount=3，达到 MAX_RETRY_ATTEMPTS
    rerender(
      <PageErrorBoundary ref={boundaryRef}>
        <ThrowingChild throwKey="err3" shouldThrow={true} />
      </PageErrorBoundary>,
    );
    expect(boundaryRef.current!.state.errorCount).toBe(3);

    // canRetry 应为 false，因此不再显示 "common.retry" 按钮
    // 只显示 "error.refreshPage" 按钮
    expect(screen.queryByRole("button", { name: "common.retry" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "error.refreshPage" })).toBeInTheDocument();
  });

  it("componentDidCatch 应被调用并累加 errorCount（验证调用次数）", () => {
    const boundaryRef = React.createRef<PageErrorBoundary>();
    const componentDidCatchSpy = vi.spyOn(
      PageErrorBoundary.prototype,
      "componentDidCatch",
    );

    render(
      <PageErrorBoundary ref={boundaryRef}>
        <ThrowingChild throwKey="once" shouldThrow={true} />
      </PageErrorBoundary>,
    );

    expect(componentDidCatchSpy).toHaveBeenCalledTimes(1);
    expect(boundaryRef.current!.state.errorCount).toBe(1);

    componentDidCatchSpy.mockRestore();
  });
});
