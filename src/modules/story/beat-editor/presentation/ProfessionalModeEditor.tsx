import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { errorLogger } from "@/shared/error-logger";
import { isElectron } from "@/shared/utils/platform";
import { container } from "@/infrastructure/di";
import { t } from "@/shared/constants";
import type { Character, Scene, StoryBeat, StoryElement } from "@/domain/schemas";
import type { BatchOptions, BatchResult } from "@/modules/story/generation";
import type { PromptEditorContext } from "@/modules/story/prompt-editor";
import { BeatListView } from "./BeatListView";
import { BeatDetailView } from "./BeatDetailView";

interface MinimalAsset {
  id: string;
  name: string;
  type: string;
  url?: string;
}

interface ProfessionalModeEditorProps {
  currentStory: { genre?: string; tone?: string; id?: string };
  beats: StoryBeat[];
  characters: Character[];
  scenes: Scene[];
  assets: MinimalAsset[];
  onUpdateBeat: (id: string, updates: Partial<StoryBeat>) => void;
  onAddBeat: (type?: StoryBeat["type"]) => void;
  onDeleteBeat: (beatId: string) => void;
  onMoveBeat: (beatId: string, direction: "up" | "down") => void;
  onReorderBeats?: (beats: StoryBeat[]) => void;
  onPlanStoryWithAI: () => Promise<void>;
  onOpenTemplateDialog: () => void;
  onOpenVersionDialog: () => void;
  isGenerating: boolean;
  isPlanningStory: boolean;
  generationEnhanced?: boolean;
  onToggleGenerationEnhanced?: (enabled: boolean) => void;
  onGenerateKeyframe?: (beatId: string) => Promise<StoryBeat | void>;
  onGenerateFramePair?: (beatId: string) => Promise<StoryBeat | void>;
  onGenerateVideoNew?: (beatId: string) => Promise<StoryBeat | void>;
  onRegenerateKeyframe?: (beatId: string) => Promise<void>;
  generatingKeyframe?: Set<string>;
  onUploadKeyframe?: (beatId: string, file: File) => void;
  onUploadFirstFrame?: (beatId: string, file: File) => void;
  onUploadLastFrame?: (beatId: string, file: File) => void;
  onUploadVideo?: (beatId: string, file: File) => void;
  onPromptChange?: (beatId: string, context: PromptEditorContext, prompt: string) => void;
  imageProviderId?: string;
  imageModelId?: string;
  onBatchGenerateKeyframes?: (beatIds?: string[], options?: BatchOptions) => Promise<BatchResult>;
  onBatchGenerateFramePairs?: (beatIds?: string[], options?: BatchOptions) => Promise<BatchResult>;
  onBatchGenerateVideos?: (beatIds?: string[], options?: BatchOptions) => Promise<BatchResult>;
  assetsLoading?: boolean;
}

