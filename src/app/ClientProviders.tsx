"use client";

import { type ReactNode } from "react";
import { ErrorBoundary } from "@/shared/presentation/ErrorBoundary";
import { CrashRecoveryDialog } from "@/shared/presentation/CrashRecoveryDialog";
import { container } from "@/infrastructure/di";
import { errorLogger } from "@/shared/error-logger";

export function ClientProviders({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary
      onErrorLog={async (error, errorInfo) => {
        try {
          await container.errorLogStorage.addErrorLog({
            message: error.message,
            stack: error.stack || undefined,
            component: errorInfo.componentStack || undefined,
            timestamp: Date.now(),
          });
          await container.errorLogStorage.deleteOldErrorLogs(50);
        } catch (e) {
          errorLogger.warn("[ErrorBoundary] Failed to save error log", e);
        }
      }}
    >
      {children}
      <CrashRecoveryDialog
        loadAutoSaves={() => container.autoSaveStorage.getAutoSaves()}
        deleteAutoSave={(id) =>
          container.autoSaveStorage.deleteAutoSave?.(id) ?? Promise.resolve()
        }
      />
    </ErrorBoundary>
  );
}
