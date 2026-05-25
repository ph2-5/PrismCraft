export type NetworkErrorCategory = "network" | "timeout" | "offline" | "unknown";

const NETWORK_PATTERNS: Array<{
  category: NetworkErrorCategory;
  codes: string[];
  patterns: RegExp[];
}> = [
  {
    category: "timeout",
    codes: ["ETIMEDOUT", "TIMEOUT", "REQUEST_TIMEOUT", "DEADLINE_EXCEEDED", "ECONNABORTED", "408", "TIMEOUT_ERROR"],
    patterns: [/timeout/i, /timed?\s*out/i, /超时/],
  },
  {
    category: "network",
    codes: ["ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "EAI_AGAIN", "ENETUNREACH", "NET_ERR", "NETWORK_ERROR"],
    patterns: [/network/i, /econnrefused/i, /enotfound/i, /net::err_/i, /Failed to fetch/i, /NetworkError/i, /网络/],
  },
  {
    category: "offline",
    codes: ["OFFLINE"],
    patterns: [],
  },
];

export function classifyNetworkError(errorCode?: string, errorMessage?: string): NetworkErrorCategory {
  if (errorCode) {
    const upper = errorCode.toUpperCase();
    for (const group of NETWORK_PATTERNS) {
      if (group.codes.some((c) => upper.includes(c))) return group.category;
    }
  }
  if (errorMessage) {
    for (const group of NETWORK_PATTERNS) {
      if (group.patterns.some((p) => p.test(errorMessage))) return group.category;
    }
  }
  return "unknown";
}

export function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) {
    const result = classifyNetworkError(undefined, error.message);
    return result === "network" || result === "timeout";
  }
  if (error instanceof Error) {
    const code = (error as unknown as { code?: string }).code;
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
