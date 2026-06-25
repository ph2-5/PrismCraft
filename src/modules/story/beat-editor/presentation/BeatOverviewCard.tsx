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
import { cn } from "@/shared/utils/utils";
import { getBeatCharacterIds } from "@/domain/utils";
import { resolveMediaUrl } from "@/shared/utils/image-url";
import { createSimpleVideoErrorHandler } from "@/shared/utils/media-error-handler";
import type { StoryBeat, Character, Scene } from "@/domain/schemas";
import { beatTypes } from "@/modules/story";
import { useConfirmDialog } from "@/shared/ui/confirm-dialog";
import { SafeImage } from "@/shared/ui/safe-image";
import { errorLogger } from "@/shared/error-logger";
import { t } from "@/shared/constants";

interface BeatOverviewCardProps {
  beat: StoryBeat;
  index: number;
  characters: Character[];
  scenes: Scene[];
  onEditClick: (beat: StoryBeat) => void;
  onMoveBeat?: (beatId: string, direction: "up" | "down") => void;
  onDeleteBeat?: (beatId: string) => void;
  totalBeats?: number;
  isSelected?: boolean;
}

export const BeatOverviewCard = React.memo(function BeatOverviewCard({
  beat,
  index,
  characters,
  scenes,
  onEditClick,
  onMoveBeat,
  onDeleteBeat,
  totalBeats = 0,
  isSelected = false,
}: BeatOverviewCardProps) {
  const { confirm: confirmDialog, ConfirmDialogComponent } = useConfirmDialog();
  const typeInfo = beatTypes.find((t) => t.value === beat.type);
  const charIds = getBeatCharacterIds(beat);
  const charNames = charIds
    .map((id: string) => characters.find((c) => c.id === id)?.name)
    .filter((n): n is string => Boolean(n));
  const sceneName = (beat.sceneId || beat.scene)
    ? scenes.find((s) => s.id === (beat.sceneId || beat.scene))?.name
    : null;
  const keyframeImage = resolveMediaUrl(beat.localKeyframePath, beat.keyframe?.imageUrl);
  const videoGen = resolveMediaUrl(beat.localVideoPath, beat.videoGen?.videoUrl);

  const getStatusInfo = () => {
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
      color: "bg-slate-500/20 text-slate-400 border-slate-500/30",
    };
  };

  const statusInfo = getStatusInfo();

  return (
    <>
      <div
        className={cn(
          "card group relative overflow-hidden transition-all duration-300 cursor-pointer hover:shadow-xl hover:shadow-purple-500/10 border-purple-700/30 hover:border-purple-500/50 bg-slate-800/40",
          isSelected &&
            "ring-2 ring-primary border-primary shadow-lg shadow-primary/10",
        )}
        onClick={() => onEditClick(beat)}
      >
        <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-purple-500 via-pink-500 to-purple-500 group-hover:w-2 transition-all duration-300" />

        <div>
          <div className="flex flex-col">
            <div className="relative overflow-hidden h-36">
              {videoGen ? (
                <video
                  src={videoGen}
                  className="w-full h-full object-cover"
                  muted
                  playsInline
                  onError={createSimpleVideoErrorHandler()}
                />
              ) : keyframeImage ? (
                <SafeImage
                  src={keyframeImage}
                  alt={beat.title}
                  fill
                  className="object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-purple-900/40 to-slate-900 flex items-center justify-center">
                  <div className="text-center">
                    <Film className="w-10 h-10 mx-auto mb-2 text-purple-500/60" />
                    <p className="text-xs text-purple-400/70">{t("beat.waitingGenerate")}</p>
                  </div>
                </div>
              )}

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
            </div>

            <div className="p-4 space-y-3">
              <div>
                <h3 className="text-base font-semibold text-purple-100 group-hover:text-purple-400 transition-colors line-clamp-1">
                  {beat.title || t("beat.shotNumber", { number: index + 1 })}
                </h3>
                <p className="text-xs text-purple-300/80 mt-1 line-clamp-2">
                  {beat.content || beat.description || t("beat.clickToEdit")}
                </p>
              </div>

              {(charNames.length > 0 || sceneName) && (
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
              )}

              <div className="flex items-center justify-between pt-2 border-t border-purple-700/30">
                {onMoveBeat && (
                  <div className="flex items-center gap-1">
                    <MoveVertical className="w-4 h-4 text-purple-400/70" />
                    <div className="flex gap-1">
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs h-7 w-7 text-purple-300/80 hover:text-purple-400 hover:bg-purple-500/10"
                        disabled={index === 0}
                        onClick={(e) => {
                          e.stopPropagation();
                          onMoveBeat(beat.id, "up");
                        }}
                      >
                        <ChevronUp className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs h-7 w-7 text-purple-300/80 hover:text-purple-400 hover:bg-purple-500/10"
                        disabled={index === totalBeats - 1}
                        onClick={(e) => {
                          e.stopPropagation();
                          onMoveBeat(beat.id, "down");
                        }}
                      >
                        <ChevronDown className="w-4 h-4" />
                      </button>
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
                      onClick={(e) => {
                        e.stopPropagation();
                        confirmDialog({
                          title: t("beat.deleteBeatTitle"),
                          description: t("beat.deleteBeatConfirm"),
                          confirmText: t("common.delete"),
                          variant: "danger",
                    }).then((confirmed) => {
                      if (confirmed) onDeleteBeat(beat.id);
                    }).catch((e) => { errorLogger.warn("[BeatOverviewCard] Confirm dialog failed", e); });
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                      {t("common.delete")}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {ConfirmDialogComponent}
    </>
  );
});
