import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertCircle, RefreshCw, RotateCcw, Copy, ChevronDown, ChevronRight, WifiOff, Loader, Bug } from "lucide-react";
import { logger } from "@/config/constants";
import { errorLogger } from "@/shared/error-logger";
import { confirm } from "@/shared/utils/confirm";
import { classifyErrorSeverity, type ErrorSeverity } from "@/shared/utils/error-classifier";
import { t } from "@/shared/constants";

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
          label: t("errorBoundary.loadingLabel"),
          icon: Loader,
          hint: t("errorBoundary.loadingHint"),
          color: "text-warning",
          bg: "bg-warning/10",
        };
      case "network":
        return {
          label: t("errorBoundary.networkLabel"),
          icon: WifiOff,
          hint: t("errorBoundary.networkHint"),
          color: "text-primary",
          bg: "bg-primary/10",
        };
      default:
        return {
          label: t("errorBoundary.appLabel"),
          icon: Bug,
          hint: t("errorBoundary.appHint"),
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
    if (!(await confirm(t("errorBoundary.resetConfirm"), t("errorBoundary.resetConfirmTitle")))) {
      return;
    }
    try {
      localStorage.removeItem("ai-animation-last-session");
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const key = sessionStorage.key(i);
        if (key?.startsWith("ai-animation-")) {
          sessionStorage.removeItem(key);
        }
      }
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
          <div className="card max-w-lg w-full" style={{ padding: 16 }}>
            <div style={{ paddingBottom: 12 }}>
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="w-6 h-6" />
                <div style={{ fontSize: 16, fontWeight: 600 }}>{t("errorBoundary.title")}</div>
              </div>
              <div style={{ fontSize: 12, color: "var(--muted-fg)" }}>
                {t("errorBoundary.description")}
              </div>
            </div>
            <div className="space-y-4">
              <div className={`p-4 rounded-lg text-sm ${config.bg}`}>
                <div className="flex items-center gap-2 mb-2">
                  <SeverityIcon className={`w-4 h-4 ${config.color}`} />
                  <span className={`font-medium ${config.color}`}>
                    {config.label}
                  </span>
                </div>
                <p className="font-medium text-destructive">
                  {this.state.error?.message || t("error.unknown")}
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {config.hint}
                </p>
                {this.state.errorCount > 1 && (
                  <p className="text-muted-foreground mt-1">
                    {t("errorBoundary.errorCount", { count: this.state.errorCount })}
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
                    {t("errorBoundary.componentStack")}
                  </button>
                  {this.state.stackExpanded && (
                    <pre className="px-4 py-3 text-xs text-muted-foreground bg-muted overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap">
                      {this.state.errorInfo.componentStack}
                    </pre>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <button
                  type="button"
                  onClick={this.handleRetry}
                  className="btn btn-outline w-full"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  {this.state.errorCount < 3 ? t("common.retry") : t("errorBoundary.tryAgain")}
                </button>
                {this.state.errorCount >= 3 && (
                  <p className="text-sm text-muted-foreground text-center">
                    {t("errorBoundary.multipleErrorsHint")}
                  </p>
                )}

                <button type="button" onClick={this.handleReload} className="btn btn-primary w-full">
                  <RotateCcw className="w-4 h-4 mr-2" />
                  {t("errorBoundary.reloadPage")}
                </button>

                <button
                  type="button"
                  onClick={this.handleCopyError}
                  className="btn btn-outline w-full"
                >
                  <Copy className="w-4 h-4 mr-2" />
                  {this.state.copied ? t("errorBoundary.copied") : t("errorBoundary.copyErrorDetail")}
                </button>

                <button
                  type="button"
                  onClick={this.handleReset}
                  className="btn btn-danger w-full"
                >
                  {t("errorBoundary.resetAndRecover")}
                </button>
              </div>

              <p className="text-xs text-muted-foreground text-center">
                {t("errorBoundary.persistentHint")}
              </p>
            </div>
          </div>
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
  const [refreshing, setRefreshing] = React.useState(false);

  React.useEffect(() => {
    loadLogs().then((allLogs) => {
      setLogs(allLogs);
    }).catch((e) => {
      errorLogger.warn("[ErrorBoundary] 加载错误日志失败", e);
    });
  }, [loadLogs]);

  const handleRefreshLogs = async () => {
    setRefreshing(true);
    try {
      const allLogs = await loadLogs();
      setLogs(allLogs);
    } catch (e) {
      errorLogger.warn("[ErrorBoundary] 刷新错误日志失败", e);
    } finally {
      setRefreshing(false);
    }
  };

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
      <div className="card" style={{ padding: 16 }}>
        <div style={{ paddingBottom: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>{t("errorBoundary.errorLog")}</div>
          <div style={{ fontSize: 12, color: "var(--muted-fg)" }}>{t("errorBoundary.noErrorRecords")}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ paddingBottom: 12 }}>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2" style={{ fontSize: 16, fontWeight: 600 }}>
              <AlertCircle className="w-5 h-5 text-destructive" />
              {t("errorBoundary.errorLog")}
            </div>
            <div style={{ fontSize: 12, color: "var(--muted-fg)" }}>{t("errorBoundary.recentErrorCount", { count: logs.length })}</div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="btn btn-outline btn-sm" onClick={handleRefreshLogs} disabled={refreshing}>
              <RefreshCw className={`w-4 h-4 mr-1 ${refreshing ? "animate-spin" : ""}`} />
              {t("errorBoundary.refreshLogs")}
            </button>
            <button type="button" className="btn btn-outline btn-sm" onClick={handleClearLogs}>
              {t("errorBoundary.clearLogs")}
            </button>
          </div>
        </div>
      </div>
      <div>
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
      </div>
    </div>
  );
}
