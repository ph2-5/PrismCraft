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
  onMoveBeat?: (beatId: string, direction: "up" | "down") => void;
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
  onMoveBeat,
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
    <div className="flex-1 min-w-0 flex flex-col" style={{ borderLeft: "1px solid var(--border)" }}>
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
          onMoveBeat={onMoveBeat}
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
        <div className="h-full flex items-center justify-center" style={{ color: "var(--muted-fg)" }}>
          <div className="text-center">
            <Film size={48} style={{ opacity: 0.2, marginBottom: 12 }} />
            <p style={{ fontSize: 14 }}>{t("beat.selectBeatToView")}</p>
            <p style={{ fontSize: 12, marginTop: 4, opacity: 0.7 }}>{t("beat.orClickAIPlan")}</p>
          </div>
        </div>
      )}
    </div>
  );
}
