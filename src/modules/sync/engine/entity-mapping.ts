import type { SyncEntityType } from "./types";

export const TABLES_WITHOUT_UPDATED_AT = new Set(["video_tasks", "story_versions"]);

export const HARD_DELETE_TABLES = new Set([
  "story_versions",
  "story_characters",
  "story_scenes",
  "story_beats",
  "story_elements",
  "elements",
  "media_assets",
  "video_tasks",
  "storyboard_assets",
  "collections",
  "video_cache",
]);

const ENTITY_TABLE_MAP: Record<SyncEntityType, string> = {
  character: "characters",
  scene: "scenes",
  story: "stories",
  media_asset: "media_assets",
  storyboard_asset: "storyboard_assets",
  video_task: "video_tasks",
  story_version: "story_versions",
  collection: "collections",
  element: "elements",
  video_template: "video_templates",
  ast_template: "ast_templates",
};

export const TABLE_PK_MAP: Record<string, string> = {
  characters: "id",
  scenes: "id",
  stories: "id",
  media_assets: "id",
  storyboard_assets: "id",
  video_tasks: "task_id",
  collections: "id",
  story_versions: "id",
  elements: "id",
  video_templates: "id",
  ast_templates: "id",
};

export function getTableName(entityType: SyncEntityType): string | null {
  return ENTITY_TABLE_MAP[entityType] || null;
}

export function getPkColumn(tableName: string): string {
  return TABLE_PK_MAP[tableName] || "id";
}
