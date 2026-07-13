import React, {
  createContext,
  useContext,
  useMemo,
  useEffect,
  useRef,
  useState,
} from "react";
import { useParams } from "react-router-dom";
import { useToastHelpers } from "@/shared/presentation/Toast";
import { t } from "@/shared/constants/messages";
import { errorLogger } from "@/shared/error-logger";
import { useAppStore } from "@/shared/app-store";
import { container } from "@/infrastructure/di";
import { useVideoTaskManager } from "@/modules/video";
import { storyService } from "@/modules/story";
import { characterService } from "@/modules/character";
import { sceneService } from "@/modules/scene";
import type { VideoModelFormat } from "@/domain/types";
import {
  useStoryState,
  useAssetLoader,
  useUploadHandlers,
  useStoryPlanner,
  useKeyframeGenerator,
  useFramePairGenerator,
  useVideoGenerator,
  useBatchGenerator,
  useStorySaver,
} from "@/modules/story";
import { useStoryActions } from "./use-story-actions";
import { useStoryPersistence } from "./use-story-persistence";
import { useStoryVideo } from "./use-story-video";
import type { StoryContextValue } from "./story-context-types";

const StoryContext = createContext<StoryContextValue | null>(null);

function useStoryContext(): StoryContextValue {
  const { success, error: showError, warning: showWarning } = useToastHelpers();

  const showErrorRef = useRef(showError);
  useEffect(() => { showErrorRef.current = showError; }, [showError]);

  const storyState = useStoryState();
  const assetLoaderServices = useMemo(
    () => ({
      getAllCharacters: () => characterService.getAll(),
      getAllScenes: () => sceneService.getAll(),
      getStoryboardAssets: async () => {
        return container.storyboardStorage.getStoryboardAssets();
      },
    }),
    [],
  );
  const assetLoader = useAssetLoader(assetLoaderServices);

  const uploadHandlers = useUploadHandlers(
    storyState.setBeats,
    success,
    showWarning,
    storyState.selectedVideoModel?.format as VideoModelFormat | undefined,
    showError,
  );

  const videoTaskManager = useVideoTaskManager();

  // Derive activeVideoTaskCount without depending on the full tasks array
  const activeVideoTaskCount = useMemo(
    () => videoTaskManager.activeTasks.length,
    [videoTaskManager.activeTasks],
  );

  const planner = useStoryPlanner({
    currentStory: storyState.currentStory,
    beatsRef: storyState.beatsRef,
    charactersRef: assetLoader.charactersRef,
    scenesRef: assetLoader.scenesRef,
    setBeats: storyState.setBeats,
    generationEnhanced: storyState.generationEnhanced,
    activeVideoTaskCount,
    success,
    showError,
  });

  const keyframeGenerator = useKeyframeGenerator({
    beatsRef: storyState.beatsRef,
    charactersRef: assetLoader.charactersRef,
    scenesRef: assetLoader.scenesRef,
    selectedImageModel: storyState.selectedImageModel,
    setBeats: storyState.setBeats,
    success,
    showError,
  });

  const framePairGenerator = useFramePairGenerator({
    beatsRef: storyState.beatsRef,
    charactersRef: assetLoader.charactersRef,
    scenesRef: assetLoader.scenesRef,
    selectedImageModel: storyState.selectedImageModel,
    setBeats: storyState.setBeats,
    success,
    showError,
  });

  const videoGenerator = useVideoGenerator({
    beatsRef: storyState.beatsRef,
    charactersRef: assetLoader.charactersRef,
    scenesRef: assetLoader.scenesRef,
    currentStory: storyState.currentStory,
    selectedVideoModel: storyState.selectedVideoModel,
    createTask: videoTaskManager.createTask,
    success,
    showError,
    showWarning,
  });

  const batchGenerator = useBatchGenerator({
    beatsRef: storyState.beatsRef,
    setBeats: storyState.setBeats,
    generateKeyframe: keyframeGenerator.generateKeyframe,
    generateFramePair: framePairGenerator.generateFramePair,
    generateVideoNew: videoGenerator.generateVideoNew,
    success,
    showError,
    showWarning,
  });

  const storySaver = useStorySaver({
    stories: storyState.stories,
    setStories: storyState.setStories,
    currentStory: storyState.currentStory,
    setCurrentStory: storyState.setCurrentStory,
    beats: storyState.beats,
    setBeats: storyState.setBeats,
    markClean: storyState.markClean,
    markDirty: storyState.markDirty,
  });

  const { deleteBeatWithCleanup, switchToStory } = useStoryActions({
    storyState,
    showError,
  });

  const { updateRecommendedTemplates } = storySaver;

  useEffect(() => {
    updateRecommendedTemplates(
      storyState.currentStory.genre || "drama",
      storyState.currentStory.tone || "neutral",
    );
  }, [
    storyState.currentStory.genre,
    storyState.currentStory.tone,
    updateRecommendedTemplates,
  ]);

  const currentStoryId = storyState.currentStory?.id;

  const { allCompletedTaskUrls, completedTaskUrls, generatingBeats } =
    useStoryVideo({
      tasks: videoTaskManager.tasks,
      currentStoryId,
      generatingKeyframe: keyframeGenerator.generatingKeyframe,
      generatingFramePair: framePairGenerator.generatingFramePair,
      generatingVideo: videoGenerator.generatingVideo,
    });

  const { isVideoUrlPersisting } = useStoryPersistence({
    beatsRef: storyState.beatsRef,
    setBeats: storyState.setBeats,
    setStories: storyState.setStories,
    currentStory: storyState.currentStory,
    currentStoryId,
    completedTaskUrls,
    allCompletedTaskUrls,
    showErrorRef,
  });

  return useMemo(
    () => ({
      stories: storyState.stories,
      currentStory: storyState.currentStory,
      beats: storyState.beats,
      beatsRef: storyState.beatsRef,
      hasUnsavedChanges: storyState.hasUnsavedChanges,
      generationEnhanced: storyState.generationEnhanced,
      selectedVideoModel: storyState.selectedVideoModel,
      selectedImageModel: storyState.selectedImageModel,
      setStories: storyState.setStories,
      setCurrentStory: storyState.setCurrentStory,
      setBeats: storyState.setBeats,
      markClean: storyState.markClean,
      markDirty: storyState.markDirty,
      setGenerationEnhanced: storyState.setGenerationEnhanced,
      setSelectedVideoModel: storyState.setSelectedVideoModel,
      setSelectedImageModel: storyState.setSelectedImageModel,
      updateBeat: storyState.updateBeat,
      addBeat: storyState.addBeat,
      deleteBeat: deleteBeatWithCleanup,
      moveBeat: storyState.moveBeat,
      characters: assetLoader.characters,
      scenes: assetLoader.scenes,
      assets: assetLoader.assets,
      assetsLoading: assetLoader.isLoading,
      charactersRef: assetLoader.charactersRef,
      scenesRef: assetLoader.scenesRef,
      handleUploadKeyframe: uploadHandlers.handleUploadKeyframe,
      handleUploadFirstFrame: uploadHandlers.handleUploadFirstFrame,
      handleUploadLastFrame: uploadHandlers.handleUploadLastFrame,
      handleUploadVideo: uploadHandlers.handleUploadVideo,
      planStoryWithAI: planner.planStoryWithAI,
      isPlanningStory: planner.isPlanningStory,
      generateKeyframe: keyframeGenerator.generateKeyframe,
      regenerateKeyframe: keyframeGenerator.regenerateKeyframe,
      generatingKeyframe: keyframeGenerator.generatingKeyframe,
      generateFramePair: framePairGenerator.generateFramePair,
      generatingFramePair: framePairGenerator.generatingFramePair,
      generateVideoNew: videoGenerator.generateVideoNew,
      generatingVideo: videoGenerator.generatingVideo,
      generatingBeats,
      batchGenerateKeyframes: batchGenerator.batchGenerateKeyframes,
      batchGenerateFramePairs: batchGenerator.batchGenerateFramePairs,
      batchGenerateVideos: batchGenerator.batchGenerateVideos,
      handleSave: storySaver.handleSave,
      handleDeleteStory: storySaver.handleDeleteStory,
      performDeleteStory: storySaver.performDeleteStory,
      switchToStory,
      handleRestoreVersion: storySaver.handleRestoreVersion,
      savedTemplates: storySaver.savedTemplates,
      handleSaveTemplate: storySaver.handleSaveTemplate,
      handleDeleteTemplate: storySaver.handleDeleteTemplate,
      applyStoryboardTemplate: storySaver.applyStoryboardTemplate,
      updateRecommendedTemplates: storySaver.updateRecommendedTemplates,
      templateDialogOpen: storySaver.templateDialogOpen,
      setTemplateDialogOpen: storySaver.setTemplateDialogOpen,
      versionDialogOpen: storySaver.versionDialogOpen,
      setVersionDialogOpen: storySaver.setVersionDialogOpen,
      deleteDialogOpen: storySaver.deleteDialogOpen,
      setDeleteDialogOpen: storySaver.setDeleteDialogOpen,
      saveStatus: storySaver.saveStatus,
      saveError: storySaver.saveError,
      isVideoUrlPersisting,
      isStoryLoading: false,
    }),
    [
      storyState, assetLoader, uploadHandlers, planner,
      keyframeGenerator, framePairGenerator, videoGenerator,
      batchGenerator, storySaver, deleteBeatWithCleanup, switchToStory,
      generatingBeats,
      isVideoUrlPersisting,
    ],
  );
}

