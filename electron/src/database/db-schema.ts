// AI: All database table/column definitions are here. Check before adding new tables or columns.
// AI: Use generateTableSQL/generateJunctionTableSQL for new tables, and add migrations in migrations.ts.
import fs from "fs";
import path from "path";
import os from "os";
import { app } from "electron";
import { getLogger } from "../logging/logger";
import { generateTableSQL, generateJunctionTableSQL, SCHEMA_FEATURES } from "./schema-builder";
import type { TableDef, ColumnDef } from "./schema-builder";
export { CURRENT_SCHEMA_VERSION, MIGRATIONS, runMigrations } from "./migrations";

const logger = getLogger("db-schema");

export function getUserDataPath(): string {
  try {
    if (app && app.getPath) {
      const p = app.getPath("userData");
      logger.info("[DB-Schema] userData path from Electron:", { path: p });
      return p;
    }
  } catch (e) {
    logger.warn("[DB-Schema] Failed to get Electron userData path:", { error: e instanceof Error ? e.message : String(e) });
  }
  const fallback = path.join(os.homedir(), ".ai-animation-studio");
  logger.info("[DB-Schema] Using fallback userData path:", { path: fallback });
  return fallback;
}

export interface DbPaths {
  DB_DIR: string;
  DB_PATH: string;
  DB_TYPE_FILE: string;
}

export function getDbPaths(): DbPaths {
  const dbDir = path.join(getUserDataPath(), "database");
  return {
    DB_DIR: dbDir,
    DB_PATH: path.join(dbDir, "studio.db"),
    DB_TYPE_FILE: path.join(dbDir, ".db-type"),
  };
}

export function ensureDbDir(): void {
  const { DB_DIR } = getDbPaths();
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
    try {
      fs.chmodSync(DB_DIR, 0o700);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      logger.warn("[DB] Failed to set directory permissions:", { error: message });
    }
  }
}



const USERS_SQL = `
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT DEFAULT '本地用户',
    role TEXT DEFAULT 'owner' CHECK(role IN ('owner','admin','member','viewer')),
    preferences TEXT DEFAULT '{}',
    created_at INTEGER DEFAULT (strftime('%s','now')),
    updated_at INTEGER DEFAULT (strftime('%s','now'))
);
INSERT OR IGNORE INTO users (id, username) VALUES (1, '本地用户');
`;

