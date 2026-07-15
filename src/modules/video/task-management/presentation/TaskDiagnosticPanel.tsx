import { memo, useMemo, useCallback, useState } from "react";
import { Stethoscope, CheckCircle2 } from "lucide-react";
import { t } from "@/shared/constants";
import { EmptyState } from "@/shared/presentation/EmptyState";
import type { VideoTask } from "@/domain/schemas";
import { classifyError, type ErrorCategory } from "@/domain/types";
import { errorLogger } from "@/shared/error-logger";
import { ProviderHealthCard, type ProviderHealth } from "./ProviderHealthCard";
import { TaskErrorGroup } from "./TaskErrorGroup";
import { AgentBar } from "./AgentBar";

/**
 * 单个任务的诊断结果。
 * - suggestion: 推荐的下一步操作描述
 * - recoverable: 是否可恢复（用于显示恢复按钮）
 */
export interface DiagnoseResult {
  category: ErrorCategory;
  suggestion: string;
  recoverable: boolean;
}

interface TaskDiagnosticPanelProps {
  filteredTasks: VideoTask[];
  onDiagnose: (taskId: string) => void;
  onRecover: (taskId: string) => void;
  /** 诊断结果按 taskId 索引；初次诊断前可能为空 */
  diagnosisResults?: Record<string, DiagnoseResult>;
  /** 供应商健康状态列表；如不提供则不渲染该区块 */
  providerHealth?: ProviderHealth[];
  /** AgentBar 回调；如不提供则不渲染 AgentBar */
  onAsk?: (question: string) => void;
}

/**
 * 按错误类别分组失败任务。
 * 只处理 failed/timeout 状态的任务；其他状态忽略。
 */
function groupByErrorCategory(tasks: VideoTask[]): Record<ErrorCategory, VideoTask[]> {
  const groups: Record<ErrorCategory, VideoTask[]> = {
    timeout: [],
    network: [],
    rate_limit: [],
    quota: [],
    invalid_params: [],
    server_error: [],
    database_busy: [],
    auth: [],
    unknown: [],
  };
  for (const task of tasks) {
    if (task.status !== "failed" && task.status !== "timeout") continue;
    const category = classifyError(undefined, task.message);
    groups[category].push(task);
  }
  return groups;
}

/**
 * 根据任务列表自动计算每个供应商的健康状态。
 * - 没有失败任务的供应商视为 100% 成功率
 * - 没有任务记录的供应商不显示
 */
function computeProviderHealth(tasks: VideoTask[]): ProviderHealth[] {
  const stats = new Map<string, { total: number; failed: number; queued: number }>();
  for (const task of tasks) {
    const pid = task.providerId || "unknown";
    const entry = stats.get(pid) ?? { total: 0, failed: 0, queued: 0 };
    entry.total += 1;
    if (task.status === "failed" || task.status === "timeout") entry.failed += 1;
    if (task.status === "pending" || task.status === "generating" || task.status === "retrying") {
      entry.queued += 1;
    }
    stats.set(pid, entry);
  }
  const result: ProviderHealth[] = [];
  for (const [pid, s] of stats) {
    const successRate = s.total > 0 ? Math.round(((s.total - s.failed) / s.total) * 100) : 100;
    result.push({
      providerId: pid,
      providerName: pid === "unknown" ? t("common.unknown") : pid,
      status: s.failed > 0 && successRate < 50 ? "offline" : "online",
      successRate,
      queued: s.queued,
    });
  }
  return result.sort((a, b) => b.queued - a.queued || a.providerName.localeCompare(b.providerName));
}

export const TaskDiagnosticPanel = memo(function TaskDiagnosticPanel({
  filteredTasks,
  onDiagnose,
  onRecover,
  diagnosisResults = {},
  providerHealth,
  onAsk,
}: TaskDiagnosticPanelProps) {
  const errorGroups = useMemo(() => groupByErrorCategory(filteredTasks), [filteredTasks]);
  const computedHealth = useMemo(
    () => providerHealth ?? computeProviderHealth(filteredTasks),
    [providerHealth, filteredTasks],
  );
  const [agentExpanded, setAgentExpanded] = useState(false);

  const handleAsk = useCallback(
    (question: string) => {
      if (onAsk) {
        onAsk(question);
      } else {
        // 没有外部 onAsk 处理器时，仅记录日志并展开 AgentBar
        errorLogger.info("[TaskDiagnosticPanel] agent asked", question);
        setAgentExpanded(true);
      }
    },
    [onAsk],
  );

  const nonEmptyGroups = useMemo(
    () => Object.entries(errorGroups).filter(([, list]) => list.length > 0),
    [errorGroups],
  );

  return (
    <div className="space-y-4">
      {/* 标题 */}
      <div className="flex items-center gap-2">
        <Stethoscope className="h-4 w-4 text-primary" />
        <div>
          <div className="text-sm font-semibold">{t("task.diagnosticTitle")}</div>
          <div className="text-xs text-muted-foreground">{t("task.diagnosticHint")}</div>
        </div>
      </div>

      {/* 供应商健康状态条 */}
      {computedHealth.length > 0 && (
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-2">
            {t("task.providerHealth")}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {computedHealth.map((health) => (
              <ProviderHealthCard
                key={health.providerId}
                providerId={health.providerId}
                health={health}
              />
            ))}
          </div>
        </div>
      )}

      {/* 错误分组 */}
      {nonEmptyGroups.length === 0 ? (
        <EmptyState compact icon={CheckCircle2} title={t("task.errorGroupEmpty")} />
      ) : (
        <div className="space-y-2">
          {nonEmptyGroups.map(([category, list]) => (
            <TaskErrorGroup
              key={category}
              group={category as ErrorCategory}
              tasks={list}
              onDiagnose={onDiagnose}
              onRecover={onRecover}
            />
          ))}
        </div>
      )}

      {/* 诊断结果展示（如果有） */}
      {Object.keys(diagnosisResults).length > 0 && (
        <div className="card !p-3 space-y-2">
          <div className="text-xs font-medium text-muted-foreground">
            {t("task.diagnoseResult")}
          </div>
          {Object.entries(diagnosisResults).map(([taskId, result]) => (
            <div key={taskId} className="text-xs border-l-2 border-primary pl-2 py-1">
              <div className="font-mono text-muted-foreground">{taskId.slice(0, 8)}…</div>
              <div className="text-foreground mt-0.5">{result.suggestion}</div>
            </div>
          ))}
        </div>
      )}

      {/* Agent 诊断栏 */}
      {(onAsk || agentExpanded) && <AgentBar onAsk={handleAsk} />}
    </div>
  );
});
