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

// 获取初始网络状态，兼容 SSR 环境（无 navigator）
function getInitialNetworkState(): NetworkState {
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
}

// 通过配置状态接口检查 API 服务器可用性
async function checkApiAvailability(): Promise<boolean> {
  if (!navigator.onLine) {
    return false;
  }
  try {
    const status = await checkConfigStatus();
    const caps = status?.capabilities;
    return !!(
      caps?.text?.configured ||
      caps?.image?.configured ||
      caps?.video?.configured
    );
  } catch (e) {
    logger.warn("[NetworkMonitor] 配置状态检查失败", e);
    return navigator.onLine;
  }
}

// 计算离线状态转换后的下一个状态（用于 updateOnlineStatus 离线分支）
function computeOfflineState(
  prev: NetworkState,
  forceCheck: boolean,
  offlineStartTimeRef: { current: number | null },
  onOffline: (() => void) | undefined,
): NetworkState {
  // 已处于离线且非强制检查时无需更新
  if (!prev.isOnline && !forceCheck) {
    return prev;
  }
  if (!offlineStartTimeRef.current) {
    offlineStartTimeRef.current = Date.now();
  }
  onOffline?.();
  logger.warn("[NetworkMonitor] 网络已断开");
  return {
    ...prev,
    isOnline: false,
    lastOnlineTime: prev.lastOnlineTime || Date.now(),
  };
}

// 计算在线状态转换后的下一个状态（用于 updateOnlineStatus 在线分支）
function computeOnlineState(
  prev: NetworkState,
  forceCheck: boolean,
  offlineStartTimeRef: { current: number | null },
  onReconnect: (() => void) | undefined,
): NetworkState {
  if (!forceCheck && prev.isOnline) {
    return prev;
  }
  if (!prev.isOnline) {
    const offlineDuration = offlineStartTimeRef.current
      ? Date.now() - offlineStartTimeRef.current
      : 0;
    offlineStartTimeRef.current = null;
    onReconnect?.();
    logger.info(`[NetworkMonitor] 网络已恢复，离线时长: ${offlineDuration}ms`);
    return {
      isOnline: true,
      isReconnecting: false,
      lastOnlineTime: Date.now(),
      offlineDuration,
    };
  }
  if (prev.isReconnecting) {
    return { ...prev, isReconnecting: false };
  }
  return prev;
}

export function useNetworkMonitor(options: NetworkOptions = {}) {
  const {
    checkInterval = 5000,
    reconnectTimeout = 30000,
    onOnline,
    onOffline,
    onReconnect,
  } = options;

  const [state, setState] = useState<NetworkState>(getInitialNetworkState);

  const offlineStartTimeRef = useRef<number | null>(null);
  const checkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
      return await checkApiAvailability();
    } catch (e) {
      logger.warn("[NetworkMonitor] 连接检查异常", e);
      return navigator.onLine;
    }
  }, []);

  const updateOnlineStatus = useCallback(
    async (forceCheck: boolean = false) => {
      // 浏览器报告离线：交给 computeOfflineState 计算下一个状态
      if (!navigator.onLine) {
        setState((prev) =>
          computeOfflineState(
            prev,
            forceCheck,
            offlineStartTimeRef,
            onOfflineRef.current,
          ),
        );
        return;
      }
      // 浏览器报告在线：交给 computeOnlineState 计算下一个状态
      setState((prev) =>
        computeOnlineState(
          prev,
          forceCheck,
          offlineStartTimeRef,
          onReconnectRef.current,
        ),
      );
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
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        setState((prev) => ({ ...prev, isReconnecting: false }));
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
    // handleOffline 使用早返回降低嵌套深度
    const handleOffline = () => {
      logger.warn("[NetworkMonitor] 浏览器报告网络已断开");
      setState((prev) => {
        if (!prev.isOnline) {
          return prev;
        }
        if (!offlineStartTimeRef.current) {
          offlineStartTimeRef.current = Date.now();
        }
        onOfflineRef.current?.();
        return { ...prev, isOnline: false };
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
      // 组件卸载后不再 setState，避免 React 警告和无意义的渲染
      if (!isMountedRef.current) return;
      updateOnlineStatus().catch((err) => {
        logger.warn("[NetworkMonitor] 定时在线状态检查失败:", err);
      });
    }, checkInterval);
    return () => {
      if (checkTimerRef.current) clearInterval(checkTimerRef.current);
    };
  }, [checkInterval, updateOnlineStatus]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, []);

  return {
    ...state,
    reconnect,
    checkConnection,
  };
}

export type { NetworkState, NetworkOptions };