const FEATURE_TABLES: TableDef[] = [
  {
    name: "video_tasks",
    featureGroup: "video",
    columns: {
      status: { type: "TEXT", default: "'pending'", check: "IN ('pending', 'generating', 'completed', 'failed', 'cancelled', 'retrying', 'timeout', 'paused')" },
      progress: { type: "INTEGER", default: "0" },
      priority: { type: "INTEGER", default: "0" },
      video_url: { type: "TEXT" },
      local_video_path: { type: "TEXT" },
      story_id: { type: "TEXT", ref: "stories(id)" },
      beat_id: { type: "TEXT" },
      message: { type: "TEXT" },
      config: { type: "TEXT", default: "'{}'" },
      provider: { type: "TEXT", default: "'{}'" },
      media_refs: { type: "TEXT", default: "'{}'" },
      tracking: { type: "TEXT", default: "'{}'" },
    },
  },
  {
    name: "story_beats",
    featureGroup: "core",
    columns: {
      story_id: { type: "TEXT", notNull: true, ref: "stories(id)" },
      sequence: { type: "INTEGER", notNull: true },
      order_num: { type: "INTEGER" },
      title: { type: "TEXT" },
      content: { type: "TEXT" },
      description: { type: "TEXT" },
      duration: { type: "INTEGER" },
      type: { type: "TEXT" },
      character_ids_json: { type: "TEXT" },
      scene_id: { type: "TEXT" },
      camera: { type: "TEXT", default: "'{}'" },
      generation: { type: "TEXT", default: "'{}'" },
      meta: { type: "TEXT", default: "'{}'" },
      local_video_path: { type: "TEXT" },
      local_keyframe_path: { type: "TEXT" },
      local_first_frame_path: { type: "TEXT" },
      local_last_frame_path: { type: "TEXT" },
    },
  },
  {
    name: "characters",
    featureGroup: "core",
    columns: {
      name: { type: "TEXT", notNull: true },
      description: { type: "TEXT" },
      ref_image_path: { type: "TEXT" },
      gender: { type: "TEXT", check: "IN ('male', 'female', 'other', 'unknown')" },
      age: { type: "INTEGER", check: "BETWEEN 0 AND 200" },
      style: { type: "TEXT" },
      source: { type: "TEXT", check: "IN ('ai-generated', 'uploaded', 'imported')" },
      use_count: { type: "INTEGER", default: "0" },
      last_used_at: { type: "INTEGER" },
      appearance: { type: "TEXT", default: "'{}'" },
      generation: { type: "TEXT", default: "'{}'" },
      config: { type: "TEXT", default: "'{}'" },
      meta: { type: "TEXT", default: "'{}'" },
    },
  },
  {
    name: "scenes",
    featureGroup: "core",
    columns: {
      name: { type: "TEXT", notNull: true },
      description: { type: "TEXT" },
      ref_image_path: { type: "TEXT" },
      type: { type: "TEXT" },
      source: { type: "TEXT", check: "IN ('ai-generated', 'uploaded', 'imported')" },
      use_count: { type: "INTEGER", default: "0" },
      last_used_at: { type: "INTEGER" },
      appearance: { type: "TEXT", default: "'{}'" },
      atmosphere: { type: "TEXT", default: "'{}'" },
      generation: { type: "TEXT", default: "'{}'" },
      config: { type: "TEXT", default: "'{}'" },
    },
  },
  {
    name: "stories",
    featureGroup: "core",
    columns: {
      title: { type: "TEXT", notNull: true },
      description: { type: "TEXT" },
      genre: { type: "TEXT" },
      tone: { type: "TEXT" },
      target_duration: { type: "INTEGER" },
      keyframe_chain_valid: { type: "INTEGER", default: "0" },
      style_guide_json: { type: "TEXT" },
      element_ids_json: { type: "TEXT" },
      element_bindings_json: { type: "TEXT" },
      status: {
        type: "TEXT",
        default: "'in_progress'",
        check: "IN ('draft', 'in_progress', 'completed', 'archived', 'abandoned')",
      },
    },
  },
  {
    name: "story_versions",
    featureGroup: "core",
    columns: {
      story_id: { type: "TEXT", notNull: true, ref: "stories(id)" },
      timestamp: { type: "INTEGER" },
      beats_json: { type: "TEXT" },
      title: { type: "TEXT" },
      description: { type: "TEXT" },
      genre: { type: "TEXT" },
      tone: { type: "TEXT" },
      target_duration: { type: "INTEGER" },
      characters_json: { type: "TEXT" },
      scenes_json: { type: "TEXT" },
      change_summary: { type: "TEXT" },
      auto_saved: { type: "INTEGER", default: "0" },
    },
  },
  {
    name: "story_templates",
    featureGroup: "core",
    columns: {
      name: { type: "TEXT", notNull: true },
      description: { type: "TEXT" },
      beats_json: { type: "TEXT", notNull: true },
      category: { type: "TEXT" },
      genre: { type: "TEXT" },
      tone: { type: "TEXT" },
      tags_json: { type: "TEXT" },
      author: { type: "TEXT" },
      total_duration: { type: "INTEGER" },
    },
  },
  {
    name: "character_outfits",
    featureGroup: "core",
    columns: {
      character_id: { type: "TEXT", notNull: true, ref: "characters(id)" },
      name: { type: "TEXT", notNull: true, default: "''" },
      description: { type: "TEXT", default: "''" },
      clothing: { type: "TEXT", default: "''" },
      accessories_json: { type: "TEXT", default: "'[]'" },
      image_url: { type: "TEXT" },
      local_image_path: { type: "TEXT" },
      thumbnail_path: { type: "TEXT" },
      is_default: { type: "INTEGER", default: "0" },
    },
  },
  {
    name: "elements",
    featureGroup: "core",
    columns: {
      type: { type: "TEXT", notNull: true, check: "IN ('character', 'prop', 'effect')" },
      name: { type: "TEXT", notNull: true },
      description: { type: "TEXT" },
      character_config_json: { type: "TEXT" },
      scene_config_json: { type: "TEXT" },
      feature_anchor_json: { type: "TEXT" },
      reference_image_quality_json: { type: "TEXT" },
      bindings_json: { type: "TEXT" },
    },
  },
  {
    name: "media_assets",
    featureGroup: "assets",
    columns: {
      name: { type: "TEXT", notNull: true },
      description: { type: "TEXT" },
      type: { type: "TEXT", check: "IN ('image', 'video')" },
      url: { type: "TEXT" },
      thumbnail_url: { type: "TEXT" },
      tags: { type: "TEXT" },
      file_size: { type: "INTEGER" },
      mime_type: { type: "TEXT" },
      width: { type: "INTEGER" },
      height: { type: "INTEGER" },
      duration: { type: "INTEGER" },
      bound_to_type: { type: "TEXT" },
      bound_to_id: { type: "TEXT" },
      bound_to_name: { type: "TEXT" },
    },
  },
  {
    name: "video_templates",
    featureGroup: "video",
    columns: {
      name: { type: "TEXT", notNull: true },
      description: { type: "TEXT" },
      category: { type: "TEXT" },
      total_duration: { type: "INTEGER" },
      shots_json: { type: "TEXT" },
      tags: { type: "TEXT" },
      thumbnail_url: { type: "TEXT" },
    },
  },
  {
    name: "storyboard_assets",
    featureGroup: "core",
    columns: {
      script: { type: "TEXT" },
      duration: { type: "INTEGER", default: "0" },
      shot_type: { type: "TEXT", check: "IN ('wide', 'medium', 'close_up', 'extreme_close_up', 'over_shoulder', 'aerial', 'tracking', 'static')" },
      preview_path: { type: "TEXT" },
      character_ids: { type: "TEXT" },
      scene_id: { type: "TEXT" },
      project_id: { type: "TEXT" },
    },
  },
  {
    name: "collections",
    featureGroup: "assets",
    columns: {
      name: { type: "TEXT", notNull: true },
    },
  },
  {
    name: "ast_templates",
    featureGroup: "templates",
    columns: {
      name: { type: "TEXT", notNull: true },
      description: { type: "TEXT" },
      category: { type: "TEXT" },
      genre: { type: "TEXT" },
      tone: { type: "TEXT" },
      tags: { type: "TEXT" },
      author: { type: "TEXT" },
      total_duration: { type: "INTEGER" },
      beats_count: { type: "INTEGER", default: "0" },
      characters_count: { type: "INTEGER", default: "0" },
      scenes_count: { type: "INTEGER", default: "0" },
      ast_file_path: { type: "TEXT" },
      ast_file_size: { type: "INTEGER" },
      is_public: { type: "INTEGER", default: "0" },
      usage_count: { type: "INTEGER", default: "0" },
      rating: { type: "REAL", default: "0" },
      version: { type: "INTEGER", default: "1" },
      parent_template_id: { type: "TEXT" },
    },
  },
  {
    name: "generation_tasks",
    featureGroup: "video",
    columns: {
      task_type: { type: "TEXT", check: "IN ('keyframe', 'first_frame', 'last_frame', 'character_image', 'scene_image')" },
      story_id: { type: "TEXT" },
      beat_id: { type: "TEXT" },
      asset_id: { type: "TEXT" },
      status: { type: "TEXT", default: "'pending'", check: "IN ('pending', 'generating', 'completed', 'failed', 'cancelled', 'retrying', 'timeout')" },
      input_params: { type: "TEXT" },
      output_path: { type: "TEXT" },
      output_url: { type: "TEXT" },
      error_message: { type: "TEXT" },
      retry_count: { type: "INTEGER", default: "0" },
      priority: { type: "TEXT", default: "'normal'" },
      next_retry_at: { type: "INTEGER" },
      last_attempt_at: { type: "INTEGER" },
      provider_id: { type: "TEXT" },
      model_id: { type: "TEXT" },
      estimated_cost: { type: "REAL" },
      completed_at: { type: "INTEGER" },
    },
  },
  {
    name: "sub_shots",
    featureGroup: "core",
    columns: {
      story_beat_id: { type: "TEXT", notNull: true, ref: "story_beats(id)" },
      sequence: { type: "INTEGER", notNull: true },
      shot_type: { type: "TEXT" },
      camera_movement: { type: "TEXT" },
      camera_angle: { type: "TEXT" },
      duration: { type: "REAL", default: "5" },
      description: { type: "TEXT" },
      prompt: { type: "TEXT" },
      image_url: { type: "TEXT" },
      video_url: { type: "TEXT" },
      transition: { type: "TEXT" },
    },
  },
  {
    name: "generation_assets",
    featureGroup: "assets",
    columns: {
      type: { type: "TEXT", notNull: true, check: "IN ('keyframe', 'first_frame', 'last_frame', 'video', 'character_image', 'scene_image', 'variant_image', 'compositor_result', 'uploaded', 'preview_3d_snapshot', 'blockout_animatic', 'blockout_glb', 'blockout_seedance_input', 'blockout_fallback_frames', 'partial_edit_video')" },
      source_type: { type: "TEXT", notNull: true, check: "IN ('ai_generated', 'user_uploaded', 'composited')" },
      url: { type: "TEXT", notNull: true },
      local_path: { type: "TEXT" },
      thumbnail_path: { type: "TEXT" },
      prompt: { type: "TEXT" },
      model_id: { type: "TEXT" },
      provider_id: { type: "TEXT" },
      metadata: { type: "TEXT", default: "'{}'" },
      story_beat_id: { type: "TEXT" },
      sub_shot_id: { type: "TEXT" },
      character_id: { type: "TEXT" },
      character_variant_id: { type: "TEXT" },
      scene_id: { type: "TEXT" },
      scene_variant_id: { type: "TEXT" },
      project_id: { type: "TEXT" },
      // Task 2A.22: 局部重绘 Asset 关联的原视频 Asset ID
      source_asset_id: { type: "TEXT" },
    },
  },
  // Task 2A.7: 小说导入项目持久化（保存 PipelineState 支持跨会话恢复）
  {
    name: "novel_projects",
    featureGroup: "core",
    columns: {
      title: { type: "TEXT" },
      raw_text: { type: "TEXT" },
      pipeline_state_json: { type: "TEXT", default: "'{}'" },
      story_id: { type: "TEXT", ref: "stories(id)", onDelete: "SET NULL" },
    },
  },
  // Task 2A.8: 道具库（服装/武器/配饰/道具/其他），独立于 elements 表
  // 现有 character_outfits 数据可迁移到 props 表（type='clothing'）
  {
    name: "props",
    featureGroup: "core",
    columns: {
      name: { type: "TEXT", notNull: true },
      type: { type: "TEXT", notNull: true, check: "IN ('clothing', 'weapon', 'accessory', 'prop', 'other')", default: "'prop'" },
      description: { type: "TEXT" },
      reference_image: { type: "TEXT" },
      local_image_path: { type: "TEXT" },
      thumbnail_path: { type: "TEXT" },
      tags_json: { type: "TEXT", default: "'[]'" },
      source_character_id: { type: "TEXT", ref: "characters(id)", onDelete: "SET NULL" },
      source_outfit_id: { type: "TEXT" },
      metadata_json: { type: "TEXT", default: "'{}'" },
    },
  },
  // Task 2A.10: 角色变体系统（替代 character_outfits 的功能）
  // 一个角色可有多个变体（少年/老年/战损等），每个变体有独立的 prompt_fragment + 8 维参数 + 参考图
  // 迁移自 character_outfits（通过 source_outfit_id 追溯），新变体由 Compositor 生成
  {
    name: "character_variants",
    featureGroup: "core",
    columns: {
      character_id: { type: "TEXT", notNull: true, ref: "characters(id)", onDelete: "CASCADE" },
      name: { type: "TEXT", notNull: true, default: "''" },
      description: { type: "TEXT", default: "''" },
      prompt_fragment: { type: "TEXT", default: "''" },
      reference_image_path: { type: "TEXT" },
      image_url: { type: "TEXT" },
      local_image_path: { type: "TEXT" },
      thumbnail_path: { type: "TEXT" },
      time_of_day: { type: "TEXT" },
      weather: { type: "TEXT" },
      lighting: { type: "TEXT" },
      mood: { type: "TEXT" },
      crowd_level: { type: "TEXT" },
      camera_angle: { type: "TEXT" },
      season: { type: "TEXT" },
      color_palette: { type: "TEXT" },
      source_outfit_id: { type: "TEXT" },
      source_compositor_asset_id: { type: "TEXT" },
      is_default: { type: "INTEGER", default: "0" },
      is_canonical: { type: "INTEGER", default: "0" },
      metadata_json: { type: "TEXT", default: "'{}'" },
    },
  },
];

