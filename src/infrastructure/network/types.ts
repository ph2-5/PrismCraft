export type CircuitState = "closed" | "open" | "half-open";

export type NetworkQualityLevel = "excellent" | "good" | "fair" | "poor" | "offline";

export type RequestState = "pending" | "active" | "completed" | "failed" | "cancelled";

export type RequestType = "api" | "download" | "upload";

export type DownloadState = "idle" | "downloading" | "paused" | "completed" | "failed";

export type BackoffStrategy = "exponential" | "linear" | "fixed";

export type DownloadSourceType = "direct" | "proxy" | "mirror";

export type TaskPriority = "critical" | "normal" | "low";

export interface NetworkQuality {
  level: NetworkQualityLevel;
  latency: number;
  bandwidth: number;
  packetLoss: number;
  lastMeasuredAt: number;
}

export interface RetryPolicy {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoff: BackoffStrategy;
  jitter: boolean;
  retryableErrors: string[];
  onRetry?: (attempt: number, error: Error, delay: number) => void;
}

export interface DownloadProgress {
  loaded: number;
  total: number;
  percent: number;
  speed: number;
  eta: number;
  state: DownloadState;
}

export interface DownloadSource {
  url: string;
  type: DownloadSourceType;
  weight: number;
}

export interface DownloadTask {
  id: string;
  url: string;
  sources: DownloadSource[];
  priority: TaskPriority;
  state: DownloadState;
  createdAt: number;
  destination?: string | ((chunk: Uint8Array) => Promise<void>);
}

export interface ResilientFetchOptions {
  url: string;
  destination: string | ((chunk: Uint8Array) => Promise<void>);
  onProgress?: (progress: DownloadProgress) => void;
  signal?: AbortSignal;
  chunkSize?: number;
  concurrency?: number;
  timeout?: number;
  maxRetries?: number;
  resumeFrom?: number;
}

export interface DownloadResult {
  success: boolean;
  totalBytes: number;
  duration: number;
  fromCache: boolean;
}

export interface ResumableDownloadHandle {
  id: string;
  pause: () => void;
  resume: () => void;
  cancel: () => void;
  getProgress: () => DownloadProgress;
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeout: number;
  halfOpenMaxCalls: number;
  successThreshold: number;
}

export interface RequestContext {
  id: string;
  type: RequestType;
  endpoint: string;
  providerId?: string;
  createdAt: number;
  state: RequestState;
  signal: AbortController;
  metadata: Record<string, unknown>;
}

export type RequestEventType =
  | "request.created"
  | "request.started"
  | "request.progress"
  | "request.completed"
  | "request.failed"
  | "request.retried"
  | "request.cancelled";

export interface RequestEvent {
  type: RequestEventType;
  context: RequestContext;
  timing?: { startedAt: number; completedAt?: number; duration?: number };
  progress?: DownloadProgress;
  error?: Error;
  attempt?: number;
  delay?: number;
}

export type Interceptor = (
  request: RequestInit & { url?: string; endpoint?: string },
  next: (request: RequestInit & { url?: string; endpoint?: string }) => Promise<Response>,
) => Promise<Response>;

export interface ResilientFetchConfig {
  enabled: boolean;
  chunkSize: number;
  concurrency: number;
  timeout: number;
  maxRetries: number;
}

export interface CircuitBreakerModuleConfig {
  enabled: boolean;
  failureThreshold: number;
  recoveryTimeout: number;
  halfOpenMaxCalls: number;
  successThreshold: number;
}

export interface DownloadManagerConfig {
  enabled: boolean;
  maxConcurrency: number;
}

export interface NetworkMonitorConfig {
  enabled: boolean;
  checkInterval: number;
  probeUrl: string;
  probeTimeout: number;
}

export interface OfflineQueueModuleConfig {
  enabled: boolean;
  maxRetries: number;
  processingInterval: number;
  deduplication: boolean;
}

export interface NetworkConfig {
  resilientFetch: ResilientFetchConfig;
  circuitBreaker: CircuitBreakerModuleConfig;
  downloadManager: DownloadManagerConfig;
  networkMonitor: NetworkMonitorConfig;
  offlineQueue: OfflineQueueModuleConfig;
}
