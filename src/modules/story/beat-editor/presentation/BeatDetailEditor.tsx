import { useEffect } from "react";
import { Layers, Zap } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import type {
  StoryBeat,
  Character,
  Scene,
  StoryElement,
} from "@/domain/schemas";
import type { PromptEditorContext } from "@/modules/story/prompt-editor";
import { BeatHeader } from "./sections/BeatHeader";
import { BasicInfoSection } from "./sections/BasicInfoSection";
import { ShotInstructionSection } from "./sections/ShotInstructionSection";
import { SettingsTabContent } from "./sections/SettingsTabContent";
import { GenerateTabContent } from "./sections/GenerateTabContent";
import { BeatFooter } from "./sections/BeatFooter";

interface MinimalAsset {
  id: string;
  name: string;
  type: string;
  url?: string;
}

interface BeatDetailEditorProps {
  beat: StoryBeat;
  index: number;
  totalBeats: number;
  characters: Character[];
  scenes: Scene[];
  elements: StoryElement[];
  assets: MinimalAsset[];
  allShots: StoryBeat[];
  onClose: () => void;
  onPrevBeat: () => void;
  onNextBeat: () => void;
  onUpdateBeat: (updatedBeat: StoryBeat) => void;
  onDeleteBeat: () => void;
  onGenerateKeyframe?: () => Promise<StoryBeat | void>;
  onGenerateFramePair?: () => Promise<StoryBeat | void>;
  onGenerateVideoNew?: () => Promise<StoryBeat | void>;
  onRegenerateKeyframe?: () => Promise<void>;
  generatingKeyframe?: boolean;
  onUploadKeyframe?: (beatId: string, file: File) => void;
  onUploadFirstFrame?: (beatId: string, file: File) => void;
  onUploadLastFrame?: (beatId: string, file: File) => void;
  onUploadVideo?: (beatId: string, file: File) => void;
  onPromptChange?: (context: PromptEditorContext, prompt: string) => void;
  imageProviderId?: string;
  imageModelId?: string;
}

export function BeatDetailEditor({
  beat,
  index,
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
}: BeatDetailEditorProps) {
  const handleUpdateField = (
    field: keyof StoryBeat,
    value: StoryBeat[keyof StoryBeat],
  ) => {
    onUpdateBeat({ ...beat, [field]: value } as StoryBeat);
  };

  const selectedScene = scenes.find((scene) => scene.id === beat.scene);
  const prevBeat = index > 0 ? allShots[index - 1] : null;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const target = e.target as HTMLElement;
        if (
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable
        ) {
          (target as HTMLInputElement).blur();
          return;
        }
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="h-full flex flex-col"
      role="region"
      aria-label={`编辑分镜 ${index + 1}`}
    >
      <BeatHeader
        beatTitle={beat.title || ""}
        index={index}
        totalBeats={totalBeats}
        selectedScene={selectedScene}
        onClose={onClose}
        onPrevBeat={onPrevBeat}
        onNextBeat={onNextBeat}
      />

      <div className="flex-1 overflow-hidden p-0">
        <div className="h-full flex flex-col md:flex-row">
          <div className="w-full md:w-1/2 md:border-r border-border overflow-y-auto">
            <div className="p-6 space-y-6">
              <BasicInfoSection
                beat={beat}
                scenes={scenes}
                onUpdateBeat={onUpdateBeat}
                onUpdateField={handleUpdateField}
              />
              <ShotInstructionSection
                beat={beat}
                onUpdateField={handleUpdateField}
              />
            </div>
          </div>

          <div className="w-full md:w-1/2 flex flex-col">
            <Tabs
              defaultValue="settings"
              className="flex-1 flex flex-col min-h-0"
            >
              <TabsList className="mx-4 mt-4 bg-muted/50 shrink-0">
                <TabsTrigger
                  value="settings"
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  <Layers className="w-4 h-4 mr-2" />
                  设置
                </TabsTrigger>
                <TabsTrigger
                  value="generate"
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  <Zap className="w-4 h-4 mr-2" />
                  生成
                </TabsTrigger>
              </TabsList>

              <div className="flex-1 overflow-hidden">
                <TabsContent
                  value="settings"
                  className="h-full overflow-y-auto p-6 m-0"
                >
                  <SettingsTabContent
                    beat={beat}
                    elements={elements}
                    characters={characters}
                    assets={assets}
                    allShots={allShots}
                    onUpdateBeat={onUpdateBeat}
                  />
                </TabsContent>

                <TabsContent
                  value="generate"
                  className="h-full overflow-y-auto p-6 m-0"
                >
                  <GenerateTabContent
                    beat={beat}
                    index={index}
                    totalBeats={totalBeats}
                    prevBeat={prevBeat}
                    generatingKeyframe={generatingKeyframe}
                    onGenerateKeyframe={onGenerateKeyframe}
                    onGenerateFramePair={onGenerateFramePair}
                    onGenerateVideoNew={onGenerateVideoNew}
                    onRegenerateKeyframe={onRegenerateKeyframe}
                    onUploadKeyframe={onUploadKeyframe}
                    onUploadFirstFrame={onUploadFirstFrame}
                    onUploadLastFrame={onUploadLastFrame}
                    onUploadVideo={onUploadVideo}
                    onPromptChange={onPromptChange}
                    imageProviderId={imageProviderId}
                    imageModelId={imageModelId}
                    characters={characters}
                    scenes={scenes}
                  />
                </TabsContent>
              </div>
            </Tabs>

            <BeatFooter
              onDeleteBeat={onDeleteBeat}
              onClose={onClose}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
