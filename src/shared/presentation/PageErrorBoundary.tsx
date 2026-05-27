"use client";

import { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/shared/ui/button";
import { AlertCircle, RefreshCw } from "lucide-react";
import { errorLogger } from "@/shared/error-logger";

interface Props {
  children: ReactNode;
  pageName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorCount: number;
}

const MAX_RETRY_ATTEMPTS = 3;

export class PageErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorCount: 0,
  };

  public static getDerivedStateFromError(error: Error, prev: State): Partial<State> {
    const nextCount = prev.errorCount + 1;
    return { hasError: true, error, errorCount: nextCount };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    errorLogger.error(`[PageErrorBoundary${this.props.pageName ? `:${this.props.pageName}` : ""}]`, { error, errorInfo });
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      const canRetry = this.state.errorCount < MAX_RETRY_ATTEMPTS;
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-8 space-y-4">
          <AlertCircle className="w-12 h-12 text-destructive" />
          <h2 className="text-xl font-semibold">
            {this.props.pageName
              ? `${this.props.pageName}页面遇到了问题`
              : "页面遇到了问题"}
          </h2>
          <p className="text-muted-foreground text-center max-w-md">
            {this.state.error?.message || "发生了意外错误"}
          </p>
          {canRetry ? (
            <div className="flex gap-3">
              <Button variant="outline" onClick={this.handleRetry}>
                <RefreshCw className="w-4 h-4 mr-2" />
                重试
              </Button>
              <Button onClick={() => window.location.reload()}>刷新页面</Button>
            </div>
          ) : (
            <div className="space-y-2 text-center">
              <p className="text-sm text-muted-foreground">
                错误多次重复出现，请尝试刷新页面或重置
              </p>
              <Button onClick={() => window.location.reload()}>刷新页面</Button>
            </div>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
