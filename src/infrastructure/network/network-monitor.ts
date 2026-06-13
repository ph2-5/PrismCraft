import type { NetworkQuality, NetworkQualityLevel } from "./types";
import { NETWORK_CONFIG } from "./network.config";
import { errorLogger } from "@/shared/error-logger";

type NetworkChangeListener = (quality: NetworkQuality) => void;

const listeners = new Set<NetworkChangeListener>();
let currentQuality: NetworkQuality = {
  level: "good",
  latency: 0,
  bandwidth: 0,
  packetLoss: 0,
  lastMeasuredAt: 0,
};

const latencyHistory: number[] = [];
const MAX_LATENCY_SAMPLES = 10;
let checkIntervalId: ReturnType<typeof setInterval> | null = null;
let isMonitoring = false;
let boundHandleOnline: (() => void) | null = null;
let boundHandleOffline: (() => void) | null = null;

if (typeof window !== "undefined") {
  const prev = window.__NETWORK_MONITOR_STATE__;
  if (prev && typeof prev === "object") {
    if (prev.checkIntervalId) clearInterval(prev.checkIntervalId);
    if (prev.boundHandleOnline) window.removeEventListener("online", prev.boundHandleOnline);
    if (prev.boundHandleOffline) window.removeEventListener("offline", prev.boundHandleOffline);
  }
  window.__NETWORK_MONITOR_STATE__ = {
    get checkIntervalId() { return checkIntervalId; },
    get boundHandleOnline() { return boundHandleOnline; },
    get boundHandleOffline() { return boundHandleOffline; },
  };
}

function classifyQuality(latency: number, _bandwidth: number): NetworkQualityLevel {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return "offline";
  }
  if (latency < 100) return "excellent";
  if (latency < 300) return "good";
  if (latency < 1000) return "fair";
  return "poor";
}

async function measureLatency(): Promise<number> {
  const config = NETWORK_CONFIG.networkMonitor;
  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.probeTimeout);

    await fetch(config.probeUrl, {
      method: "HEAD",
      signal: controller.signal,
      cache: "no-store",
    });

    clearTimeout(timeoutId);
    return Date.now() - startTime;
  } catch (e) {
    errorLogger.warn("[NetworkMonitor] Latency probe failed", e);
    return -1;
  }
}

function estimateBandwidth(): number {
  if (latencyHistory.length === 0) return 0;

  const avgLatency = latencyHistory.reduce((a, b) => a + b, 0) / latencyHistory.length;

  if (avgLatency <= 0) return 0;
  if (avgLatency < 100) return 50;
  if (avgLatency < 300) return 20;
  if (avgLatency < 1000) return 5;
  return 1;
}

function estimatePacketLoss(): number {
  if (latencyHistory.length < 3) return 0;

  const failed = latencyHistory.filter((l) => l < 0).length;
  return (failed / latencyHistory.length) * 100;
}

async function updateQuality(): Promise<void> {
  const latency = await measureLatency();

  if (latency > 0) {
    latencyHistory.push(latency);
    if (latencyHistory.length > MAX_LATENCY_SAMPLES) {
      latencyHistory.shift();
    }
  }

  const bandwidth = estimateBandwidth();
  const packetLoss = estimatePacketLoss();
  const level = latency < 0 ? "offline" : classifyQuality(latency, bandwidth);

  const newQuality: NetworkQuality = {
    level,
    latency: latency > 0 ? latency : currentQuality.latency,
    bandwidth,
    packetLoss,
    lastMeasuredAt: Date.now(),
  };

  const levelChanged = currentQuality.level !== newQuality.level;
  currentQuality = newQuality;

  if (levelChanged) {
    for (const listener of listeners) {
      try {
        listener(newQuality);
      } catch (e) {
        errorLogger.warn("[NetworkMonitor] Listener error in updateQuality", e);
      }
    }
  }
}

export function startMonitoring(): void {
  if (isMonitoring) return;

  isMonitoring = true;
  updateQuality();

  checkIntervalId = setInterval(() => {
    updateQuality().catch((err) => {
      errorLogger.warn("[NetworkMonitor] 网络质量检测失败", err);
    });
  }, NETWORK_CONFIG.networkMonitor.checkInterval);

  if (typeof window !== "undefined") {
    boundHandleOnline = () => {
      currentQuality = { ...currentQuality, level: classifyQuality(currentQuality.latency, currentQuality.bandwidth) };
      for (const listener of listeners) {
        try { listener(currentQuality); } catch (e) { errorLogger.warn("[NetworkMonitor] Listener error in online handler", e); }
      }
    };

    boundHandleOffline = () => {
      currentQuality = { ...currentQuality, level: "offline", lastMeasuredAt: Date.now() };
      for (const listener of listeners) {
        try { listener(currentQuality); } catch (e) { errorLogger.warn("[NetworkMonitor] Listener error in offline handler", e); }
      }
    };

    window.addEventListener("online", boundHandleOnline);
    window.addEventListener("offline", boundHandleOffline);
  }
}

export function stopMonitoring(): void {
  if (checkIntervalId) {
    clearInterval(checkIntervalId);
    checkIntervalId = null;
  }
  if (typeof window !== "undefined") {
    if (boundHandleOnline) {
      window.removeEventListener("online", boundHandleOnline);
      boundHandleOnline = null;
    }
    if (boundHandleOffline) {
      window.removeEventListener("offline", boundHandleOffline);
      boundHandleOffline = null;
    }
  }
  isMonitoring = false;
}

export function getNetworkQuality(): NetworkQuality {
  return { ...currentQuality };
}

export function getAdaptiveTimeout(baseTimeout: number): number {
  switch (currentQuality.level) {
    case "excellent": return baseTimeout;
    case "good": return baseTimeout;
    case "fair": return Math.floor(baseTimeout * 1.5);
    case "poor": return baseTimeout * 2;
    case "offline": return baseTimeout * 3;
  }
}

export function getAdaptiveConcurrency(baseConcurrency: number): number {
  switch (currentQuality.level) {
    case "excellent": return baseConcurrency;
    case "good": return Math.max(1, Math.floor(baseConcurrency * 0.8));
    case "fair": return Math.max(1, Math.floor(baseConcurrency * 0.5));
    case "poor": return Math.max(1, Math.floor(baseConcurrency * 0.3));
    case "offline": return 0;
  }
}

export function shouldDeferNonCriticalRequest(): boolean {
  return currentQuality.level === "poor" || currentQuality.level === "offline";
}

export function onNetworkChange(callback: NetworkChangeListener): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}
