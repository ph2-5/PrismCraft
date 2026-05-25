import type { Interceptor } from "../types";
import { executeWithRetry } from "../retry-executor";

export const retryInterceptor: Interceptor = async (request, next) => {
  const method = request.method ?? "GET";

  const isIdempotent = method === "GET" || method === "HEAD" || method === "PUT" || method === "DELETE";

  if (!isIdempotent) {
    return next(request);
  }

  return executeWithRetry(
    async () => {
      const response = await next(request);

      if (response.status === 429 || response.status === 408 || response.status >= 500) {
        throw Object.assign(new Error(`HTTP ${response.status}`), {
          statusCode: response.status,
          code: response.status === 429 ? "RATE_LIMITED" : "API_SERVER_ERROR",
        });
      }

      return response;
    },
    "api",
    request.signal ?? undefined,
  );
};
