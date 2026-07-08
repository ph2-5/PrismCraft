import { useEffect, useState, useRef, useSyncExternalStore } from "react";
import { Wifi, WifiOff, RefreshCw, Loader2 } from "lucide-react";
import { useNetworkMonitor } from "@/shared/hooks/use-network-monitor";
import { t } from "@/shared/constants/messages";

const subscribeNoop = () => () => {};

export function NetworkStatusAlert() {
  const [showReconnectSuccess, setShowReconnectSuccess] = useState(false);
  const isInitialized = useSyncExternalStore(subscribeNoop, () => true, () => false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        <div style={{ padding: 12, borderRadius: 8, border: "1px solid var(--border)", background: "var(--card2)" }} className="max-w-2xl mx-auto">
          <div className="flex items-start gap-3">
            <WifiOff className="h-4 w-4 mt-0.5" />
            <div className="flex-1">
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{t("network.disconnected")}</div>
              <div className="flex items-center justify-between" style={{ fontSize: 12, color: "var(--muted-fg)" }}>
                <span>
                  {offlineDuration > 0
                    ? t("network.offlineDuration", { duration: formatOfflineDuration(offlineDuration) })
                    : t("network.checkConnection")}
                </span>
                <button
                  type="button"
                  className="btn btn-outline btn-sm ml-4"
                  onClick={reconnect}
                  disabled={isReconnecting}
                >
                  {isReconnecting ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  {isReconnecting ? t("network.reconnecting") : t("network.reconnect")}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (showReconnectSuccess) {
    return (
      <div className="fixed top-16 left-0 right-0 z-50 px-4">
        <div style={{ padding: 12, borderRadius: 8, border: "1px solid var(--border)", background: "var(--card2)" }} className="max-w-2xl mx-auto bg-success/20 border-success">
          <div className="flex items-start gap-3">
            <Wifi className="h-4 w-4 mt-0.5" style={{ color: "var(--success)" }} />
            <div className="flex-1">
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }} className="text-success">{t("network.recovered")}</div>
              <div className="text-success" style={{ fontSize: 12, color: "var(--muted-fg)" }}>
                {t("network.recoveredDesc")}
                <span className="block text-xs mt-1">{t("network.retrySuggestion")}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
