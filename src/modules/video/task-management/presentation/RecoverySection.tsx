import { memo, useMemo, useState, useId } from "react";
import {
  Search,
  Loader2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Stethoscope,
  RotateCw,
  Inbox,
} from "lucide-react";
import { t } from "@/shared/constants";
import type { VideoTask } from "@/domain/schemas";
import { classifyError, type ErrorCategory } from "@/domain/types";

interface RecoverySectionProps {
  /** 所有失败任务（跨状态筛选器，始终为全量失败任务） */
  failedTasks: VideoTask[];
  /** 手动输入 taskId 受控值 */
  recoveryTaskId: string;
  onRecoveryTaskIdChange: (value: string) => void;
  /** 手动输入框的恢复回调 */
  onRecover: () => void;
  isRecovering: boolean;
  /** 按 taskId 恢复单个失败任务 */
  onRecoverTaskById: (taskId: string) => void;
  /** 批量恢复所有失败任务 */
  onRecoverAllFailed: (taskIds: string[]) => void;
  /** 正在恢复中的 taskId 集合 */
  recoveringTaskIds: Set<string>;
  /** 可选：诊断回调（如提供则展示诊断按钮） */
  onDiagnose?: (taskId: string) => void;
}

const CATEGORY_COLOR: Record<ErrorCategory, string> = {
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
    case "timeout": return t("task.errorGroupTimeout");
    case "network": return t("task.errorGroupNetwork");
    case "rate_limit": return t("task.errorGroupRateLimit");
    case "quota": return t("task.errorGroupQuota");
    case "invalid_params": return t("task.errorGroupInvalidParams");
    case "server_error": return t("task.errorGroupServerError");
    case "database_busy": return t("task.errorGroupDatabaseBusy");
    case "auth": return t("task.errorGroupAuth");
    default: return t("task.errorGroupUnknown");
  }
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

interface FailedTaskRowProps {
  task: VideoTask;
  isRecovering: boolean;
  onRecover: (taskId: string) => void;
  onDiagnose?: (taskId: string) => void;
}

const FailedTaskRow = memo(function FailedTaskRow({
  task, isRecovering, onRecover, onDiagnose,
}: FailedTaskRowProps) {
  const category = useMemo(() => classifyError(undefined, task.message), [task.message]);
  const color = CATEGORY_COLOR[category];
  const promptText = task.prompt || task.beatTitle || task.taskId;

  return (
    <div
      className="px-3 py-2.5 flex items-center gap-3"
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <AlertTriangle className="h-4 w-4 shrink-0" style={{ color }} />
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="text-sm font-medium truncate">{promptText}</div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <span>{t("task.recoveryTaskModel")}: {task.model || t("task.modelNotRecorded")}</span>
          <span>{t("task.recoveryTaskTime")}: {formatTime(task.updatedAt || task.createdAt)}</span>
          <span className="badge badge-xs" style={{ background: `${color}20`, color }}>
            {categoryLabel(category)}
          </span>
        </div>
        {task.message && (
          <div className="text-xs text-muted-foreground truncate">
            {t("task.recoveryTaskError")}: {task.message}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {onDiagnose && (
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            onClick={() => onDiagnose(task.taskId)}
            title={t("task.diagnose")}
          >
            <Stethoscope className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          className="btn btn-outline btn-xs gap-1"
          onClick={() => onRecover(task.taskId)}
          disabled={isRecovering}
          title={t("task.recover")}
        >
          {isRecovering ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RotateCw className="h-3.5 w-3.5" />
          )}
          {t("task.recover")}
        </button>
      </div>
    </div>
  );
});

export const RecoverySection = memo(function RecoverySection({
  failedTasks,
  recoveryTaskId,
  onRecoveryTaskIdChange,
  onRecover,
  isRecovering,
  onRecoverTaskById,
  onRecoverAllFailed,
  recoveringTaskIds,
  onDiagnose,
}: RecoverySectionProps) {
  const [showManualInput, setShowManualInput] = useState(false);
  const recoveryInputId = useId();

  const sortedFailedTasks = useMemo(() => {
    return [...failedTasks].sort((a, b) => {
      const ta = new Date(a.updatedAt || a.createdAt).getTime();
      const tb = new Date(b.updatedAt || b.createdAt).getTime();
      return tb - ta; // 最近失败优先
    });
  }, [failedTasks]);

  const allTaskIds = useMemo(() => sortedFailedTasks.map((t) => t.taskId), [sortedFailedTasks]);
  const isRecoveringAny = recoveringTaskIds.size > 0;

  return (
    <div className="space-y-3 border-t pt-4" style={{ borderColor: "var(--border)" }}>
      {/* 标题栏 */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-medium flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            {t("task.recoveryListTitle")}
            {sortedFailedTasks.length > 0 && (
              <span className="badge badge-destructive badge-xs">
                {sortedFailedTasks.length}
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {t("task.recoveryListHint")}
          </div>
        </div>
        {sortedFailedTasks.length > 0 && (
          <button
            type="button"
            className="btn btn-primary btn-sm gap-1"
            onClick={() => onRecoverAllFailed(allTaskIds)}
            disabled={isRecoveringAny}
          >
            {isRecoveringAny ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RotateCw className="h-3.5 w-3.5" />
            )}
            {t("task.recoverAll")}
          </button>
        )}
      </div>

      {/* 失败任务列表 */}
      {sortedFailedTasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
          <Inbox className="h-8 w-8 mb-2 opacity-40" />
          <p className="text-xs">{t("task.recoveryEmpty")}</p>
        </div>
      ) : (
        <div className="card !p-0 overflow-hidden divide-y divide-border max-h-[400px] overflow-y-auto">
          {sortedFailedTasks.map((task) => (
            <FailedTaskRow
              key={task.taskId}
              task={task}
              isRecovering={recoveringTaskIds.has(task.taskId)}
              onRecover={onRecoverTaskById}
              onDiagnose={onDiagnose}
            />
          ))}
        </div>
      )}

      {/* 高级：手动输入 taskId（折叠） */}
      <div className="border-t pt-3" style={{ borderColor: "var(--border)" }}>
        <button
          type="button"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-fg transition-colors"
          onClick={() => setShowManualInput((v) => !v)}
          aria-expanded={showManualInput}
        >
          {showManualInput ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          {t("task.advancedManualInput")}
        </button>
        {showManualInput && (
          <div className="mt-2 space-y-2">
            <div className="flex gap-2">
              <input
                id={recoveryInputId}
                className="input flex-1"
                placeholder={t("task.enterTaskId")}
                value={recoveryTaskId}
                onChange={(e) => onRecoveryTaskIdChange(e.target.value)}
              />
              <button
                type="button"
                className="btn btn-primary gap-2"
                onClick={onRecover}
                disabled={isRecovering}
              >
                {isRecovering ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
                {t("task.recoverButton")}
              </button>
            </div>
            <p className="text-xs" style={{ color: "var(--muted-fg)" }}>
              {t("task.recoverHint")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
});
