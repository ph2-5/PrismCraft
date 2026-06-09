export type ErrorDomain =
  | "database"
  | "validation"
  | "api"
  | "network"
  | "storage"
  | "generation"
  | "recovery"
  | "cache"
  | "config"
  | "auth"
  | "state"
  | "system";

export interface ErrorCodeEntry {
  code: string;
  domain: ErrorDomain;
  i18nKey: string;
  retryable: boolean;
}

const ERROR_CODES: ErrorCodeEntry[] = [
  { code: "DATABASE_ERROR", domain: "database", i18nKey: "errorCode.databaseError", retryable: true },
  { code: "VALIDATION_ERROR", domain: "validation", i18nKey: "errorCode.validationError", retryable: false },
  { code: "API_ERROR", domain: "api", i18nKey: "errorCode.apiError", retryable: true },
  { code: "NOT_FOUND", domain: "database", i18nKey: "errorCode.notFound", retryable: false },
  { code: "NETWORK_ERROR", domain: "network", i18nKey: "errorCode.networkError", retryable: true },
  { code: "STORAGE_ERROR", domain: "storage", i18nKey: "errorCode.storageError", retryable: true },
  { code: "CONFIGURATION_ERROR", domain: "config", i18nKey: "errorCode.configurationError", retryable: false },
  { code: "GENERATION_ERROR", domain: "generation", i18nKey: "errorCode.generationError", retryable: true },
  { code: "TIMEOUT_ERROR", domain: "network", i18nKey: "errorCode.timeoutError", retryable: true },
  { code: "RATE_LIMIT_ERROR", domain: "api", i18nKey: "errorCode.rateLimitError", retryable: true },
  { code: "AUTHENTICATION_ERROR", domain: "auth", i18nKey: "errorCode.authenticationError", retryable: false },
  { code: "UNKNOWN_ERROR", domain: "system", i18nKey: "errorCode.unknownError", retryable: false },

  { code: "CLEANUP_ERROR", domain: "system", i18nKey: "errorCode.cleanupError", retryable: true },
  { code: "CACHE_CLEANUP_ERROR", domain: "cache", i18nKey: "errorCode.cacheCleanupError", retryable: true },
  { code: "CACHE_VIDEO_ERROR", domain: "cache", i18nKey: "errorCode.cacheVideoError", retryable: true },
  { code: "CACHE_DB_ERROR", domain: "cache", i18nKey: "errorCode.cacheDbError", retryable: true },
  { code: "REMOVE_TASK_ERROR", domain: "system", i18nKey: "errorCode.removeTaskError", retryable: false },
  { code: "CLEAR_ACTIVE_TASKS_ERROR", domain: "system", i18nKey: "errorCode.clearActiveTasksError", retryable: false },

  { code: "RETRY_NOT_RECOMMENDED", domain: "recovery", i18nKey: "errorCode.retryNotRecommended", retryable: false },
  { code: "DUPLICATE_DETECTED", domain: "recovery", i18nKey: "errorCode.duplicateDetected", retryable: false },
  { code: "HIGH_RISK_RETRY", domain: "recovery", i18nKey: "errorCode.highRiskRetry", retryable: false },
  { code: "INVALID_TRANSITION", domain: "state", i18nKey: "errorCode.invalidTransition", retryable: false },
  { code: "VERIFICATION_FAILED", domain: "recovery", i18nKey: "errorCode.verificationFailed", retryable: true },
  { code: "RECOVERY_INCOMPLETE", domain: "recovery", i18nKey: "errorCode.recoveryIncomplete", retryable: true },
  { code: "RECOVERY_FAILED", domain: "recovery", i18nKey: "errorCode.recoveryFailed", retryable: false },
  { code: "RECOVERY_PENDING", domain: "recovery", i18nKey: "errorCode.recoveryPending", retryable: true },
  { code: "UNKNOWN_STATUS", domain: "recovery", i18nKey: "errorCode.unknownStatus", retryable: true },
  { code: "QUERY_FAILED", domain: "recovery", i18nKey: "errorCode.queryFailed", retryable: true },
  { code: "BACKGROUND_RECOVERY_ERROR", domain: "recovery", i18nKey: "errorCode.backgroundRecoveryError", retryable: true },

  { code: "SYNTHESIZE_PROGRESS", domain: "generation", i18nKey: "errorCode.synthesizeProgress", retryable: false },
  { code: "UNHANDLED_REJECTION", domain: "system", i18nKey: "errorCode.unhandledRejection", retryable: false },
  { code: "LOG", domain: "system", i18nKey: "errorCode.log", retryable: false },
];

const codeMap = new Map<string, ErrorCodeEntry>();
for (const entry of ERROR_CODES) {
  codeMap.set(entry.code, entry);
}

export function isRetryable(code: string): boolean {
  return codeMap.get(code)?.retryable ?? false;
}

export function getErrorCodeEntry(code: string): ErrorCodeEntry | undefined {
  return codeMap.get(code);
}

export type ErrorCategory =
  | "timeout"
  | "rate_limit"
  | "quota"
  | "invalid_params"
  | "network"
  | "server_error"
  | "database_busy"
  | "auth"
  | "unknown";

const ERROR_CATEGORY_MAP: Record<string, ErrorCategory> = {
  TIMEOUT_ERROR: "timeout",
  RATE_LIMIT_ERROR: "rate_limit",
  NETWORK_ERROR: "network",
  DATABASE_ERROR: "database_busy",
  AUTHENTICATION_ERROR: "auth",
  VALIDATION_ERROR: "invalid_params",
  API_ERROR: "server_error",
  GENERATION_ERROR: "server_error",
  STORAGE_ERROR: "database_busy",
  CONFIGURATION_ERROR: "invalid_params",
  NOT_FOUND: "invalid_params",
};

const CATEGORY_PATTERNS: Array<{
  category: ErrorCategory;
  patterns: RegExp[];
}> = [
  { category: "timeout", patterns: [/timeout/i, /timed?\s*out/i, /ETIMEDOUT/, /ECONNABORTED/, /超时/] },
  { category: "rate_limit", patterns: [/rate[\s_-]?limit/i, /429/, /限流|过于频繁/] },
  { category: "quota", patterns: [/quota/i, /insufficient/i, /402/, /余额不足|额度|配额/] },
  { category: "invalid_params", patterns: [/invalid/i, /bad.?request/i, /400/, /参数错误/] },
  { category: "network", patterns: [/ECONNREFUSED|ECONNRESET|ENOTFOUND/i, /network/i, /Failed to fetch/i, /NetworkError/i, /网络错误|连接失败/] },
  { category: "server_error", patterns: [/internal[\s_-]?error/i, /service[\s_-]?unavailable/i, /50[234]/, /服务器错误/] },
  { category: "database_busy", patterns: [/busy|locked/i] },
  { category: "auth", patterns: [/unauthorized/i, /forbidden/i, /401/, /403/] },
];

export function classifyError(errorCode?: string, errorMessage?: string): ErrorCategory {
  if (errorCode) {
    const mapped = ERROR_CATEGORY_MAP[errorCode];
    if (mapped) return mapped;
    const upperCode = errorCode.toUpperCase();
    for (const group of CATEGORY_PATTERNS) {
      if (group.patterns.some((p) => p.test(upperCode))) return group.category;
    }
  }
  if (errorMessage) {
    for (const group of CATEGORY_PATTERNS) {
      if (group.patterns.some((p) => p.test(errorMessage))) return group.category;
    }
  }
  return "unknown";
}
