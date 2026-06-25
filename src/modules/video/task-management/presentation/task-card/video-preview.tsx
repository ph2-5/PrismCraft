import { useState, useEffect } from "react";
import {
  Video,
  Download,
  Trash2,
  Play,
  ChevronRight,
  VideoOff,
} from "lucide-react";
import type { VideoTask } from "@/modules/video/task-management";
import { t } from "@/shared/constants";

interface VideoPreviewProps {
  task: VideoTask;
  onOpenPreview: (task: VideoTask) => void;
  onOpenDetail: (task: VideoTask) => void;
  onDownloadVideo: (task: VideoTask) => void;
  onDeleteCache: (task: VideoTask) => void;
  cacheState?: { exists: boolean; fileSizeMB?: number };
}

export function VideoPreview({
  task,
  onOpenPreview,
  onOpenDetail,
  onDownloadVideo,
  onDeleteCache,
  cacheState,
}: VideoPreviewProps) {
  const [videoError, setVideoError] = useState(false);

  useEffect(() => {
    setVideoError(false);
  }, [task.videoUrl]);

  if (!task.videoUrl) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          <Video className="w-4 h-4" style={{ color: "var(--success)" }} />
          <span className="font-medium" style={{ color: "var(--success)" }}>{t("task.videoGenerated")}</span>
        </div>
        {cacheState?.exists && (
          <span
            className="badge badge-info flex items-center gap-1"
            style={{ background: "rgba(var(--primary-rgb), 0.1)", color: "var(--primary)" }}
          >
            <svg
              className="w-3 h-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
              />
            </svg>
            {t("task.localCache")}
            {cacheState.fileSizeMB !== undefined && (
              <span className="text-xs opacity-80">
                ({cacheState.fileSizeMB.toFixed(2)}MB)
              </span>
            )}
          </span>
        )}
      </div>
      <div className="group relative">
        <div
          className="aspect-video bg-background rounded-lg overflow-hidden cursor-pointer"
          onClick={() => onOpenPreview(task)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onOpenPreview(task);
            }
          }}
          aria-label={t("aria.previewVideo")}
        >
          {videoError ? (
            <div className="w-full h-full flex items-center justify-center">
              <VideoOff className="w-8 h-8" style={{ color: "var(--muted-fg)" }} />
            </div>
          ) : (
            <video
              src={task.videoUrl}
              className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
              preload="metadata"
              muted
              onError={() => setVideoError(true)}
            />
          )}
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/10 transition-colors">
            <Play className="w-8 h-8 text-white opacity-70 group-hover:opacity-100 group-hover:scale-110 transition-all" />
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          className="btn btn-outline btn-sm h-8 px-3 text-xs flex-1 gap-1"
          onClick={() => onOpenPreview(task)}
        >
          <Play className="w-3 h-3" />
          {t("task.previewButton")}
        </button>
        <button
          type="button"
          className="btn btn-outline btn-sm h-8 px-3 text-xs flex-1 gap-1"
          onClick={() => onOpenDetail(task)}
        >
          <ChevronRight className="w-3 h-3" />
          {t("shot.detail")}
        </button>
        <button
          type="button"
          className="btn btn-outline btn-sm h-8 px-3 text-xs flex-1 gap-1"
          onClick={() => onDownloadVideo(task)}
        >
          <Download className="w-3 h-3" />
          {t("task.downloadButton")}
        </button>
        {cacheState?.exists && (
          <button
            type="button"
            className="btn btn-outline btn-sm h-8 px-3 text-xs flex-1 gap-1"
            style={{ color: "var(--destructive)", borderColor: "var(--destructive)" }}
            onClick={() => onDeleteCache(task)}
          >
            <Trash2 className="w-3 h-3" />
            {t("common.delete")}
          </button>
        )}
      </div>
    </div>
  );
}
