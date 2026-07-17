import { vi } from "vitest";

const methodTemplates: Record<string, string[]> = {
  videoTask: [
    "getVideoTasks", "getVideoTaskById", "getVideoTasksByStory",
    "getVideoTasksByStatus", "getPendingVideoTasks",
    "createVideoTask", "updateVideoTask", "deleteVideoTask",
    "deleteVideoTasksByStatus", "deleteExpiredVideoTasks",
    "clearVideoTasks", "bulkPutVideoTasks",
  ],
  character: [
    "getCharacters", "getCharacterById", "createCharacter",
    "updateCharacter", "deleteCharacter", "incrementCharacterUseCount",
    "getOutfitsForCharacter", "saveOutfitsForCharacter", "updateOutfitImage",
  ],
  scene: [
    "getScenes", "getSceneById", "createScene",
    "updateScene", "deleteScene",
  ],
  story: [
    "getStories", "getStoryById", "getStoryByBeatId",
    "createStory", "updateStory", "deleteStory",
  ],
  version: [
    "getVersions", "createVersion", "deleteVersion",
  ],
  element: [
    "getElements", "getElementById", "createElement",
    "updateElement", "deleteElement",
  ],
  videoCache: [
    "getCachedVideo", "setCachedVideo", "deleteCachedVideo", "clearCache",
  ],
  collection: [
    "getCollections", "createCollection", "updateCollection", "deleteCollection",
  ],
  storyboard: [
    "getStoryboardAssets", "createStoryboardAsset", "deleteStoryboardAsset",
  ],
  importExport: [
    "exportAllData", "importData",
  ],
  template: [
    "getTemplates", "createTemplate", "updateTemplate", "deleteTemplate",
  ],
  autoSave: [
    "getAutoSave", "setAutoSave", "deleteAutoSave",
  ],
  errorLog: [
    "getErrorLogs", "logError", "clearErrorLogs",
  ],
  session: [
    "getSession", "setSession", "deleteSession",
  ],
  novelProject: [
    "getAllProjects", "getProjectById", "createProject",
    "updateProject", "deleteProject", "hardDeleteProject",
    "cleanExpiredProjects",
  ],
  prop: [
    "getAllProps", "getPropById", "getPropsByType", "getPropsByTag",
    "createProp", "updateProp", "deleteProp", "migrateOutfitsToProps",
  ],
  characterVariant: [
    "getVariantsForCharacter", "getAllVariants", "getVariantById",
    "getDefaultVariant", "createVariant", "updateVariant",
    "deleteVariant", "deleteVariantsForCharacter", "setDefaultVariant",
    "updateVariantImage", "migrateOutfitsToVariants",
  ],
};

export function createStoragePortMock(entityType: string): Record<string, ReturnType<typeof vi.fn>> {
  const methods = methodTemplates[entityType] || [];
  const mock: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of methods) {
    mock[method] = vi.fn().mockResolvedValue(null);
  }
  return mock;
}
