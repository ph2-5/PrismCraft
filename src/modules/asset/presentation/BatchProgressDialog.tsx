import { useState } from "react";
import { t } from "@/shared/constants/messages";
import { cn } from "@/shared/utils/utils";
import { Tabs } from "@/shared/presentation/Tabs";
import type { BatchTask } from "@/domain/schemas";
import {
  Wand2,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Download,
  RefreshCw,
  Grid3X3,
  List,
} from "lucide-react";

interface BatchProgressDialogProps {
  tasks: BatchTask[];
  isGenerating: boolean;
  overallProgress: number;
  completedCount: number;
  failedCount: number;
  pendingCount: number;
  selectedResults: Set<string>;
  viewMode: "grid" | "list";
  globalError: string | null;
  hasItems: boolean;
  onStartGeneration: () => void;
  onCancelGeneration: () => void;
  onRetryFailed: () => void;
  onDownloadAll: () => void;
  onSaveSelected: () => void;
  onToggleResultSelection: (taskId: string) => void;
  onViewModeChange: (mode: "grid" | "list") => void;
  onRetryGlobalError: () => void;
}

export function BatchProgressDialog({
  tasks,
  isGenerating,
  overallProgress,
  completedCount,
  failedCount,
  pendingCount,
  selectedResults,
  viewMode,
  globalError,
  hasItems,
  onStartGeneration,
  onCancelGeneration,
  onRetryFailed,
  onDownloadAll,
  onSaveSelected,
  onToggleResultSelection,
  onViewModeChange,
  onRetryGlobalError,
}: BatchProgressDialogProps) {
  const [tabValue, setTabValue] = useState("all");

  return (
    <div className="space-y-4">
      {globalError && (
        <div
          className="rounded-lg border p-4 mb-4"
          style={{ background: "rgba(239,68,68,0.1)", borderColor: "rgba(239,68,68,0.3)" }}
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 mt-0.5" style={{ color: "#ef4444" }} />
            <div className="flex-1 min-w-0">
              <h4 className="font-medium" style={{ color: "#ef4444" }}>{globalError}</h4>
              <button
                type="button"
                onClick={onRetryGlobalError}
                className="mt-3 text-sm font-medium underline hover:opacity-80"
                style={{ color: "#ef4444" }}
              >
                {t("common.retry")}
              </button>
            </div>
          </div>
        </div>
      )}

      {isGenerating && (
        <div className="space-y-2">
          <div
            className="flex items-center justify-between"
            role="status"
            aria-live="polite"
          >
            <span className="text-sm text-muted-foreground">
              {t("asset.overallProgress", { completed: completedCount, total: tasks.length })}
            </span>
            <span className="text-sm font-medium">{overallProgress}%</span>
          </div>
          <div
            className="progress-bar h-2"
            role="progressbar"
            aria-label={t("common.generating")}
            aria-valuenow={overallProgress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="progress-fill" style={{ width: `${overallProgress}%` }} />
          </div>
        </div>
      )}

      {tasks.length > 0 && (
        <div
          className="flex items-center gap-4 text-sm"
          role="status"
          aria-live="polite"
        >
          <span className="flex items-center gap-1">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            {t("asset.completedCount", { count: completedCount })}
          </span>
          <span className="flex items-center gap-1">
            <AlertCircle className="h-4 w-4 text-red-500" />
            {t("asset.failedCount", { count: failedCount })}
          </span>
          <span className="flex items-center gap-1">
            <Loader2 className="h-4 w-4 text-blue-500" />
            {t("asset.pendingCount", { count: pendingCount })}
          </span>
        </div>
      )}

      <div className="flex items-center gap-2">
        {!isGenerating ? (
          <button
            type="button"
            className="btn btn-primary gap-2"
            onClick={onStartGeneration}
            disabled={!hasItems}
          >
            <Wand2 className="h-4 w-4" />
            {t("asset.startBatch")}
          </button>
        ) : (
          <button type="button" className="btn btn-danger gap-2" onClick={onCancelGeneration}>
            <X className="h-4 w-4" />
            {t("asset.cancelBatch")}
          </button>
        )}

        {failedCount > 0 && !isGenerating && (
          <button type="button" className="btn btn-outline gap-2" onClick={onRetryFailed}>
            <RefreshCw className="h-4 w-4" />
            {t("asset.retryFailed")}
          </button>
        )}

        {completedCount > 0 && !isGenerating && (
          <>
            <button type="button" className="btn btn-outline gap-2" onClick={onDownloadAll}>
              <Download className="h-4 w-4" />
              {t("asset.downloadAll")}
            </button>
            {selectedResults.size > 0 && (
              <button type="button" className="btn btn-primary gap-2" onClick={onSaveSelected}>
                <CheckCircle2 className="h-4 w-4" />
                {t("asset.saveSelected", { count: selectedResults.size })}
              </button>
            )}
          </>
        )}

        {tasks.length > 0 && (
          <div className="ml-auto flex items-center gap-1 border rounded-lg p-1">
            <button
              type="button"
              className={cn("btn btn-sm", viewMode === "grid" ? "btn-outline" : "btn-ghost")}
              onClick={() => onViewModeChange("grid")}
            >
              <Grid3X3 className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={cn("btn btn-sm", viewMode === "list" ? "btn-outline" : "btn-ghost")}
              onClick={() => onViewModeChange("list")}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {tasks.length > 0 && (
        <div className="w-full">
          <Tabs
            tabs={[
              { id: "all", label: t("batch.tabAll", { count: tasks.length }) },
              { id: "completed", label: t("batch.tabCompleted", { count: completedCount }) },
              { id: "failed", label: t("batch.tabFailed", { count: failedCount }) },
            ]}
            activeTab={tabValue}
            onChange={setTabValue}
          />

          {tabValue === "all" && (
            <div className="mt-4">
              <TaskGrid
                tasks={tasks}
                viewMode={viewMode}
                selectedResults={selectedResults}
                onToggleSelection={onToggleResultSelection}
                isGenerating={isGenerating}
              />
            </div>
          )}

          {tabValue === "completed" && (
            <div className="mt-4">
              <TaskGrid
                tasks={tasks.filter((t) => t.status === "completed")}
                viewMode={viewMode}
                selectedResults={selectedResults}
                onToggleSelection={onToggleResultSelection}
                isGenerating={isGenerating}
              />
            </div>
          )}

          {tabValue === "failed" && (
            <div className="mt-4">
              <TaskGrid
                tasks={tasks.filter((t) => t.status === "failed")}
                viewMode={viewMode}
                selectedResults={selectedResults}
                onToggleSelection={onToggleResultSelection}
                isGenerating={isGenerating}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface TaskGridProps {
  tasks: BatchTask[];
  viewMode: "grid" | "list";
  selectedResults: Set<string>;
  onToggleSelection: (taskId: string) => void;
  isGenerating: boolean;
}

function TaskGrid({ tasks, viewMode, selectedResults, onToggleSelection, isGenerating }: TaskGridProps) {
  if (tasks.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        {t("batch.noTasks")}
      </div>
    );
  }

  if (viewMode === "grid") {
    return (
      <div className="grid grid-cols-3 gap-4">
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            isSelected={selectedResults.has(task.id)}
            onToggleSelection={() => onToggleSelection(task.id)}
            isGenerating={isGenerating}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {tasks.map((task) => (
        <TaskListItem
          key={task.id}
          task={task}
          isSelected={selectedResults.has(task.id)}
          onToggleSelection={() => onToggleSelection(task.id)}
          isGenerating={isGenerating}
        />
      ))}
    </div>
  );
}

interface TaskCardProps {
  task: BatchTask;
  isSelected: boolean;
  onToggleSelection: () => void;
  isGenerating: boolean;
}

function TaskCard({ task, isSelected, onToggleSelection, isGenerating }: TaskCardProps) {
  const statusColors = {
    pending: "bg-gray-100",
    generating: "bg-blue-50",
    completed: "bg-green-50",
    failed: "bg-red-50",
  };

  return (
    <div
      className={`relative rounded-lg border-2 p-3 transition-all ${
        isSelected ? "border-blue-500" : "border-transparent"
      } ${statusColors[task.status]}`}
      onClick={task.status === "completed" && !isGenerating ? onToggleSelection : undefined}
    >
      {task.status === "completed" && task.result?.imageUrl && (
        <img
          src={task.result.imageUrl}
          alt={task.itemName}
          className="w-full h-32 object-cover rounded mb-2"
        />
      )}

      {task.status === "generating" && (
        <div className="w-full h-32 flex items-center justify-center bg-gray-100 rounded mb-2">
          <div className="flex flex-col items-center justify-center p-8">
            <div className="h-12 w-12 rounded-full border-4 border-border border-t-primary animate-spin" />
            <p className="mt-4 text-muted-foreground font-medium">{t("common.generating")}</p>
          </div>
        </div>
      )}

      {task.status === "failed" && (
        <div className="w-full h-32 flex items-center justify-center bg-red-50 rounded mb-2 text-red-500">
          <AlertCircle className="h-8 w-8" />
        </div>
      )}

      {task.status === "pending" && (
        <div className="w-full h-32 flex items-center justify-center bg-gray-100 rounded mb-2 text-gray-400">
          {t("common.pending")}...
        </div>
      )}

      <div className="text-sm font-medium truncate">{task.itemName}</div>

      {task.status === "generating" && (
        <div
          className="progress-bar h-1 mt-2"
          role="progressbar"
          aria-label={t("common.generating")}
          aria-valuenow={task.progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="progress-fill" style={{ width: `${task.progress}%` }} />
        </div>
      )}

      {task.status === "failed" && task.error && (
        <div className="text-xs text-red-500 mt-1 truncate">{task.error}</div>
      )}

      {isSelected && (
        <div className="absolute top-2 right-2 bg-blue-500 text-white rounded-full p-1">
          <CheckCircle2 className="h-3 w-3" />
        </div>
      )}
    </div>
  );
}

type TaskListItemProps = TaskCardProps;

function TaskListItem({ task, isSelected, onToggleSelection, isGenerating }: TaskListItemProps) {
  const statusIcons = {
    pending: <Loader2 className="h-4 w-4 text-gray-400" />,
    generating: <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />,
    completed: <CheckCircle2 className="h-4 w-4 text-green-500" />,
    failed: <AlertCircle className="h-4 w-4 text-red-500" />,
  };

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
        isSelected ? "border-blue-500 bg-blue-50" : "border-gray-200"
      }`}
      onClick={task.status === "completed" && !isGenerating ? onToggleSelection : undefined}
    >
      {statusIcons[task.status]}

      {task.status === "completed" && task.result?.imageUrl && (
        <img
          src={task.result.imageUrl}
          alt={task.itemName}
          className="w-12 h-12 object-cover rounded"
        />
      )}

      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{task.itemName}</div>
        {task.status === "generating" && (
          <div
            className="progress-bar h-1 mt-1"
            role="progressbar"
            aria-label={t("common.generating")}
            aria-valuenow={task.progress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="progress-fill" style={{ width: `${task.progress}%` }} />
          </div>
        )}
        {task.status === "failed" && task.error && (
          <div className="text-xs text-red-500 truncate">{task.error}</div>
        )}
      </div>

      {isSelected && <CheckCircle2 className="h-4 w-4 text-blue-500" />}
    </div>
  );
}
