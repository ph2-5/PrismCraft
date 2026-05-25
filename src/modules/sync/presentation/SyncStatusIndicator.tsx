"use client";

import { useState } from "react";
import { Badge } from "@/shared/ui/badge";
import {
  Cloud,
  CloudOff,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import type { SyncStatusInfo } from "@/modules/sync";

interface SyncStatusIndicatorProps {
  status: SyncStatusInfo;
  onClick?: () => void;
}

export function SyncStatusIndicator({ status, onClick }: SyncStatusIndicatorProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  if (!status) return null;

  const { lastSyncAt, pendingChanges, conflicts, isSyncing } = status;

  let icon = <CloudOff className="h-4 w-4" />;
  let label = "未同步";
  let variant: "default" | "secondary" | "destructive" | "outline" = "outline";

  if (isSyncing) {
    icon = <RefreshCw className="h-4 w-4 animate-spin" />;
    label = "同步中...";
    variant = "secondary";
  } else if (conflicts > 0) {
    icon = <AlertTriangle className="h-4 w-4" />;
    label = `${conflicts} 个冲突`;
    variant = "destructive";
  } else if (pendingChanges > 0) {
    icon = <Cloud className="h-4 w-4" />;
    label = `${pendingChanges} 个待同步`;
    variant = "secondary";
  } else if (lastSyncAt) {
    icon = <CheckCircle2 className="h-4 w-4" />;
    label = "已同步";
    variant = "default";
  }

  const timeText = lastSyncAt
    ? `上次同步: ${new Date(lastSyncAt).toLocaleString("zh-CN")}`
    : "尚未同步";

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <button onClick={onClick} className="cursor-pointer">
        <Badge variant={variant} className="gap-1">
          {icon}
          <span className="hidden sm:inline">{label}</span>
        </Badge>
      </button>
      {showTooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-popover text-popover-foreground text-xs rounded-md shadow-md border whitespace-nowrap z-50">
          <div className="space-y-1">
            <p>{timeText}</p>
            {pendingChanges > 0 && <p>待同步变更: {pendingChanges}</p>}
            {conflicts > 0 && <p>冲突: {conflicts}</p>}
            <p className="text-muted-foreground">点击打开同步面板</p>
          </div>
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-popover" />
        </div>
      )}
    </div>
  );
}
