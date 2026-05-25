"use client";

import { useEffect, useRef } from "react";
import { initSyncEngine, performSync } from "@/modules/sync";
import { processPendingQueue, cleanCompletedRequests } from "@/infrastructure/ai-providers/offline-queue";
import { apiCall } from "@/infrastructure/ai-providers/core";
import { errorLogger } from "@/shared/error-logger";

export function MigrationInitializer() {
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    initSyncEngine().catch((err) => {
      errorLogger.warn("[MigrationInitializer] 同步引擎初始化失败:", err);
    });

    const handleOnline = async () => {
      try {
        await processPendingQueue(async (type, payload) => {
          const endpoint = (payload._endpoint as string) || type;
          const method = (payload._method as string) || "POST";
          const bodyPayload = { ...payload };
          delete bodyPayload._endpoint;
          delete bodyPayload._method;

          const result = await apiCall<{ success?: boolean }>(endpoint, {
            method,
            body: JSON.stringify(bodyPayload),
          });
          return result.success !== false;
        });

        await performSync();
      } catch (err) {
        errorLogger.warn("[MigrationInitializer] 在线恢复处理失败:", err);
      }
    };

    const cleanupInterval = setInterval(() => {
      cleanCompletedRequests().catch((e) => {
        errorLogger.warn("[MigrationInitializer] cleanCompletedRequests failed", e);
      });
    }, 3600000);

    window.addEventListener("online", handleOnline);

    return () => {
      window.removeEventListener("online", handleOnline);
      clearInterval(cleanupInterval);
    };
  }, []);

  return null;
}
