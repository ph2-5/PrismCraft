import { t } from "@/shared/constants/messages";
import { Button } from "@/shared/ui/button";
import { Progress } from "@/shared/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { ErrorDisplay, LoadingState } from "@/shared/ui/feedback";
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
  return (
    <div className="space-y-4">
      {globalError && (
        <ErrorDisplay
          error={globalError}
          onRetry={onRetryGlobalError}
          className="mb-4"
        />
      )}

      {isGenerating && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {t("asset.overallProgress", { completed: completedCount, total: tasks.length })}
            </span>
            <span className="text-sm font-medium">{overallProgress}%</span>
          </div>
          <Progress value={overallProgress} className="h-2" />
        </div>
      )}

      {tasks.length > 0 && (
        <div className="flex items-center gap-4 text-sm">
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
          <Button
            onClick={onStartGeneration}
            disabled={!hasItems}
            className="gap-2"
          >
            <Wand2 className="h-4 w-4" />
            {t("asset.startBatch")}
          </Button>
        ) : (
          <Button variant="destructive" onClick={onCancelGeneration} className="gap-2">
            <X className="h-4 w-4" />
            {t("asset.cancelBatch")}
          </Button>
        )}

        {failedCount > 0 && !isGenerating && (
          <Button variant="outline" onClick={onRetryFailed} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            {t("asset.retryFailed")}
          </Button>
        )}

        {completedCount > 0 && !isGenerating && (
          <>
            <Button variant="outline" onClick={onDownloadAll} className="gap-2">
              <Download className="h-4 w-4" />
              {t("asset.downloadAll")}
            </Button>
            {selectedResults.size > 0 && (
              <Button onClick={onSaveSelected} className="gap-2">
                <CheckCircle2 className="h-4 w-4" />
                {t("asset.saveSelected", { count: selectedResults.size })}
              </Button>
            )}
          </>
        )}

        {tasks.length > 0 && (
          <div className="ml-auto flex items-center gap-1 border rounded-lg p-1">
            <Button
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => onViewModeChange("grid")}
            >
              <Grid3X3 className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => onViewModeChange("list")}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {tasks.length > 0 && (
        <Tabs defaultValue="all" className="w-full">
          <TabsList>
            <TabsTrigger value="all">{t("batch.tabAll", { count: tasks.length })}</TabsTrigger>
            <TabsTrigger value="completed">{t("batch.tabCompleted", { count: completedCount })}</TabsTrigger>
            <TabsTrigger value="failed">{t("batch.tabFailed", { count: failedCount })}</TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="mt-4">
            <TaskGrid
              tasks={tasks}
              viewMode={viewMode}
              selectedResults={selectedResults}
              onToggleSelection={onToggleResultSelection}
              isGenerating={isGenerating}
            />
          </TabsContent>

          <TabsContent value="completed" className="mt-4">
            <TaskGrid
              tasks={tasks.filter((t) => t.status === "completed")}
              viewMode={viewMode}
              selectedResults={selectedResults}
              onToggleSelection={onToggleResultSelection}
              isGenerating={isGenerating}
            />
          </TabsContent>

          <TabsContent value="failed" className="mt-4">
            <TaskGrid
              tasks={tasks.filter((t) => t.status === "failed")}
              viewMode={viewMode}
              selectedResults={selectedResults}
              onToggleSelection={onToggleResultSelection}
              isGenerating={isGenerating}
            />
          </TabsContent>
        </Tabs>
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
          <LoadingState message={t("common.generating")} />
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
        <Progress value={task.progress} className="h-1 mt-2" />
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
          <Progress value={task.progress} className="h-1 mt-1" />
        )}
        {task.status === "failed" && task.error && (
          <div className="text-xs text-red-500 truncate">{task.error}</div>
        )}
      </div>

      {isSelected && <CheckCircle2 className="h-4 w-4 text-blue-500" />}
    </div>
  );
}
