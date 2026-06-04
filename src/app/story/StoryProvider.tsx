import React, {
  createContext,
  useContext,
  useMemo,
  useEffect,
  useRef,
} from "react";
import { useToastHelpers } from "@/shared/presentation/Toast";
import { t } from "@/shared/constants/messages";
import type { SaveStatus } from "@/shared/presentation/SaveStatusIndicator";
import { errorLogger } from "@/shared/error-logger";
import { container } from "@/infrastructure/di";
import { useVideoTaskManager, useVideoTaskStore } from "@/modules/video";
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
import { useStoryActions } from "./useStoryActions";
import { useStoryPersistence } from "./useStoryPersistence";
import { useStoryVideo } from "./useStoryVideo";

interface StoryContextValue {
  stories: ReturnType<typeof useStoryState>["stories"];
  currentStory: ReturnType<typeof useStoryState>["currentStory"];
  beats: ReturnType<typeof useStoryState>["beats"];
  beatsRef: ReturnType<typeof useStoryState>["beatsRef"];
  hasUnsavedChanges: ReturnType<typeof useStoryState>["hasUnsavedChanges"];
  generationEnhanced: ReturnType<typeof useStoryState>["generationEnhanced"];
  selectedVideoModel: ReturnType<typeof useStoryState>["selectedVideoModel"];
  selectedImageModel: ReturnType<typeof useStoryState>["selectedImageModel"];
  setStories: ReturnType<typeof useStoryState>["setStories"];
  setCurrentStory: ReturnType<typeof useStoryState>["setCurrentStory"];
  setBeats: ReturnType<typeof useStoryState>["setBeats"];
  markClean: ReturnType<typeof useStoryState>["markClean"];
  markDirty: ReturnType<typeof useStoryState>["markDirty"];
  setGenerationEnhanced: ReturnType<
    typeof useStoryState
  >["setGenerationEnhanced"];
  setSelectedVideoModel: ReturnType<
    typeof useStoryState
  >["setSelectedVideoModel"];
  setSelectedImageModel: ReturnType<
    typeof useStoryState
  >["setSelectedImageModel"];
  updateBeat: ReturnType<typeof useStoryState>["updateBeat"];
  addBeat: ReturnType<typeof useStoryState>["addBeat"];
  deleteBeat: ReturnType<typeof useStoryState>["deleteBeat"];
  moveBeat: ReturnType<typeof useStoryState>["moveBeat"];

  characters: ReturnType<typeof useAssetLoader>["characters"];
  scenes: ReturnType<typeof useAssetLoader>["scenes"];
  assets: ReturnType<typeof useAssetLoader>["assets"];
  assetsLoading: ReturnType<typeof useAssetLoader>["isLoading"];
  charactersRef: ReturnType<typeof useAssetLoader>["charactersRef"];
  scenesRef: ReturnType<typeof useAssetLoader>["scenesRef"];

  handleUploadKeyframe: ReturnType<
    typeof useUploadHandlers
  >["handleUploadKeyframe"];
  handleUploadFirstFrame: ReturnType<
    typeof useUploadHandlers
  >["handleUploadFirstFrame"];
  handleUploadLastFrame: ReturnType<
    typeof useUploadHandlers
  >["handleUploadLastFrame"];
  handleUploadVideo: ReturnType<typeof useUploadHandlers>["handleUploadVideo"];

  planStoryWithAI: ReturnType<typeof useStoryPlanner>["planStoryWithAI"];
  isPlanningStory: ReturnType<typeof useStoryPlanner>["isPlanningStory"];

  generateKeyframe: ReturnType<typeof useKeyframeGenerator>["generateKeyframe"];
  regenerateKeyframe: ReturnType<
    typeof useKeyframeGenerator
  >["regenerateKeyframe"];
  generatingKeyframe: ReturnType<
    typeof useKeyframeGenerator
  >["generatingKeyframe"];

  generateFramePair: ReturnType<
    typeof useFramePairGenerator
  >["generateFramePair"];
  generatingFramePair: ReturnType<
    typeof useFramePairGenerator
  >["generatingFramePair"];

  generateVideoNew: ReturnType<typeof useVideoGenerator>["generateVideoNew"];
  generatingVideo: ReturnType<typeof useVideoGenerator>["generatingVideo"];

  generatingBeats: Set<string>;

