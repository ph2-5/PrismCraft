import { memo } from "react";

import { cn } from "@/shared/utils/utils";
import type { StoryBeat } from "@/domain/schemas";
import {
  statusConfig,
  FeatureAnchoringBanner,
  ActionButtons,
  VideoPreview,
  ConsistencyCheckCard,
  ErrorBlock,
  GenerationTips,
} from "./ShotGenerationPanelParts";

interface ShotGenerationPanelProps {
  beat: StoryBeat;
  isGenerating: boolean;
  onGenerate: () => Promise<void>;
  onRegenerate?: () => Promise<void>;
}

export const ShotGenerationPanel = memo(function ShotGenerationPanel({
  beat,
  isGenerating,
  onGenerate,
  onRegenerate,
}: ShotGenerationPanelProps) {
  const status = beat.generationStatus || "idle";
  const config = statusConfig[status];
  const Icon = config.icon;

  const videoUrl = beat.videoGen?.videoUrl || beat.generationResult?.videoUrl;
  const localVideoPath = beat.localVideoPath;
  const error = beat.generationResult?.error;
  const isFeatureAnchored = beat.featureAnchoring?.enabled;
  const anchoring = isFeatureAnchored ? beat.featureAnchoring : undefined;
  const consistencyCheck = beat.consistencyCheck;

  return (
    <div className="space-y-4">
      {isFeatureAnchored && anchoring && (
        <FeatureAnchoringBanner anchoring={anchoring} />
      )}

      <div className="card" style={{ padding: 16 }}>
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className={cn("badge badge-info", config.color)}>{config.label}</span>
              {Icon && (
                <Icon
                  className={`w-4 h-4 ${status === "generating" ? "animate-spin" : ""}`}
                />
              )}
            </div>
            <ActionButtons
              beatId={beat.id}
              status={status}
              isGenerating={isGenerating}
              onGenerate={onGenerate}
              onRegenerate={onRegenerate}
            />
          </div>

          {videoUrl && (
            <VideoPreview videoUrl={videoUrl} localVideoPath={localVideoPath} />
          )}

          {consistencyCheck && (
            <ConsistencyCheckCard
              consistencyCheck={consistencyCheck}
              onRegenerate={onRegenerate}
            />
          )}

          {error && <ErrorBlock error={error} />}
        </div>
      </div>

      <GenerationTips isFeatureAnchored={!!isFeatureAnchored} />
    </div>
  );
});
