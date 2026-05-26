"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/shared/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/shared/ui/card";
import { AlertCircle, RefreshCw, RotateCcw, Copy, ChevronDown, ChevronRight, WifiOff, Loader, Bug } from "lucide-react";
import { logger } from "@/config/constants";
import { errorLogger } from "@/shared/error-logger";
import { confirm } from "@/shared/utils/confirm";
import { classifyErrorSeverity, type ErrorSeverity } from "@/shared/utils/error-classifier";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  onErrorLog?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorCount: number;
  stackExpanded: boolean;
  copied: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  private copyTimerId: ReturnType<typeof setTimeout> | null = null;

  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    errorCount: 0,
    stackExpanded: false,
    copied: false,
  };

  private getErrorSeverity(error: Error | null): ErrorSeverity {
    return classifyErrorSeverity(error);
  }

  private getSeverityConfig(severity: ErrorSeverity) {
    switch (severity) {
      case "loading":
        return {
          label: "加载错误",
          icon: Loader,
          hint: "资源加载失败，请尝试刷新页面",
          color: "text-orange-500",
          bg: "bg-orange-50 dark:bg-orange-950/30",
        };
      case "network":
        return {
          label: "网络错误",
          icon: WifiOff,
          hint: "网络连接异常，请检查网络设置后重试",
          color: "text-blue-500",
          bg: "bg-blue-50 dark:bg-blue-950/30",
        };
      default:
        return {
          label: "应用错误",
          icon: Bug,
          hint: "应用遇到了意外错误",
          color: "text-destructive",
          bg: "bg-muted",
        };
    }
  }

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState((prev) => ({
      error,
      errorInfo,
      errorCount: prev.errorCount + 1,
    }));

    logger.error("[ErrorBoundary] 组件错误:", error);
    logger.error("[ErrorBoundary] 错误详情:", errorInfo);

    if (this.props.onErrorLog) {
      this.props.onErrorLog(error, errorInfo);
    }

    this.props.onError?.(error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  private handleReload = () => {
    window.location.reload();
  };

  private handleReset = async () => {
    if (!(await confirm("重置将清除会话数据，未保存的内容可能丢失。确定要继续吗？", "重置确认"))) {
      return;
    }
    try {
      localStorage.removeItem("ai-animation-last-session");
      sessionStorage.clear();
    } catch (e) {
      errorLogger.warn("[ErrorBoundary] 清除会话数据失败", e instanceof Error ? e.message : e);
    }
    window.location.reload();
  };

  private handleCopyError = () => {
    const errorText = [
      `Error: ${this.state.error?.message || "Unknown"}`,
      `Stack: ${this.state.error?.stack || "N/A"}`,
      `Component Stack: ${this.state.errorInfo?.componentStack || "N/A"}`,
      `Error Count: ${this.state.errorCount}`,
      `Timestamp: ${new Date().toISOString()}`,
    ].join("\n\n");

    const markCopied = () => {
      this.setState({ copied: true });
      if (this.copyTimerId) clearTimeout(this.copyTimerId);
      this.copyTimerId = setTimeout(() => this.setState({ copied: false }), 2000);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(errorText).then(() => {
        markCopied();
      }).catch((err) => {
        errorLogger.warn("[ErrorBoundary] 复制到剪贴板失败", err instanceof Error ? err.message : err);
        this.fallbackCopyToClipboard(errorText, markCopied);
      });
    } else {
      this.fallbackCopyToClipboard(errorText, markCopied);
    }
  };

  private fallbackCopyToClipboard(text: string, onSuccess: () => void): void {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);
    const selection = document.getSelection();
    const range = document.createRange();
    range.selectNodeContents(textarea);
    if (selection) {
      selection.removeAllRanges();
      selection.addRange(range);
    }
    textarea.setSelectionRange(0, text.length);
    let success = false;
    try {
      success = document.execCommand("copy");
    } catch (e) {
      errorLogger.warn("[ErrorBoundary] fallback复制到剪贴板失败", e instanceof Error ? e.message : e);
    }
    if (selection) selection.removeAllRanges();
    document.body.removeChild(textarea);
    if (success) onSuccess();
  }

  componentWillUnmount(): void {
    if (this.copyTimerId) {
      clearTimeout(this.copyTimerId);
      this.copyTimerId = null;
    }
  }

  private toggleStack = () => {
    this.setState((prev) => ({ stackExpanded: !prev.stackExpanded }));
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const severity = this.getErrorSeverity(this.state.error);
      const config = this.getSeverityConfig(severity);
      const SeverityIcon = config.icon;

      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-background">
          <Card className="max-w-lg w-full">
            <CardHeader>
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="w-6 h-6" />
                <CardTitle>出错了</CardTitle>
              </div>
              <CardDescription>
                应用遇到了意外错误，请尝试以下操作
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className={`p-4 rounded-lg text-sm ${config.bg}`}>
                <div className="flex items-center gap-2 mb-2">
                  <SeverityIcon className={`w-4 h-4 ${config.color}`} />
                  <span className={`font-medium ${config.color}`}>
                    {config.label}
                  </span>
                </div>
                <p className="font-medium text-destructive">
                  {this.state.error?.message || "未知错误"}
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {config.hint}
                </p>
                {this.state.errorCount > 1 && (
                  <p className="text-muted-foreground mt-1">
                    该错误已发生 {this.state.errorCount} 次
                  </p>
                )}
              </div>

              {this.state.errorInfo?.componentStack && (
                <div className="border rounded-lg overflow-hidden">
                  <button
                    onClick={this.toggleStack}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
                  >
                    {this.state.stackExpanded ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                    组件堆栈信息
                  </button>
                  {this.state.stackExpanded && (
                    <pre className="px-4 py-3 text-xs text-muted-foreground bg-muted overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap">
                      {this.state.errorInfo.componentStack}
                    </pre>
                  )}
                </div>
              )}

              <div className="space-y-2">
                {this.state.errorCount < 3 ? (
                  <Button
                    onClick={this.handleRetry}
                    className="w-full"
                    variant="outline"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    重试
                  </Button>
                ) : (
                  <p className="text-sm text-muted-foreground text-center">
                    错误多次重复出现，请尝试刷新页面或重置
                  </p>
                )}

                <Button onClick={this.handleReload} className="w-full">
                  <RotateCcw className="w-4 h-4 mr-2" />
                  刷新页面
                </Button>

                <Button
                  onClick={this.handleCopyError}
                  className="w-full"
                  variant="outline"
                >
                  <Copy className="w-4 h-4 mr-2" />
                  {this.state.copied ? "已复制" : "复制错误详情"}
                </Button>

                <Button
                  onClick={this.handleReset}
                  className="w-full"
                  variant="destructive"
                >
                  重置并恢复
                </Button>
              </div>

              <p className="text-xs text-muted-foreground text-center">
                如果问题持续存在，请尝试清除浏览器缓存或重新安装应用
              </p>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

interface ErrorLogViewerProps {
  loadLogs: () => Promise<Array<{ timestamp: number; message: string; component?: string }>>;
  clearLogs: () => Promise<void>;
}

export function ErrorLogViewer({ loadLogs, clearLogs }: ErrorLogViewerProps) {
  const [logs, setLogs] = React.useState<
    Array<{
      timestamp: number;
      message: string;
      component?: string;
    }>
  >([]);

  React.useEffect(() => {
    loadLogs().then((allLogs) => {
      setLogs(allLogs);
    }).catch((e) => {
      errorLogger.warn("[ErrorBoundary] 加载错误日志失败", e);
    });
  }, [loadLogs]);

  const handleClearLogs = async () => {
    setLogs([]);
    try {
      await clearLogs();
    } catch (e) {
      errorLogger.warn("[ErrorBoundary] 清除错误日志失败", e instanceof Error ? e.message : e);
    }
  };

  if (logs.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>错误日志</CardTitle>
          <CardDescription>暂无错误记录</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-destructive" />
              错误日志
            </CardTitle>
            <CardDescription>最近 {logs.length} 条错误记录</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={handleClearLogs}>
            清除日志
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {logs.map((log, index) => (
            <div key={`${log.timestamp}-${index}`} className="p-3 bg-muted rounded-lg text-sm">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{new Date(log.timestamp).toLocaleString()}</span>
                {log.component && (
                  <span className="truncate max-w-[200px]">
                    {log.component}
                  </span>
                )}
              </div>
              <p className="mt-1 text-destructive">{log.message}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
