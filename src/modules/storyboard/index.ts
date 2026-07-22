export {
  storyService,
  planStory,
  useStoryPlanner,
  useStories,
  useStory,
  useStoryCount,
  useSearchStories,
  useCreateStory,
  useUpdateStory,
  useDeleteStory,
  useUpdateStoryStatus,
  useStoriesByStatus,
  useDuplicateStory,
  useStoryNovelSource,
  NOVEL_SOURCE_QUERY_KEY,
  DEFAULT_STORY,
  genres,
  tones,
  beatTypes,
  useStorySaver,
} from "./planning";
export type { CreationMode, NovelSource, StoryWithNovelSource, StorySearchOptions } from "./planning";

export { resolveCharacterRef, resolveCharacterRefs, resolveSceneRef } from "@/domain/services/reference-resolver";

export {
  useAIGeneratorBase,
  useKeyframeGenerator,
  useFramePairGenerator,
  useVideoGenerator,
  useBatchGenerator,
  useUploadHandlers,
  KeyframePanel,
  PromptPreview,
  ShotReferenceConfig,
  ReferenceVideoUploader,
  generateBeatKeyframe,
  generateBeatFramePair,
  generateBeatVideo,
  generateBeatFullWorkflow,
  generateKeyframeChain,
  determineVideoGenerationMode,
  generateFramePrompts,
  batchGenerateFramePrompts,
  generateStyleGuide,
} from "./generation";
export type { AIGeneratorBaseProps, ResolvedRefs } from "./generation";
export type { VideoGenerationMode } from "./generation";
export { BatchStrategy, GenerationLevel } from "./generation";
export type { BatchOptions, BatchResult } from "./generation";

export {
  useStoryState,
  useAssetLoader,
  BeatDetailEditor,
  BeatOverviewCard,
  SortableBeatList,
  ElementBindingPanel,
  ProfessionalModeEditor,
} from "./beat-editor";

export {
  TemplateManagerDialog,
  VersionDialog,
  AssetPicker,
  type StoryboardTemplate,
  type StoryboardTemplateBeat,
  createTemplateFromBeats,
  applyTemplateToBeats,
  exportTemplateToFile,
  importTemplateFromFile,
  getAllSavedTemplates,
  saveSavedTemplate,
  deleteSavedTemplate,
  updateSavedTemplate,
  getSavedTemplateById,
  deleteAllSavedTemplates,
  useSavedTemplates,
  useCreateSavedTemplate,
  useDeleteSavedTemplate,
  SAVED_TEMPLATE_QUERY_KEYS,
  restoreVersion,
  formatVersionTime,
  saveVersion,
  getVersions,
  deleteVersion,
  cleanupVersions,
  getVersionStats,
  type StoryVersion,
  getRecommendedTemplates,
  applyTemplate,
  type StoryTemplate,
} from "./template";

export {
  generatePromptWithAI,
  buildDefaultPrompt,
  usePromptEditor,
  PromptEditor,
  PromptFloatingBall,
} from "./prompt-editor";
export type { PromptEditorContext, PromptEditorRequest, PromptEditorResult } from "./prompt-editor";
