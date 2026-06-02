import type { Character, Scene, StoryBeat } from "@/domain/schemas";
import { KeyframePanel } from "@/modules/story/generation";
import type { PromptEditorContext } from "@/modules/story/prompt-editor";

interface GenerateTabContentProps {
  beat: StoryBeat;
  index: number;
  totalBeats: number;
  prevBeat: StoryBeat | null;
  generatingKeyframe?: boolean;
  onGenerateKeyframe?: () => Promise<StoryBeat | void>;
  onGenerateFramePair?: () => Promise<StoryBeat | void>;
  onGenerateVideoNew?: () => Promise<StoryBeat | void>;
  onRegenerateKeyframe?: () => Promise<void>;
  onUploadKeyframe?: (beatId: string, file: File) => void;
  onUploadFirstFrame?: (beatId: string, file: File) => void;
  onUploadLastFrame?: (beatId: string, file: File) => void;
  onUploadVideo?: (beatId: string, file: File) => void;
  onPromptChange?: (context: PromptEditorContext, prompt: string) => void;
  imageProviderId?: string;
  imageModelId?: string;
  characters: Character[];
  scenes: Scene[];
}

export function GenerateTabContent({
  beat,
  index,
  totalBeats,
  prevBeat,
  generatingKeyframe,
  onGenerateKeyframe,
  onGenerateFramePair,
  onGenerateVideoNew,
  onRegenerateKeyframe,
  onUploadKeyframe,
  onUploadFirstFrame,
  onUploadLastFrame,
  onUploadVideo,
  onPromptChange,
  imageProviderId,
  imageModelId,
  characters,
  scenes,
}: GenerateTabContentProps) {
  return (
    <KeyframePanel
      beat={beat}
      index={index}
      totalBeats={totalBeats}
      prevBeat={prevBeat}
      isGenerating={!!generatingKeyframe}
      onGenerateKeyframe={onGenerateKeyframe || (async () => {})}
      onGenerateFramePair={onGenerateFramePair || (async () => {})}
      onGenerateVideo={onGenerateVideoNew || (async () => {})}
      onRegenerateKeyframe={onRegenerateKeyframe || (async () => {})}
      onUploadKeyframe={
        onUploadKeyframe
          ? (file) => onUploadKeyframe(beat.id, file)
          : undefined
      }
      onUploadFirstFrame={
        onUploadFirstFrame
          ? (file) => onUploadFirstFrame(beat.id, file)
          : undefined
      }
      onUploadLastFrame={
        onUploadLastFrame
          ? (file) => onUploadLastFrame(beat.id, file)
          : undefined
      }
      onUploadVideo={
        onUploadVideo
          ? (file) => onUploadVideo(beat.id, file)
          : undefined
      }
      onPromptChange={onPromptChange}
      providerId={imageProviderId}
      modelId={imageModelId}
      characters={characters}
      scenes={scenes}
    />
  );
}
