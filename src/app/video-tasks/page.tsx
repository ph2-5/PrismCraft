import { PageErrorBoundary } from "@/shared/presentation/PageErrorBoundary";
import { VideoTaskManager as VideoTaskManagerComponent } from "@/modules/video";
import {
  CheckCircle2,
  Clock,
  XCircle,
  List,
  Trash2,
  Video,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { t } from "@/shared/constants";
import { EmptyState } from "@/shared/presentation/EmptyState";
import { useVideoTasksPage } from "./hooks/useVideoTasksPage";

export default function VideoTasksPage() {
  const {
    totalTasks,
    completedTasks,
    processingTasks,
    pendingTasks,
    failedTasks,
    completionRate,
    isLoading,
    allTasks,
    startBackgroundProcessing,
    recoverTask,
    statusFilter,
    setStatusFilter,
    handleRefresh,
    isClearingCompleted,
    isClearingFailed,
    handleClearCompleted,
    handleClearFailed,
    navigateToStory,
    navigateToQuickGenerate,
  } = useVideoTasksPage();

  return (
    <PageErrorBoundary pageName={t("page.videoTasks")}>
      <div className="fade-in flex flex-col h-full">
        {/* top-tabs 标题栏 */}
        <div className="top-tabs justify-between">
          <span className="font-semibold text-sm">
            <Video className="inline-block" size={14} /> {t("page.videoTasks")}
          </span>
          <div className="toolbar">
            <select
              className="select !text-xs"
              aria-label={t("aria.statusFilter")}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            >
              <option value="all">{t("task.statusAll")}</option>
              <option value="processing">{t("task.statusProcessing")}</option>
              <option value="completed">{t("task.statusCompleted")}</option>
              <option value="failed">{t("task.statusFailed")}</option>
            </select>
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={handleRefresh}
            >
              <RefreshCw className="inline-block" size={12} /> {t("task.refresh")}
            </button>
          </div>
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* 统计卡片 */}
          <div
            className="grid gap-3 mb-4 [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))]"
            aria-live="polite"
          >
            {/* 总任务数 */}
            <div className="card !p-3.5">
              <div
                className="flex items-center gap-2 text-xs text-muted-foreground mb-2"
              >
                <List size={16} />
                {t("task.totalTasks")}
              </div>
              <div className="text-2xl font-bold">{isLoading ? "..." : totalTasks}</div>

            </div>

            {/* 已完成 */}
            <div
              className="card !p-3.5 !bg-[rgba(var(--success-rgb),0.1)] !border-[rgba(var(--success-rgb),0.3)]"
            >
              <div
                className="flex items-center gap-2 text-xs text-success mb-2"
              >
                <CheckCircle2 size={16} />
                {t("task.completedCount")}
              </div>
              <div className="text-2xl font-bold text-success">
                {isLoading ? "..." : completedTasks}
              </div>
            </div>

            {/* 待处理 */}
            <div
              className="card !p-3.5 !bg-[rgba(var(--warning-rgb),0.1)] !border-[rgba(var(--warning-rgb),0.3)]"
            >
              <div
                className="flex items-center gap-2 text-xs text-warning mb-2"
              >
                <Clock size={16} />
                {t("task.pendingCount")}
              </div>
              <div className="text-2xl font-bold text-warning">
                {isLoading ? "..." : pendingTasks}
              </div>
            </div>

            {/* 生成中 */}
            <div
              className="card !p-3.5 !bg-[rgba(var(--primary-rgb),0.1)] !border-[rgba(var(--primary-rgb),0.3)]"
            >
              <div
                className="flex items-center gap-2 text-xs text-primary mb-2"
              >
                <Clock size={16} />
                {t("task.generatingCount")}
              </div>
              <div className="text-2xl font-bold text-primary">
                {isLoading ? "..." : processingTasks}
              </div>
            </div>

            {/* 失败 */}
            <div
              className="card !p-3.5 !bg-[rgba(var(--destructive-rgb),0.1)] !border-[rgba(var(--destructive-rgb),0.3)]"
            >
              <div
                className="flex items-center gap-2 text-xs text-destructive mb-2"
              >
                <XCircle size={16} />
                {t("task.failedCount")}
              </div>
              <div className="text-2xl font-bold text-destructive">
                {isLoading ? "..." : failedTasks}
              </div>
            </div>

            {/* 完成率 */}
            <div
              className="card !p-3.5 !bg-[rgba(var(--primary-rgb),0.1)] !border-[rgba(var(--primary-rgb),0.3)]"
            >
              <div
                className="flex items-center gap-2 text-xs text-primary mb-2"
              >
                <CheckCircle2 size={16} />
                {t("task.completionRate")}
              </div>
              <div className="text-2xl font-bold text-primary">
                {isLoading ? "..." : `${completionRate}%`}
              </div>
              <div
                className="progress-bar mt-2 !bg-[rgba(var(--primary-rgb),0.2)]"
                role="progressbar"
                aria-label={t("task.completionRate")}
                aria-valuenow={completionRate}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="progress-fill"
                  style={{ width: isLoading ? 0 : `${completionRate}%`, background: "var(--primary)" }}
                />
              </div>
            </div>
          </div>

          {/* 清除按钮 */}
          <div className="flex justify-end gap-2 mb-4">
            {completedTasks > 0 && (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={isClearingCompleted}
                onClick={handleClearCompleted}
              >
                {isClearingCompleted ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                {isClearingCompleted ? t("common.clearing") : t("task.clearCompleted")}
              </button>
            )}
            {failedTasks > 0 && (
              <button
                type="button"
                className="btn btn-outline btn-sm text-destructive"
                disabled={isClearingFailed}
                onClick={handleClearFailed}
              >
                {isClearingFailed ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                {isClearingFailed ? t("common.clearing") : t("task.clearFailed")}
              </button>
            )}
          </div>

          {/* 任务列表 — 直接平铺，不再用 card 容器包裹（对齐预览页样式） */}
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="card">
                  <div className="flex items-center gap-3">
                    <div className="w-4 h-4 skeleton-shimmer rounded shrink-0" />
                    <div className="w-16 h-5 skeleton-shimmer rounded shrink-0" />
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="h-4 w-1/2 skeleton-shimmer rounded" />
                      <div className="h-3 w-1/3 skeleton-shimmer rounded" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : totalTasks === 0 ? (
            <EmptyState
              icon={Video}
              title={t("task.noTasks")}
              description={t("task.noTasksHint")}
              action={
                <div className="flex items-center justify-center gap-3">
                  <button type="button" className="btn btn-primary btn-sm" onClick={navigateToStory}>
                    {t("task.viewStoryboard")}
                  </button>
                  <button type="button" className="btn btn-outline btn-sm" onClick={navigateToQuickGenerate}>
                    {t("task.quickGenerate")}
                  </button>
                </div>
              }
            />
          ) : (
            <VideoTaskManagerComponent
              tasks={allTasks}
              onBackgroundProcess={startBackgroundProcessing}
              onTaskRecovered={recoverTask}
            />
          )}
        </div>
      </div>
    </PageErrorBoundary>
  );
}