const JUNCTION_TABLES: { name: string; columns: Record<string, ColumnDef>; primaryKey: string[]; uniqueConstraints?: string[][] }[] = [
  {
    name: "story_characters",
    columns: {
      story_id: { type: "TEXT", notNull: true, ref: "stories(id)" },
      character_id: { type: "TEXT", notNull: true, ref: "characters(id)" },
      display_order: { type: "INTEGER", default: "0" },
    },
    primaryKey: ["story_id", "character_id"],
  },
  {
    name: "story_scenes",
    columns: {
      story_id: { type: "TEXT", notNull: true, ref: "stories(id)" },
      scene_id: { type: "TEXT", notNull: true, ref: "scenes(id)" },
      display_order: { type: "INTEGER", default: "0" },
    },
    primaryKey: ["story_id", "scene_id"],
  },
  {
    name: "story_elements",
    columns: {
      story_id: { type: "TEXT", notNull: true, ref: "stories(id)" },
      element_id: { type: "TEXT", notNull: true, ref: "elements(id)" },
      binding_config: { type: "TEXT" },
    },
    primaryKey: ["story_id", "element_id"],
  },
  {
    name: "collection_assets",
    columns: {
      collection_id: { type: "TEXT", notNull: true, ref: "collections(id)" },
      asset_type: { type: "TEXT", check: "IN ('character', 'scene', 'storyboard', 'story', 'media_asset')" },
      asset_id: { type: "TEXT", notNull: true },
      created_at: { type: "INTEGER", default: "(strftime('%s','now'))" },
      updated_at: { type: "INTEGER", default: "(strftime('%s','now'))" },
    },
    primaryKey: ["collection_id", "asset_id"],
  },
  {
    name: "asset_tags",
    columns: {
      asset_id: { type: "TEXT", notNull: true },
      asset_type: { type: "TEXT", check: "IN ('character', 'scene', 'prop', 'reference')" },
      tag: { type: "TEXT", notNull: true },
      confidence: { type: "REAL", default: "1.0", check: "BETWEEN 0 AND 1" },
    },
    primaryKey: ["asset_id", "tag"],
  },
];

