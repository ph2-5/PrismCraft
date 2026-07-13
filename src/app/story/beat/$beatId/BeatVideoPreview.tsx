import {
  RotateCcw,
  Film,
  Image,
  Video,
  Wand2,
} from "lucide-react";
import { t } from "@/shared/constants";
import type { StoryBeat } from "@/domain/schemas";
import { getFirstFrameUrl } from "@/domain/utils";
import type { VideoTask } from "@/modules/video";

interface BeatVideoPreviewProps {
  beat: StoryBeat;
  task?: VideoTask;
  videoUrl?: string;
  guardedPush: (path: string) => void;
}

export function BeatVideoPreview({ beat, task, videoUrl, guardedPush }: BeatVideoPreviewProps) {
  return (
    <>
      <div className="card !p-0 overflow-hidden">
        <div>
          {videoUrl || beat.videoGen?.videoUrl || task?.videoUrl ? (
            <div className="relative aspect-video bg-black">
              <video
                src={
                  videoUrl || beat.videoGen?.videoUrl || task?.videoUrl
                }
                className="w-full h-full"
                controls
                onError={(e) => {
                  const target = e.currentTarget;
                  if (!target.dataset.retried && beat.videoGen?.videoUrl) {
                    // 仅当当前 src 与重试 URL 不同时才重试，避免无限循环
                    if (target.src !== beat.videoGen.videoUrl) {
                      target.dataset.retried = "1";
                      target.src = beat.videoGen.videoUrl;
                    }
                  }
                }}
              />
            </div>
          ) : getFirstFrameUrl(beat.framePair) ? (
            <div className="relative aspect-video bg-muted flex items-center justify-center">
              <img
                src={getFirstFrameUrl(beat.framePair)}
                alt={t("beat.firstFramePreview")}
                className="max-w-full max-h-full object-contain"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <div className="text-center text-white">
                  <Film className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p className="text-lg font-medium">{t("beat.videoNotGenerated")}</p>
                  <p className="text-sm opacity-70">{t("beat.framesReady")}</p>
                </div>
              </div>
            </div>
          ) : beat.keyframe?.imageUrl ? (
            <div className="relative aspect-video bg-muted flex items-center justify-center">
              <img
                src={beat.keyframe.imageUrl}
                alt={t("beat.previewImage")}
                className="max-w-full max-h-full object-contain"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <div className="text-center text-white">
                  <Image className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p className="text-lg font-medium">{t("beat.keyframeGenerated")}</p>
                  <p className="text-sm opacity-70">{t("beat.generateFramesFirst")}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="aspect-video bg-muted flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <Video className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p className="text-lg font-medium">{t("beat.notStarted")}</p>
                <p className="text-sm opacity-70">{t("beat.generateKeyframeFirst")}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {beat.videoGen?.status === "failed" && (
          <button
            type="button"
            className="btn btn-outline gap-2 flex-1"
            onClick={() => guardedPush("/storyboard")}
          >
            <RotateCcw className="w-4 h-4" />
            {t("beat.backToStory")}
          </button>
        )}
        {getFirstFrameUrl(beat.framePair) &&
          !videoUrl &&
          !beat.videoGen?.videoUrl && (
            <button
              type="button"
              className="btn btn-primary gap-2 flex-1"
              onClick={() => guardedPush("/storyboard")}
            >
              <Wand2 className="w-4 h-4" />
              {t("beat.goToStoryboardGenerateVideo")}
            </button>
          )}
        {beat.keyframe?.imageUrl &&
          !getFirstFrameUrl(beat.framePair) && (
            <button
              type="button"
              className="btn btn-primary gap-2 flex-1"
              onClick={() => guardedPush("/storyboard")}
            >
              <Image className="w-4 h-4" />
              {t("beat.goToStoryboardGenerateFramePair")}
            </button>
          )}
        {!beat.keyframe?.imageUrl && (
          <button
            type="button"
            className="btn btn-primary gap-2 flex-1"
            onClick={() => guardedPush("/storyboard")}
          >
            <Wand2 className="w-4 h-4" />
            {t("beat.goToStoryboardGenerateKeyframe")}
          </button>
        )}
        <p className="text-xs text-muted-foreground text-center">
          {t("beat.generateFromStoryboardHint")}
        </p>
      </div>
    </>
  );
}
