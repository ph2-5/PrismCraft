import { Play, Upload, Loader2, RefreshCw } from "lucide-react";
import { AppCard } from "@/shared/ui/app-card";
import { resolveMediaUrl } from "@/shared/utils/image-url";
import { createVideoErrorHandler } from "@/shared/utils/media-error-handler";
import { t } from "@/shared/constants/messages";
import type { StoryBeat } from "@/domain/schemas";

interface VideoStepContentProps {
  beat: StoryBeat;
  isGenerating: boolean;
  isActiveStep: boolean;
  hasFramePair: boolean;
  hasVideo: boolean;
  videoInputRef: React.RefObject<HTMLInputElement | null>;
  onUploadVideo?: (file: File) => void;
  onGenerateVideo: () => Promise<StoryBeat | void>;
  onRegenerateVideo?: () => Promise<void>;
  onFileSelect: (
    e: React.ChangeEvent<HTMLInputElement>,
    handler?: (file: File) => void,
  ) => void;
}

export function VideoStepContent({
  beat,
  isGenerating,
  isActiveStep,
  hasFramePair,
  hasVideo,
  videoInputRef,
  onUploadVideo,
  onGenerateVideo,
  onRegenerateVideo,
  onFileSelect,
}: VideoStepContentProps) {
  const status = hasVideo
    ? "completed"
    : isActiveStep && isGenerating
      ? "generating"
      : !hasFramePair
        ? "pending"
        : "ready";

  const videoUrl = beat.videoGen?.videoUrl;
  const localVideoPath = beat.localVideoPath;

  return (
    <AppCard
      className={`transition-all ${
        status === "generating"
          ? "border-blue-500/50 shadow-lg shadow-blue-500/10"
          : status === "completed"
            ? "border-emerald-500/30"
            : status === "pending"
              ? "opacity-50"
              : ""
      }`}
    >
      <div className="p-4">
        <div className="flex items-center gap-3 mb-3">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
              status === "completed"
                ? "bg-emerald-500/20 text-emerald-400"
                : status === "generating"
                  ? "bg-blue-500/20"
                  : status === "pending"
                    ? "bg-slate-700/50 text-slate-500"
                    : "bg-slate-700/50 text-slate-400"
            }`}
            style={status === "generating" ? { color: "var(--primary)" } : undefined}
          >
            {status === "generating" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-white">
                {t("keyframe.stepVideo")}
              </span>
              {status === "completed" && (
                <span className="text-xs text-emerald-400">✓</span>
              )}
              {status === "generating" && (
                <span className="text-xs animate-pulse" style={{ color: "var(--primary)" }}>
                  {t("keyframe.generating")}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {t("keyframe.videoDesc")}
            </p>
          </div>
          <div className="flex gap-2">
            <input
              ref={videoInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => onFileSelect(e, onUploadVideo)}
            />
            <button
              type="button"
              className="btn btn-outline btn-sm bg-slate-700 hover:bg-slate-600"
              onClick={() => videoInputRef.current?.click()}
            >
              <Upload className="w-4 h-4 mr-1" />
              {t("common.upload")}
            </button>
            {!hasVideo ? (
              <button
                type="button"
                className="btn btn-primary btn-sm bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500"
                onClick={onGenerateVideo}
                disabled={isGenerating || !hasFramePair}
              >
                {isGenerating && isActiveStep ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 mr-1" />
                )}
                {t("beat.generateVideo")}
              </button>
            ) : onRegenerateVideo ? (
              <button
                type="button"
                className="btn btn-outline btn-sm bg-slate-700 hover:bg-slate-600"
                onClick={onRegenerateVideo}
                disabled={isGenerating}
              >
                <RefreshCw className="w-4 h-4 mr-1" />
                {t("common.regenerate")}
              </button>
            ) : null}
          </div>
        </div>

        {hasVideo && (videoUrl || localVideoPath) && (
          <div className="mt-3">
            <video
              src={resolveMediaUrl(localVideoPath, videoUrl) || ""}
              controls
              className="w-full max-h-64 rounded-lg border border-slate-700"
              onError={createVideoErrorHandler(videoUrl)}
            />
          </div>
        )}
      </div>
    </AppCard>
  );
}
