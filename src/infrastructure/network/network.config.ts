import type { NetworkConfig } from "./types";

export const NETWORK_CONFIG: NetworkConfig = {
  resilientFetch: {
    enabled: true,
    chunkSize: 1024 * 1024,
    concurrency: 3,
    timeout: 30000,
    maxRetries: 3,
  },
  circuitBreaker: {
    enabled: true,
    failureThreshold: 5,
    recoveryTimeout: 30000,
    halfOpenMaxCalls: 2,
    successThreshold: 3,
  },
  downloadManager: {
    enabled: true,
    maxConcurrency: 2,
  },
  networkMonitor: {
    enabled: true,
    checkInterval: 10000,
    probeUrl: "/api/config",
    probeTimeout: 3000,
  },
  offlineQueue: {
    enabled: true,
    maxRetries: 3,
    processingInterval: 60000,
    deduplication: true,
  },
};

export function getNetworkConfig(): NetworkConfig {
  return { ...NETWORK_CONFIG };
}
