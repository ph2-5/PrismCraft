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
import { retryWithBackoff } from "@/shared-logic/retry/retry-with-backoff";

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
  "generate-chat",
  "generate-keyframe",
  "generate-frame-pair",
  "generate-embedding",
  "generate-audio",
  "transcribe-audio",
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

interface ParsedErrorInfo {
  message: string;
  code: string | undefined;
}

function extractErrorValueInfo(
  errorValue: unknown,
  responseStatus: number,
  fallbackCode: string | undefined,
): ParsedErrorInfo {
  if (typeof errorValue === "object" && errorValue !== null) {
    const obj = errorValue as { message?: string; code?: string };
    return {
      message: obj.message || obj.code || `HTTP ${responseStatus}`,
      code: obj.code || fallbackCode,
    };
  }
  return {
    message: (errorValue as string) || `HTTP ${responseStatus}`,
    code: fallbackCode,
  };
}

async function parseErrorResponse(response: Response): Promise<ParsedErrorInfo> {
  let errorData: { error?: string | { code?: string; message?: string }; code?: string } = {};
  try {
    errorData = await response.json();
  } catch (e) {
    errorLogger.warn("[ApiClient] 响应 JSON 解析失败", e);
    const text = await response.text().catch(() => "");
    errorData = { error: text || `HTTP ${response.status}` };
  }
  const fallbackCode = errorData.code || statusCodeToErrorCode(response.status);
  return extractErrorValueInfo(errorData.error, response.status, fallbackCode);
}

async function parseSuccessResponse<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch (e) {
    errorLogger.warn("[ApiClient] 成功响应 JSON 解析失败", e);
    throw new ApiClientError(
      "响应格式错误：无法解析 JSON",
      response.status,
      "INVALID_RESPONSE",
    );
  }
}

function shouldQueueRequest(endpoint: string, error: unknown): boolean {
  const isNetworkError = isNetworkErrorClassified(error);
  const isCircuitError = isCircuitBreakerError(error);
  const isOffline = typeof navigator !== "undefined" && !navigator.onLine;
  return (
    (isNetworkError || isOffline || isCircuitError) &&
    QUEUEABLE_ENDPOINTS.some((e) => endpoint.startsWith(e))
  );
}

function buildQueuePayload(endpoint: string, options: ApiRequestOptions): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (options.body) {
    try {
      Object.assign(payload, JSON.parse(options.body as string));
    } catch {
      payload._rawBody = options.body;
      payload._rawBodyType = typeof options.body;
      errorLogger.warn("[ApiClient] 离线队列 payload 解析失败，使用原始 body");
    }
  }
  payload._endpoint = endpoint;
  payload._method = options.method || "POST";
  return payload;
}

async function tryEnqueueOfflineRequest<T>(
  endpoint: string,
  options: ApiRequestOptions,
): Promise<T | null> {
  try {
    const payload = buildQueuePayload(endpoint, options);
    const queuedId = await enqueueRequest(endpoint, payload);
    if (!queuedId) return null;
    const queuedResponse: QueuedResponse = {
      success: false,
      error: t("error.offlineQueued"),
      message: t("error.offlineQueued"),
      queued: true,
      queueId: queuedId,
    };
    return queuedResponse as T;
  } catch (queueError) {
    errorLogger.warn("[ApiClient] 离线队列入队失败:", queueError);
    return null;
  }
}

function buildFetchRequest(
  url: string,
  options: ApiRequestOptions,
  signal: AbortSignal,
): Promise<Response> {
  return fetch(url, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...ELECTRON_APP_HEADERS,
      ...options.headers,
    },
    body: options.body,
    signal,
  });
}

/**
 * 从请求 body 中提取 providerId，用于构造复合熔断 key。
 *
 * 请求 body（如 ImageGenerationRequestBody / VideoGenerationRequestBody 等）
 * 均可选携带 providerId 字段。若 body 不是合法 JSON 或不含 providerId，返回 undefined。
 */
