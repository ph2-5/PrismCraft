import { classifyError } from "@/domain/types";

export type NetworkErrorCategory = "network" | "timeout" | "offline" | "unknown";

function getErrorCode(error: Error): string | undefined {
  return "code" in error && typeof (error as { code?: unknown }).code === "string"
    ? (error as { code: string }).code
    : undefined;
}

export function classifyNetworkError(errorCode?: string, errorMessage?: string): NetworkErrorCategory {
  const category = classifyError(errorCode, errorMessage);
  if (category === "timeout") return "timeout";
  if (category === "network") return "network";
  if (category === "database_busy") return "network";
  return "unknown";
}

export function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) {
    const result = classifyNetworkError(undefined, error.message);
    return result === "network" || result === "timeout";
  }
  if (error instanceof Error) {
    const code = getErrorCode(error);
    const result = classifyNetworkError(code, error.message);
    return result === "network" || result === "timeout";
  }
  return false;
}

export type ErrorSeverity = "loading" | "network" | "app";

export function classifyErrorSeverity(error: Error | null): ErrorSeverity {
  if (!error) return "app";
  if (isNetworkError(error)) return "network";
  const msg = error.message.toLowerCase();
  if (/chunk|loading|module/.test(msg)) return "loading";
  if (/network|fetch|offline/i.test(msg)) return "network";
  return "app";
}
