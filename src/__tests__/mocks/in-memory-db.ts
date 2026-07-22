import BetterSqlite3 from "better-sqlite3";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT DEFAULT '本地用户',
    role TEXT DEFAULT 'owner' CHECK(role IN ('owner','admin','member','viewer')),
    preferences TEXT DEFAULT '{}',
    created_at INTEGER DEFAULT (strftime('%s','now')),
    updated_at INTEGER DEFAULT (strftime('%s','now'))
);
INSERT OR IGNORE INTO users (id, username) VALUES (1, '本地用户');

CREATE TABLE IF NOT EXISTS video_tasks (
    id TEXT PRIMARY KEY,
    owner_id INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER DEFAULT (strftime('%s','now')),
    updated_at INTEGER DEFAULT (strftime('%s','now')),
    is_deleted INTEGER DEFAULT 0,
    deleted_at INTEGER,
    version INTEGER DEFAULT 1,
    sync_id TEXT,
    status TEXT CHECK(status IN ('pending', 'generating', 'completed', 'failed', 'cancelled', 'retrying', 'timeout')) DEFAULT 'pending',
    progress INTEGER DEFAULT 0,
    video_url TEXT,
    local_video_path TEXT,
    story_id TEXT,
    beat_id TEXT,
    message TEXT,
    config TEXT DEFAULT '{}',
    provider TEXT DEFAULT '{}',
    media_refs TEXT DEFAULT '{}',
    tracking TEXT DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS story_beats (
    id TEXT PRIMARY KEY,
    owner_id INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER DEFAULT (strftime('%s','now')),
    updated_at INTEGER DEFAULT (strftime('%s','now')),
    is_deleted INTEGER DEFAULT 0,
    deleted_at INTEGER,
    version INTEGER DEFAULT 1,
    sync_id TEXT,
    story_id TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    order_num INTEGER,
    title TEXT,
    content TEXT,
    description TEXT,
    duration INTEGER,
    type TEXT,
    character_ids_json TEXT,
    scene_id TEXT,
    camera TEXT DEFAULT '{}',
    generation TEXT DEFAULT '{}',
    meta TEXT DEFAULT '{}',
    local_video_path TEXT,
    FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS characters (
    id TEXT PRIMARY KEY,
    owner_id INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER DEFAULT (strftime('%s','now')),
    updated_at INTEGER DEFAULT (strftime('%s','now')),
    is_deleted INTEGER DEFAULT 0,
    deleted_at INTEGER,
    version INTEGER DEFAULT 1,
    sync_id TEXT,
    name TEXT NOT NULL,
    description TEXT,
    ref_image_path TEXT,
    gender TEXT CHECK(gender IN ('male', 'female', 'other', 'unknown')),
    age INTEGER CHECK(age BETWEEN 0 AND 200),
    style TEXT,
    source TEXT CHECK(source IN ('ai-generated', 'uploaded', 'imported')),
    use_count INTEGER DEFAULT 0,
    last_used_at INTEGER,
    appearance TEXT DEFAULT '{}',
    generation TEXT DEFAULT '{}',
    config TEXT DEFAULT '{}',
    meta TEXT DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS scenes (
    id TEXT PRIMARY KEY,
    owner_id INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER DEFAULT (strftime('%s','now')),
    updated_at INTEGER DEFAULT (strftime('%s','now')),
    is_deleted INTEGER DEFAULT 0,
    deleted_at INTEGER,
    version INTEGER DEFAULT 1,
    sync_id TEXT,
    name TEXT NOT NULL,
    description TEXT,
    ref_image_path TEXT,
    type TEXT,
    source TEXT CHECK(source IN ('ai-generated', 'uploaded', 'imported')),
    use_count INTEGER DEFAULT 0,
    last_used_at INTEGER,
    appearance TEXT DEFAULT '{}',
    atmosphere TEXT DEFAULT '{}',
    generation TEXT DEFAULT '{}',
    config TEXT DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS stories (
    id TEXT PRIMARY KEY,
    owner_id INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER DEFAULT (strftime('%s','now')),
    updated_at INTEGER DEFAULT (strftime('%s','now')),
    is_deleted INTEGER DEFAULT 0,
    deleted_at INTEGER,
    version INTEGER DEFAULT 1,
    sync_id TEXT,
    title TEXT NOT NULL,
    description TEXT,
    genre TEXT,
    tone TEXT,
    target_duration INTEGER,
    keyframe_chain_valid INTEGER DEFAULT 0,
    style_guide_json TEXT,
    element_ids_json TEXT,
    element_bindings_json TEXT
);

CREATE TABLE IF NOT EXISTS story_characters (
    story_id TEXT NOT NULL,
    character_id TEXT NOT NULL,
    display_order INTEGER DEFAULT 0,
    FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE,
    PRIMARY KEY (story_id, character_id)
);

CREATE TABLE IF NOT EXISTS story_scenes (
    story_id TEXT NOT NULL,
    scene_id TEXT NOT NULL,
    display_order INTEGER DEFAULT 0,
    FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE,
    PRIMARY KEY (story_id, scene_id)
);

CREATE TABLE IF NOT EXISTS story_elements (
    story_id TEXT NOT NULL,
    element_id TEXT NOT NULL,
    binding_config TEXT,
    FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE,
    PRIMARY KEY (story_id, element_id)
);

CREATE TABLE IF NOT EXISTS story_versions (
    id TEXT PRIMARY KEY,
    owner_id INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER DEFAULT (strftime('%s','now')),
    updated_at INTEGER DEFAULT (strftime('%s','now')),
    is_deleted INTEGER DEFAULT 0,
    deleted_at INTEGER,
    version INTEGER DEFAULT 1,
    sync_id TEXT,
    story_id TEXT NOT NULL,
    timestamp INTEGER,
    beats_json TEXT,
    title TEXT,
    description TEXT,
    genre TEXT,
    tone TEXT,
    target_duration INTEGER,
    characters_json TEXT,
    scenes_json TEXT,
    change_summary TEXT,
    auto_saved INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS character_outfits (
    id TEXT PRIMARY KEY,
    character_id TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    description TEXT DEFAULT '',
    clothing TEXT DEFAULT '',
    accessories_json TEXT DEFAULT '[]',
    image_url TEXT,
    local_image_path TEXT,
    thumbnail_path TEXT,
    is_default INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s','now')),
    updated_at INTEGER DEFAULT (strftime('%s','now')),
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
);

-- Task 2A.10: 角色变体表
CREATE TABLE IF NOT EXISTS character_variants (
    id TEXT PRIMARY KEY,
    owner_id INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER DEFAULT (strftime('%s','now')),
    updated_at INTEGER DEFAULT (strftime('%s','now')),
    is_deleted INTEGER DEFAULT 0,
    deleted_at INTEGER,
    version INTEGER DEFAULT 1,
    sync_id TEXT,
    character_id TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    description TEXT DEFAULT '',
    prompt_fragment TEXT DEFAULT '',
    reference_image_path TEXT,
    image_url TEXT,
    local_image_path TEXT,
    thumbnail_path TEXT,
    time_of_day TEXT,
    weather TEXT,
    lighting TEXT,
    mood TEXT,
    crowd_level TEXT,
    camera_angle TEXT,
    season TEXT,
    color_palette TEXT,
    source_outfit_id TEXT,
    source_compositor_asset_id TEXT,
    is_default INTEGER DEFAULT 0,
    is_canonical INTEGER DEFAULT 0,
    metadata_json TEXT DEFAULT '{}',
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_character_variants_character ON character_variants(character_id);
CREATE INDEX IF NOT EXISTS idx_character_variants_default ON character_variants(character_id, is_default);

-- Q3-1: 场景变体表（对称 character_variants）
CREATE TABLE IF NOT EXISTS scene_variants (
    id TEXT PRIMARY KEY,
    owner_id INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER DEFAULT (strftime('%s','now')),
    updated_at INTEGER DEFAULT (strftime('%s','now')),
    is_deleted INTEGER DEFAULT 0,
    deleted_at INTEGER,
    version INTEGER DEFAULT 1,
    sync_id TEXT,
    scene_id TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    description TEXT DEFAULT '',
    prompt_fragment TEXT DEFAULT '',
    reference_image_path TEXT,
    image_url TEXT,
    local_image_path TEXT,
    thumbnail_path TEXT,
    time_of_day TEXT,
    weather TEXT,
    lighting TEXT,
    mood TEXT,
    crowd_level TEXT,
    camera_angle TEXT,
    season TEXT,
    color_palette TEXT,
    source_compositor_asset_id TEXT,
    is_default INTEGER DEFAULT 0,
    is_canonical INTEGER DEFAULT 0,
    metadata_json TEXT DEFAULT '{}',
    FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_scene_variants_scene ON scene_variants(scene_id);
CREATE INDEX IF NOT EXISTS idx_scene_variants_default ON scene_variants(scene_id, is_default);

CREATE TABLE IF NOT EXISTS elements (
    id TEXT PRIMARY KEY,
    owner_id INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER DEFAULT (strftime('%s','now')),
    updated_at INTEGER DEFAULT (strftime('%s','now')),
    is_deleted INTEGER DEFAULT 0,
    deleted_at INTEGER,
    version INTEGER DEFAULT 1,
    sync_id TEXT,
    type TEXT NOT NULL CHECK(type IN ('character', 'prop', 'effect')),
    name TEXT NOT NULL,
    description TEXT,
    character_config_json TEXT,
    scene_config_json TEXT,
    feature_anchor_json TEXT,
    reference_image_quality_json TEXT,
    bindings_json TEXT
);

CREATE TABLE IF NOT EXISTS media_assets (
    id TEXT PRIMARY KEY,
    owner_id INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER DEFAULT (strftime('%s','now')),
    updated_at INTEGER DEFAULT (strftime('%s','now')),
    is_deleted INTEGER DEFAULT 0,
    deleted_at INTEGER,
    version INTEGER DEFAULT 1,
    sync_id TEXT,
    name TEXT NOT NULL,
    description TEXT,
    type TEXT CHECK(type IN ('image', 'video')),
    url TEXT,
    thumbnail_url TEXT,
    tags TEXT,
    file_size INTEGER,
    mime_type TEXT,
    width INTEGER,
    height INTEGER,
    duration INTEGER,
    bound_to_type TEXT,
    bound_to_id TEXT,
    bound_to_name TEXT
);

CREATE TABLE IF NOT EXISTS video_templates (
    id TEXT PRIMARY KEY,
    owner_id INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER DEFAULT (strftime('%s','now')),
    updated_at INTEGER DEFAULT (strftime('%s','now')),
    is_deleted INTEGER DEFAULT 0,
    deleted_at INTEGER,
    version INTEGER DEFAULT 1,
    sync_id TEXT,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT,
    total_duration INTEGER,
    shots_json TEXT,
    tags TEXT,
    thumbnail_url TEXT
);

CREATE TABLE IF NOT EXISTS storyboard_assets (
    id TEXT PRIMARY KEY,
    owner_id INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER DEFAULT (strftime('%s','now')),
    updated_at INTEGER DEFAULT (strftime('%s','now')),
    is_deleted INTEGER DEFAULT 0,
    deleted_at INTEGER,
    version INTEGER DEFAULT 1,
    sync_id TEXT,
    script TEXT,
    duration INTEGER DEFAULT 0,
    shot_type TEXT CHECK(shot_type IN ('wide', 'medium', 'close_up', 'extreme_close_up', 'over_shoulder', 'aerial', 'tracking', 'static')),
    preview_path TEXT,
    character_ids TEXT,
    scene_id TEXT,
    project_id TEXT
);

CREATE TABLE IF NOT EXISTS collections (
    id TEXT PRIMARY KEY,
    owner_id INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER DEFAULT (strftime('%s','now')),
    updated_at INTEGER DEFAULT (strftime('%s','now')),
    is_deleted INTEGER DEFAULT 0,
    deleted_at INTEGER,
    version INTEGER DEFAULT 1,
    sync_id TEXT,
    name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS collection_assets (
    collection_id TEXT NOT NULL,
    asset_type TEXT CHECK(asset_type IN ('character', 'scene', 'storyboard', 'story', 'media_asset')),
    asset_id TEXT NOT NULL,
    PRIMARY KEY (collection_id, asset_id)
);

CREATE TABLE IF NOT EXISTS asset_tags (
    asset_id TEXT NOT NULL,
    asset_type TEXT CHECK(asset_type IN ('character', 'scene', 'prop', 'reference')),
    tag TEXT NOT NULL,
    confidence REAL DEFAULT 1.0 CHECK(confidence BETWEEN 0 AND 1),
    PRIMARY KEY (asset_id, tag)
);

CREATE TABLE IF NOT EXISTS ast_templates (
    id TEXT PRIMARY KEY,
    owner_id INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER DEFAULT (strftime('%s','now')),
    updated_at INTEGER DEFAULT (strftime('%s','now')),
    is_deleted INTEGER DEFAULT 0,
    deleted_at INTEGER,
    version INTEGER DEFAULT 1,
    sync_id TEXT,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT,
    genre TEXT,
    tone TEXT,
    tags TEXT,
    author TEXT,
    total_duration INTEGER,
    beats_count INTEGER DEFAULT 0,
    characters_count INTEGER DEFAULT 0,
    scenes_count INTEGER DEFAULT 0,
    ast_file_path TEXT,
    ast_file_size INTEGER,
    is_public INTEGER DEFAULT 0,
    usage_count INTEGER DEFAULT 0,
    rating REAL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS generation_tasks (
    id TEXT PRIMARY KEY,
    owner_id INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER DEFAULT (strftime('%s','now')),
    updated_at INTEGER DEFAULT (strftime('%s','now')),
    is_deleted INTEGER DEFAULT 0,
    deleted_at INTEGER,
    version INTEGER DEFAULT 1,
    sync_id TEXT,
    task_type TEXT CHECK(task_type IN ('keyframe', 'first_frame', 'last_frame', 'character_image', 'scene_image')),
    story_id TEXT,
    beat_id TEXT,
    asset_id TEXT,
    status TEXT CHECK(status IN ('pending', 'generating', 'completed', 'failed', 'cancelled', 'retrying', 'timeout')) DEFAULT 'pending',
    input_params TEXT,
    output_path TEXT,
    output_url TEXT,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    priority TEXT DEFAULT 'normal',
    next_retry_at INTEGER,
    last_attempt_at INTEGER,
    provider_id TEXT,
    model_id TEXT,
    estimated_cost REAL,
    completed_at INTEGER
);

CREATE TABLE IF NOT EXISTS video_cache (
    task_id TEXT PRIMARY KEY,
    file_path TEXT NOT NULL,
    original_url TEXT,
    mime_type TEXT,
    file_size INTEGER,
    cached_at INTEGER DEFAULT (strftime('%s','now')),
    owner_id INTEGER NOT NULL DEFAULT 1,
    version INTEGER DEFAULT 1,
    sync_id TEXT
);

CREATE TABLE IF NOT EXISTS error_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message TEXT NOT NULL,
    stack TEXT,
    timestamp INTEGER,
    component TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    key TEXT NOT NULL,
    value TEXT,
    timestamp INTEGER
);

CREATE TABLE IF NOT EXISTS auto_saves (
    id TEXT PRIMARY KEY,
    type TEXT CHECK(type IN ('character', 'scene', 'story')),
    data_json TEXT,
    timestamp INTEGER
);

CREATE TABLE IF NOT EXISTS file_index (
    id TEXT PRIMARY KEY,
    file_path TEXT NOT NULL UNIQUE,
    file_name TEXT,
    file_size INTEGER,
    file_hash TEXT,
    asset_id TEXT,
    asset_type TEXT,
    created_at INTEGER,
    last_accessed_at INTEGER,
    access_count INTEGER DEFAULT 0,
    is_temporary INTEGER DEFAULT 0,
    expires_at INTEGER
);

CREATE TABLE IF NOT EXISTS sync_changelog (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    operation TEXT NOT NULL CHECK(operation IN ('insert', 'update', 'delete')),
    vector_clock TEXT NOT NULL DEFAULT '{}',
    data TEXT,
    timestamp INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    synced INTEGER NOT NULL DEFAULT 0,
    device_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_conflict_backup (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    local_data TEXT,
    remote_data TEXT,
    resolved_at INTEGER NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s','now'))
);

CREATE INDEX IF NOT EXISTS idx_video_tasks_status ON video_tasks(status);
CREATE INDEX IF NOT EXISTS idx_video_tasks_story_id ON video_tasks(story_id);
CREATE INDEX IF NOT EXISTS idx_video_tasks_status_updated ON video_tasks(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_story_beats_story ON story_beats(story_id);
CREATE INDEX IF NOT EXISTS idx_story_versions_story ON story_versions(story_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_character_outfits_character ON character_outfits(character_id);
CREATE INDEX IF NOT EXISTS idx_video_cache_cached_at ON video_cache(cached_at);
CREATE INDEX IF NOT EXISTS idx_video_cache_size ON video_cache(file_size);
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
`;

export class InMemoryDatabase {
  private db: import("better-sqlite3").Database | null = null;
  private _isReady = false;

  get isReady() {
    return this._isReady;
  }

  initialize(): void {
    if (this._isReady) return;

    this.db = new BetterSqlite3(":memory:");
    this.db.pragma("journal_mode = MEMORY");
    this.db.pragma("synchronous = OFF");
    this.db.pragma("foreign_keys = ON");

    this.db.exec(SCHEMA_SQL);

    this._isReady = true;
  }

  query(sql: string, params: unknown[] = []): Record<string, unknown>[] {
    if (!this.db) throw new Error("Database not initialized");
    try {
      const stmt = this.db.prepare(sql);
      return stmt.all(...params) as Record<string, unknown>[];
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`Query failed: ${msg} | SQL: ${sql.substring(0, 100)}`);
    }
  }

  run(sql: string, params: unknown[] = []): { changes: number; lastInsertRowid: number | bigint } {
    if (!this.db) throw new Error("Database not initialized");
    try {
      const stmt = this.db.prepare(sql);
      const result = stmt.run(...params);
      return {
        changes: result.changes,
        lastInsertRowid: result.lastInsertRowid,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`Run failed: ${msg} | SQL: ${sql.substring(0, 100)}`);
    }
  }

  transaction(statements: { sql: string; params: unknown[] }[]): unknown[] {
    if (!this.db) throw new Error("Database not initialized");
    const results: unknown[] = [];
    const txn = this.db.transaction(() => {
      for (const { sql, params } of statements) {
        const isSelect = /^\s*SELECT\s/i.test(sql);
        if (isSelect) {
          results.push(this.query(sql, params));
        } else {
          results.push(this.run(sql, params));
        }
      }
    });
    txn();
    return results;
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this._isReady = false;
    }
  }
}

let dbInstance: InMemoryDatabase | null = null;

export function getTestDatabase(): InMemoryDatabase {
  if (!dbInstance) {
    dbInstance = new InMemoryDatabase();
    dbInstance.initialize();
  }
  return dbInstance;
}

export function closeTestDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

export function resetTestDatabase(): void {
  closeTestDatabase();
}
