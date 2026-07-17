import { useEffect, useRef } from "react";
import { initSyncEngine, destroySyncEngine, performSync } from "@/modules/sync";
import { processPendingQueue, cleanCompletedRequests, apiCall } from "@/shared/ai-providers";
import { errorLogger } from "@/shared/error-logger";
import { isElectron } from "@/shared/utils/platform";

export function MigrationInitializer() {
  const initialized = useRef(false);

  useEffect(() => {
    if (!isElectron()) return;
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

    // 应用退出时销毁 SyncEngine 单例的 timer，避免 timer 泄漏
    // beforeunload 是同步事件，destroySyncEngine 内部只做 clearInterval + 状态重置，无 I/O
    const handleBeforeUnload = () => {
      try {
        destroySyncEngine();
      } catch (err) {
        errorLogger.warn("[MigrationInitializer] SyncEngine destroy 失败:", err);
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    window.addEventListener("online", handleOnline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      clearInterval(cleanupInterval);
      // 组件卸载（HMR / 路由切换）时也销毁 engine，防止 timer 泄漏
      // 再次挂载时 initSyncEngine 会重新启动
      destroySyncEngine();
    };
  }, []);

  return null;
}
