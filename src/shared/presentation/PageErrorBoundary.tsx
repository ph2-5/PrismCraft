import { Component, type ErrorInfo, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { errorLogger } from "@/shared/error-logger";
import { t } from "@/shared/constants/messages";
import { ErrorState } from "@/shared/presentation/ErrorState";

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

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState((prev) => ({ errorCount: prev.errorCount + 1 }));
    errorLogger.error(`[PageErrorBoundary${this.props.pageName ? `:${this.props.pageName}` : ""}]`, { error, errorInfo });
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      const canRetry = this.state.errorCount < MAX_RETRY_ATTEMPTS;
      const title = this.props.pageName
        ? t("error.pageProblemWith", { pageName: this.props.pageName })
        : t("error.pageProblem");
      const description = this.state.error?.message || t("error.unexpectedError");

      if (!canRetry) {
        return (
          <div className="flex flex-col items-center justify-center min-h-[400px] p-8">
            <ErrorState
              severity="generic"
              title={title}
              description={description}
              hint={t("error.retryRepeatedShort")}
              action={
                <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
                  {t("error.refreshPage")}
                </button>
              }
            />
          </div>
        );
      }

      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-8">
          <ErrorState
            severity="generic"
            title={title}
            description={description}
            action={
              <div className="flex gap-3">
                <button type="button" className="btn btn-outline" onClick={this.handleRetry}>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  {t("common.retry")}
                </button>
                <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
                  {t("error.refreshPage")}
                </button>
              </div>
            }
          />
        </div>
      );
    }

    return this.props.children;
  }
}