export function StoryProvider({ children }: { children: React.ReactNode }) {
  const value = useStoryContext();
  const { storyId: urlStoryId } = useParams<{ storyId: string }>();
  const [isStoryLoading, setIsStoryLoading] = useState(true);

  const setStoriesRef = useRef(value.setStories);
  useEffect(() => { setStoriesRef.current = value.setStories; }, [value.setStories]);
  const setCurrentStoryRef = useRef(value.setCurrentStory);
  useEffect(() => { setCurrentStoryRef.current = value.setCurrentStory; }, [value.setCurrentStory]);
  const setBeatsRef = useRef(value.setBeats);
  useEffect(() => { setBeatsRef.current = value.setBeats; }, [value.setBeats]);
  const markCleanRef = useRef(value.markClean);
  useEffect(() => { markCleanRef.current = value.markClean; }, [value.markClean]);
  const { error: showError } = useToastHelpers();
  const showErrorRef = useRef(showError);
  useEffect(() => { showErrorRef.current = showError; }, [showError]);

  useEffect(() => {
    let cancelled = false;
    // 优先级：URL storyId > activeStoryId（持久化记忆）> 第一个故事（fallback）
    const activeStoryId = useAppStore.getState().activeStoryId;
    const targetStoryId = urlStoryId ?? activeStoryId;

    storyService
      .getAll()
      .then(async (result) => {
        if (cancelled || !result.ok) return;
        if (result.value.length === 0) {
          markCleanRef.current("story");
          return;
        }
        setStoriesRef.current(result.value);

        // 尝试加载目标故事（URL 指定或上次激活）
        if (targetStoryId) {
          const targetResult = await storyService.getById(targetStoryId);
          if (!cancelled && targetResult.ok) {
            const story = targetResult.value;
            setCurrentStoryRef.current(story, true);
            setBeatsRef.current(story.beats || [], true);
            useAppStore.getState().setActiveStoryId(story.id);
            markCleanRef.current("story");
            return;
          }
        }

        // Fallback：第一个故事
        const firstStory = result.value[0];
        if (firstStory) {
          setCurrentStoryRef.current(firstStory, true);
          setBeatsRef.current(firstStory.beats || [], true);
          useAppStore.getState().setActiveStoryId(firstStory.id);
        }
        markCleanRef.current("story");
      })
      .catch((err) => {
        if (!cancelled) {
          errorLogger.warn("Failed to load stories from storyService", err);
          showErrorRef.current(t("error.loadFailed"), t("story.loadFailed"));
        }
      })
      .finally(() => {
        if (!cancelled) setIsStoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [urlStoryId]);

  const valueWithLoading = useMemo(
    () => ({ ...value, isStoryLoading }),
    [value, isStoryLoading],
  );

  return (
    <StoryContext.Provider value={valueWithLoading}>{children}</StoryContext.Provider>
  );
}

export function useStory() {
  const context = useContext(StoryContext);
  if (!context) {
    throw new Error("useStory must be used within a StoryProvider");
  }
  return context;
}

export type { StoryContextValue } from "./story-context-types";
