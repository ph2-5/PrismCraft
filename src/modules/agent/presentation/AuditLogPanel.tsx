/**
 * 审计日志查看面板（P1-A）
 *
 * 让用户可视化查看 Agent 工具调用审计日志：
 * - 统计概览（总条目数 / 会话数 / 失败次数）
 * - 工具调用统计（按工具名分组）
 * - 日志列表（支持按 sessionId / 工具名 / 状态筛选）
 * - 清除全部日志
 *
 * 独立组件，不污染 AgentSettingsPanel 的职责。
 * 通过 @/modules/agent 公共 API 直接读取，不经过 Agent Loop。
 */

"use client";

import { useState, useEffect, useCallback, useMemo, useRef, memo } from "react";
import {
  queryAuditLogs,
  getAuditStats,
  clearAllAuditLogs,
  type AuditEntry,
} from "@/modules/audit-log";
import { t } from "@/shared/constants";
import { confirm } from "@/shared/utils/confirm";
import { errorLogger } from "@/shared/error-logger";
import { downloadJSONFile } from "@/shared/utils/file-download";
import { X, ScrollText, Trash2, RefreshCw, Filter, Download } from "lucide-react";

interface AuditLogPanelProps {
  onClose: () => void;
}

/** 单次加载的日志条数上限 */
const LOAD_LIMIT = 100;
/** 工具统计显示的 Top N */
const TOP_TOOLS = 5;
/** 分页每页条数 */
const PAGE_SIZE = 20;
/** 导出时使用的条数上限（足够大以导出全部） */
const EXPORT_LIMIT = 100000;
/** 导出状态反馈持续时间（毫秒） */
const EXPORT_STATUS_DURATION_MS = 2000;

