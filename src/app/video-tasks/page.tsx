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
} from "lucide-react";
import { t } from "@/shared/constants";
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
      <div className="fade-in" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        {/* top-tabs 标题栏 */}
        <div className="top-tabs" style={{ justifyContent: "space-between" }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>
            🎥 {t("page.videoTasks")}
          </span>
          <div className="toolbar">
            <select
              className="select"
              style={{ fontSize: 12 }}
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
              🔄 {t("task.refresh")}
            </button>
          </div>
        </div>

        {/* 内容区 */}
        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
          {/* 统计卡片 */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(6, 1fr)",
              gap: 12,
              marginBottom: 16,
            }}
            aria-live="polite"
          >
            {/* 总任务数 */}
            <div className="card" style={{ padding: 14 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 12,
                  color: "var(--muted-fg)",
                  marginBottom: 8,
                }}
              >
                <List size={16} />
                {t("task.totalTasks")}
              </div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{isLoading ? "..." : totalTasks}</div>

            </div>

            {/* 已完成 */}
            <div
              className="card"
              style={{
                padding: 14,
                background: "rgba(var(--success-rgb), 0.1)",
                borderColor: "rgba(var(--success-rgb), 0.3)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 12,
                  color: "var(--success)",
                  marginBottom: 8,
                }}
              >
                <CheckCircle2 size={16} />
                {t("task.completedCount")}
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "var(--success)" }}>
                {isLoading ? "..." : completedTasks}
              </div>
            </div>

            {/* 待处理 */}
            <div
              className="card"
              style={{
                padding: 14,
                background: "rgba(var(--warning-rgb), 0.1)",
                borderColor: "rgba(var(--warning-rgb), 0.3)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 12,
                  color: "var(--warning)",
                  marginBottom: 8,
                }}
              >
                <Clock size={16} />
                {t("task.pendingCount")}
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "var(--warning)" }}>
                {isLoading ? "..." : pendingTasks}
              </div>
            </div>

            {/* 生成中 */}
            <div
              className="card"
              style={{
                padding: 14,
                background: "rgba(var(--primary-rgb), 0.1)",
                borderColor: "rgba(var(--primary-rgb), 0.3)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 12,
                  color: "var(--primary)",
                  marginBottom: 8,
                }}
              >
                <Clock size={16} />
                {t("task.generatingCount")}
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "var(--primary)" }}>
                {isLoading ? "..." : processingTasks}
              </div>
            </div>

            {/* 失败 */}
            <div
              className="card"
              style={{
                padding: 14,
                background: "rgba(var(--destructive-rgb), 0.1)",
                borderColor: "rgba(var(--destructive-rgb), 0.3)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 12,
                  color: "var(--destructive)",
                  marginBottom: 8,
                }}
              >
                <XCircle size={16} />
                {t("task.failedCount")}
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "var(--destructive)" }}>
                {isLoading ? "..." : failedTasks}
              </div>
            </div>

            {/* 完成率 */}
            <div
              className="card"
              style={{
                padding: 14,
                background: "rgba(var(--primary-rgb), 0.1)",
                borderColor: "rgba(var(--primary-rgb), 0.3)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 12,
                  color: "var(--primary)",
                  marginBottom: 8,
                }}
              >
                <CheckCircle2 size={16} />
                {t("task.completionRate")}
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "var(--primary)" }}>
                {isLoading ? "..." : `${completionRate}%`}
              </div>
              <div
                className="progress-bar"
                style={{ marginTop: 8, background: "rgba(var(--primary-rgb), 0.2)" }}
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
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 16 }}>
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
                className="btn btn-outline btn-sm"
                style={{ color: "var(--destructive)" }}
                disabled={isClearingFailed}
                onClick={handleClearFailed}
              >
                {isClearingFailed ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                {isClearingFailed ? t("common.clearing") : t("task.clearFailed")}
              </button>
            )}
          </div>

          {/* 任务列表 */}
          <div className="card" style={{ padding: 16 }}>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{t("task.taskList")}</div>
              <div style={{ fontSize: 12, color: "var(--muted-fg)", marginTop: 2 }}>
                {t("task.taskListDesc")}
              </div>
            </div>
            {isLoading ? (
              <div style={{ textAlign: "center", padding: "64px 0" }}>
                <Loader2 size={32} className="animate-spin" style={{ margin: "0 auto 16px", color: "var(--muted-fg)" }} />
                <p style={{ color: "var(--muted-fg)", fontSize: 13 }}>{t("common.loading")}</p>
              </div>
            ) : totalTasks === 0 ? (
              <div style={{ textAlign: "center", padding: "64px 0" }}>
                <Video size={64} style={{ margin: "0 auto 16px", color: "var(--muted-fg)", opacity: 0.2 }} />
                <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>{t("task.noTasks")}</h2>
                <p style={{ color: "var(--muted-fg)", marginBottom: 24 }}>
                  {t("task.noTasksHint")}
                </p>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
                  <button type="button" className="btn btn-primary btn-sm" onClick={navigateToStory}>
                    {t("task.viewStoryboard")}
                  </button>
                  <button type="button" className="btn btn-outline btn-sm" onClick={navigateToQuickGenerate}>
                    {t("task.quickGenerate")}
                  </button>
                </div>
              </div>
            ) : (
              <VideoTaskManagerComponent
                tasks={allTasks}
                onBackgroundProcess={startBackgroundProcessing}
                onTaskRecovered={recoverTask}
              />
            )}
          </div>
        </div>
      </div>
    </PageErrorBoundary>
  );
}
