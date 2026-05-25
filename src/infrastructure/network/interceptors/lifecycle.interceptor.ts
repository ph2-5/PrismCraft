import type { Interceptor } from "../types";
import {
  createRequest,
  startRequest,
  completeRequest,
  failRequest,
  cancelRequest,
} from "../request-lifecycle";

export const lifecycleInterceptor: Interceptor = async (request, next) => {
  const endpoint = (request as Record<string, unknown>).endpoint as string | undefined;
  const url = (request as Record<string, unknown>).url as string | undefined;

  const context = createRequest({
    type: "api",
    endpoint: endpoint ?? url ?? "unknown",
    metadata: {
      method: request.method ?? "GET",
    },
  });

  const originalSignal = request.signal;
  if (originalSignal) {
    originalSignal.addEventListener("abort", () => {
      cancelRequest(context.id);
    }, { once: true });
  }

  request.signal = context.signal.signal;

  startRequest(context.id);

  try {
    const response = await next(request);
    completeRequest(context.id);
    return response;
  } catch (error) {
    failRequest(context.id, error instanceof Error ? error : new Error(String(error)));
    throw error;
  }
};
