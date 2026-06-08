import type { TaskPriority } from "@/infrastructure/network/types";
import { NETWORK_CONFIG } from "@/infrastructure/network/network.config";
import { getNetworkQuality } from "@/infrastructure/network/network-monitor";

export interface QueuedRequest {
  id: string;
  type: string;
  payload: string;
  status: "pending" | "generating" | "failed";
  retryCount: number;
  maxRetries: number;
  createdAt: number;
  lastAttemptAt: number | null;
  nextRetryAt: number | null;
  error: string | null;
  priority: TaskPriority;
}

export const MAX_RETRIES = NETWORK_CONFIG.offlineQueue.maxRetries;
export const MAX_RETRY_COUNT = 5;

export function calculateRetryDelay(attempt: number, baseDelayMs = 5000): number {
  const maxDelayMs = 60 * 60 * 1000;
  const jitter = Math.random() * 0.3 + 0.85;
  const delay = Math.min(baseDelayMs * Math.pow(2, attempt) * jitter, maxDelayMs);
  return delay;
}

export const deduplicationCache = new Map<string, { value: string; expiresAt: number }>();
export const DEDUPE_TTL_MS = 10 * 60 * 1000;

export function pruneDeduplicationCache(): void {
  const now = Date.now();
  for (const [key, entry] of deduplicationCache) {
    if (now >= entry.expiresAt) {
      deduplicationCache.delete(key);
    }
  }
}

export function isOnline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine;
}

export function priorityValue(priority: TaskPriority): number {
  switch (priority) {
    case "critical": return 3;
    case "normal": return 2;
    case "low": return 1;
  }
}

export function computeDeduplicationKey(type: string, payload: Record<string, unknown>): string {
  const sortedPayload = Object.keys(payload)
    .filter((k) => !k.startsWith("_"))
    .sort()
    .map((k) => `${k}=${JSON.stringify(payload[k])}`)
    .join("&");
  return `${type}:${sortedPayload}`;
}

export function getAdaptiveInterval(): number {
  const baseInterval = NETWORK_CONFIG.offlineQueue.processingInterval;
  const quality = getNetworkQuality();

  switch (quality.level) {
    case "excellent":
    case "good":
      return baseInterval;
    case "fair":
      return Math.floor(baseInterval * 1.5);
    case "poor":
      return baseInterval * 2;
    case "offline":
      return baseInterval * 3;
  }
}

const PERMANENT_ERROR_PATTERNS = [
  /401/i, /unauthorized/i, /invalid.*api.*key/i, /authentication/i,
  /400/i, /bad request/i, /invalid.*parameter/i, /invalid.*model/i,
  /403/i, /forbidden/i, /quota/i, /billing/i,
];

export function isPermanentError(errorMessage: string | null): boolean {
  if (!errorMessage) return false;
  return PERMANENT_ERROR_PATTERNS.some(pattern => pattern.test(errorMessage));
}