const CACHE_TABLES: TableDef[] = [
  {
    name: "video_cache",
    featureGroup: "video",
    baseColumns: false,
    columns: {
      task_id: { type: "TEXT" },
      file_path: { type: "TEXT", notNull: true },
      original_url: { type: "TEXT" },
      mime_type: { type: "TEXT" },
      file_size: { type: "INTEGER" },
      cached_at: { type: "INTEGER", default: "(strftime('%s','now'))" },
      owner_id: { type: "INTEGER", default: "1" },
      version: { type: "INTEGER", default: "1" },
      sync_id: { type: "TEXT" },
    },
    primaryKey: "task_id",
  },
  {
    name: "image_cache",
    featureGroup: "core",
    baseColumns: false,
    columns: {
      source_url: { type: "TEXT", notNull: true },
      file_path: { type: "TEXT", notNull: true },
      mime_type: { type: "TEXT" },
      file_size: { type: "INTEGER" },
      width: { type: "INTEGER" },
      height: { type: "INTEGER" },
      cached_at: { type: "INTEGER", default: "(strftime('%s','now'))" },
      last_accessed_at: { type: "INTEGER", default: "(strftime('%s','now'))" },
    },
    primaryKey: "source_url",
  },
  {
    name: "error_logs",
    featureGroup: "core",
    baseColumns: false,
    columns: {
      id: { type: "INTEGER", notNull: true },
      message: { type: "TEXT", notNull: true },
      stack: { type: "TEXT" },
      timestamp: { type: "INTEGER" },
      component: { type: "TEXT" },
    },
    primaryKey: "id",
  },
  {
    name: "sessions",
    featureGroup: "core",
    baseColumns: false,
    columns: {
      id: { type: "TEXT", notNull: true },
      key: { type: "TEXT", notNull: true },
      value: { type: "TEXT" },
      timestamp: { type: "INTEGER" },
    },
  },
  {
    name: "auto_saves",
    featureGroup: "core",
    baseColumns: false,
    columns: {
      id: { type: "TEXT", notNull: true },
      type: { type: "TEXT", check: "IN ('character', 'scene', 'story')" },
      data_json: { type: "TEXT" },
      timestamp: { type: "INTEGER" },
    },
  },
  {
    name: "file_index",
    featureGroup: "core",
    baseColumns: false,
    columns: {
      id: { type: "TEXT", notNull: true },
      file_path: { type: "TEXT", notNull: true, unique: true },
      file_name: { type: "TEXT" },
      file_size: { type: "INTEGER" },
      file_hash: { type: "TEXT" },
      asset_id: { type: "TEXT" },
      asset_type: { type: "TEXT" },
      created_at: { type: "INTEGER" },
      last_accessed_at: { type: "INTEGER" },
      access_count: { type: "INTEGER", default: "0" },
      is_temporary: { type: "INTEGER", default: "0" },
      expires_at: { type: "INTEGER" },
    },
  },
];

