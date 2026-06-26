import { Play, Upload, Loader2, RefreshCw } from "lucide-react";
import { AppCard } from "@/shared/presentation/AppCard";
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
          ? "border-primary/50 shadow-lg shadow-primary/10"
          : status === "completed"
            ? "border-success/30"
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
                ? "bg-success/20 text-success"
                : status === "generating"
                  ? "bg-primary/20"
                  : status === "pending"
                    ? "bg-muted text-muted-foreground"
                    : "bg-muted text-muted-foreground"
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
              <span className="text-sm font-medium text-foreground">
                {t("keyframe.stepVideo")}
              </span>
              {status === "completed" && (
                <span className="text-xs text-success">✓</span>
              )}
              {status === "generating" && (
                <span className="text-xs animate-pulse" style={{ color: "var(--primary)" }}>
                  {t("keyframe.generating")}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
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
              className="btn btn-outline btn-sm bg-muted hover:bg-muted/80"
              onClick={() => videoInputRef.current?.click()}
            >
              <Upload className="w-4 h-4 mr-1" />
              {t("common.upload")}
            </button>
            {!hasVideo ? (
              <button
                type="button"
                className="btn btn-primary btn-sm bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90"
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
                className="btn btn-outline btn-sm bg-muted hover:bg-muted/80"
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
              className="w-full max-h-64 rounded-lg border border-border"
              onError={createVideoErrorHandler(videoUrl)}
            />
          </div>
        )}
      </div>
    </AppCard>
  );
}
