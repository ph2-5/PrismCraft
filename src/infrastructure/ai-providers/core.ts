import { ApiClientError } from "./errors";
import type { ApiRequestOptions } from "./types";
import { enqueueRequest } from "@/infrastructure/ai-providers/offline-queue";
import { isElectron } from "@/shared/utils/platform";
import { apiCache } from "./api-cache";
import { errorLogger, extractErrorMessage } from "@/shared/error-logger";
import { API_SERVER_PORT, ELECTRON_APP_HEADERS } from "@/config/constants";
import { isNetworkError as isNetworkErrorClassified } from "@/shared/utils/error-classifier";
import { executeThroughCircuit } from "@/infrastructure/network/circuit-breaker";
import { t } from "@/shared/constants";

export interface QueuedResponse {
  success: false;
  error: string;
  message: string;
  queued: true;
  queueId: string;
}

export function isQueuedResponse(response: unknown): response is QueuedResponse {
  return (
    typeof response === "object" &&
    response !== null &&
    "queued" in response &&
    (response as QueuedResponse).queued === true
  );
}

export { ApiClientError };
export { isElectron };

const DEFAULT_TIMEOUT = 60000;

const QUEUEABLE_ENDPOINTS = [
  "generate-image",
  "generate-video",
  "generate-text",
  "generate-keyframe",
  "generate-frame-pair",
  "upload",
];

function statusCodeToErrorCode(status: number): string | undefined {
  switch (status) {
    case 429:
      return "RATE_LIMITED";
    case 408:
      return "TIMEOUT";
    case 500:
    case 502:
    case 503:
    case 504:
      return "API_SERVER_ERROR";
    default:
      return undefined;
  }
}

function isCircuitBreakerError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as Record<string, unknown>;
  return e.code === "CIRCUIT_OPEN" || e.code === "CIRCUIT_HALF_OPEN_LIMIT";
}

