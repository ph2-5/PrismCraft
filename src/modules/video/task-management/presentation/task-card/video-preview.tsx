import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import {
  Video,
  Download,
  Trash2,
  Play,
  ChevronRight,
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
  if (!task.videoUrl) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          <Video className="w-4 h-4 text-green-600" />
          <span className="text-green-600 font-medium">{t("task.videoGenerated")}</span>
        </div>
        {cacheState?.exists && (
          <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 flex items-center gap-1">
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
          </Badge>
        )}
      </div>
      <div className="group relative">
        <div
          className="aspect-video bg-slate-900 rounded-lg overflow-hidden cursor-pointer"
          onClick={() => onOpenPreview(task)}
        >
          <video
            src={task.videoUrl}
            className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
            preload="metadata"
            muted
            onError={(e) => {
              const target = e.currentTarget;
              if (target.dataset.retried) return;
              target.dataset.retried = "1";
              target.style.display = "none";
              const parent = target.parentElement;
              if (parent && !parent.querySelector(".video-fallback")) {
                const fallback = document.createElement("div");
                fallback.className =
                  "video-fallback w-full h-full flex items-center justify-center";
                const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
                svg.setAttribute("class", "w-8 h-8 text-gray-500");
                svg.setAttribute("fill", "none");
                svg.setAttribute("stroke", "currentColor");
                svg.setAttribute("viewBox", "0 0 24 24");
                const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
                path.setAttribute("stroke-linecap", "round");
                path.setAttribute("stroke-linejoin", "round");
                path.setAttribute("stroke-width", "2");
                path.setAttribute("d", "M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z");
                svg.appendChild(path);
                fallback.appendChild(svg);
                parent.appendChild(fallback);
              }
            }}
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/10 transition-colors">
            <Play className="w-8 h-8 text-white opacity-70 group-hover:opacity-100 group-hover:scale-110 transition-all" />
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-3 text-xs flex-1 gap-1"
          onClick={() => onOpenPreview(task)}
        >
          <Play className="w-3 h-3" />
          {t("task.previewButton")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-3 text-xs flex-1 gap-1"
          onClick={() => onOpenDetail(task)}
        >
          <ChevronRight className="w-3 h-3" />
          {t("shot.detail")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-3 text-xs flex-1 gap-1"
          onClick={() => onDownloadVideo(task)}
        >
          <Download className="w-3 h-3" />
          {t("task.downloadButton")}
        </Button>
        {cacheState?.exists && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-3 text-xs flex-1 gap-1 text-red-600 hover:text-red-700 border-red-200 hover:border-red-300"
            onClick={() => onDeleteCache(task)}
          >
            <Trash2 className="w-3 h-3" />
            {t("common.delete")}
          </Button>
        )}
      </div>
    </div>
  );
}
