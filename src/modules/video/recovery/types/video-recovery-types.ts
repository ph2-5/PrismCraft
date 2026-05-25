export interface VideoVerificationDetails {
  apiStatus: string;
  urlAccessible: boolean;
  contentValid: boolean;
  contentSize?: number;
  contentType?: string;
  errorMessage?: string;
}

export interface VideoVerificationResult {
  isValid: boolean;
  reason: string;
  details?: VideoVerificationDetails;
  confidence: "high" | "medium" | "low";
}

export interface RetryDecision {
  shouldRetry: boolean;
  reason: string;
  errorCategory?: "timeout" | "rate_limit" | "quota" | "invalid_params" | "network" | "server_error" | "unknown";
  confidence: "high" | "medium" | "low";
  retryAfterMs?: number;
  maxRetries?: number;
  tokenWasteRisk: "high" | "medium" | "low";
}

export interface VideoRecoveryLog {
  timestamp: number;
  action: string;
  details?: string;
  success?: boolean;
}

export interface VideoTaskRecoveryInfo {
  taskId: string;
  verification?: VideoVerificationResult;
  decision: RetryDecision;
  logs: VideoRecoveryLog[];
  duplicateCheck?: DuplicateCheckResult;
  statistics: {
    totalAttempts: number;
    failedAttempts: number;
    lastAttempt?: number;
    averageRetryInterval?: number;
  };
}

export interface DuplicateCheckResult {
  hasDuplicate: boolean;
  existingTaskId?: string;
  existingVideoUrl?: string;
  similarity?: number;
  reason?: string;
}

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  exponentialBackoff: boolean;
  jitter: boolean;
}
