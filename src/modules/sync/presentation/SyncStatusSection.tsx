import { CheckCircle2, AlertTriangle, Cloud, CloudOff } from "lucide-react";
import { t } from "@/shared/constants";
import type { SyncStatusInfo } from "@/modules/sync";

interface SyncStatusSectionProps {
  status: SyncStatusInfo | null;
  syncResult: { pushed: number; pulled: number; conflicts: number } | null;
}

export function SyncStatusSection({ status, syncResult }: SyncStatusSectionProps) {
  return (
    <>
      {status && (
        <div className="rounded-lg border p-3 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            {status.conflicts > 0 ? (
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
            ) : status.pendingChanges > 0 ? (
              <Cloud className="h-4 w-4 text-blue-500" />
            ) : status.lastSyncAt ? (
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            ) : (
              <CloudOff className="h-4 w-4 text-muted-foreground" />
            )}
            <span>{t("sync.syncStatus")}</span>
          </div>
          <div className="text-xs text-muted-foreground space-y-1">
            <p>
              {status.lastSyncAt
                ? `${t("sync.lastSync")}: ${new Date(status.lastSyncAt).toLocaleString("zh-CN")}`
                : t("sync.notSyncedYet")}
            </p>
            <p>{t("sync.pendingSync")}: {status.pendingChanges} {t("sync.items")}</p>
            <p>{t("sync.conflicts")}: {status.conflicts} {t("sync.items")}</p>
          </div>
        </div>
      )}

      {syncResult && (
        <div className="rounded-lg bg-muted p-3 text-sm space-y-1">
          <p>{t("sync.push")}: {syncResult.pushed} {t("sync.items")}</p>
          <p>{t("sync.pull")}: {syncResult.pulled} {t("sync.items")}</p>
          <p>{t("sync.conflicts")}: {syncResult.conflicts} {t("sync.items")}</p>
        </div>
      )}
    </>
  );
}
