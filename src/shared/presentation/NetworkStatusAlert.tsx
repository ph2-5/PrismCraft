"use client";

import { useEffect, useState, useRef, useSyncExternalStore } from "react";
import { Wifi, WifiOff, RefreshCw } from "lucide-react";
import { Button } from "@/shared/ui/button";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/shared/ui/alert";
import { useNetworkMonitor } from "@/shared/hooks/use-network-monitor";

const subscribeNoop = () => () => {};

export function NetworkStatusAlert() {
  const [showReconnectSuccess, setShowReconnectSuccess] = useState(false);
  const isInitialized = useSyncExternalStore(subscribeNoop, () => true, () => false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const {
    isOnline,
    isReconnecting,
    offlineDuration,
    reconnect,
  } = useNetworkMonitor({
    onOffline: () => {
      setShowReconnectSuccess(false);
    },
    onReconnect: () => {
      setShowReconnectSuccess(true);

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setShowReconnectSuccess(false);
      }, 3000);
    },
  });

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (!isInitialized) {
    return null;
  }

  const formatOfflineDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}小时${minutes % 60}分钟`;
    } else if (minutes > 0) {
      return `${minutes}分钟${seconds % 60}秒`;
    } else {
      return `${seconds}秒`;
    }
  };

  if (isOnline && !showReconnectSuccess) {
    return null;
  }

  if (!isOnline) {
    return (
      <div className="fixed top-16 left-0 right-0 z-50 px-4">
        <Alert variant="destructive" className="max-w-2xl mx-auto">
          <WifiOff className="h-4 w-4" />
          <AlertTitle>网络已断开</AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <span>
              {offlineDuration > 0
                ? `已离线 ${formatOfflineDuration(offlineDuration)}`
                : "请检查网络连接，恢复后将自动继续"}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={reconnect}
              disabled={isReconnecting}
              className="ml-4"
            >
              {isReconnecting ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              {isReconnecting ? "连接中..." : "重新连接"}
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (showReconnectSuccess) {
    return (
      <div className="fixed top-16 left-0 right-0 z-50 px-4">
        <Alert className="max-w-2xl mx-auto bg-green-900/20 border-green-800">
          <Wifi className="h-4 w-4 text-green-400" />
          <AlertTitle className="text-green-300">网络已恢复</AlertTitle>
          <AlertDescription className="text-green-400">
            已自动恢复网络连接，继续创作吧！
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return null;
}
