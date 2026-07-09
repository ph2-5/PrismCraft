import type { CircuitState, CircuitBreakerConfig, CircuitBreakerModuleConfig } from "./types";
import { NETWORK_CONFIG } from "./network.config";

interface CircuitBreakerState {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  halfOpenCallCount: number;
  halfOpenActiveCalls: number;
  lastFailureTime: number;
  lastStateChangeTime: number;
}

const MAX_BREAKERS = 50;
const breakers = new Map<string, CircuitBreakerState>();

function getConfig(): CircuitBreakerModuleConfig {
  return NETWORK_CONFIG.circuitBreaker;
}

function getOrCreateBreaker(breakerKey: string): CircuitBreakerState {
  let breaker = breakers.get(breakerKey);
  if (!breaker) {
    if (breakers.size >= MAX_BREAKERS) {
      const oldestKey = breakers.keys().next().value;
      if (oldestKey !== undefined) {
        breakers.delete(oldestKey);
      }
    }
    breaker = {
      state: "closed",
      failureCount: 0,
      successCount: 0,
      halfOpenCallCount: 0,
      halfOpenActiveCalls: 0,
      lastFailureTime: 0,
      lastStateChangeTime: Date.now(),
    };
    breakers.set(breakerKey, breaker);
  }
  return breaker;
}

/**
 * 构造复合熔断 key：`providerId:endpoint`
 *
 * 维度隔离语义：
 * - 同一 provider 的不同 endpoint 仍独立熔断（保持现状）
 * - 不同 provider 即使 endpoint 相同也独立熔断（修复维度耦合）
 * - 若 providerId 缺失（如 GET 请求无 body），回退到仅 endpoint 维度，保持向后兼容
 *
 * 调用方应使用此函数构造 key，避免直接拼接字符串导致格式不一致。
 */
export function buildCircuitBreakerKey(
  providerId: string | undefined | null,
  endpoint: string,
): string {
  if (!providerId) {
    return endpoint;
  }
  return `${providerId}:${endpoint}`;
}

function tryTransitionToHalfOpen(breaker: CircuitBreakerState, config: CircuitBreakerConfig): void {
  if (breaker.state === "open") {
    const elapsed = Date.now() - breaker.lastFailureTime;
    if (elapsed >= config.recoveryTimeout) {
      breaker.state = "half-open";
      breaker.halfOpenCallCount = 0;
      breaker.halfOpenActiveCalls = 0;
      breaker.successCount = 0;
      breaker.lastStateChangeTime = Date.now();
    }
  }
}

function recordSuccess(breaker: CircuitBreakerState, config: CircuitBreakerConfig): void {
  if (breaker.state === "half-open") {
    breaker.successCount++;

    if (breaker.successCount >= config.successThreshold) {
      breaker.state = "closed";
      breaker.failureCount = 0;
      breaker.successCount = 0;
      breaker.halfOpenCallCount = 0;
      breaker.lastStateChangeTime = Date.now();
    }
  } else if (breaker.state === "closed") {
    breaker.failureCount = 0;
  }
}

function recordFailure(breaker: CircuitBreakerState, config: CircuitBreakerConfig): void {
  breaker.failureCount++;
  breaker.lastFailureTime = Date.now();

  if (breaker.state === "half-open") {
    breaker.state = "open";
    breaker.halfOpenActiveCalls = 0;
    breaker.lastStateChangeTime = Date.now();
  } else if (breaker.state === "closed") {
    if (breaker.failureCount >= config.failureThreshold) {
      breaker.state = "open";
      breaker.lastStateChangeTime = Date.now();
    }
  }
}

/**
 * 获取指定熔断 key 的熔断器状态。
 *
 * @param breakerKey 熔断 key，应由 `buildCircuitBreakerKey(providerId, endpoint)` 构造，
 *                  形成 `providerId:endpoint` 复合维度，避免不同 provider 共享 endpoint 时互相影响。
 */
export function getCircuitBreaker(breakerKey: string): CircuitBreakerState {
  return getOrCreateBreaker(breakerKey);
}

/**
 * 获取指定熔断 key 的当前状态（closed / open / half-open）。
 *
 * @param breakerKey 熔断 key，应由 `buildCircuitBreakerKey(providerId, endpoint)` 构造。
 */
export function getCircuitState(breakerKey: string): CircuitState {
  const breaker = getOrCreateBreaker(breakerKey);
  const config = getConfig();
  tryTransitionToHalfOpen(breaker, config);
  return breaker.state;
}

/**
 * 通过熔断器执行异步函数。
 *
 * @param breakerKey 熔断 key，应由 `buildCircuitBreakerKey(providerId, endpoint)` 构造，
 *                  形成 `providerId:endpoint` 复合维度。
 *                  - 同一 provider 的不同 endpoint 仍独立熔断（保持现状）
 *                  - 不同 provider 即使 endpoint 相同也独立熔断（修复维度耦合）
 * @param fn 待执行的异步函数
 * @param fallback 熔断器开启时的回退函数（可选）
 */
export async function executeThroughCircuit<T>(
  breakerKey: string,
  fn: () => Promise<T>,
  fallback?: () => Promise<T>,
): Promise<T> {
  const config = getConfig();

  if (!config.enabled) {
    return fn();
  }

  const breaker = getOrCreateBreaker(breakerKey);
  tryTransitionToHalfOpen(breaker, config);

  if (breaker.state === "open") {
    if (fallback) {
      return fallback();
    }
    throw Object.assign(
      new Error(`Circuit breaker is open for key: ${breakerKey}`),
      { code: "CIRCUIT_OPEN" as const },
    );
  }

  let wasHalfOpenCall = false;
  if (breaker.state === "half-open") {
    if (breaker.halfOpenActiveCalls >= config.halfOpenMaxCalls) {
      if (fallback) {
        return fallback();
      }
      throw Object.assign(
        new Error(`Circuit breaker half-open concurrency limit reached for key: ${breakerKey}`),
        { code: "CIRCUIT_HALF_OPEN_LIMIT" as const },
      );
    }
    breaker.halfOpenActiveCalls++;
    wasHalfOpenCall = true;
  }

  try {
    const result = await fn();
    recordSuccess(breaker, config);
    return result;
  } catch (error) {
    recordFailure(breaker, config);

    if (fallback) {
      return fallback();
    }

    throw error;
  } finally {
    if (wasHalfOpenCall && breaker.halfOpenActiveCalls > 0) {
      breaker.halfOpenActiveCalls--;
    }
  }
}

/**
 * 重置指定熔断 key 的熔断器。
 *
 * @param breakerKey 熔断 key，应由 `buildCircuitBreakerKey(providerId, endpoint)` 构造。
 */
export function resetCircuitBreaker(breakerKey: string): void {
  breakers.delete(breakerKey);
}

export function resetAllCircuitBreakers(): void {
  breakers.clear();
}

export function getAllCircuitStates(): Record<string, { state: CircuitState; failureCount: number; successCount: number }> {
  const result: Record<string, { state: CircuitState; failureCount: number; successCount: number }> = {};
  for (const [id, breaker] of breakers.entries()) {
    result[id] = {
      state: breaker.state,
      failureCount: breaker.failureCount,
      successCount: breaker.successCount,
    };
  }
  return result;
}
