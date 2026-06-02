import { useEffect, useState, useRef, useSyncExternalStore } from "react";
import { Wifi, WifiOff, RefreshCw } from "lucide-react";
import { Button } from "@/shared/ui/button";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/shared/ui/alert";
import { useNetworkMonitor } from "@/shared/hooks/use-network-monitor";
import { t } from "@/shared/constants/messages";

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
      return t("network.hoursMinutes", { hours, minutes: minutes % 60 });
    } else if (minutes > 0) {
      return t("network.minutesSeconds", { minutes, seconds: seconds % 60 });
    } else {
      return t("network.secondsOnly", { seconds });
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
          <AlertTitle>{t("network.disconnected")}</AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <span>
              {offlineDuration > 0
                ? t("network.offlineDuration", { duration: formatOfflineDuration(offlineDuration) })
                : t("network.checkConnection")}
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
              {isReconnecting ? t("network.reconnecting") : t("network.reconnect")}
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
          <AlertTitle className="text-green-300">{t("network.recovered")}</AlertTitle>
          <AlertDescription className="text-green-400">
            {t("network.recoveredDesc")}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return null;
}
