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

function getOrCreateBreaker(providerId: string): CircuitBreakerState {
  let breaker = breakers.get(providerId);
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
    breakers.set(providerId, breaker);
  }
  return breaker;
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

export function getCircuitBreaker(providerId: string): CircuitBreakerState {
  return getOrCreateBreaker(providerId);
}

export function getCircuitState(providerId: string): CircuitState {
  const breaker = getOrCreateBreaker(providerId);
  const config = getConfig();
  tryTransitionToHalfOpen(breaker, config);
  return breaker.state;
}

export async function executeThroughCircuit<T>(
  providerId: string,
  fn: () => Promise<T>,
  fallback?: () => Promise<T>,
): Promise<T> {
  const config = getConfig();

  if (!config.enabled) {
    return fn();
  }

  const breaker = getOrCreateBreaker(providerId);
  tryTransitionToHalfOpen(breaker, config);

  if (breaker.state === "open") {
    if (fallback) {
      return fallback();
    }
    throw new Error(`Circuit breaker is open for provider: ${providerId}`);
  }

  let wasHalfOpenCall = false;
  if (breaker.state === "half-open") {
    if (breaker.halfOpenActiveCalls >= config.halfOpenMaxCalls) {
      if (fallback) {
        return fallback();
      }
      throw new Error(`Circuit breaker half-open concurrency limit reached for provider: ${providerId}`);
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

export function resetCircuitBreaker(providerId: string): void {
  breakers.delete(providerId);
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
