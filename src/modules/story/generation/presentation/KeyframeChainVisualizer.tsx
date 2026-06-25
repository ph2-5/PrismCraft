import { useMemo } from "react";
import { Link, Image, CheckCircle } from "lucide-react";
import type { StoryBeat } from "@/domain/schemas";
import { t } from "@/shared/constants";

interface KeyframeChainVisualizerProps {
  beats: StoryBeat[];
}

export function KeyframeChainVisualizer({
  beats,
}: KeyframeChainVisualizerProps) {
  const chainStatus = useMemo(() => {
    const status = beats.map((beat, index) => {
      const hasKeyframe = !!beat.keyframe?.imageUrl;
      const hasFramePair = !!beat.framePair?.firstFrame?.imageUrl;
      const hasVideo = !!beat.videoGen?.videoUrl;
      const prevBeat = index > 0 ? beats[index - 1] : null;
      const isLinked =
        hasKeyframe &&
        prevBeat?.keyframe?.imageUrl &&
        beat.keyframe?.referencedPrevKeyframe === prevBeat.id;

      return {
        beat,
        index,
        hasKeyframe,
        hasFramePair,
        hasVideo,
        isLinked,
        isFirst: index === 0,
      };
    });

    const validChain = status.every((s, i) => {
      if (i === 0) return s.hasKeyframe;
      return s.hasKeyframe && s.isLinked;
    });

    return { status, validChain };
  }, [beats]);

  if (beats.length === 0) return null;

  return (
    <div className="bg-card2 border border-primary/30 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-primary flex items-center gap-2">
          <Link className="w-4 h-4 text-primary" />
          {t("keyframe.chainInheritance")}
        </h4>
        <span
          className={
            chainStatus.validChain
              ? "badge badge-info bg-success/50"
              : "badge badge-info bg-warning/50"
          }
        >
          {chainStatus.validChain ? t("keyframe.chainComplete") : t("keyframe.chainBroken")}
        </span>
      </div>

      <div className="flex items-center gap-1 overflow-x-auto pb-2">
        {chainStatus.status.map((item, index) => (
          <div key={item.beat.id} className="flex items-center gap-1 shrink-0">
            {/* 连接线 */}
            {!item.isFirst && (
              <div
                className={`w-6 h-0.5 ${
                  item.isLinked
                    ? "bg-primary"
                    : item.hasKeyframe
                      ? "bg-primary/30"
                      : "bg-muted"
                }`}
              />
            )}

            {/* 节点 */}
            <div
              className={`relative w-10 h-10 rounded-lg flex items-center justify-center border-2 ${
                item.hasKeyframe
                  ? item.isLinked || item.isFirst
                    ? "border-primary bg-primary/20"
                    : "border-primary bg-primary/20"
                  : "border-border bg-muted"
              }`}
              title={t("beat.shotNumber", { number: index + 1 }) +
                (item.hasKeyframe
                  ? item.isLinked
                    ? t("keyframe.beatLinked")
                    : item.isFirst
                      ? t("keyframe.beatFirst")
                      : t("keyframe.beatUnlinked")
                  : t("keyframe.beatNoPreview")
                )}
            >
              {item.hasKeyframe ? (
                <>
                  {item.beat.keyframe?.imageUrl ? (
                    <img
                      src={item.beat.keyframe.imageUrl}
                      alt={t("beat.shotNumber", { number: index + 1 })}
                      className="w-full h-full object-cover rounded-md"
                    />
                  ) : (
                    <Image className="w-4 h-4 text-primary" />
                  )}
                  {/* 状态指示器 */}
                  <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center">
                    {item.hasVideo ? (
                      <CheckCircle className="w-3.5 h-3.5 bg-background rounded-full" style={{ color: "var(--success)" }} />
                    ) : item.hasFramePair ? (
                      <div className="w-3 h-3 rounded-full bg-primary border-2 border-background" />
                    ) : (
                      <div className="w-3 h-3 rounded-full bg-warning border-2 border-background" />
                    )}
                  </div>
                </>
              ) : (
                <span className="text-xs text-muted-foreground">{index + 1}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 图例 */}
      <div className="flex flex-wrap gap-3 mt-3 text-[10px] text-primary">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-primary border border-background" />
          <span>{t("keyframe.linked")}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-warning border border-background" />
          <span>{t("keyframe.previewOnly")}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-success border border-background" />
          <span>{t("keyframe.videoCompleted")}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-0.5 bg-primary" />
          <span>{t("keyframe.chainRef")}</span>
        </div>
      </div>
    </div>
  );
}
