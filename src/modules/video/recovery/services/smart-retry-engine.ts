import type { VideoTask } from "@/domain/schemas";
import type {
  RetryDecision,
  RetryConfig,
  VideoVerificationResult,
} from "../types/video-recovery-types";

export type ErrorCategory =
  | "timeout"
  | "rate_limit"
  | "quota"
  | "invalid_params"
  | "network"
  | "server_error"
  | "unknown";

const ERROR_CODE_PATTERNS: Array<{
  category: ErrorCategory;
  codes: string[];
  patterns: RegExp[];
}> = [
  {
    category: "timeout",
    codes: ["TIMEOUT", "ETIMEDOUT", "REQUEST_TIMEOUT", "DEADLINE_EXCEEDED", "TIMEOUT_ERROR"],
    patterns: [/timeout/i, /超时/],
  },
  {
    category: "rate_limit",
    codes: ["RATE_LIMITED", "RATE_LIMIT", "TOO_MANY_REQUESTS", "429", "THROTTLED"],
    patterns: [/rate[\s_-]?limit/i, /限流/, /请求过于频繁/],
  },
  {
    category: "quota",
    codes: ["QUOTA_EXCEEDED", "INSUFFICIENT_QUOTA", "QUOTA", "BILLING", "PAYMENT_REQUIRED", "402"],
    patterns: [/quota/i, /余额/, /额度/, /配额/, /insufficient/i],
  },
  {
    category: "invalid_params",
    codes: ["INVALID_PARAMS", "INVALID_ARGUMENT", "BAD_REQUEST", "400", "VALIDATION_ERROR", "PARAM_ERROR"],
    patterns: [/invalid/i, /参数错误/, /bad.?request/i],
  },
  {
    category: "network",
    codes: ["NETWORK_ERROR", "ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "EAI_AGAIN", "FETCH_ERROR"],
    patterns: [/network/i, /网络/, /connection/i, /连接/],
  },
  {
    category: "server_error",
    codes: ["INTERNAL_ERROR", "SERVER_ERROR", "500", "502", "503", "504", "SERVICE_UNAVAILABLE"],
    patterns: [/internal[\s_-]?error/i, /服务器错误/, /service[\s_-]?unavailable/i],
  },
];

export function classifyError(errorCode?: string, errorMessage?: string): ErrorCategory {
  if (errorCode) {
    const upperCode = errorCode.toUpperCase();
    for (const group of ERROR_CODE_PATTERNS) {
      if (group.codes.some((c) => upperCode.includes(c))) {
        return group.category;
      }
    }
  }

  if (errorMessage) {
    for (const group of ERROR_CODE_PATTERNS) {
      if (group.patterns.some((p) => p.test(errorMessage))) {
        return group.category;
      }
    }
  }

  return "unknown";
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 60,
  baseDelayMs: 10000,
  maxDelayMs: 300000,
  exponentialBackoff: true,
  jitter: true,
};

export class SmartRetryEngine {
  private config: RetryConfig;

  constructor(config: Partial<RetryConfig> = {}) {
    this.config = { ...DEFAULT_RETRY_CONFIG, ...config };
  }

  makeRetryDecision(
    task: VideoTask,
    verification?: VideoVerificationResult,
    previousAttempts: number = 0
  ): RetryDecision {
    if (previousAttempts >= this.config.maxRetries) {
      return {
        shouldRetry: false,
        reason: `已达到最大重试次数 (${this.config.maxRetries})`,
        errorCategory: "unknown",
        confidence: "high",
        tokenWasteRisk: "low",
      };
    }

    const taskAge = Date.now() - new Date(task.createdAt).getTime();
    const maxTaskAge = 120 * 60 * 1000;
    if (taskAge > maxTaskAge) {
      return {
        shouldRetry: false,
        reason: "任务已超时（超过2小时），不再重试",
        errorCategory: "timeout",
        confidence: "high",
        tokenWasteRisk: "low",
      };
    }

    if (task.status === "completed" && task.videoUrl) {
      if (verification && !verification.isValid) {
        return {
          shouldRetry: true,
          reason: "视频标记为完成但验证失败，可能是假成功",
          errorCategory: "unknown",
          confidence: verification.confidence,
          tokenWasteRisk: "low",
        };
      }
      return {
        shouldRetry: false,
        reason: "视频已成功生成，无需重试",
        errorCategory: "unknown",
        confidence: "high",
        tokenWasteRisk: "low",
      };
    }

    if (task.status === "failed") {
      if (verification && !verification.isValid) {
        return this.analyzeFailedVerification(task, verification, previousAttempts);
      }

      return this.analyzeFailedTask(task, previousAttempts);
    }

    if (task.status === "generating" || task.status === "pending") {
      const timeSinceCreation = Date.now() - new Date(task.createdAt).getTime();

      if (timeSinceCreation < 30000) {
        return {
          shouldRetry: false,
          reason: "任务刚开始处理，建议等待",
          errorCategory: "unknown",
          confidence: "high",
          retryAfterMs: 30000,
          tokenWasteRisk: "low",
        };
      }

      if (task.pollCount && task.pollCount > 5) {
        return {
          shouldRetry: false,
          reason: "任务已在处理中，已轮询多次但未完成",
          errorCategory: "unknown",
          confidence: "medium",
          retryAfterMs: this.calculateNextRetryDelay(previousAttempts),
          tokenWasteRisk: "medium",
        };
      }

      return {
        shouldRetry: false,
        reason: "任务仍在生成中",
        errorCategory: "unknown",
        confidence: "high",
        retryAfterMs: Math.min(30000 + previousAttempts * 10000, 120000),
        tokenWasteRisk: "low",
      };
    }

    return {
      shouldRetry: false,
      reason: "任务状态不明确，建议手动检查",
      errorCategory: "unknown",
      confidence: "low",
      tokenWasteRisk: "medium",
    };
  }

  private analyzeFailedVerification(
    _task: VideoTask,
    verification: VideoVerificationResult,
    previousAttempts: number
  ): RetryDecision {
    const { details } = verification;

    const category = classifyError(details?.apiStatus, details?.errorMessage);

    if (category === "timeout") {
      const tokenWasteRisk = previousAttempts > 3 ? "high" : "medium";
      return {
        shouldRetry: true,
        reason: "视频验证超时，可能是网络问题或服务器繁忙",
        errorCategory: category,
        confidence: "medium",
        retryAfterMs: this.calculateNextRetryDelay(previousAttempts),
        tokenWasteRisk,
      };
    }

    if (details?.contentValid === false && details?.urlAccessible === true) {
      return {
        shouldRetry: true,
        reason: "视频URL可访问但内容无效，可能是生成过程中的临时错误",
        errorCategory: "unknown",
        confidence: "medium",
        retryAfterMs: this.calculateNextRetryDelay(previousAttempts),
        tokenWasteRisk: "medium",
      };
    }

    if (details?.urlAccessible === false) {
      const tokenWasteRisk = previousAttempts > 5 ? "high" : "medium";
      return {
        shouldRetry: true,
        reason: "视频URL不可访问，可能是云端服务临时故障",
        errorCategory: "network",
        confidence: "medium",
        retryAfterMs: this.calculateNextRetryDelay(previousAttempts),
        tokenWasteRisk,
      };
    }

    return {
      shouldRetry: false,
      reason: "视频验证失败，但不符合重试条件",
      errorCategory: "unknown",
      confidence: "high",
      tokenWasteRisk: "high",
    };
  }

  private analyzeFailedTask(
    task: VideoTask,
    previousAttempts: number
  ): RetryDecision {
    const category = classifyError(undefined, task.message);

    switch (category) {
      case "timeout": {
        const tokenWasteRisk = previousAttempts > 3 ? "high" : "medium";
        return {
          shouldRetry: true,
          reason: "任务执行超时，可能是服务器处理时间过长",
          errorCategory: category,
          confidence: "medium",
          retryAfterMs: this.calculateNextRetryDelay(previousAttempts),
          tokenWasteRisk,
        };
      }

      case "rate_limit":
        return {
          shouldRetry: true,
          reason: "触发API速率限制，需要等待后重试",
          errorCategory: category,
          confidence: "high",
          retryAfterMs: Math.max(this.calculateNextRetryDelay(previousAttempts), 60000),
          tokenWasteRisk: "low",
        };

      case "quota":
        return {
          shouldRetry: false,
          reason: "账户余额或配额不足",
          errorCategory: category,
          confidence: "high",
          tokenWasteRisk: "high",
        };

      case "invalid_params":
        return {
          shouldRetry: false,
          reason: "任务参数错误，重试无意义",
          errorCategory: category,
          confidence: "high",
          tokenWasteRisk: "high",
        };

      case "network":
        return {
          shouldRetry: true,
          reason: "网络错误，可能是临时问题",
          errorCategory: category,
          confidence: "medium",
          retryAfterMs: this.calculateNextRetryDelay(previousAttempts),
          tokenWasteRisk: "low",
        };

      case "server_error": {
        const tokenWasteRisk = previousAttempts > 2 ? "medium" : "low";
        return {
          shouldRetry: true,
          reason: "服务端错误，可能是临时故障",
          errorCategory: category,
          confidence: "medium",
          retryAfterMs: this.calculateNextRetryDelay(previousAttempts),
          tokenWasteRisk,
        };
      }
    }

    const recentFailureCount = this.estimateRecentFailures(task);
    if (recentFailureCount > 5) {
      return {
        shouldRetry: false,
        reason: "连续失败次数过多，建议检查问题根源",
        errorCategory: "unknown",
        confidence: "high",
        tokenWasteRisk: "high",
      };
    }

    return {
      shouldRetry: true,
      reason: "任务失败，但错误原因不明确，尝试重新生成",
      errorCategory: "unknown",
      confidence: "low",
      retryAfterMs: this.calculateNextRetryDelay(previousAttempts),
      tokenWasteRisk: "medium",
    };
  }

  private calculateNextRetryDelay(attempts: number): number {
    let delay = this.config.baseDelayMs;

    if (this.config.exponentialBackoff) {
      delay = Math.min(
        delay * Math.pow(2, attempts),
        this.config.maxDelayMs
      );
    }

    if (this.config.jitter) {
      const jitterAmount = delay * 0.2;
      delay = delay + (Math.random() * jitterAmount * 2 - jitterAmount);
    }

    return Math.round(delay);
  }

  private estimateRecentFailures(task: VideoTask): number {
    if (task.recoveryAttempts !== undefined && task.recoveryAttempts > 0) {
      return task.recoveryAttempts;
    }
    return task.pollFailureCount || 0;
  }

  getRecommendedRetryDelay(
    decision: RetryDecision,
    currentAttempt: number
  ): number {
    if (decision.retryAfterMs) {
      return decision.retryAfterMs;
    }

    return this.calculateNextRetryDelay(currentAttempt);
  }
}

export const smartRetryEngine = new SmartRetryEngine();

export function createRetryEngine(config: Partial<RetryConfig>): SmartRetryEngine {
  return new SmartRetryEngine(config);
}