/** 格式化导出文件名时间戳：YYYYMMDD-HHmmss */
function formatExportTimestamp(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

type AuditStatsData = {
  totalEntries: number;
  sessionCount: number;
  toolStats: Array<{ toolName: string; count: number; successCount: number; failCount: number }>;
};

interface AuditLogStatsProps {
  stats: AuditStatsData | null;
  failTotal: number;
  topTools: AuditStatsData["toolStats"];
}

/** 统计概览 + Top N 工具调用 */
function AuditLogStats({ stats, failTotal, topTools }: AuditLogStatsProps) {
  return (
    <>
      {/* 统计概览 */}
      <div className="mb-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded border border-border bg-background/50 py-1.5">
          <div className="font-mono text-sm font-semibold">{stats?.totalEntries ?? 0}</div>
          <div className="text-[10px] text-muted-foreground">{t("agent.audit.totalEntries")}</div>
        </div>
        <div className="rounded border border-border bg-background/50 py-1.5">
          <div className="font-mono text-sm font-semibold">{stats?.sessionCount ?? 0}</div>
          <div className="text-[10px] text-muted-foreground">{t("agent.audit.sessionCount")}</div>
        </div>
        <div className="rounded border border-border bg-background/50 py-1.5">
          <div className="font-mono text-sm font-semibold text-destructive">{failTotal}</div>
          <div className="text-[10px] text-muted-foreground">{t("agent.audit.failCount")}</div>
        </div>
      </div>

      {/* 工具调用 Top N */}
      {topTools.length > 0 && (
        <div className="mb-3">
          <div className="mb-1.5 text-xs font-medium text-muted-foreground">
            {t("agent.audit.topTools")}
          </div>
          <div className="space-y-1">
            {topTools.map((s) => (
              <div
                key={s.toolName}
                className="flex items-center justify-between rounded border border-border bg-background/50 px-2 py-1 text-xs"
              >
                <span className="truncate font-mono" title={s.toolName}>{s.toolName}</span>
                <span className="ml-2 shrink-0 font-mono text-muted-foreground">
                  <span className="text-emerald-600 dark:text-emerald-400">{s.successCount}</span>
                  {" / "}
                  <span className="text-destructive">{s.failCount}</span>
                  {" · "}
                  {s.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

interface AuditLogPaginationProps {
  currentPage: number;
  totalPages: number;
  totalLogs: number;
  totalEntries: number;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
}

/** 底部分页控件 */
function AuditLogPagination({
  currentPage,
  totalPages,
  totalLogs,
  totalEntries,
  setCurrentPage,
}: AuditLogPaginationProps) {
  return (
    <div className="mt-2 border-t border-border pt-1.5" aria-label={t("agent.audit.page")}>
      <div className="mb-1 text-center text-[10px] text-muted-foreground">
        {t("agent.audit.showingCount", { count: totalLogs, total: totalEntries })}
      </div>
      <div className="flex items-center justify-between gap-1">
        <button
          onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
          disabled={currentPage <= 1}
          className="rounded border border-border bg-background px-2 py-0.5 text-[10px] hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {t("agent.audit.prevPage")}
        </button>
        <span className="text-[10px] text-muted-foreground">
          {t("agent.audit.pageInfo", { current: Math.min(currentPage, totalPages), total: totalPages })}
        </span>
        <button
          onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
          disabled={currentPage >= totalPages}
          className="rounded border border-border bg-background px-2 py-0.5 text-[10px] hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {t("agent.audit.nextPage")}
        </button>
      </div>
    </div>
  );
}

export function AuditLogPanel({ onClose }: AuditLogPanelProps) {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [stats, setStats] = useState<{
    totalEntries: number;
    sessionCount: number;
    toolStats: Array<{ toolName: string; count: number; successCount: number; failCount: number }>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportStatus, setExportStatus] = useState<"idle" | "exporting" | "success" | "failed">("idle");
  const [exportCount, setExportCount] = useState(0);
  const exportTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 组件卸载时清除定时器，防止 state update on unmounted component
  useEffect(() => {
    return () => {
      if (exportTimerRef.current) clearTimeout(exportTimerRef.current);
    };
  }, []);

  // 筛选条件
  const [filterTool, setFilterTool] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<"" | "success" | "fail">("");

  // 分页
  const [currentPage, setCurrentPage] = useState(1);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [entries, s] = await Promise.all([
        queryAuditLogs({ limit: LOAD_LIMIT }),
        getAuditStats(),
      ]);
      setLogs(entries);
      setStats(s);
      setCurrentPage(1);
    } catch (e) {
      errorLogger.warn("[Agent] 加载审计日志失败", e instanceof Error ? e : undefined);
      setError(t("agent.audit.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // a11y：Escape 关闭面板
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  /** 清空全部审计日志 */
  const handleClearAll = async () => {
    const ok = await confirm({
      description: t("agent.audit.confirmClear"),
      variant: "danger",
    });
    if (!ok) return;
    setActionLoading(true);
    try {
      await clearAllAuditLogs();
      await loadAll();
    } catch (e) {
      errorLogger.warn("[Agent] 清空审计日志失败", e instanceof Error ? e : undefined);
      setError(t("agent.audit.clearFailed"));
    } finally {
      setActionLoading(false);
    }
  };

  /** 重新应用筛选 */
  const handleApplyFilter = async () => {
    setLoading(true);
    setError(null);
    try {
      const entries = await queryAuditLogs({
        limit: LOAD_LIMIT,
        toolName: filterTool || undefined,
        success: filterStatus === "success" ? true : filterStatus === "fail" ? false : undefined,
      });
      setLogs(entries);
      setCurrentPage(1);
    } catch (e) {
      errorLogger.warn("[Agent] 筛选审计日志失败", e instanceof Error ? e : undefined);
      setError(t("agent.audit.loadFailed"));
    } finally {
      setLoading(false);
    }
  };

  /** 导出当前过滤条件下的所有日志为 JSON 文件 */
  const handleExport = async () => {
    setExportStatus("exporting");
    try {
      const entries = await queryAuditLogs({
        limit: EXPORT_LIMIT,
        toolName: filterTool || undefined,
        success: filterStatus === "success" ? true : filterStatus === "fail" ? false : undefined,
      });
      const filename = `audit-logs-all-${formatExportTimestamp(new Date())}.json`;
      downloadJSONFile(entries, filename);
      setExportCount(entries.length);
      setExportStatus("success");
      // 2 秒后恢复 idle
      resetExportStatusTimer();
    } catch (e) {
      errorLogger.warn("[Agent] 导出审计日志失败", e instanceof Error ? e : undefined);
      setExportStatus("failed");
      resetExportStatusTimer();
    }
  };

  /** 重置导出状态定时器（2 秒后恢复 idle） */
  const resetExportStatusTimer = () => {
    if (exportTimerRef.current) clearTimeout(exportTimerRef.current);
    exportTimerRef.current = setTimeout(() => setExportStatus("idle"), EXPORT_STATUS_DURATION_MS);
  };

  /** 工具名去重列表（来自 stats，用于筛选下拉） */
  const toolOptions = useMemo(() => {
    return stats?.toolStats.map((s) => s.toolName) ?? [];
  }, [stats]);

  /** 失败总数 */
  const failTotal = useMemo(() => {
    return stats?.toolStats.reduce((sum, s) => sum + s.failCount, 0) ?? 0;
  }, [stats]);

  /** Top N 工具统计 */
  const topTools = useMemo(() => {
    return stats?.toolStats.slice(0, TOP_TOOLS) ?? [];
  }, [stats]);

  /** 总页数 */
  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(logs.length / PAGE_SIZE));
  }, [logs.length]);

  /** 当前页日志（自动钳制到有效范围） */
  const pagedLogs = useMemo(() => {
    const page = Math.min(currentPage, totalPages);
    const start = (page - 1) * PAGE_SIZE;
    return logs.slice(start, start + PAGE_SIZE);
  }, [logs, currentPage, totalPages]);

  return (
    <div className="absolute right-0 top-full z-50 mt-1 max-h-[80vh] w-[calc(100vw-2rem)] max-w-96 overflow-y-auto rounded-lg border border-border bg-popover p-3 shadow-md">
      {/* 头部 */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <ScrollText className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">{t("agent.audit.management")}</h3>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => void loadAll()}
            disabled={loading}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
            title={t("agent.audit.refresh")}
            aria-label={t("agent.audit.refresh")}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={() => void handleExport()}
            disabled={exportStatus === "exporting" || (stats?.totalEntries ?? 0) === 0}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
            title={t("agent.audit.export")}
            aria-label={t("agent.audit.export")}
          >
            <Download className={`h-3.5 w-3.5 ${exportStatus === "exporting" ? "animate-pulse" : ""}`} />
          </button>
          <button
            onClick={handleClearAll}
            disabled={actionLoading || (stats?.totalEntries ?? 0) === 0}
            className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
            title={t("agent.audit.clearAll")}
            aria-label={t("agent.audit.clearAll")}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={t("aria.close")}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-2 rounded bg-destructive/10 px-2 py-1 text-xs text-destructive">
          {error}
        </div>
      )}

      {/* 导出状态反馈 */}
      {exportStatus === "success" && (
        <div className="mb-2 rounded bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-600 dark:text-emerald-400">
          {t("agent.audit.exportSuccess", { count: exportCount })}
        </div>
      )}
      {exportStatus === "failed" && (
        <div className="mb-2 rounded bg-destructive/10 px-2 py-1 text-[10px] text-destructive">
          {t("agent.audit.exportFailed")}
        </div>
      )}

      {/* 统计概览 + Top N 工具 */}
      <AuditLogStats
        stats={stats}
        failTotal={failTotal}
        topTools={topTools}
      />

      {/* 筛选器 */}
      <div className="mb-2 flex items-end gap-1.5">
        <div className="flex-1">
          <label className="mb-1 block text-[10px] text-muted-foreground">
            {t("agent.audit.filterTool")}
          </label>
          <select
            value={filterTool}
            onChange={(e) => setFilterTool(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
          >
            <option value="">{t("agent.audit.allTools")}</option>
            {toolOptions.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-[10px] text-muted-foreground">
            {t("agent.audit.filterStatus")}
          </label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as "" | "success" | "fail")}
            className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
          >
            <option value="">{t("agent.audit.allStatus")}</option>
            <option value="success">{t("agent.audit.statusSuccess")}</option>
            <option value="fail">{t("agent.audit.statusFail")}</option>
          </select>
        </div>
        <button
          onClick={handleApplyFilter}
          disabled={loading}
          className="flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2 text-[10px] hover:bg-muted disabled:opacity-50"
          title={t("agent.audit.applyFilter")}
        >
          <Filter className="h-3 w-3" />
          {t("agent.audit.applyFilter")}
        </button>
      </div>

      {/* 日志列表 */}
      <div className="max-h-72 space-y-1 overflow-y-auto">
        {logs.length === 0 ? (
          <div className="px-2 py-4 text-center text-xs text-muted-foreground italic">
            {loading ? t("agent.audit.loading") : t("agent.audit.noLogs")}
          </div>
        ) : (
          pagedLogs.map((entry) => (
            <AuditLogEntry key={entry.toolCallId} entry={entry} />
          ))
        )}
      </div>

      {/* 底部分页 */}
      {logs.length > 0 && (
        <AuditLogPagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalLogs={logs.length}
          totalEntries={stats?.totalEntries ?? 0}
          setCurrentPage={setCurrentPage}
        />
      )}
    </div>
  );
}

/** 单条审计日志条目 */
const AuditLogEntry = memo(function AuditLogEntry({ entry }: { entry: AuditEntry }) {
  const [expanded, setExpanded] = useState(false);

  const time = new Date(entry.timestamp).toLocaleTimeString();
  const statusColor =
    entry.success
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-destructive";
  const dangerColor =
    entry.dangerLevel === "destructive"
      ? "text-destructive"
      : entry.dangerLevel === "limited"
        ? "text-amber-600 dark:text-amber-400"
        : "text-muted-foreground";

  const toggleExpand = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setExpanded((prev) => !prev);
    }
  }, []);

  return (
    <div
      className="rounded border border-border bg-background/50 px-2 py-1.5 text-xs cursor-pointer hover:bg-muted/30"
      onClick={toggleExpand}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      aria-label={t("aria.toggleExpand")}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-mono font-medium" title={entry.toolName}>
          {entry.toolName}
        </span>
        <span className={`shrink-0 font-mono ${statusColor}`}>
          <span aria-hidden="true">{entry.success ? "✓" : "✗"}</span> {entry.status}
        </span>
      </div>
      <div className="mt-0.5 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
        <span className="font-mono">{time}</span>
        <span className="flex items-center gap-1.5">
          {entry.durationMs !== undefined && (
            <span className="font-mono">{entry.durationMs}ms</span>
          )}
          {entry.dangerLevel && (
            <span className={`font-mono ${dangerColor}`}>{entry.dangerLevel}</span>
          )}
          {entry.confirmedByUser && (
            <span className="rounded bg-primary/10 px-1 text-primary">{t("agent.audit.confirmed")}</span>
          )}
          {entry.specialist && (
            <span className="rounded bg-blue-500/10 px-1 text-blue-600 dark:text-blue-400">
              {entry.specialist}
            </span>
          )}
        </span>
      </div>
      {expanded && (
        <div className="mt-1.5 space-y-1 border-t border-border pt-1.5">
          <div>
            <span className="text-muted-foreground">{t("agent.audit.session")}: </span>
            <span className="font-mono break-all">{entry.sessionId}</span>
          </div>
          <div>
            <span className="text-muted-foreground">{t("agent.audit.args")}: </span>
            <pre className="mt-0.5 max-h-32 overflow-auto rounded bg-muted/40 p-1 font-mono text-[10px] whitespace-pre-wrap break-all">
              {entry.argsJson}
            </pre>
          </div>
          {entry.error && (
            <div>
              <span className="text-destructive">{t("agent.audit.error")}: </span>
              <span className="break-all text-destructive">{entry.error}</span>
            </div>
          )}
          {entry.resultPreview && (
            <div>
              <span className="text-muted-foreground">{t("agent.audit.result")}: </span>
              <span className="break-all text-muted-foreground">{entry.resultPreview}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