const SYNC_TABLES: TableDef[] = [
  {
    name: "sync_changelog",
    featureGroup: "sync",
    baseColumns: false,
    columns: {
      entity_type: { type: "TEXT", notNull: true },
      entity_id: { type: "TEXT", notNull: true },
      operation: { type: "TEXT", notNull: true, check: "IN ('insert', 'update', 'delete')" },
      vector_clock: { type: "TEXT", notNull: true, default: "'{}'" },
      data: { type: "TEXT" },
      timestamp: { type: "INTEGER", notNull: true, default: "(strftime('%s','now'))" },
      synced: { type: "INTEGER", notNull: true, default: "0" },
      device_id: { type: "TEXT", notNull: true },
    },
  },
  {
    name: "sync_meta",
    featureGroup: "sync",
    baseColumns: false,
    columns: {
      key: { type: "TEXT", notNull: true },
      value: { type: "TEXT", notNull: true },
    },
    primaryKey: "key",
  },
  {
    name: "sync_conflict_backup",
    featureGroup: "sync",
    baseColumns: false,
    columns: {
      entity_type: { type: "TEXT", notNull: true },
      entity_id: { type: "TEXT", notNull: true },
      local_data: { type: "TEXT" },
      remote_data: { type: "TEXT" },
      resolved_at: { type: "INTEGER", notNull: true },
      created_at: { type: "INTEGER", default: "(strftime('%s','now'))" },
    },
  },
];

