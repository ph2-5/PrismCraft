export {
  storyService,
  planStory,
  useStoryPlanner,
  useStories,
  useStory,
  useCreateStory,
  useUpdateStory,
  useDeleteStory,
  DEFAULT_STORY,
  genres,
  tones,
  beatTypes,
  useStorySaver,
} from "./planning";
export type { CreationMode } from "./planning";

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
