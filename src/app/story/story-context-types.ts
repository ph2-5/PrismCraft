import type { SaveStatus } from "@/shared/presentation/SaveStatusIndicator";
import type {
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

export interface StoryContextValue {
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
  setGenerationEnhanced: ReturnType<typeof useStoryState>["setGenerationEnhanced"];
  setSelectedVideoModel: ReturnType<typeof useStoryState>["setSelectedVideoModel"];
  setSelectedImageModel: ReturnType<typeof useStoryState>["setSelectedImageModel"];
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

  handleUploadKeyframe: ReturnType<typeof useUploadHandlers>["handleUploadKeyframe"];
  handleUploadFirstFrame: ReturnType<typeof useUploadHandlers>["handleUploadFirstFrame"];
  handleUploadLastFrame: ReturnType<typeof useUploadHandlers>["handleUploadLastFrame"];
  handleUploadVideo: ReturnType<typeof useUploadHandlers>["handleUploadVideo"];

  planStoryWithAI: ReturnType<typeof useStoryPlanner>["planStoryWithAI"];
  isPlanningStory: ReturnType<typeof useStoryPlanner>["isPlanningStory"];

  generateKeyframe: ReturnType<typeof useKeyframeGenerator>["generateKeyframe"];
  regenerateKeyframe: ReturnType<typeof useKeyframeGenerator>["regenerateKeyframe"];
  generatingKeyframe: ReturnType<typeof useKeyframeGenerator>["generatingKeyframe"];

  generateFramePair: ReturnType<typeof useFramePairGenerator>["generateFramePair"];
  generatingFramePair: ReturnType<typeof useFramePairGenerator>["generatingFramePair"];

  generateVideoNew: ReturnType<typeof useVideoGenerator>["generateVideoNew"];
  generatingVideo: ReturnType<typeof useVideoGenerator>["generatingVideo"];

  generatingBeats: Set<string>;

  batchGenerateKeyframes: ReturnType<typeof useBatchGenerator>["batchGenerateKeyframes"];
  batchGenerateFramePairs: ReturnType<typeof useBatchGenerator>["batchGenerateFramePairs"];
  batchGenerateVideos: ReturnType<typeof useBatchGenerator>["batchGenerateVideos"];

  handleSave: ReturnType<typeof useStorySaver>["handleSave"];
  handleDeleteStory: ReturnType<typeof useStorySaver>["handleDeleteStory"];
  performDeleteStory: ReturnType<typeof useStorySaver>["performDeleteStory"];
  switchToStory: (storyId: string) => Promise<void>;
  handleRestoreVersion: ReturnType<typeof useStorySaver>["handleRestoreVersion"];
  savedTemplates: ReturnType<typeof useStorySaver>["savedTemplates"];
  handleSaveTemplate: ReturnType<typeof useStorySaver>["handleSaveTemplate"];
  handleDeleteTemplate: ReturnType<typeof useStorySaver>["handleDeleteTemplate"];
  applyStoryboardTemplate: ReturnType<typeof useStorySaver>["applyStoryboardTemplate"];
  updateRecommendedTemplates: ReturnType<typeof useStorySaver>["updateRecommendedTemplates"];
  templateDialogOpen: ReturnType<typeof useStorySaver>["templateDialogOpen"];
  setTemplateDialogOpen: ReturnType<typeof useStorySaver>["setTemplateDialogOpen"];
  versionDialogOpen: ReturnType<typeof useStorySaver>["versionDialogOpen"];
  setVersionDialogOpen: ReturnType<typeof useStorySaver>["setVersionDialogOpen"];
  deleteDialogOpen: ReturnType<typeof useStorySaver>["deleteDialogOpen"];
  setDeleteDialogOpen: ReturnType<typeof useStorySaver>["setDeleteDialogOpen"];

  saveStatus: SaveStatus;
  saveError: string;

  isVideoUrlPersisting: boolean;
}
