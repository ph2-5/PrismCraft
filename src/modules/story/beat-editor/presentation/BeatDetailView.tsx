import { Film } from "lucide-react";
import { t } from "@/shared/constants";
import { BeatDetailEditor } from "./BeatDetailEditor";
import type { Character, Scene, StoryBeat, StoryElement } from "@/domain/schemas";
import type { PromptEditorContext } from "@/modules/story/prompt-editor";

interface MinimalAsset {
  id: string;
  name: string;
  type: string;
  url?: string;
}

interface BeatDetailViewProps {
  editingBeat: StoryBeat | null;
  editingBeatIndex: number;
  totalBeats: number;
  characters: Character[];
  scenes: Scene[];
  elements: StoryElement[];
  assets: MinimalAsset[];
  allShots: StoryBeat[];
  onClose: () => void;
  onPrevBeat: () => void;
  onNextBeat: () => void;
  onUpdateBeat: (beat: StoryBeat) => void;
  onDeleteBeat: () => void;
  onGenerateKeyframe: () => Promise<StoryBeat | void>;
  onGenerateFramePair: () => Promise<StoryBeat | void>;
  onGenerateVideoNew: () => Promise<StoryBeat | void>;
  onRegenerateKeyframe: () => Promise<void>;
  generatingKeyframe: boolean;
  onUploadKeyframe?: (beatId: string, file: File) => void;
  onUploadFirstFrame?: (beatId: string, file: File) => void;
  onUploadLastFrame?: (beatId: string, file: File) => void;
  onUploadVideo?: (beatId: string, file: File) => void;
  onPromptChange?: (context: PromptEditorContext, prompt: string) => void;
  imageProviderId?: string;
  imageModelId?: string;
}

export function BeatDetailView({
  editingBeat,
  editingBeatIndex,
  totalBeats,
  characters,
  scenes,
  elements,
  assets,
  allShots,
  onClose,
  onPrevBeat,
  onNextBeat,
  onUpdateBeat,
  onDeleteBeat,
  onGenerateKeyframe,
  onGenerateFramePair,
  onGenerateVideoNew,
  onRegenerateKeyframe,
  generatingKeyframe,
  onUploadKeyframe,
  onUploadFirstFrame,
  onUploadLastFrame,
  onUploadVideo,
  onPromptChange,
  imageProviderId,
  imageModelId,
}: BeatDetailViewProps) {
  return (
    <div className="flex-1 min-w-0 border border-border rounded-lg bg-card overflow-hidden">
      {editingBeat ? (
        <BeatDetailEditor
          beat={editingBeat}
          index={editingBeatIndex}
          totalBeats={totalBeats}
          characters={characters}
          scenes={scenes}
          elements={elements}
          assets={assets}
          allShots={allShots}
          onClose={onClose}
          onPrevBeat={onPrevBeat}
          onNextBeat={onNextBeat}
          onUpdateBeat={onUpdateBeat}
          onDeleteBeat={onDeleteBeat}
          onGenerateKeyframe={onGenerateKeyframe}
          onGenerateFramePair={onGenerateFramePair}
          onGenerateVideoNew={onGenerateVideoNew}
          onRegenerateKeyframe={onRegenerateKeyframe}
          generatingKeyframe={generatingKeyframe}
          onUploadKeyframe={onUploadKeyframe}
          onUploadFirstFrame={onUploadFirstFrame}
          onUploadLastFrame={onUploadLastFrame}
          onUploadVideo={onUploadVideo}
          onPromptChange={onPromptChange}
          imageProviderId={imageProviderId}
          imageModelId={imageModelId}
        />
      ) : (
        <div className="h-full flex items-center justify-center text-muted-foreground">
          <div className="text-center">
            <Film className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="text-sm">{t("beat.selectBeatToView")}</p>
            <p className="text-xs mt-1">{t("beat.orClickAIPlan")}</p>
          </div>
        </div>
      )}
    </div>
  );
}