  batchGenerateKeyframes: ReturnType<
    typeof useBatchGenerator
  >["batchGenerateKeyframes"];
  batchGenerateFramePairs: ReturnType<
    typeof useBatchGenerator
  >["batchGenerateFramePairs"];
  batchGenerateVideos: ReturnType<
    typeof useBatchGenerator
  >["batchGenerateVideos"];

  handleSave: ReturnType<typeof useStorySaver>["handleSave"];
  handleDeleteStory: ReturnType<typeof useStorySaver>["handleDeleteStory"];
  performDeleteStory: ReturnType<typeof useStorySaver>["performDeleteStory"];
  switchToStory: (storyId: string) => Promise<void>;
  handleRestoreVersion: ReturnType<
    typeof useStorySaver
  >["handleRestoreVersion"];
  savedTemplates: ReturnType<typeof useStorySaver>["savedTemplates"];
  handleSaveTemplate: ReturnType<typeof useStorySaver>["handleSaveTemplate"];
  handleDeleteTemplate: ReturnType<
    typeof useStorySaver
  >["handleDeleteTemplate"];
  applyStoryboardTemplate: ReturnType<
    typeof useStorySaver
  >["applyStoryboardTemplate"];
  updateRecommendedTemplates: ReturnType<
    typeof useStorySaver
  >["updateRecommendedTemplates"];
  templateDialogOpen: ReturnType<typeof useStorySaver>["templateDialogOpen"];
  setTemplateDialogOpen: ReturnType<
    typeof useStorySaver
  >["setTemplateDialogOpen"];
  versionDialogOpen: ReturnType<typeof useStorySaver>["versionDialogOpen"];
  setVersionDialogOpen: ReturnType<
    typeof useStorySaver
  >["setVersionDialogOpen"];
  deleteDialogOpen: ReturnType<typeof useStorySaver>["deleteDialogOpen"];
  setDeleteDialogOpen: ReturnType<typeof useStorySaver>["setDeleteDialogOpen"];

  tasks: ReturnType<typeof useVideoTaskManager>["tasks"];
  addTask: ReturnType<typeof useVideoTaskManager>["addTask"];
  createTask: ReturnType<typeof useVideoTaskManager>["createTask"];
  pollTask: ReturnType<typeof useVideoTaskManager>["pollTask"];
  removeTask: ReturnType<typeof useVideoTaskManager>["removeTask"];
  removeTasks: ReturnType<typeof useVideoTaskManager>["removeTasks"];

  success: (title: string, description?: string) => void;
  showError: (title: string, description?: string) => void;

  saveStatus: SaveStatus;
  saveError: string;

  isVideoUrlPersisting: boolean;
}

const StoryContext = createContext<StoryContextValue | null>(null);

