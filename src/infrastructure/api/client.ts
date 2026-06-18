import type { Result } from "@/domain/types";
import { ok, err, ApiError, NetworkError } from "@/domain/types";
import type { ApiErrorCode } from "@/domain/schemas";
import { API_SERVER_PORT, ELECTRON_APP_HEADERS } from "@/config/constants";
import type { Interceptor } from "@/infrastructure/network/types";
import { aiApiProfile } from "@/infrastructure/network/profiles";

const DEFAULT_TIMEOUT = aiApiProfile.timeout;

export class AppApiClientError extends Error {
  constructor(
    public readonly code: ApiErrorCode | string,
    message: string,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = "AppApiClientError";
  }
}

const DEFAULT_INTERCEPTORS: Interceptor[] = [...aiApiProfile.interceptors];

let interceptors: Interceptor[] = [...DEFAULT_INTERCEPTORS];

export function setInterceptors(customInterceptors: Interceptor[]): void {
  interceptors = customInterceptors;
}

export function addInterceptor(interceptor: Interceptor): void {
  interceptors.push(interceptor);
}

export function removeInterceptor(interceptor: Interceptor): void {
  const index = interceptors.indexOf(interceptor);
  if (index !== -1) {
    interceptors.splice(index, 1);
  }
}

function composeInterceptors(
  finalHandler: (request: RequestInit & { url?: string; endpoint?: string }) => Promise<Response>,
  interceptorList: Interceptor[],
): (request: RequestInit & { url?: string; endpoint?: string }) => Promise<Response> {
  let handler = finalHandler;

  for (let i = interceptorList.length - 1; i >= 0; i--) {
    const current = interceptorList[i]!;
    const next = handler;
    handler = (req) => current(req, next);
  }

  return handler;
}

async function request<T>(
  endpoint: string,
  options: RequestInit & { timeout?: number } = {},
): Promise<Result<T>> {
  const { timeout = DEFAULT_TIMEOUT, ...fetchOptions } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  const baseUrl = `http://localhost:${API_SERVER_PORT}`;

  const fullUrl = `${baseUrl}/api/${endpoint}`;

  const enrichedRequest: RequestInit & { url?: string; endpoint?: string } = {
    ...fetchOptions,
    url: fullUrl,
    endpoint,
    signal: controller.signal,
    headers: {
      "Content-Type": "application/json",
      ...ELECTRON_APP_HEADERS,
      ...fetchOptions.headers,
    },
  };

  const finalHandler = async (req: RequestInit & { url?: string; endpoint?: string }): Promise<Response> => {
    const { url: reqUrl, endpoint: _endpoint, ...fetchReq } = req;
    return fetch(reqUrl ?? fullUrl, fetchReq);
  };

  const chain = composeInterceptors(finalHandler, interceptors);

  try {
    const response = await chain(enrichedRequest);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const code = body.code || mapStatusToCode(response.status);
      return err(new ApiError(body.error || body.message || `HTTP ${response.status}`, response.status, code));
    }

    const data = await response.json();
    return ok(data as T);
  } catch (e) {
    // 统一返回 Result，不再 throw，符合 Result 模式约定
    if (e instanceof AppApiClientError) {
      return err(new ApiError(e.message, e.statusCode ?? 500, e.code));
    }
    if (e instanceof DOMException && e.name === "AbortError") {
      return err(new NetworkError(`Request timeout after ${timeout}ms`));
    }
    if (e instanceof Error && "statusCode" in e) {
      const statusCode = (e as Error & { statusCode: number }).statusCode;
      const errorCode = (e as Error & { code?: string }).code || mapStatusToCode(statusCode);
      return err(new ApiError(e.message, statusCode, errorCode));
    }
    return err(new NetworkError(e instanceof Error ? e.message : "Network request failed", e));
  } finally {
    clearTimeout(timeoutId);
  }
}

function mapStatusToCode(status: number): ApiErrorCode {
  switch (status) {
    case 401: return "INVALID_API_KEY";
    case 429: return "RATE_LIMITED";
    case 404: return "ENDPOINT_NOT_FOUND";
    case 500: return "API_SERVER_ERROR";
    case 503: return "API_SERVER_ERROR";
    default: return "UNKNOWN_ERROR";
  }
}

export const apiClient = {
  get: <T>(endpoint: string) => request<T>(endpoint, { method: "GET" }),
  post: <T>(endpoint: string, body?: unknown, timeout?: number) =>
    request<T>(endpoint, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
      timeout,
    }),
};
