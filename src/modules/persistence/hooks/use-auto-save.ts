import { useRef, useEffect, useCallback } from "react";
import { fromAsyncThrowable } from "@/domain/types/result";
import { emitToast } from "@/shared/utils/toast-bridge";
import { t } from "@/shared/constants";

const MAX_RETRY = 3;
const MIN_INTERVAL_MINUTES = 0.5;

interface UseAutoSaveOptions {
  enabled: boolean;
  intervalMinutes: number;
  onSave: () => Promise<void>;
  isDirty?: () => boolean;
}

export function useAutoSave({ enabled, intervalMinutes, onSave, isDirty }: UseAutoSaveOptions) {
  const savingRef = useRef(false);
  const pendingRef = useRef(false);
  const retryCountRef = useRef(0);
  const cancelledRef = useRef(false);
  const onSaveRef = useRef(onSave);
  // 与 onSaveRef 对称：用 ref 同步 isDirty，避免 setInterval 闭包捕获过期引用（stale closure）
  const isDirtyRef = useRef(isDirty);
  useEffect(() => {
    onSaveRef.current = onSave;
    isDirtyRef.current = isDirty;
  }, [onSave, isDirty]);

  const guardedSave = useCallback(async () => {
    if (savingRef.current) {
      pendingRef.current = true;
      return;
    }
    if (cancelledRef.current) return;

    while (!cancelledRef.current) {
      savingRef.current = true;
      const saveResult = await fromAsyncThrowable(() => onSaveRef.current());
      if (saveResult.ok) {
        retryCountRef.current = 0;
      } else {
        retryCountRef.current++;
        if (retryCountRef.current >= MAX_RETRY) {
          emitToast("error", t("error.saveFailed"), t("error.saveFailedRetry"));
          retryCountRef.current = 0;
          pendingRef.current = false;
          savingRef.current = false;
          return;
        }
        await new Promise(r => setTimeout(r, 200 * Math.pow(2, retryCountRef.current - 1)));
        continue;
      }
      savingRef.current = false;
      if (pendingRef.current && !cancelledRef.current) {
        pendingRef.current = false;
      } else {
        return;
      }
    }
    savingRef.current = false;
  }, []);

  const clampedInterval = Math.max(intervalMinutes, MIN_INTERVAL_MINUTES);
  const intervalMs = clampedInterval * 60 * 1000;

  useEffect(() => {
    if (!enabled || intervalMinutes <= 0) return;

    cancelledRef.current = false;

    const timer = setInterval(() => {
      // 通过 ref 读取最新 isDirty，避免 setInterval 闭包捕获过期引用
      if (isDirtyRef.current && !isDirtyRef.current()) return;
      guardedSave();
    }, intervalMs);

    return () => {
      cancelledRef.current = true;
      clearInterval(timer);
    };
  }, [enabled, intervalMinutes, intervalMs, guardedSave]);

  return { triggerSave: guardedSave };
}