const EXTRA_INDEXES_SQL = `
CREATE INDEX IF NOT EXISTS idx_video_tasks_status ON video_tasks(status);
CREATE INDEX IF NOT EXISTS idx_video_tasks_story_id ON video_tasks(story_id);
CREATE INDEX IF NOT EXISTS idx_video_tasks_status_updated ON video_tasks(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_story_beats_story ON story_beats(story_id);
CREATE INDEX IF NOT EXISTS idx_story_versions_story ON story_versions(story_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_story_templates_updated ON story_templates(updated_at);
CREATE INDEX IF NOT EXISTS idx_story_templates_category ON story_templates(category);
CREATE INDEX IF NOT EXISTS idx_character_outfits_character ON character_outfits(character_id);
CREATE INDEX IF NOT EXISTS idx_video_cache_cached_at ON video_cache(cached_at);
CREATE INDEX IF NOT EXISTS idx_video_cache_size ON video_cache(file_size);
CREATE INDEX IF NOT EXISTS idx_image_cache_cached_at ON image_cache(cached_at);
CREATE INDEX IF NOT EXISTS idx_image_cache_last_accessed ON image_cache(last_accessed_at);
CREATE INDEX IF NOT EXISTS idx_auto_saves_type ON auto_saves(type);
CREATE INDEX IF NOT EXISTS idx_auto_saves_timestamp ON auto_saves(timestamp);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON generation_tasks(status, created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_story ON generation_tasks(story_id, beat_id);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON generation_tasks(priority, status);
CREATE INDEX IF NOT EXISTS idx_tasks_next_retry ON generation_tasks(next_retry_at);
CREATE INDEX IF NOT EXISTS idx_file_hash ON file_index(file_hash);
CREATE INDEX IF NOT EXISTS idx_file_expires ON file_index(expires_at) WHERE is_temporary = 1;
CREATE INDEX IF NOT EXISTS idx_ast_templates_category ON ast_templates(category);
CREATE INDEX IF NOT EXISTS idx_ast_templates_name ON ast_templates(name);
CREATE INDEX IF NOT EXISTS idx_ast_templates_usage ON ast_templates(usage_count DESC);
CREATE INDEX IF NOT EXISTS idx_ast_templates_created ON ast_templates(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_characters_style ON characters(style);
CREATE INDEX IF NOT EXISTS idx_characters_gender ON characters(gender);
CREATE INDEX IF NOT EXISTS idx_characters_source ON characters(source);
CREATE INDEX IF NOT EXISTS idx_characters_created ON characters(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_characters_used ON characters(use_count DESC, last_used_at DESC);
CREATE INDEX IF NOT EXISTS idx_characters_name ON characters(name);
CREATE INDEX IF NOT EXISTS idx_scenes_type ON scenes(type);
CREATE INDEX IF NOT EXISTS idx_scenes_created ON scenes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scenes_name ON scenes(name);
CREATE INDEX IF NOT EXISTS idx_asset_tags_tag ON asset_tags(tag);
CREATE INDEX IF NOT EXISTS idx_asset_tags_lookup ON asset_tags(asset_type, tag);
CREATE INDEX IF NOT EXISTS idx_changelog_synced ON sync_changelog(synced, timestamp);
CREATE INDEX IF NOT EXISTS idx_changelog_entity ON sync_changelog(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_story_beats_beat_id ON story_beats(beat_id);
CREATE INDEX IF NOT EXISTS idx_story_beats_scene ON story_beats(scene_id);
CREATE INDEX IF NOT EXISTS idx_video_tasks_beat_id ON video_tasks(beat_id);
CREATE INDEX IF NOT EXISTS idx_storyboard_assets_scene ON storyboard_assets(scene_id);
CREATE INDEX IF NOT EXISTS idx_storyboard_assets_project ON storyboard_assets(project_id);
CREATE INDEX IF NOT EXISTS idx_media_assets_bound ON media_assets(bound_to_type, bound_to_id);
CREATE INDEX IF NOT EXISTS idx_ast_templates_parent ON ast_templates(parent_template_id);
CREATE INDEX IF NOT EXISTS idx_sync_changelog_device ON sync_changelog(device_id);
CREATE INDEX IF NOT EXISTS idx_sync_conflict_backup_entity ON sync_conflict_backup(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_story_versions_auto ON story_versions(story_id, auto_saved);
CREATE INDEX IF NOT EXISTS idx_novel_projects_updated ON novel_projects(updated_at);
CREATE INDEX IF NOT EXISTS idx_novel_projects_story ON novel_projects(story_id);
CREATE INDEX IF NOT EXISTS idx_props_type ON props(type);
CREATE INDEX IF NOT EXISTS idx_props_source_character ON props(source_character_id);
CREATE INDEX IF NOT EXISTS idx_character_variants_character ON character_variants(character_id);
CREATE INDEX IF NOT EXISTS idx_character_variants_default ON character_variants(character_id, is_default);
CREATE INDEX IF NOT EXISTS idx_stories_status ON stories(status);
`;

