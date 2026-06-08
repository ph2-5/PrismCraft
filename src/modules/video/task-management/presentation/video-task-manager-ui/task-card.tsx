import { memo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import {
  ChevronDown,
  ChevronRight,
  Download,
  Eye,
  RefreshCw,
} from "lucide-react";
import type { VideoTask } from "@/domain/schemas";
import { resolveImageUrl } from "@/shared/utils/image-url";
import { createVideoErrorHandler } from "@/shared/utils/media-error-handler";
import { t } from "@/shared/constants/messages";
import { StatusBadge, getTaskDisplayStatus } from "./status-badge";

function formatDuration(ms: number): string {
  if (ms < 1000) return t("task.justNow");
  if (ms < 60000) return t("task.secondsAgo", { count: Math.floor(ms / 1000) });
  if (ms < 3600000) return t("task.minutesAgo", { count: Math.floor(ms / 60000) });
  return t("task.hoursAgo", { count: Math.floor(ms / 3600000) });
}

interface TaskCardProps {
  task: VideoTask;
  isSelected: boolean;
  isExpanded: boolean;
  now: number;
  onToggleSelection: (taskId: string) => void;
  onToggleExpanded: (taskId: string) => void;
  onRetry: (taskId: string) => void;
  onViewDetail: (task: VideoTask) => void;
}

export const TaskCard = memo(function TaskCard({
  task,
  isSelected,
  isExpanded,
  now,
  onToggleSelection,
  onToggleExpanded,
  onRetry,
  onViewDetail,
}: TaskCardProps) {
  return (
    <Card className="overflow-hidden">
      <CardHeader
        className="pb-3 cursor-pointer"
        onClick={() => onToggleExpanded(task.taskId)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={(e) => {
                e.stopPropagation();
                onToggleSelection(task.taskId);
              }}
              className="h-4 w-4 rounded border-gray-600 text-blue-500 focus:ring-blue-500"
            />
            <StatusBadge status={getTaskDisplayStatus(task.status)} />
            <div>
              <CardTitle className="text-sm">
                {task.prompt?.slice(0, 50) || t("task.noPrompt")}
                {(task.prompt?.length || 0) > 50 ? "..." : ""}
              </CardTitle>
              <CardDescription className="text-xs">
                {formatDuration(now - new Date(task.createdAt).getTime())} · {task.providerId || t("common.unknown")}
                {task.storyId ? ` · ${t("task.beatLabel")}: ${task.storyTitle || task.beatTitle || t("task.relatedStory")}` : ` · ${t("sidebar.quickGenerate")}`}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {getTaskDisplayStatus(task.status) === "failed" && (
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  onRetry(task.taskId);
                }}
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                {t("common.retry")}
              </Button>
            )}
            {task.videoUrl && (
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  onViewDetail(task);
                }}
              >
                <Eye className="w-3 h-3 mr-1" />
                {t("task.view")}
              </Button>
            )}
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-0 space-y-4">
          {task.prompt && (
            <div>
              <p className="text-sm text-muted-foreground mb-1">{t("beat.prompt")}</p>
              <p className="text-sm bg-black/20 p-3 rounded">{task.prompt}</p>
            </div>
          )}

          {task.videoUrl && (
            <div>
              <p className="text-sm text-muted-foreground mb-2">{t("task.videoLabel")}</p>
              <video
                src={resolveImageUrl(task.videoUrl)}
                controls
                className="w-full max-h-48 rounded-lg border border-border"
                onError={createVideoErrorHandler()}
              />
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onViewDetail(task)}
                >
                  <Eye className="w-4 h-4 mr-2" />
                  {t("task.viewDetail")}
                </Button>
                <a
                  href={resolveImageUrl(task.videoUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  download
                >
                  <Button size="sm" variant="outline">
                    <Download className="w-4 h-4 mr-2" />
                    {t("beat.download")}
                  </Button>
                </a>
              </div>
            </div>
          )}

          {task.message && (
            <div>
              <p className="text-sm text-muted-foreground mb-1">{t("task.messageLabel")}</p>
              <p className="text-sm text-yellow-400">{task.message}</p>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
});