function extractProviderIdFromBody(body: string | undefined): string | undefined {
  if (!body) return undefined;
  try {
    const parsed = JSON.parse(body) as { providerId?: string };
    return parsed.providerId;
  } catch {
    return undefined;
  }
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

    // 构造复合熔断 key：`providerId:endpoint`
    // - 不同 provider 即使 endpoint 相同也独立熔断（修复维度耦合）
    // - 若 body 中无 providerId（如 GET 请求），回退到仅 endpoint 维度，保持向后兼容
    const providerId = extractProviderIdFromBody(options.body);
    const breakerKey = providerId ? `${providerId}:${endpoint}` : endpoint;
    const response = await executeThroughCircuit(breakerKey, () =>
      buildFetchRequest(url, options, controller.signal),
    );

    if (!response.ok) {
      const errorInfo = await parseErrorResponse(response);
      throw new ApiClientError(errorInfo.message, response.status, errorInfo.code);
    }

    const data = await parseSuccessResponse<T>(response);
    if (options.method === "GET" || !options.method) {
      apiCache.set(endpoint, data, { body: options.body });
    }
    return data;
  } catch (error) {
    if (error instanceof ApiClientError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new ApiClientError(t("error.requestTimeout"), 408, "TIMEOUT");
    }

    if (shouldQueueRequest(endpoint, error)) {
      const queued = await tryEnqueueOfflineRequest<T>(endpoint, options);
      if (queued !== null) return queued;
    }

    throw new ApiClientError(extractErrorMessage(error));
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function apiCallWithRetry<T>(
  endpoint: string,
  options: ApiRequestOptions = {},
  retries = 3,
): Promise<T> {
  // 代理到统一重试实现 @/shared-logic/retry/retry-with-backoff
  // 对外保持 (endpoint, options, retries) 签名与历史行为不变：
  //  - 总尝试次数 = retries（首次 + 最多 retries-1 次重试）
  //  - 4xx 客户端错误（除 429/408）不重试
  //  - 5xx / 429 / 408 / 无状态码错误（网络错误）重试
  //  - 指数退避 + 抖动，基础延迟 1000ms
  return retryWithBackoff<T>({
    fn: () => apiCall<T>(endpoint, options),
    maxRetries: Math.max(0, retries - 1),
    baseDelayMs: 1000,
    backoff: "exponential",
    shouldJitter: true,
    retryOn: (error: unknown) => {
      // 使用鸭子类型检查 statusCode 属性，避免 instanceof 在测试模块隔离中失效
      if (error && typeof error === "object" && "statusCode" in error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status !== undefined && status >= 400 && status < 500) {
          // 4xx：仅 429（限流）和 408（超时）可重试
          return status === 429 || status === 408;
        }
        // 5xx 或无状态码（网络错误包装）：可重试
        return true;
      }
      // 非 ApiClientError：可重试（兼容性保留）
      return true;
    },
    // 429 限流时强制至少 5000ms 延迟（与服务端 Retry-After 语义对齐）
    getDelayOverride: (error: Error, defaultDelay: number) => {
      if (error && typeof error === "object" && "statusCode" in error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 429) {
          return Math.max(defaultDelay, 5000);
        }
      }
      return defaultDelay;
    },
  });
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

type SSEEvent =
  | { type: "chunk"; chunk: unknown }
  | { type: "done"; result: unknown }
  | { type: "error"; error: string }
  | { type: "skip" };

/** 解析一行 SSE 数据，返回结构化事件或 skip */
function parseSSELine(line: string): SSEEvent {
  const trimmed = line.trim();
  if (!trimmed || !trimmed.startsWith("data:")) return { type: "skip" };

  const data = trimmed.slice(5).trim();
  if (!data) return { type: "skip" };

  let parsed: { _t?: string; chunk?: unknown; result?: unknown; error?: string };
  try {
    parsed = JSON.parse(data);
  } catch {
    return { type: "skip" };
  }

  if (parsed._t === "chunk" && parsed.chunk !== undefined) {
    return { type: "chunk", chunk: parsed.chunk };
  }
  if (parsed._t === "done") {
    return { type: "done", result: parsed.result };
  }
  if (parsed._t === "error") {
    return { type: "error", error: parsed.error || "流式响应错误" };
  }
  return { type: "skip" };
}