export function ProfessionalModeEditor({
  currentStory: _currentStory,
  beats,
  characters,
  scenes,
  assets,
  onUpdateBeat,
  onAddBeat,
  onDeleteBeat,
  onMoveBeat,
  onReorderBeats,
  onPlanStoryWithAI,
  onOpenTemplateDialog,
  onOpenVersionDialog,
  isGenerating: _isGenerating,
  isPlanningStory,
  generationEnhanced = true,
  onToggleGenerationEnhanced,
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
  onBatchGenerateKeyframes,
  onBatchGenerateFramePairs,
  onBatchGenerateVideos,
  assetsLoading = false,
}: ProfessionalModeEditorProps) {
  const [editingBeatId, setEditingBeatId] = useState<string | null>(null);
  const [elements, setElements] = useState<StoryElement[]>([]);
  const pendingNewBeatRef = useRef<boolean>(false);

  const editingBeat = useMemo(
    () => beats.find((b) => b.id === editingBeatId) || null,
    [beats, editingBeatId],
  );

  const editingBeatIndex = useMemo(() => {
    if (!editingBeat) return -1;
    return beats.findIndex((b) => b.id === editingBeat.id);
  }, [editingBeat, beats]);

  useEffect(() => {
    if (pendingNewBeatRef.current && beats.length > 0) {
      pendingNewBeatRef.current = false;
      setEditingBeatId(beats[beats.length - 1]!.id);
    }
  }, [beats]);

  useEffect(() => {
    let cancelled = false;
    container.elementManager
      .then((em) => em.getAllElements())
      .then((els) => {
        if (!cancelled) setElements(els);
      })
      .catch((err: unknown) => {
        if (!isElectron()) return;
        errorLogger.warn(
          { code: "ElementLoadFailed", message: t("error.elementLoadFailed"), cause: err },
          { component: "ProfessionalModeEditor", source: "getAllElements" },
        );
      });
    return () => {
      cancelled = true;
    };
  }, [beats, characters, scenes]);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    container.elementManager.then((em) => {
      if (cancelled) return;
      unsubscribe = em.subscribe(() => {
        em.getAllElements()
          .then((els) => {
            if (!cancelled) setElements(els);
          })
          .catch((err: unknown) => {
            errorLogger.warn(
              { code: "ElementSubscribeFailed", message: t("error.elementSubscribeFailed"), cause: err },
              { component: "ProfessionalModeEditor", source: "subscribe" },
            );
          });
      });
    }).catch((err: unknown) => {
      if (!cancelled) {
        errorLogger.warn(
          { code: "ElementManagerLoadFailed", message: t("error.elementLoadFailed"), cause: err },
          { component: "ProfessionalModeEditor", source: "elementManager" },
        );
      }
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const handleAddBeat = useCallback(() => {
    pendingNewBeatRef.current = true;
    onAddBeat("scene");
  }, [onAddBeat]);

  const handleUpdateBeat = useCallback(
    (updatedBeat: StoryBeat) => {
      onUpdateBeat(updatedBeat.id, updatedBeat);
    },
    [onUpdateBeat],
  );

  const handleDeleteBeat = useCallback(() => {
    if (!editingBeat) return;
    onDeleteBeat(editingBeat.id);
    setEditingBeatId(null);
  }, [editingBeat, onDeleteBeat]);

  const handlePrevBeat = useCallback(() => {
    if (editingBeatIndex > 0) {
      setEditingBeatId(beats[editingBeatIndex - 1]!.id);
    }
  }, [editingBeatIndex, beats]);

  const handleNextBeat = useCallback(() => {
    if (editingBeatIndex < beats.length - 1) {
      setEditingBeatId(beats[editingBeatIndex + 1]!.id);
    }
  }, [editingBeatIndex, beats]);

  const handleGenerateKeyframe = useCallback(() => {
    if (editingBeat && onGenerateKeyframe) {
      return onGenerateKeyframe(editingBeat.id);
    }
    return Promise.resolve();
  }, [editingBeat, onGenerateKeyframe]);

  const handleGenerateFramePair = useCallback(() => {
    if (editingBeat && onGenerateFramePair) {
      return onGenerateFramePair(editingBeat.id);
    }
    return Promise.resolve();
  }, [editingBeat, onGenerateFramePair]);

  const handleGenerateVideoNew = useCallback(() => {
    if (editingBeat && onGenerateVideoNew) {
      return onGenerateVideoNew(editingBeat.id);
    }
    return Promise.resolve();
  }, [editingBeat, onGenerateVideoNew]);

  const handleRegenerateKeyframe = useCallback(() => {
    if (editingBeat && onRegenerateKeyframe) {
      return onRegenerateKeyframe(editingBeat.id);
    }
    return Promise.resolve();
  }, [editingBeat, onRegenerateKeyframe]);

  return (
    <div className="flex gap-3 h-full">
      <BeatListView
        beats={beats}
        characters={characters}
        scenes={scenes}
        editingBeatId={editingBeatId}
        onEditClick={(beat) => setEditingBeatId(beat.id)}
        onAddBeat={handleAddBeat}
        onMoveBeat={onMoveBeat}
        onDeleteBeat={onDeleteBeat}
        onReorderBeats={onReorderBeats}
        onPlanStoryWithAI={onPlanStoryWithAI}
        onOpenTemplateDialog={onOpenTemplateDialog}
        onOpenVersionDialog={onOpenVersionDialog}
        isPlanningStory={isPlanningStory}
        generationEnhanced={generationEnhanced}
        onToggleGenerationEnhanced={onToggleGenerationEnhanced}
        onBatchGenerateKeyframes={() => onBatchGenerateKeyframes?.()}
        onBatchGenerateFramePairs={() => onBatchGenerateFramePairs?.()}
        onBatchGenerateVideos={() => onBatchGenerateVideos?.()}
        assetsLoading={assetsLoading}
      />

      <BeatDetailView
        editingBeat={editingBeat}
        editingBeatIndex={editingBeatIndex}
        totalBeats={beats.length}
        characters={characters}
        scenes={scenes}
        elements={elements}
        assets={assets}
        allShots={beats}
        onClose={() => setEditingBeatId(null)}
        onPrevBeat={handlePrevBeat}
        onNextBeat={handleNextBeat}
        onUpdateBeat={handleUpdateBeat}
        onDeleteBeat={handleDeleteBeat}
        onGenerateKeyframe={handleGenerateKeyframe}
        onGenerateFramePair={handleGenerateFramePair}
        onGenerateVideoNew={handleGenerateVideoNew}
        onRegenerateKeyframe={handleRegenerateKeyframe}
        generatingKeyframe={editingBeat ? (generatingKeyframe?.has(editingBeat.id) ?? false) : false}
        onUploadKeyframe={onUploadKeyframe}
        onUploadFirstFrame={onUploadFirstFrame}
        onUploadLastFrame={onUploadLastFrame}
        onUploadVideo={onUploadVideo}
        onPromptChange={onPromptChange && editingBeat ? (context, prompt) => onPromptChange(editingBeat.id, context, prompt) : undefined}
        imageProviderId={imageProviderId}
        imageModelId={imageModelId}
      />
    </div>
  );
}
