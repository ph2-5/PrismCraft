import { Clock, Loader2, CheckCircle2, AlertCircle, Timer, PauseCircle } from "lucide-react";
import type { CSSProperties } from "react";
import { t } from "@/shared/constants/messages";

export type TaskDisplayStatus = "pending" | "generating" | "completed" | "failed" | "timeout" | "paused";

interface StatusBadgeConfig {
  style: CSSProperties;
  icon: typeof Clock;
  label: string;
  animate?: boolean;
}

export function getTaskDisplayStatus(status: string): TaskDisplayStatus {
  if (status === "completed") return "completed";
  if (status === "failed") return "failed";
  if (status === "timeout") return "timeout";
  if (status === "cancelled") return "failed";
  if (status === "paused") return "paused";
  if (status === "generating") return "generating";
  return "pending";
}

export function StatusBadge({ status }: { status: TaskDisplayStatus }) {
  const config: StatusBadgeConfig = {
    pending: { style: { background: "rgba(var(--warning-rgb), 0.5)", color: "var(--warning)", borderColor: "var(--warning)" }, icon: Clock, label: t("common.pending") },
    generating: { style: { background: "rgba(var(--primary-rgb), 0.5)", color: "var(--primary)", borderColor: "var(--primary)" }, icon: Loader2, label: t("common.generatingShort"), animate: true },
    completed: { style: { background: "rgba(var(--success-rgb), 0.5)", color: "var(--success)", borderColor: "var(--success)" }, icon: CheckCircle2, label: t("common.completed") },
    failed: { style: { background: "rgba(var(--destructive-rgb), 0.5)", color: "var(--destructive)", borderColor: "var(--destructive)" }, icon: AlertCircle, label: t("common.failed") },
    timeout: { style: { background: "rgba(var(--warning-rgb), 0.5)", color: "var(--warning)", borderColor: "var(--warning)" }, icon: Timer, label: t("common.timeout") },
    paused: { style: { background: "var(--muted)", color: "var(--muted-fg)", borderColor: "var(--muted-fg)" }, icon: PauseCircle, label: t("task.pausedLabel") },
  }[status];

  const Icon = config.icon;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border"
      style={config.style}
    >
      <Icon className={`w-3 h-3 ${config.animate ? "animate-spin" : ""}`} />
      {config.label}
    </span>
  );
}
