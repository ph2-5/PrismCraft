"use client";

import { useRef, useCallback } from "react";
import { errorLogger } from "@/shared/error-logger";
import { emitToast } from "@/shared/utils/toast-bridge";

const MAX_RETRY = 3;

export function usePersistenceGuard() {
  const savingRef = useRef(false);
  const pendingRef = useRef(false);
  const retryCountRef = useRef(0);
  const saveFnRef = useRef<(() => Promise<void>) | null>(null);

  const guardedSave = useCallback(async (saveFn: () => Promise<void>) => {
    saveFnRef.current = saveFn;

    if (savingRef.current) {
      pendingRef.current = true;
      return;
    }

    while (true) {
      savingRef.current = true;
      try {
        await saveFnRef.current();
        retryCountRef.current = 0;
      } catch (e) {
        retryCountRef.current++;
        errorLogger.warn("[PersistenceGuard] Save failed", e);
        if (retryCountRef.current >= MAX_RETRY) {
          emitToast("error", "保存失败", "多次重试后仍无法保存，请手动保存您的更改");
          retryCountRef.current = 0;
          pendingRef.current = false;
          savingRef.current = false;
          return;
        }
      }
      savingRef.current = false;
      if (pendingRef.current) {
        pendingRef.current = false;
      } else {
        return;
      }
    }
  }, []);

  return { guardedSave };
}
