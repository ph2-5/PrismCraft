import { useSyncExternalStore } from "react";

let cachedNow = 0;
let nowTimer: ReturnType<typeof setInterval> | null = null;
const nowListeners = new Set<() => void>();

function subscribeNow(callback: () => void) {
  nowListeners.add(callback);
  if (nowListeners.size === 1) {
    cachedNow = Date.now();
    nowTimer = setInterval(() => {
      cachedNow = Date.now();
      nowListeners.forEach(l => l());
    }, 60000);
  }
  return () => {
    nowListeners.delete(callback);
    if (nowListeners.size === 0 && nowTimer) {
      clearInterval(nowTimer);
      nowTimer = null;
    }
  };
}

function getNowSnapshot() {
  return cachedNow;
}

function getNowServerSnapshot() {
  return 0;
}

export function useCurrentTime() {
  return useSyncExternalStore(subscribeNow, getNowSnapshot, getNowServerSnapshot);
}
