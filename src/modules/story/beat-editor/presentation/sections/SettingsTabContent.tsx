import { Layers, Zap, Video, Sparkles } from "lucide-react";
import type { Character, StoryBeat, StoryElement } from "@/domain/schemas";
import { ElementBindingPanel } from "../ElementBindingPanel";
import { ShotReferenceConfig, ReferenceVideoUploader, PromptPreview } from "@/modules/story/generation";
import { t } from "@/shared/constants";

interface MinimalAsset {
  id: string;
  name: string;
  type: string;
  url?: string;
}

interface SettingsTabContentProps {
  beat: StoryBeat;
  elements: StoryElement[];
  characters: Character[];
  assets: MinimalAsset[];
  allShots: StoryBeat[];
  onUpdateBeat: (updatedBeat: StoryBeat) => void;
}

export function SettingsTabContent({
  beat,
  elements,
  characters,
  assets,
  allShots,
  onUpdateBeat,
}: SettingsTabContentProps) {
  return (
    <div className="space-y-6">
      <div className="bg-muted/30 rounded-lg p-4 border border-border">
        <h4 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <Layers className="w-4 h-4 text-primary" />
          {t("beat.elementBinding")}
        </h4>
        <ElementBindingPanel
          beat={beat}
          elements={elements}
          characters={characters}
          assets={assets}
          onUpdateBeat={onUpdateBeat}
        />
      </div>

      <div className="bg-muted/30 rounded-lg p-4 border border-border">
        <h4 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" />
          {t("beat.referenceConfig")}
        </h4>
        <ShotReferenceConfig
          beat={beat}
          allShots={allShots}
          onUpdateBeat={onUpdateBeat}
        />
      </div>

      <div className="bg-muted/30 rounded-lg p-4 border border-border">
        <h4 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <Video className="w-4 h-4 text-primary" />
          {t("beat.referenceVideo")}
        </h4>
        <ReferenceVideoUploader
          referenceVideo={beat.referenceVideo}
          assets={assets}
          onUpdate={(config) =>
            onUpdateBeat({ ...beat, referenceVideo: config })
          }
        />
      </div>

      <div className="bg-muted/30 rounded-lg p-4 border border-border">
        <h4 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          {t("beat.promptPreview")}
        </h4>
        <PromptPreview
          beat={beat}
          elements={elements}
          allShots={allShots}
        />
      </div>
    </div>
  );
}