function useStoryContext(): StoryContextValue {
  const { success, error: showError, warning: showWarning } = useToastHelpers();

  const showErrorRef = useRef(showError);
  useEffect(() => { showErrorRef.current = showError; }, [showError]);

  const storyState = useStoryState();
  const assetLoader = useAssetLoader({
    getAllCharacters: () => characterService.getAll(),
    getAllScenes: () => sceneService.getAll(),
    getStoryboardAssets: async () => {
      return container.storyboardStorage.getStoryboardAssets();
    },
  });

  const uploadHandlers = useUploadHandlers(
    storyState.setBeats,
    success,
    showWarning,
    storyState.selectedVideoModel?.format as VideoModelFormat | undefined,
    showError,
  );

  const videoTaskManager = useVideoTaskManager();

  const planner = useStoryPlanner({
    currentStory: storyState.currentStory,
    beatsRef: storyState.beatsRef,
    charactersRef: assetLoader.charactersRef,
    scenesRef: assetLoader.scenesRef,
    setBeats: storyState.setBeats,
    generationEnhanced: storyState.generationEnhanced,
    activeVideoTaskCount: videoTaskManager.tasks.filter(
      (t) => t.status === "pending" || t.status === "generating",
    ).length,
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
    onBeforeDeleteStory: async (storyId) => {
      await useVideoTaskStore.getState().removeTasksByStoryId(storyId);
    },
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
      tasks: videoTaskManager.tasks,
      addTask: videoTaskManager.addTask,
      createTask: videoTaskManager.createTask,
      pollTask: videoTaskManager.pollTask,
      removeTask: videoTaskManager.removeTask,
      removeTasks: videoTaskManager.removeTasks,
      saveStatus: storySaver.saveStatus,
      saveError: storySaver.saveError,
      isVideoUrlPersisting,
      success,
      showError,
    }),
    [
      storyState.stories,
      storyState.currentStory,
      storyState.beats,
      storyState.beatsRef,
      storyState.hasUnsavedChanges,
      storyState.generationEnhanced,
      storyState.selectedVideoModel,
      storyState.selectedImageModel,
      storyState.setStories,
      storyState.setCurrentStory,
      storyState.setBeats,
      storyState.markClean,
      storyState.markDirty,
      storyState.setGenerationEnhanced,
      storyState.setSelectedVideoModel,
      storyState.setSelectedImageModel,
      storyState.updateBeat,
      storyState.addBeat,
      deleteBeatWithCleanup,
      storyState.moveBeat,
      assetLoader.characters,
      assetLoader.scenes,
      assetLoader.assets,
      assetLoader.isLoading,
      assetLoader.charactersRef,
      assetLoader.scenesRef,
      uploadHandlers.handleUploadKeyframe,
      uploadHandlers.handleUploadFirstFrame,
      uploadHandlers.handleUploadLastFrame,
      uploadHandlers.handleUploadVideo,
      planner.planStoryWithAI,
      planner.isPlanningStory,
      keyframeGenerator.generateKeyframe,
      keyframeGenerator.regenerateKeyframe,
      keyframeGenerator.generatingKeyframe,
      framePairGenerator.generateFramePair,
      framePairGenerator.generatingFramePair,
      videoGenerator.generateVideoNew,
      videoGenerator.generatingVideo,
      generatingBeats,
      batchGenerator.batchGenerateKeyframes,
      batchGenerator.batchGenerateFramePairs,
      batchGenerator.batchGenerateVideos,
      storySaver.handleSave,
      storySaver.handleDeleteStory,
      storySaver.performDeleteStory,
      switchToStory,
      storySaver.handleRestoreVersion,
      storySaver.savedTemplates,
      storySaver.handleSaveTemplate,
      storySaver.handleDeleteTemplate,
      storySaver.applyStoryboardTemplate,
      storySaver.updateRecommendedTemplates,
      storySaver.templateDialogOpen,
      storySaver.setTemplateDialogOpen,
      storySaver.versionDialogOpen,
      storySaver.setVersionDialogOpen,
      storySaver.deleteDialogOpen,
      storySaver.setDeleteDialogOpen,
      storySaver.saveStatus,
      storySaver.saveError,
      videoTaskManager.tasks,
      videoTaskManager.addTask,
      videoTaskManager.createTask,
      videoTaskManager.pollTask,
      videoTaskManager.removeTask,
      videoTaskManager.removeTasks,
      isVideoUrlPersisting,
      success,
      showError,
    ],
  );
}

export function StoryProvider({ children }: { children: React.ReactNode }) {
  const value = useStoryContext();

  const setStoriesRef = useRef(value.setStories);
  useEffect(() => { setStoriesRef.current = value.setStories; }, [value.setStories]);
  const setCurrentStoryRef = useRef(value.setCurrentStory);
  useEffect(() => { setCurrentStoryRef.current = value.setCurrentStory; }, [value.setCurrentStory]);
  const setBeatsRef = useRef(value.setBeats);
  useEffect(() => { setBeatsRef.current = value.setBeats; }, [value.setBeats]);
  const markCleanRef = useRef(value.markClean);
  useEffect(() => { markCleanRef.current = value.markClean; }, [value.markClean]);
  const showErrorRef2 = useRef(value.showError);
  useEffect(() => { showErrorRef2.current = value.showError; }, [value.showError]);

  useEffect(() => {
    let cancelled = false;
    storyService
      .getAll()
      .then((result) => {
        if (!cancelled && result.ok && result.value.length > 0) {
          setStoriesRef.current(result.value);
          const firstStory = result.value[0];
          setCurrentStoryRef.current(firstStory, true);
          setBeatsRef.current(firstStory.beats || [], true);
          markCleanRef.current("story");
        }
      })
      .catch((err) => {
        if (!cancelled) {
          errorLogger.warn("Failed to load stories from storyService", err);
          showErrorRef2.current(t("error.loadFailed"), t("story.loadFailed"));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <StoryContext.Provider value={value}>{children}</StoryContext.Provider>
  );
}

export function useStory() {
  const context = useContext(StoryContext);
  if (!context) {
    throw new Error("useStory must be used within a StoryProvider");
  }
  return context;
}
