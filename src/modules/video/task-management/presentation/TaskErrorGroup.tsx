import { memo, useState } from "react";
import { ChevronDown, ChevronRight, AlertCircle } from "lucide-react";
import { t } from "@/shared/constants";
import type { VideoTask } from "@/domain/schemas";
import type { ErrorCategory } from "@/domain/types";

interface TaskErrorGroupProps {
  group: ErrorCategory;
  tasks: VideoTask[];
  onDiagnose: (taskId: string) => void;
  onRecover: (taskId: string) => void;
}

const CATEGORY_BORDER_COLOR: Record<ErrorCategory, string> = {
  timeout: "var(--warning)",
  network: "var(--warning)",
  rate_limit: "var(--warning)",
  quota: "var(--warning)",
  invalid_params: "var(--destructive)",
  server_error: "var(--warning)",
  database_busy: "var(--warning)",
  auth: "var(--warning)",
  unknown: "var(--destructive)",
};

function categoryLabel(category: ErrorCategory): string {
  switch (category) {
    case "timeout":
      return t("task.errorGroupTimeout");
    case "network":
      return t("task.errorGroupNetwork");
    case "rate_limit":
      return t("task.errorGroupRateLimit");
    case "quota":
      return t("task.errorGroupQuota");
    case "invalid_params":
      return t("task.errorGroupInvalidParams");
    case "server_error":
      return t("task.errorGroupServerError");
    case "database_busy":
      return t("task.errorGroupDatabaseBusy");
    case "auth":
      return t("task.errorGroupAuth");
    default:
      return t("task.errorGroupUnknown");
  }
}

export const TaskErrorGroup = memo(function TaskErrorGroup({
  group,
  tasks,
  onDiagnose,
  onRecover,
}: TaskErrorGroupProps) {
  const [expanded, setExpanded] = useState(true);
  const borderColor = CATEGORY_BORDER_COLOR[group];

  return (
    <div
      className="card !p-0 overflow-hidden"
      style={{ borderLeft: `3px solid ${borderColor}` }}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
        aria-expanded={expanded}
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
        <AlertCircle className="h-4 w-4 shrink-0" style={{ color: borderColor }} />
        <span className="text-sm font-medium flex-1">{categoryLabel(group)}</span>
        <span
          className="text-xs px-2 py-0.5 rounded-full"
          style={{ background: `${borderColor}20`, color: borderColor }}
        >
          {tasks.length}
        </span>
      </button>
      {expanded && (
        <div className="border-t border-border divide-y divide-border">
          {tasks.map((task) => (
            <div key={task.taskId} className="px-3 py-2.5 flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  {task.prompt ? task.prompt.slice(0, 60) : task.taskId}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {task.message || t("common.unknown")}
                </div>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-xs shrink-0"
                onClick={() => onDiagnose(task.taskId)}
              >
                {t("task.diagnose")}
              </button>
              <button
                type="button"
                className="btn btn-outline btn-xs shrink-0"
                onClick={() => onRecover(task.taskId)}
              >
                {t("task.recover")}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
