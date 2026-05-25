import type { Interceptor } from "../types";
import { errorLogger, extractErrorMessage } from "@/shared/error-logger";

export const loggingInterceptor: Interceptor = async (request, next) => {
  const method = request.method ?? "GET";
  const url = (request as Record<string, unknown>).url as string | undefined;
  const endpoint = (request as Record<string, unknown>).endpoint as string | undefined;
  const target = url ?? endpoint ?? "unknown";

  const startTime = Date.now();

  try {
    const response = await next(request);
    const duration = Date.now() - startTime;

    if (response.ok) {
      errorLogger.debug(`[Network] ${method} ${target} → ${response.status} (${duration}ms)`);
    } else {
      errorLogger.warn(`[Network] ${method} ${target} → ${response.status} (${duration}ms)`);
    }

    return response;
  } catch (error) {
    const duration = Date.now() - startTime;
    errorLogger.error(`[Network] ${method} ${target} → ERROR (${duration}ms)`, extractErrorMessage(error));
    throw error;
  }
};