export async function apiCall<T>(
  endpoint: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const { timeout = DEFAULT_TIMEOUT } = options;

  if (options.method === "GET" || !options.method) {
    const cached = apiCache.get<T>(endpoint, { body: options.body });
    if (cached && !cached.stale) {
      return cached.data;
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const baseUrl = isElectron()
      ? `http://localhost:${API_SERVER_PORT}`
      : "";
    const url = `${baseUrl}/api/${endpoint}`;

    const response = await executeThroughCircuit(
      endpoint,
      () =>
        fetch(url, {
          method: options.method || "GET",
          headers: {
            "Content-Type": "application/json",
            ...ELECTRON_APP_HEADERS,
            ...options.headers,
          },
          body: options.body,
          signal: controller.signal,
        }),
    );

    if (!response.ok) {
      let errorData: { error?: string | { code?: string; message?: string }; code?: string } = {};
      try {
        errorData = await response.json();
      } catch (e) {
        errorLogger.warn("[ApiClient] 响应 JSON 解析失败", e);
        const text = await response.text().catch(() => "");
        errorData = { error: text || `HTTP ${response.status}` };
      }
      const errorValue = errorData.error;
      const errorMessage = typeof errorValue === "object" && errorValue !== null
        ? (errorValue.message || errorValue.code || `HTTP ${response.status}`)
        : (errorValue || `HTTP ${response.status}`);
      const errorCode = typeof errorValue === "object" && errorValue !== null && errorValue.code
        ? errorValue.code
        : (errorData.code || statusCodeToErrorCode(response.status));
      throw new ApiClientError(
        errorMessage,
        response.status,
        errorCode,
      );
    }

    try {
      const data = (await response.json()) as T;
      if (options.method === "GET" || !options.method) {
        apiCache.set(endpoint, data, { body: options.body });
      }
      return data;
    } catch (e) {
      errorLogger.warn("[ApiClient] 成功响应 JSON 解析失败", e);
      throw new ApiClientError(
        "响应格式错误：无法解析 JSON",
        response.status,
        "INVALID_RESPONSE",
      );
    }
  } catch (error) {
    if (error instanceof ApiClientError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new ApiClientError(t("error.requestTimeout"), 408, "TIMEOUT");
    }

    const isNetworkError = isNetworkErrorClassified(error);
    const isCircuitError = isCircuitBreakerError(error);
    const isOffline = typeof navigator !== "undefined" && !navigator.onLine;

    if (
      (isNetworkError || isOffline || isCircuitError) &&
      QUEUEABLE_ENDPOINTS.some((e) => endpoint.startsWith(e))
    ) {
      try {
        const payload: Record<string, unknown> = {};
        if (options.body) {
          try {
            Object.assign(payload, JSON.parse(options.body as string));
          } catch {
            payload._rawBody = options.body;
            payload._rawBodyType = typeof options.body;
            errorLogger.warn(
              "[ApiClient] 离线队列 payload 解析失败，使用原始 body",
            );
          }
        }
        payload._endpoint = endpoint;
        payload._method = options.method || "POST";
        const queuedId = await enqueueRequest(endpoint, payload);
        if (queuedId) {
          const queuedResponse: QueuedResponse = {
            success: false,
            error: t("error.offlineQueued"),
            message: t("error.offlineQueued"),
            queued: true,
            queueId: queuedId,
          };
          return queuedResponse as T;
        }
      } catch (queueError) {
        errorLogger.warn("[ApiClient] 离线队列入队失败:", queueError);
      }
    }

    throw new ApiClientError(
      extractErrorMessage(error),
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function apiCallWithRetry<T>(
  endpoint: string,
  options: ApiRequestOptions = {},
  retries = 3,
): Promise<T> {
  let lastError: Error = new Error("请求失败");

  for (let i = 0; i < retries; i++) {
    try {
      return await apiCall<T>(endpoint, options);
    } catch (error) {
      lastError = error as Error;

      const isClientError =
        error instanceof ApiClientError &&
        error.statusCode !== undefined &&
        error.statusCode >= 400 &&
        error.statusCode < 500;

      const shouldRetry =
        !isClientError ||
        (error instanceof ApiClientError &&
          (error.statusCode === 429 || error.statusCode === 408));

      if (!shouldRetry) {
        throw error;
      }

      if (i < retries - 1) {
        let delay = Math.pow(2, i) * 1000;
        if (error instanceof ApiClientError && error.statusCode === 429) {
          delay = Math.max(delay, 5000);
        }
        delay = delay * (0.5 + Math.random() * 0.5);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError!;
}

export async function apiCallWithFallback<T>(
  endpoints: Array<{ endpoint: string; options?: ApiRequestOptions }>,
  retries = 1,
): Promise<T> {
  let lastError: Error = new Error(t("error.allProvidersFailed"));

  for (const { endpoint, options } of endpoints) {
    try {
      return await apiCallWithRetry<T>(endpoint, options, retries);
    } catch (error) {
      lastError = error as Error;
      errorLogger.warn(
        `[API] 提供商 ${endpoint} 失败，尝试下一个:`,
        extractErrorMessage(error),
      );
    }
  }

  throw lastError;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    switch (error.statusCode) {
      case 400:
        if (error.code === "CONFIG_MISSING") {
          return "API 未配置，请先在设置中配置 API Key";
        }
        return `请求参数错误: ${error.message}`;
      case 401:
        return "API Key 无效或已过期，请检查设置";
      case 403:
        return "没有权限访问该资源";
      case 404:
        return "请求的资源不存在";
      case 408:
        return "请求超时，请检查网络连接后重试";
      case 429:
        return "请求过于频繁，请稍后再试";
      case 500:
        return `服务器错误: ${error.message}`;
      case 503:
        return "服务暂时不可用，请稍后再试";
      default:
        return error.message || "请求失败";
    }
  }

  if (error instanceof Error) {
    if (isNetworkErrorClassified(error)) {
      return "网络连接失败，请检查网络设置";
    }
    return error.message;
  }

  return "未知错误";
}

export async function checkApiHealth(): Promise<boolean> {
  try {
    await apiCall("config", { method: "GET", timeout: 5000 });
    return true;
  } catch (e) {
    errorLogger.warn("[ApiClient] API 健康检查失败", e);
    return false;
  }
}
