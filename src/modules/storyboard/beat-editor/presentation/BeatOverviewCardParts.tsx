import React from "react";
import {
  Clock,
  Edit2,
  Film,
  Users,
  Image as LucideImage,
  Play,
  Zap,
  Sparkles,
  ChevronUp,
  ChevronDown,
  Trash2,
  MoveVertical,
} from "lucide-react";
import { resolveMediaUrl } from "@/shared/utils/image-url";
import { createSimpleVideoErrorHandler } from "@/shared/utils/media-error-handler";
import type { StoryBeat } from "@/domain/schemas";
import { beatTypes } from "@/modules/storyboard";
import { confirm } from "@/shared/utils/confirm";
import { SafeImage } from "@/shared/presentation/SafeImage";
import { errorLogger } from "@/shared/error-logger";
import { t } from "@/shared/constants";
import { IconButton } from "@/shared/presentation/IconButton";

export interface BeatStatusInfo {
  icon: React.ReactNode;
  text: string;
  color: string;
}

export function getBeatStatusInfo(beat: StoryBeat): BeatStatusInfo {
  const hasKeyframe = !!beat.keyframe?.imageUrl;
  const hasFramePair = !!beat.framePair?.firstFrame?.imageUrl;
  const hasVideo = !!beat.videoGen?.videoUrl;

  if (hasVideo) {
    return {
      icon: <Play className="w-3 h-3" />,
      text: t("beat.videoComplete"),
      color: "bg-green-500/20 text-green-400 border-green-500/30",
    };
  }
  if (hasFramePair) {
    return {
      icon: <LucideImage className="w-3 h-3" />,
      text: t("beat.framePairComplete"),
      color: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    };
  }
  if (hasKeyframe) {
    return {
      icon: <Sparkles className="w-3 h-3" />,
      text: t("beat.keyframeComplete"),
      color: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    };
  }
  return {
    icon: <Zap className="w-3 h-3" />,
    text: t("beat.pendingGenerate"),
    color: "bg-muted text-muted-foreground border-muted",
  };
}

interface BeatPreviewMediaProps {
  beat: StoryBeat;
}

export function BeatPreviewMedia({ beat }: BeatPreviewMediaProps) {
  const videoGen = resolveMediaUrl(beat.localVideoPath, beat.videoGen?.videoUrl);
  const keyframeImage = resolveMediaUrl(beat.localKeyframePath, beat.keyframe?.imageUrl);

  if (videoGen) {
    return (
      <video
        src={videoGen}
        className="w-full h-full object-cover"
        muted
        playsInline
        onError={createSimpleVideoErrorHandler()}
      />
    );
  }
  if (keyframeImage) {
    return (
      <SafeImage
        src={keyframeImage}
        alt={beat.title}
        fill
        className="object-cover"
      />
    );
  }
  return (
    <div className="w-full h-full bg-gradient-to-br from-primary/20 to-card2 flex items-center justify-center">
      <div className="text-center">
        <Film className="w-10 h-10 mx-auto mb-2 text-primary/60" />
        <p className="text-xs text-muted-foreground">{t("beat.waitingGenerate")}</p>
      </div>
    </div>
  );
}

interface BeatCardHeaderProps {
  index: number;
  beat: StoryBeat;
  statusInfo: BeatStatusInfo;
}

export function BeatCardHeader({ index, beat, statusInfo }: BeatCardHeaderProps) {
  const typeInfo = beatTypes.find((t) => t.value === beat.type);
  return (
    <>
      <div className="absolute top-3 left-3 flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-black/60 backdrop-blur-sm flex items-center justify-center text-white font-bold text-sm shadow-lg border border-purple-500/30">
          {index + 1}
        </div>
        <span
          className={`badge badge-info ${typeInfo?.color || "bg-purple-600/70"} shadow-md border border-purple-400/30`}
        >
          {typeInfo?.label || t("beat.typeLabel")}
        </span>
      </div>

      <div className="absolute top-3 right-3">
        <span
          className={`badge badge-info ${statusInfo.color} backdrop-blur-sm shadow-md border`}
        >
          {statusInfo.icon}
          <span className="ml-1 text-xs">{statusInfo.text}</span>
        </span>
      </div>

      <div className="absolute bottom-3 right-3">
        <div className="bg-black/60 backdrop-blur-sm px-2 py-1 rounded-lg flex items-center gap-1.5 text-xs text-white border border-purple-500/30">
          <Clock className="w-3 h-3" />
          {beat.duration ?? 0}s
        </div>
      </div>
    </>
  );
}

