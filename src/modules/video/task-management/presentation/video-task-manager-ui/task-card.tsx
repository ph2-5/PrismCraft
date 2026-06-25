import { memo } from "react";
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
    <div className="card" style={{ padding: 16, overflow: "hidden" }}>
      <div
        className="pb-3 cursor-pointer"
        style={{ paddingBottom: 12, cursor: "pointer" }}
        onClick={() => onToggleExpanded(task.taskId)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              aria-label={t("aria.toggleSelection")}
              checked={isSelected}
              onChange={(e) => {
                e.stopPropagation();
                onToggleSelection(task.taskId);
              }}
              className="h-4 w-4 rounded border-gray-600 focus:ring-blue-500"
              style={{ color: "var(--primary)" }}
            />
            <StatusBadge status={getTaskDisplayStatus(task.status)} />
            <div>
              <div className="text-sm" style={{ fontSize: 16, fontWeight: 600 }}>
                {task.prompt?.slice(0, 50) || t("task.noPrompt")}
                {(task.prompt?.length || 0) > 50 ? "..." : ""}
              </div>
              <div className="text-xs" style={{ fontSize: 12, color: "var(--muted-fg)" }}>
                {formatDuration(now - new Date(task.createdAt).getTime())} · {task.providerId || t("common.unknown")}
                {task.storyId ? ` · ${t("task.beatLabel")}: ${task.storyTitle || task.beatTitle || t("task.relatedStory")}` : ` · ${t("sidebar.quickGenerate")}`}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(getTaskDisplayStatus(task.status) === "failed" || getTaskDisplayStatus(task.status) === "timeout") && (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onRetry(task.taskId);
                }}
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                {t("common.retry")}
              </button>
            )}
            {task.videoUrl && (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onViewDetail(task);
                }}
              >
                <Eye className="w-3 h-3 mr-1" />
                {t("task.view")}
              </button>
            )}
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="pt-0 space-y-4">
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
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => onViewDetail(task)}
                >
                  <Eye className="w-4 h-4 mr-2" />
                  {t("task.viewDetail")}
                </button>
                <a
                  href={resolveImageUrl(task.videoUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  download
                >
                  <button type="button" className="btn btn-outline btn-sm">
                    <Download className="w-4 h-4 mr-2" />
                    {t("beat.download")}
                  </button>
                </a>
              </div>
            </div>
          )}

          {task.message && (
            <div>
              <p className="text-sm text-muted-foreground mb-1">{t("task.messageLabel")}</p>
              <p className="text-sm" style={{ color: "var(--warning)" }}>{task.message}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
