import type { Interceptor } from "../types";
import { executeThroughCircuit, getCircuitState, buildCircuitBreakerKey } from "../circuit-breaker";
import { NETWORK_CONFIG } from "../network.config";
import { errorLogger } from "@/shared/error-logger";

export const circuitBreakerInterceptor: Interceptor = async (request, next) => {
  const config = NETWORK_CONFIG.circuitBreaker;
  if (!config.enabled) {
    return next(request);
  }

  const url = (request as Record<string, unknown>).url as string | undefined;
  const endpoint = (request as Record<string, unknown>).endpoint as string | undefined;
  const providerId = extractProviderId(url ?? endpoint ?? "");

  // 若无法从 URL 提取 providerId，则跳过熔断（保持原有行为，不破坏现有功能）
  if (!providerId) {
    return next(request);
  }

  // 构造复合熔断 key：`providerId:endpoint`
  // - 同一 provider 的不同 endpoint 仍独立熔断（保持现状）
  // - 不同 provider 即使 endpoint 相同也独立熔断（修复维度耦合）
  // - endpoint 缺失时回退到仅 providerId 维度
  const breakerKey = buildCircuitBreakerKey(providerId, endpoint ?? url ?? "");

  const state = getCircuitState(breakerKey);
  if (state === "open") {
    return new Response(JSON.stringify({ error: "Provider circuit breaker is open", code: "CIRCUIT_OPEN" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  return executeThroughCircuit(breakerKey, () => next(request));
};

function extractProviderId(url: string): string | null {
  try {
    const patterns = [
      /provider[=/]([^/&?]+)/,
      /api[=/]([^/&?]+)/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1] ?? null;
    }

    return null;
  } catch (e) {
    errorLogger.warn("[CircuitBreaker] Failed to extract provider from URL", e as Error);
    return null;
  }
}