interface CharacterSceneChipsProps {
  charNames: string[];
  sceneName: string | null;
}

export function CharacterSceneChips({ charNames, sceneName }: CharacterSceneChipsProps) {
  if (charNames.length === 0 && !sceneName) return null;
  return (
    <div className="flex flex-wrap gap-2 pt-2 border-t border-purple-700/30">
      {charNames.length > 0 && (
        <div className="flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5 text-purple-400/70" />
          <div className="flex flex-wrap gap-1">
            {charNames.map((name: string, idx: number) => (
              <span
                key={`${name}-${idx}`}
                className="text-xs px-1.5 py-0.5 rounded bg-purple-900/50 text-purple-200"
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      )}
      {sceneName && (
        <div className="flex items-center gap-1.5">
          <LucideImage className="w-3.5 h-3.5 text-purple-400/70" />
          <span className="text-xs px-1.5 py-0.5 rounded bg-purple-900/50 text-purple-200">
            {sceneName}
          </span>
        </div>
      )}
    </div>
  );
}

interface BeatCardFooterProps {
  beat: StoryBeat;
  index: number;
  totalBeats: number;
  onEditClick: (beat: StoryBeat) => void;
  onMoveBeat?: (beatId: string, direction: "up" | "down") => void;
  onDeleteBeat?: (beatId: string) => void;
}

export function BeatCardFooter({
  beat,
  index,
  totalBeats,
  onEditClick,
  onMoveBeat,
  onDeleteBeat,
}: BeatCardFooterProps) {
  const handleDeleteClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    try {
      const confirmed = await confirm({
        title: t("beat.deleteBeatTitle"),
        description: t("beat.deleteBeatConfirm"),
        confirmText: t("common.delete"),
        variant: "danger",
      });
      if (confirmed && onDeleteBeat) onDeleteBeat(beat.id);
    } catch (err) {
      errorLogger.warn("[BeatOverviewCard] Confirm dialog failed", err);
    }
  };

  return (
    <div className="flex items-center justify-between pt-2 border-t border-purple-700/30">
      {onMoveBeat && (
        <div className="flex items-center gap-1">
          <MoveVertical className="w-4 h-4 text-purple-400/70" />
          <div className="flex gap-1">
            <IconButton
              variant="ghost"
              className="btn-xs h-7 w-7 text-purple-300/80 hover:text-purple-400 hover:bg-purple-500/10"
              disabled={index === 0}
              onClick={(e) => {
                e.stopPropagation();
                onMoveBeat(beat.id, "up");
              }}
              aria-label={t("aria.moveUpBeat")}
            >
              <ChevronUp className="w-4 h-4" />
            </IconButton>
            <IconButton
              variant="ghost"
              className="btn-xs h-7 w-7 text-purple-300/80 hover:text-purple-400 hover:bg-purple-500/10"
              disabled={index === totalBeats - 1}
              onClick={(e) => {
                e.stopPropagation();
                onMoveBeat(beat.id, "down");
              }}
              aria-label={t("aria.moveDownBeat")}
            >
              <ChevronDown className="w-4 h-4" />
            </IconButton>
          </div>
        </div>
      )}

      <div className="flex items-center gap-1">
        <button
          type="button"
          className="btn btn-ghost btn-sm text-xs text-purple-300/80 hover:text-purple-400 hover:bg-purple-500/10 h-7 px-2"
          onClick={(e) => {
            e.stopPropagation();
            onEditClick(beat);
          }}
        >
          <Edit2 className="w-3.5 h-3.5 mr-1.5" />
          {t("beat.editLabel")}
        </button>
        {onDeleteBeat && (
          <button
            type="button"
            className="btn btn-ghost btn-sm text-xs text-purple-300/80 hover:text-red-400 hover:bg-red-500/10 h-7 px-2"
            onClick={handleDeleteClick}
          >
            <Trash2 className="w-3.5 h-3.5 mr-1.5" />
            {t("common.delete")}
          </button>
        )}
      </div>
    </div>
  );
}