/** 消费 SSE 流，按事件分派回调。返回 done 事件的 result */
async function consumeSSEStream<TChunk, TResult>(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onChunk: (chunk: TChunk) => void,
): Promise<TResult> {
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      // 最后一段可能不完整，保留在 buffer
      buffer = lines.pop() || "";

      for (const line of lines) {
        const evt = parseSSELine(line);
        if (evt.type === "chunk") {
          onChunk(evt.chunk as TChunk);
        } else if (evt.type === "done") {
          return evt.result as TResult;
        } else if (evt.type === "error") {
          throw new ApiClientError(evt.error, 500, "STREAM_ERROR");
        }
      }
    }

    // 流结束但没收到 done 事件
    throw new ApiClientError(
      "流式响应意外结束",
      500,
      "STREAM_ENDED_PREMATURELY",
    );
  } finally {
    reader.releaseLock();
  }
}

/**
 * 流式 API 调用（Task 1.0）。
 * 用于消费 server.ts 的 SSE 流式响应（Content-Type: text/event-stream）。
 *
 * SSE 协议（由 server.ts 产生）：
 * - chunk:  `data: {"_t":"chunk","chunk":...}\n\n`   → 调用 onChunk(chunk)
 * - done:   `data: {"_t":"done","result":...}\n\n`    → resolve(result)
 * - error:  `data: {"_t":"error","error":"..."}\n\n`  → reject
 *
 * 与 apiCall 的区别：
 * - 不走 circuit breaker / offline queue（流式响应难以安全重试）
 * - 不走 apiCache（流式响应不可缓存）
 * - 使用 ReadableStream 实时消费，不缓冲完整响应
 *
 * @returns 流式结束时返回 done 事件中的 result（通常是完整的 ApiResponse）
 */
export async function apiCallStream<TChunk, TResult>(
  endpoint: string,
  options: ApiRequestOptions,
  callbacks: {
    onChunk: (chunk: TChunk) => void;
    /** P1-1 修复：外部 abort 信号，允许调用方在流式传输期间取消 */
    signal?: AbortSignal;
  },
): Promise<TResult> {
  const STREAM_TIMEOUT = 300000; // 流式生成可能较慢，5 分钟
  const baseUrl = isElectron()
    ? `http://localhost:${API_SERVER_PORT}`
    : "";
  const url = `${baseUrl}/api/${endpoint}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), STREAM_TIMEOUT);

  // P1-1 修复：将外部 signal 联动到内部 controller，
  // 使外部 abort 时也能中断流式 fetch 和 reader.read()
  if (callbacks.signal) {
    if (callbacks.signal.aborted) {
      clearTimeout(timeoutId);
      controller.abort();
    } else {
      callbacks.signal.addEventListener("abort", () => controller.abort(), { once: true });
    }
  }

  try {
    const response = await fetch(url, {
      method: options.method || "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        ...ELECTRON_APP_HEADERS,
        ...options.headers,
      },
      body: options.body,
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorInfo = await parseErrorResponse(response);
      throw new ApiClientError(errorInfo.message, response.status, errorInfo.code);
    }

    if (!response.body) {
      throw new ApiClientError(
        "流式响应无 body",
        response.status,
        "INVALID_RESPONSE",
      );
    }

    const reader = response.body.getReader();
    return await consumeSSEStream<TChunk, TResult>(reader, callbacks.onChunk);
  } catch (error) {
    if (error instanceof ApiClientError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new ApiClientError(t("error.requestTimeout"), 408, "TIMEOUT");
    }
    throw new ApiClientError(extractErrorMessage(error));
  } finally {
    clearTimeout(timeoutId);
  }
}
