import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React, { type ReactNode } from "react";

const { mockT, mockConfirm, mockErrorLogger, mockClassifyErrorSeverity } = vi.hoisted(() => ({
  mockT: vi.fn((key: string) => {
    const map: Record<string, string> = {
      "errorBoundary.title": "出错了",
      "errorBoundary.description": "应用发生了错误",
      "errorBoundary.tryAgain": "再试一次",
      "errorBoundary.reloadPage": "重新加载页面",
      "errorBoundary.multipleErrorsHint": "多次出现错误，建议重新加载页面",
      "errorBoundary.resetAndRecover": "重置并恢复",
      "errorBoundary.persistentHint": "如问题持续，请联系支持",
      "errorBoundary.copyErrorDetail": "复制错误详情",
      "errorBoundary.copied": "已复制",
      "errorBoundary.componentStack": "组件堆栈",
      "errorBoundary.errorCount": "已发生 {count} 次错误",
      "errorBoundary.appLabel": "应用错误",
      "errorBoundary.appHint": "应用内部发生了错误",
      "errorBoundary.loadingLabel": "加载错误",
      "errorBoundary.loadingHint": "资源加载失败",
      "errorBoundary.networkLabel": "网络错误",
      "errorBoundary.networkHint": "网络连接出现问题",
      "error.unknown": "未知错误",
      "common.retry": "重试",
    };
    return map[key] ?? key;
  }),
  mockConfirm: vi.fn().mockResolvedValue(true),
  mockErrorLogger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
  mockClassifyErrorSeverity: vi.fn(() => "app"),
}));

vi.mock("@/shared/constants", () => ({
  t: mockT,
}));

vi.mock("@/shared/utils/confirm", () => ({
  confirm: mockConfirm,
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: mockErrorLogger,
}));

vi.mock("@/shared/utils/error-classifier", () => ({
  classifyErrorSeverity: mockClassifyErrorSeverity,
}));

vi.mock("lucide-react", () => ({
  AlertCircle: () => <span data-testid="icon-alert" />,
  RefreshCw: () => <span data-testid="icon-refresh" />,
  RotateCcw: () => <span data-testid="icon-rotate" />,
  Copy: () => <span data-testid="icon-copy" />,
  Bug: () => <span data-testid="icon-bug" />,
  WifiOff: () => <span data-testid="icon-wifi-off" />,
  Loader: () => <span data-testid="icon-loader" />,
}));

import { ErrorBoundary } from "../ErrorBoundary";

describe("R74: Error recovery must not remove retry option based on count", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClassifyErrorSeverity.mockReturnValue("app");
  });

  it("on first error, retry button is visible with '重试' label", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    class TestErrorBoundary extends ErrorBoundary {
      constructor(props: { children: ReactNode }) {
        super(props);
        this.state = {
          hasError: true,
          error: new Error("first error"),
          errorInfo: null,
          errorCount: 1,
          stackExpanded: false,
          copied: false,
        };
      }
    }

    render(
      <TestErrorBoundary>
        <div>child</div>
      </TestErrorBoundary>,
    );

    const retryButton = screen.getByRole("button", { name: /重试/ });
    expect(retryButton).toBeInTheDocument();
    expect(retryButton).not.toBeDisabled();

    consoleError.mockRestore();
  });

  it("after 3+ errors, retry button is still visible with '再试一次' label", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    class TestErrorBoundary extends ErrorBoundary {
      constructor(props: { children: ReactNode }) {
        super(props);
        this.state = {
          hasError: true,
          error: new Error("repeated error"),
          errorInfo: null,
          errorCount: 3,
          stackExpanded: false,
          copied: false,
        };
      }
    }

    render(
      <TestErrorBoundary>
        <div>child</div>
      </TestErrorBoundary>,
    );

    const retryButton = screen.getByRole("button", { name: /再试一次/ });
    expect(retryButton).toBeInTheDocument();
    expect(retryButton).not.toBeDisabled();

    consoleError.mockRestore();
  });

  it("the multiple errors hint text appears after 3+ errors", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    class TestErrorBoundary extends ErrorBoundary {
      constructor(props: { children: ReactNode }) {
        super(props);
        this.state = {
          hasError: true,
          error: new Error("repeated error"),
          errorInfo: null,
          errorCount: 3,
          stackExpanded: false,
          copied: false,
        };
      }
    }

    render(
      <TestErrorBoundary>
        <div>child</div>
      </TestErrorBoundary>,
    );

    expect(screen.getByText("多次出现错误，建议重新加载页面")).toBeInTheDocument();

    consoleError.mockRestore();
  });
});
