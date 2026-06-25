import { useState } from "react";
import {
  Cloud,
  CloudOff,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import type { SyncStatusInfo } from "@/modules/sync";
import { t } from "@/shared/constants";

interface SyncStatusIndicatorProps {
  status: SyncStatusInfo;
  onClick?: () => void;
}

export function SyncStatusIndicator({ status, onClick }: SyncStatusIndicatorProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  if (!status) return null;

  const { lastSyncAt, pendingChanges, conflicts, isSyncing } = status;

  let icon = <CloudOff className="h-4 w-4" />;
  let label = t("sync.notSynced");
  let badgeClassName = "badge";

  if (isSyncing) {
    icon = <RefreshCw className="h-4 w-4 animate-spin" />;
    label = t("sync.syncingShort");
    badgeClassName = "badge badge-muted";
  } else if (conflicts > 0) {
    icon = <AlertTriangle className="h-4 w-4" />;
    label = t("sync.conflictCount", { count: conflicts });
    badgeClassName = "badge badge-danger";
  } else if (pendingChanges > 0) {
    icon = <Cloud className="h-4 w-4" />;
    label = t("sync.pendingSyncCount", { count: pendingChanges });
    badgeClassName = "badge badge-muted";
  } else if (lastSyncAt) {
    icon = <CheckCircle2 className="h-4 w-4" />;
    label = t("sync.synced");
    badgeClassName = "badge badge-info";
  }

  const timeText = lastSyncAt
    ? t("sync.lastSyncAt", { time: new Date(lastSyncAt).toLocaleString("zh-CN") })
    : t("sync.notSyncedYetShort");

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <button onClick={onClick} className="cursor-pointer">
        <span className={`${badgeClassName} gap-1`}>
          {icon}
          <span className="hidden sm:inline">{label}</span>
        </span>
      </button>
      {showTooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-popover text-popover-foreground text-xs rounded-md shadow-md border whitespace-nowrap z-50">
          <div className="space-y-1">
            <p>{timeText}</p>
            {pendingChanges > 0 && <p>{t("sync.pendingChanges", { count: pendingChanges })}</p>}
            {conflicts > 0 && <p>{t("sync.conflictsLabel", { count: conflicts })}</p>}
            <p className="text-muted-foreground">{t("sync.clickToOpen")}</p>
          </div>
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-popover" />
        </div>
      )}
    </div>
  );
}
