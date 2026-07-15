import { memo } from "react";
import { t } from "@/shared/constants";

/**
 * 供应商健康状态。
 * - status: 在线/离线/未知
 * - successRate: 0-100 百分比
 * - queued: 当前排队任务数
 */
export interface ProviderHealth {
  providerId: string;
  providerName: string;
  status: "online" | "offline" | "unknown";
  successRate: number;
  queued: number;
}

interface ProviderHealthCardProps {
  providerId: string;
  health: ProviderHealth;
}

const STATUS_COLOR: Record<ProviderHealth["status"], string> = {
  online: "var(--success)",
  offline: "var(--destructive)",
  unknown: "var(--muted-foreground)",
};

function statusLabel(status: ProviderHealth["status"]): string {
  switch (status) {
    case "online":
      return t("task.providerOnline");
    case "offline":
      return t("task.providerOffline");
    default:
      return t("task.providerUnknown");
  }
}

export const ProviderHealthCard = memo(function ProviderHealthCard({
  health,
}: ProviderHealthCardProps) {
  const color = STATUS_COLOR[health.status];
  return (
    <div className="card !p-3 flex items-center gap-3">
      <span
        className="w-2.5 h-2.5 rounded-full shrink-0"
        style={{ background: color, boxShadow: `0 0 6px ${color}` }}
        aria-label={statusLabel(health.status)}
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{health.providerName}</div>
        <div className="text-xs text-muted-foreground">{statusLabel(health.status)}</div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-xs text-muted-foreground">{t("task.successRate")}</div>
        <div className="text-sm font-semibold" style={{ color }}>
          {health.successRate}%
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-xs text-muted-foreground">{t("task.queuedCount")}</div>
        <div className="text-sm font-semibold">{health.queued}</div>
      </div>
    </div>
  );
});
