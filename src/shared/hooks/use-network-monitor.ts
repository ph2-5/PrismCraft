"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { logger } from "@/config/constants";
import { checkConfigStatus } from "@/shared/api-config";

interface NetworkState {
  isOnline: boolean;
  isReconnecting: boolean;
  lastOnlineTime: number | null;
  offlineDuration: number;
}

interface NetworkOptions {
  checkInterval?: number;
  reconnectTimeout?: number;
  onOnline?: () => void;
  onOffline?: () => void;
  onReconnect?: () => void;
}

export function useNetworkMonitor(options: NetworkOptions = {}) {
  const {
    checkInterval = 5000,
    reconnectTimeout = 30000,
    onOnline,
    onOffline,
    onReconnect,
  } = options;

  const [state, setState] = useState<NetworkState>(() => {
    if (typeof navigator !== "undefined") {
      return {
        isOnline: navigator.onLine,
        isReconnecting: false,
        lastOnlineTime: navigator.onLine ? Date.now() : null,
        offlineDuration: 0,
      };
    }
    return {
      isOnline: true,
      isReconnecting: false,
      lastOnlineTime: null,
      offlineDuration: 0,
    };
  });

  const offlineStartTimeRef = useRef<number | null>(null);
  const checkTimerRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);
  const onOfflineRef = useRef(onOffline);
  const onOnlineRef = useRef(onOnline);
  const onReconnectRef = useRef(onReconnect);
  useEffect(() => {
    onOfflineRef.current = onOffline;
    onOnlineRef.current = onOnline;
    onReconnectRef.current = onReconnect;
  });

  const checkConnection = useCallback(async (): Promise<boolean> => {
    try {
      if (!navigator.onLine) {
        return false;
      }

      try {
        const status = await checkConfigStatus();
        return !!(status?.text?.configured || status?.image?.configured || status?.video?.configured);
      } catch (e) {
        logger.warn("[NetworkMonitor] 配置状态检查失败", e);
        return navigator.onLine;
      }
    } catch (e) {
      logger.warn("[NetworkMonitor] 连接检查异常", e);
      return navigator.onLine;
    }
  }, []);

  const updateOnlineStatus = useCallback(
    async (forceCheck: boolean = false) => {
      const browserOnline = navigator.onLine;

      if (!browserOnline) {
        setState((prev) => {
          if (!prev.isOnline || forceCheck) {
            if (!offlineStartTimeRef.current) {
              offlineStartTimeRef.current = Date.now();
            }
            onOfflineRef.current?.();
            logger.warn("[NetworkMonitor] 网络已断开");
            return {
              ...prev,
              isOnline: false,
              lastOnlineTime: prev.lastOnlineTime || Date.now(),
            };
          }
          return prev;
        });
        return;
      }

      setState((prev) => {
        if (forceCheck || !prev.isOnline) {
          if (!prev.isOnline) {
            const offlineDuration = offlineStartTimeRef.current
              ? Date.now() - offlineStartTimeRef.current
              : 0;

            offlineStartTimeRef.current = null;
            onReconnectRef.current?.();
            logger.info(
              `[NetworkMonitor] 网络已恢复，离线时长: ${offlineDuration}ms`,
            );

            return {
              isOnline: true,
              isReconnecting: false,
              lastOnlineTime: Date.now(),
              offlineDuration,
            };
          }
          if (prev.isReconnecting && prev.isOnline) {
            return { ...prev, isReconnecting: false };
          }
        }
        return prev;
      });

      if (forceCheck) {
        checkConnection().then((isApiAvailable) => {
          if (!isApiAvailable) {
            logger.warn(
              "[NetworkMonitor] API 服务器可能不可用，但网络连接正常",
            );
          }
        }).catch(() => {
          logger.warn("[NetworkMonitor] 连接检查失败");
        });
      }
    },
    [checkConnection],
  );

  const reconnect = useCallback(async () => {
    setState((prev) => ({ ...prev, isReconnecting: true }));
    logger.info("[NetworkMonitor] 尝试重新连接...");

    await updateOnlineStatus(true);

    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
    }

    reconnectTimerRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        setState((prev) => ({
          ...prev,
          isReconnecting: false,
        }));
      }
    }, reconnectTimeout);
  }, [updateOnlineStatus, reconnectTimeout]);

  useEffect(() => {
    const handleOnline = () => {
      logger.info("[NetworkMonitor] 浏览器报告网络已连接");
      onOnlineRef.current?.();
      updateOnlineStatus(true).catch((err) => {
        logger.warn("[NetworkMonitor] 在线状态更新失败:", err);
      });
    };

    const handleOffline = () => {
      logger.warn("[NetworkMonitor] 浏览器报告网络已断开");
      setState((prev) => {
        if (prev.isOnline) {
          if (!offlineStartTimeRef.current) {
            offlineStartTimeRef.current = Date.now();
          }
          onOfflineRef.current?.();
          return {
            ...prev,
            isOnline: false,
          };
        }
        return prev;
      });
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [updateOnlineStatus]);

  useEffect(() => {
    checkTimerRef.current = setInterval(() => {
      updateOnlineStatus().catch((err) => {
        logger.warn("[NetworkMonitor] 定时在线状态检查失败:", err);
      });
    }, checkInterval);

    return () => {
      if (checkTimerRef.current) {
        clearInterval(checkTimerRef.current);
      }
    };
  }, [checkInterval, updateOnlineStatus]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
    };
  }, []);

  return {
    ...state,
    reconnect,
    checkConnection,
  };
}

export type { NetworkState, NetworkOptions };
