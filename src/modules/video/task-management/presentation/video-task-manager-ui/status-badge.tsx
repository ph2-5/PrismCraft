import { Clock, Loader2, CheckCircle2, AlertCircle, Timer } from "lucide-react";
import { t } from "@/shared/constants/messages";

export type TaskDisplayStatus = "pending" | "generating" | "completed" | "failed" | "timeout";

export function getTaskDisplayStatus(status: string): TaskDisplayStatus {
  if (status === "completed") return "completed";
  if (status === "failed") return "failed";
  if (status === "timeout") return "timeout";
  if (status === "cancelled") return "failed";
  if (status === "generating") return "generating";
  return "pending";
}

export function StatusBadge({ status }: { status: TaskDisplayStatus }) {
  const config = {
    pending: { color: "bg-yellow-900/50 text-yellow-300 border-yellow-700", icon: Clock, label: t("common.pending") },
    generating: { color: "bg-blue-900/50 text-blue-300 border-blue-700", icon: Loader2, label: t("common.generatingShort"), animate: true },
    completed: { color: "bg-green-900/50 text-green-300 border-green-700", icon: CheckCircle2, label: t("common.completed") },
    failed: { color: "bg-red-900/50 text-red-300 border-red-700", icon: AlertCircle, label: t("common.failed") },
    timeout: { color: "bg-orange-900/50 text-orange-300 border-orange-700", icon: Timer, label: t("common.timeout") },
  }[status];

  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${config.color}`}>
      <Icon className={`w-3 h-3 ${(config as { animate?: boolean }).animate ? "animate-spin" : ""}`} />
      {config.label}
    </span>
  );
}
