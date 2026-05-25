import type { Interceptor } from "../types";
import { executeThroughCircuit, getCircuitState } from "../circuit-breaker";
import { NETWORK_CONFIG } from "../network.config";

export const circuitBreakerInterceptor: Interceptor = async (request, next) => {
  const config = NETWORK_CONFIG.circuitBreaker;
  if (!config.enabled) {
    return next(request);
  }

  const url = (request as Record<string, unknown>).url as string | undefined;
  const endpoint = (request as Record<string, unknown>).endpoint as string | undefined;
  const providerId = extractProviderId(url ?? endpoint ?? "");

  if (!providerId) {
    return next(request);
  }

  const state = getCircuitState(providerId);
  if (state === "open") {
    return new Response(JSON.stringify({ error: "Provider circuit breaker is open", code: "CIRCUIT_OPEN" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  return executeThroughCircuit(providerId, () => next(request));
};

function extractProviderId(url: string): string | null {
  try {
    const patterns = [
      /provider[=/]([^/&?]+)/,
      /api[=/]([^/&?]+)/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }

    return null;
  } catch {
    return null;
  }
}
