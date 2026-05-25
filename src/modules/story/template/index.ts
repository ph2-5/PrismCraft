export { default as TemplateManagerDialog } from "./presentation/TemplateManagerDialog";
export { VersionDialog } from "./presentation/VersionDialog";
export { default as AssetPicker } from "./presentation/AssetPicker";
export type { StoryboardTemplate, StoryboardTemplateBeat } from "./services/storyboard-template";
export {
  createTemplateFromBeats,
  applyTemplateToBeats,
  exportTemplateToFile,
  importTemplateFromFile,
} from "./services/storyboard-template";
export {
  restoreVersion,
  formatVersionTime,
  saveVersion,
  getVersions,
  deleteVersion,
  cleanupVersions,
  getVersionStats,
  compareVersions,
} from "./services/version-control";
export type { StoryVersion } from "@/domain/schemas";
export {
  getRecommendedTemplates,
  applyTemplate,
  type StoryTemplate,
} from "./story-templates";
