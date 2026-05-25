import type { Interceptor, RetryPolicy } from "./types";
import { NETWORK_CONFIG } from "./network.config";
import {
  lifecycleInterceptor,
  circuitBreakerInterceptor,
  cacheInterceptor,
  retryInterceptor,
  loggingInterceptor,
} from "./interceptors";

export interface NetworkProfile {
  interceptors: Interceptor[];
  timeout: number;
  retryPolicy: RetryPolicy | "api" | "video" | "download" | "status";
  circuitBreakerEnabled: boolean;
}

export const aiApiProfile: NetworkProfile = {
  interceptors: [
    lifecycleInterceptor,
    circuitBreakerInterceptor,
    cacheInterceptor,
    retryInterceptor,
    loggingInterceptor,
  ],
  timeout: 60000,
  retryPolicy: "api",
  circuitBreakerEnabled: NETWORK_CONFIG.circuitBreaker.enabled,
};

export const syncProfile: NetworkProfile = {
  interceptors: [
    lifecycleInterceptor,
    retryInterceptor,
    loggingInterceptor,
  ],
  timeout: 120000,
  retryPolicy: {
    maxRetries: 5,
    baseDelay: 1000,
    maxDelay: 30000,
    backoff: "exponential",
    jitter: true,
    retryableErrors: ["NETWORK_ERROR", "TIMEOUT", "API_SERVER_ERROR", "ECONNREFUSED", "ETIMEDOUT"],
  },
  circuitBreakerEnabled: false,
};
