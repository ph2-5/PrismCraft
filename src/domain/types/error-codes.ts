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
  description: string;
  retryable: boolean;
}

const ERROR_CODES: ErrorCodeEntry[] = [
  { code: "DATABASE_ERROR", domain: "database", description: "数据库操作失败", retryable: true },
  { code: "VALIDATION_ERROR", domain: "validation", description: "输入验证失败", retryable: false },
  { code: "API_ERROR", domain: "api", description: "API 请求失败", retryable: true },
  { code: "NOT_FOUND", domain: "database", description: "实体未找到", retryable: false },
  { code: "NETWORK_ERROR", domain: "network", description: "网络请求失败", retryable: true },
  { code: "STORAGE_ERROR", domain: "storage", description: "存储操作失败", retryable: true },
  { code: "CONFIGURATION_ERROR", domain: "config", description: "配置错误", retryable: false },
  { code: "GENERATION_ERROR", domain: "generation", description: "AI 生成失败", retryable: true },
  { code: "TIMEOUT_ERROR", domain: "network", description: "请求超时", retryable: true },
  { code: "RATE_LIMIT_ERROR", domain: "api", description: "API 速率限制", retryable: true },
  { code: "AUTHENTICATION_ERROR", domain: "auth", description: "认证失败", retryable: false },
  { code: "UNKNOWN_ERROR", domain: "system", description: "未知错误", retryable: false },

  { code: "CLEANUP_ERROR", domain: "system", description: "清理过期任务失败", retryable: true },
  { code: "CACHE_CLEANUP_ERROR", domain: "cache", description: "缓存清理失败", retryable: true },
  { code: "CACHE_VIDEO_ERROR", domain: "cache", description: "视频缓存失败", retryable: true },
  { code: "CACHE_DB_ERROR", domain: "cache", description: "缓存数据库记录失败", retryable: true },
  { code: "REMOVE_TASK_ERROR", domain: "system", description: "移除任务失败", retryable: false },
  { code: "CLEAR_ACTIVE_TASKS_ERROR", domain: "system", description: "清除活跃任务失败", retryable: false },

  { code: "RETRY_NOT_RECOMMENDED", domain: "recovery", description: "智能重试不建议重试", retryable: false },
  { code: "DUPLICATE_DETECTED", domain: "recovery", description: "检测到重复任务", retryable: false },
  { code: "HIGH_RISK_RETRY", domain: "recovery", description: "重试风险较高", retryable: false },
  { code: "INVALID_TRANSITION", domain: "state", description: "状态转换不合法", retryable: false },
  { code: "VERIFICATION_FAILED", domain: "recovery", description: "视频验证失败", retryable: true },
  { code: "RECOVERY_INCOMPLETE", domain: "recovery", description: "恢复未完成", retryable: true },
  { code: "RECOVERY_FAILED", domain: "recovery", description: "云端任务已确认失败", retryable: false },
  { code: "RECOVERY_PENDING", domain: "recovery", description: "视频仍在生成中", retryable: true },
  { code: "UNKNOWN_STATUS", domain: "recovery", description: "未知任务状态", retryable: true },
  { code: "QUERY_FAILED", domain: "recovery", description: "查询任务状态失败", retryable: true },
  { code: "BACKGROUND_RECOVERY_ERROR", domain: "recovery", description: "后台恢复失败", retryable: true },

  { code: "SYNTHESIZE_PROGRESS", domain: "generation", description: "合成进度", retryable: false },
  { code: "UNHANDLED_REJECTION", domain: "system", description: "未处理的 Promise 拒绝", retryable: false },
  { code: "LOG", domain: "system", description: "日志记录", retryable: false },
];

const codeMap = new Map<string, ErrorCodeEntry>();
for (const entry of ERROR_CODES) {
  codeMap.set(entry.code, entry);
}

export function isRetryable(code: string): boolean {
  return codeMap.get(code)?.retryable ?? false;
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
  { category: "timeout", patterns: [/timeout/i, /timed?\s*out/i, /超时/, /ETIMEDOUT/, /ECONNABORTED/] },
  { category: "rate_limit", patterns: [/rate[\s_-]?limit/i, /限流/, /请求过于频繁/, /429/] },
  { category: "quota", patterns: [/quota/i, /余额/, /额度/, /配额/, /insufficient/i, /402/] },
  { category: "invalid_params", patterns: [/invalid/i, /参数错误/, /bad.?request/i, /400/] },
  { category: "network", patterns: [/ECONNREFUSED|ECONNRESET|ENOTFOUND/i, /network/i, /Failed to fetch/i, /NetworkError/i, /网络/, /连接/] },
  { category: "server_error", patterns: [/internal[\s_-]?error/i, /服务器错误/, /service[\s_-]?unavailable/i, /50[234]/] },
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
