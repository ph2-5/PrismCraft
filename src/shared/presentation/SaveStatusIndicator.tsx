import React, { useEffect, useState, useRef, useCallback } from "react";
import { Check, Loader2, AlertCircle } from "lucide-react";
import { t } from "@/shared/constants/messages";

export type SaveStatus = "idle" | "saving" | "saved" | "error" | "unsaved";

interface SaveStatusIndicatorProps {
  status: SaveStatus;
  errorMessage?: string;
  className?: string;
}

const statusConfig: Record<
  SaveStatus,
  {
    icon: React.ElementType;
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
    className: "text-green-500",
  },
  error: {
    icon: AlertCircle,
    label: t("saveStatus.saveFailed"),
    className: "text-destructive",
  },
  unsaved: {
    icon: AlertCircle,
    label: t("saveStatus.unsaved"),
    className: "text-amber-500",
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
      hideTimerRef.current = setTimeout(() => setShowSaved(false), 3000);
      return () => {
        clearTimeout(showTimer);
        clearHideTimer();
      };
    }

    const hideTimer = setTimeout(() => setShowSaved(false), 0);
    return () => clearTimeout(hideTimer);
  }, [status, clearHideTimer]);

  const displayStatus = status === "saved" && !showSaved ? "idle" : status;
  const config = statusConfig[displayStatus];
  const Icon = config.icon;

  return (
    <div
      className={`flex items-center gap-1.5 text-xs font-medium transition-all duration-300 ${config.className} ${className}`}
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
