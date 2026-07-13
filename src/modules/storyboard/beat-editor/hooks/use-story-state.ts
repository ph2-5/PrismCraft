import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useDirtyState } from "@/shared/hooks/use-dirty-state";
import { useModelSelection } from "@/modules/prompt";
import type { Story, StoryBeat } from "@/domain/schemas";
import { DEFAULT_STORY } from "@/modules/storyboard";

export function useStoryState() {
  const { markDirty, markClean, isDirty } = useDirtyState();
  const [stories, setStories] = useState<Story[]>([]);
  const [currentStory, setCurrentStoryRaw] = useState<Story>(DEFAULT_STORY);

  const setCurrentStory = useCallback(
    (update: Story | ((prev: Story) => Story), skipDirty = false) => {
      if (!skipDirty) {
        markDirty("story");
      }
      setCurrentStoryRaw(update);
    },
    [markDirty],
  );

  const [beats, setBeatsRaw] = useState<StoryBeat[]>([]);
  const beatsRef = useRef<StoryBeat[]>(beats);
  useEffect(() => {
    beatsRef.current = beats;
  }, [beats]);

  const setBeats = useCallback(
    (update: StoryBeat[] | ((prev: StoryBeat[]) => StoryBeat[]), skipDirty = false) => {
      setBeatsRaw(update);
      if (!skipDirty) markDirty("story");
    },
    [markDirty],
  );

  const effectiveCurrentStory = useMemo(
    () => ({ ...currentStory, beats }),
    [currentStory, beats],
  );

  const [generationEnhanced, setGenerationEnhanced] = useState(true);
  const [selectedVideoModel, setSelectedVideoModel] =
    useModelSelection("story-video-model");
  const [selectedImageModel, setSelectedImageModel] =
    useModelSelection("story-image-model");

  const addBeat = useCallback((type?: StoryBeat["type"]) => {
    setBeatsRaw((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        sequence: prev.length + 1,
        description: "",
        order: prev.length + 1,
        type: type || "scene",
        title: "",
        content: "",
        duration: 5,
        elementIds: [],
        characterIds: [],
        enhancedGeneration: generationEnhanced,
        sceneId: undefined,
        imageGenerationPrompt: undefined,
        firstFramePrompt: undefined,
        lastFramePrompt: undefined,
        transition: undefined,
        imageUrl: undefined,
        videoReferenceUrl: undefined,
        uploadedKeyframe: undefined,
        uploadedVideo: undefined,
        customChainTarget: undefined,
      },
    ]);
    markDirty("story");
  }, [generationEnhanced, markDirty]);

  const updateBeat = useCallback((id: string, updates: Partial<StoryBeat>) => {
    setBeatsRaw((prev) =>
      prev.map((b) => (b.id === id ? { ...b, ...updates } : b)),
    );
    markDirty("story");
  }, [markDirty]);

  /** 内部删除 beat 状态；级联清理（VideoTask、缓存）由 StoryProvider.deleteBeatWithCleanup 负责 */
  const deleteBeat = useCallback((beatId: string) => {
    setBeatsRaw((prev) =>
      prev
        .filter((b) => b.id !== beatId)
        .map((b, i) => ({ ...b, order: i + 1, sequence: i + 1 })),
    );
    markDirty("story");
  }, [markDirty]);

  const moveBeat = useCallback((id: string, direction: "up" | "down") => {
    setBeatsRaw((prev) => {
      const index = prev.findIndex((b) => b.id === id);
      if (
        index === -1 ||
        (direction === "up" && index === 0) ||
        (direction === "down" && index === prev.length - 1)
      ) {
        return prev;
      }
      const newBeats = [...prev];
      const swapIndex = direction === "up" ? index - 1 : index + 1;
      [newBeats[index]!, newBeats[swapIndex]!] = [
        newBeats[swapIndex]!,
        newBeats[index]!,
      ];
      return newBeats.map((b, i) => ({ ...b, order: i + 1, sequence: i + 1 }));
    });
    markDirty("story");
  }, [markDirty]);

  const hasUnsavedChanges = isDirty("story");

  return {
    stories,
    setStories,
    currentStory: effectiveCurrentStory,
    setCurrentStory,
    setCurrentStoryRaw,
    beats,
    setBeats,
    beatsRef,
    hasUnsavedChanges,
    addBeat,
    updateBeat,
    deleteBeat,
    moveBeat,
    markClean,
    markDirty,
    generationEnhanced,
    setGenerationEnhanced,
    selectedVideoModel,
    setSelectedVideoModel,
    selectedImageModel,
    setSelectedImageModel,
  };
}
