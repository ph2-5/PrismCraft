"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useDirtyState } from "@/shared/hooks/use-dirty-state";
import { useModelSelection } from "@/modules/prompt";
import type { Story, StoryBeat } from "@/domain/schemas";
import { DEFAULT_STORY } from "@/modules/story";

export function useStoryState() {
  const { markDirty, markClean, isDirty } = useDirtyState();
  const [stories, setStories] = useState<Story[]>([]);
  const [currentStory, setCurrentStoryRaw] = useState<Story>(DEFAULT_STORY);

  const suppressDirtyCountRef = useRef(0);
  const beatsInitializedRef = useRef(false);
  const initialBeatsLoadedRef = useRef(false);

  const incrementSuppressDirtyCount = useCallback(() => {
    suppressDirtyCountRef.current++;
  }, []);

  const setCurrentStory = useCallback(
    (update: Story | ((prev: Story) => Story), skipDirty = false) => {
      if (skipDirty) {
        suppressDirtyCountRef.current++;
      } else {
        markDirty("story");
      }
      setCurrentStoryRaw(update);
    },
    [markDirty],
  );

  const [beats, setBeats] = useState<StoryBeat[]>([]);
  const beatsRef = useRef<StoryBeat[]>(beats);
  useEffect(() => {
    beatsRef.current = beats;
  }, [beats]);

  const effectiveCurrentStory = useMemo(
    () => ({ ...currentStory, beats }),
    [currentStory, beats],
  );

  const [generationEnhanced, setGenerationEnhanced] = useState(true);
  const [selectedVideoModel, setSelectedVideoModel] =
    useModelSelection("story-video-model");
  const [selectedImageModel, setSelectedImageModel] =
    useModelSelection("story-image-model");

  useEffect(() => {
    if (!beatsInitializedRef.current) {
      beatsInitializedRef.current = true;
      if (beats.length > 0) {
        initialBeatsLoadedRef.current = true;
      }
      return;
    }
    if (!initialBeatsLoadedRef.current) {
      initialBeatsLoadedRef.current = true;
      return;
    }
    if (suppressDirtyCountRef.current > 0) {
      suppressDirtyCountRef.current--;
    } else {
      markDirty("story");
    }
  }, [beats, markDirty]);

  const addBeat = useCallback((type?: StoryBeat["type"]) => {
    setBeats((prev) => [
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
        characters: [],
        elementIds: [],
        characterIds: [],
        enhancedGeneration: generationEnhanced,
        character: undefined,
        scene: undefined,
        sceneId: undefined,
        generationPrompt: undefined,
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
  }, [generationEnhanced]);

  const updateBeat = useCallback((id: string, updates: Partial<StoryBeat>) => {
    setBeats((prev) =>
      prev.map((b) => (b.id === id ? { ...b, ...updates } : b)),
    );
  }, []);

  const deleteBeat = useCallback((beatId: string) => {
    setBeats((prev) =>
      prev
        .filter((b) => b.id !== beatId)
        .map((b, i) => ({ ...b, order: i + 1, sequence: i + 1 })),
    );
  }, []);

  const moveBeat = useCallback((id: string, direction: "up" | "down") => {
    setBeats((prev) => {
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
      [newBeats[index], newBeats[swapIndex]] = [
        newBeats[swapIndex],
        newBeats[index],
      ];
      return newBeats.map((b, i) => ({ ...b, order: i + 1, sequence: i + 1 }));
    });
  }, []);

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
    suppressDirtyCountRef,
    incrementSuppressDirtyCount,
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
