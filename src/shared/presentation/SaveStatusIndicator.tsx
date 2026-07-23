import React, { useEffect, useState, useRef, useCallback } from "react";
import { Check, Loader2, AlertCircle, Save } from "lucide-react";
import { t } from "@/shared/constants/messages";

const SAVE_INDICATOR_HIDE_DELAY_MS = 5000;

export type SaveStatus = "idle" | "saving" | "saved" | "error" | "unsaved";

interface SaveStatusIndicatorProps {
  status: SaveStatus;
  errorMessage?: string;
  className?: string;
}

const statusConfig: Record<
  SaveStatus,
  {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    className: string;
  }
> = {
  idle: {
    icon: Check,
    label: "",
    className: "text-muted-foreground opacity-0",
  },
  saving: {
    icon: Loader2,
    label: t("saveStatus.saving"),
    className: "text-primary",
  },
  saved: {
    icon: Check,
    label: t("saveStatus.saved"),
    className: "text-success",
  },
  error: {
    icon: AlertCircle,
    label: t("saveStatus.saveFailed"),
    className: "text-destructive",
  },
  unsaved: {
    icon: Save,
    label: t("saveStatus.unsaved"),
    className: "text-amber-500 animate-pulse",
  },
};

export function SaveStatusIndicator({
  status,
  errorMessage,
  className = "",
}: SaveStatusIndicatorProps) {
  const [showSaved, setShowSaved] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    clearHideTimer();

    if (status === "saved") {
      const showTimer = setTimeout(() => setShowSaved(true), 0);
      hideTimerRef.current = setTimeout(() => setShowSaved(false), SAVE_INDICATOR_HIDE_DELAY_MS);
      return () => {
        clearTimeout(showTimer);
        clearHideTimer();
      };
    }

    if (status === "error") {
      setShowSaved(true);
      return () => {};
    }

    const hideTimer = setTimeout(() => setShowSaved(false), 0);
    return () => clearTimeout(hideTimer);
  }, [status, clearHideTimer]);

  const displayStatus = status === "saved" && !showSaved ? "idle" : status;
  const config = statusConfig[displayStatus];
  const Icon = config.icon;

  // idle 状态无动态文本，无需 aria-live；error 用 role="alert" 即时朗读，其余用 polite
  const liveProps =
    displayStatus === "idle"
      ? {}
      : displayStatus === "error"
        ? { role: "alert" as const }
        : { role: "status" as const, "aria-live": "polite" as const };

  return (
    <div
      className={`flex items-center gap-1.5 text-xs font-medium transition-all duration-300 ${config.className} ${className}`}
      {...liveProps}
    >
      <Icon
        className={`w-3.5 h-3.5 ${
          status === "saving" ? "animate-spin" : ""
        } ${status === "saved" && showSaved ? "animate-bounce-in" : ""}`}
      />
      {config.label && <span>{config.label}</span>}
      {status === "error" && errorMessage && (
        <span className="text-[10px] opacity-70">({errorMessage})</span>
      )}
    </div>
  );
}