export function getSchemaSQL(): string {
  const parts: string[] = [];

  parts.push(`
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = -64000;
PRAGMA temp_store = memory;
PRAGMA mmap_size = 268435456;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER DEFAULT (strftime('%s','now'))
);
`);

  if (SCHEMA_FEATURES.users) {
    parts.push(USERS_SQL);
  }

  if (SCHEMA_FEATURES.core) {
    for (const table of FEATURE_TABLES) {
      parts.push(generateTableSQL(table));
    }
  }

  for (const jt of JUNCTION_TABLES) {
    parts.push(generateJunctionTableSQL(jt.name, jt.columns, jt.primaryKey, jt.uniqueConstraints));
  }

  for (const table of CACHE_TABLES) {
    parts.push(generateTableSQL(table));
  }

  if (SCHEMA_FEATURES.sync) {
    for (const table of SYNC_TABLES) {
      parts.push(generateTableSQL(table));
    }
  }

  parts.push(EXTRA_INDEXES_SQL);

  return parts.join("\n\n");
}

export function getTableDefByName(name: string): TableDef | undefined {
  const allTables = [...FEATURE_TABLES, ...CACHE_TABLES, ...SYNC_TABLES];
  return allTables.find((t) => t.name.toLowerCase() === name.toLowerCase());
}

export function getAllTableDefs(): TableDef[] {
  return [...FEATURE_TABLES, ...CACHE_TABLES, ...SYNC_TABLES];
}
