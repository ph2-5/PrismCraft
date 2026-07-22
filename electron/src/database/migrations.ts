import { getLogger } from "../logging/logger";

const logger = getLogger("migrations");

const VALID_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * 允许的列类型白名单（含简单 DEFAULT 字面量）。
 * 迁移脚本中的 type 字段虽来自代码常量，但仍通过白名单校验
 * 防止未来误拼接用户输入。
 */
const VALID_COLUMN_TYPE = /^(TEXT|INTEGER|REAL|BLOB|NUMERIC|BOOLEAN)(\s+DEFAULT\s+([0-9]+|'[a-zA-Z0-9_\-:]*'|\([^)]*\)))?$/i;

function sanitizeIdentifier(name: string): string {
  if (!VALID_IDENTIFIER.test(name)) {
    throw new Error(`Invalid SQL identifier in migration: ${name}`);
  }
  return `"${name}"`;
}

function sanitizeColumnType(type: string): string {
  if (!VALID_COLUMN_TYPE.test(type)) {
    throw new Error(`Invalid SQL column type in migration: ${type}`);
  }
  return type;
}

export const CURRENT_SCHEMA_VERSION = 12;

// PR 3 Step 1：shotType 迁移映射表（内联，不导入 shared-logic 以遵守架构边界）
// 语义：旧 shotType 中的 size 类 → shotSize
const SHOT_SIZE_FROM_LEGACY: Record<string, string> = {
  extreme_close: "extreme_close",
  close: "close",
  medium: "medium",
  wide: "wide",
  extreme_wide: "extreme_wide",
};

// 语义：旧 shotType 中的 angle 类 → cameraAngle（修正历史 bug：
// 旧实现把 angle 类 shotType 当成 size，丢失了角度信息）
const CAMERA_ANGLE_FROM_LEGACY: Record<string, string> = {
  eye_level: "eye_level",
  low: "low",
  high: "high",
  birds_eye: "birds_eye",
  worms_eye: "worms_eye",
  dutch: "dutch",
  birdseye: "birds_eye",
  wormseye: "worms_eye",
};

const CAMERA_MOVEMENT_FROM_LEGACY: Record<string, string> = {
  static: "static",
  push: "push",
  pull: "pull",
  pan: "pan",
  orbit: "orbit",
  crane_up: "crane_up",
  crane_down: "crane_down",
  tracking: "tracking",
};

/**
 * PR 3 Step 1：从旧的 camera.shotType + camera.angle + camera.movement
 * 构造 shotInstruction 子对象。
 *
 * 修正历史 bug：旧 shotType 可能是 angle 类（low/high/birdseye/wormseye），
 * 被误认为 size。此函数按语义重新分配到 shotSize 或 cameraAngle。
 */
function buildShotInstructionFromCameraContainer(camera: {
  shotType?: string;
  angle?: string;
  movement?: string;
}): { shotSize: string; cameraAngle: string; cameraMovement: string } | undefined {
  const shotType = camera.shotType;
  const angle = camera.angle;
  const movement = camera.movement;

  const shotSize = shotType ? SHOT_SIZE_FROM_LEGACY[shotType] : undefined;
  // shotType 若是 angle 类（size 映射失败），尝试 angle 映射
  const angleFromShotType = shotType && !shotSize ? CAMERA_ANGLE_FROM_LEGACY[shotType] : undefined;
  const mappedAngle = angle ? CAMERA_ANGLE_FROM_LEGACY[angle] : undefined;
  const mappedMovement = movement ? CAMERA_MOVEMENT_FROM_LEGACY[movement] : undefined;

  const finalAngle = mappedAngle ?? angleFromShotType;

  if (!shotSize && !finalAngle && !mappedMovement) return undefined;

  return {
    shotSize: shotSize || "medium",
    cameraAngle: finalAngle || "eye_level",
    cameraMovement: mappedMovement || "static",
  };
}

export interface MigrationDb {
  prepare(sql: string): { get(...params: unknown[]): Record<string, unknown> | undefined; all(...params: unknown[]): Record<string, unknown>[]; run(...params: unknown[]): unknown };
  exec(sql: string): void;
  transaction(fn: () => void): void;
}

export const MIGRATIONS: Record<number, (db: MigrationDb) => void> = {
  3: (db) => {
    const columns = [
      { table: "video_tasks", column: "local_video_path", type: "TEXT" },
      { table: "story_beats", column: "local_video_path", type: "TEXT" },
      { table: "story_beats", column: "local_keyframe_path", type: "TEXT" },
      { table: "story_beats", column: "local_first_frame_path", type: "TEXT" },
      { table: "story_beats", column: "local_last_frame_path", type: "TEXT" },
    ];
    for (const { table, column, type } of columns) {
      try {
        db.exec(`ALTER TABLE ${sanitizeIdentifier(table)} ADD COLUMN ${sanitizeIdentifier(column)} ${sanitizeColumnType(type)};`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!msg.includes("duplicate column")) {
          throw e;
        }
      }
    }
  },
  4: (db) => {
    const columns = [
      { table: "collection_assets", column: "created_at", type: "INTEGER DEFAULT (strftime('%s','now'))" },
      { table: "collection_assets", column: "updated_at", type: "INTEGER DEFAULT (strftime('%s','now'))" },
    ];
    for (const { table, column, type } of columns) {
      try {
        db.exec(`ALTER TABLE ${sanitizeIdentifier(table)} ADD COLUMN ${sanitizeIdentifier(column)} ${sanitizeColumnType(type)};`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!msg.includes("duplicate column")) {
          throw e;
        }
      }
    }
  },
  5: (db) => {
    const columns = [
      { table: "video_cache", column: "owner_id", type: "INTEGER DEFAULT 1" },
      { table: "video_cache", column: "version", type: "INTEGER DEFAULT 1" },
      { table: "video_cache", column: "sync_id", type: "TEXT" },
    ];
    for (const { table, column, type } of columns) {
      try {
        db.exec(`ALTER TABLE ${sanitizeIdentifier(table)} ADD COLUMN ${sanitizeIdentifier(column)} ${sanitizeColumnType(type)};`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!msg.includes("duplicate column")) {
          throw e;
        }
      }
    }
  },
  6: (db) => {
    const columns = [
      { table: "video_tasks", column: "priority", type: "INTEGER DEFAULT 0" },
    ];
    for (const { table, column, type } of columns) {
      try {
        db.exec(`ALTER TABLE ${sanitizeIdentifier(table)} ADD COLUMN ${sanitizeIdentifier(column)} ${sanitizeColumnType(type)};`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!msg.includes("duplicate column")) {
          throw e;
        }
      }
    }
  },
  // Task 2A.22: 重建 generation_assets 表以更新 CHECK 约束
  // 同时修复 Task 2A.21 遗留问题（CHECK 未包含 preview_3d_snapshot/blockout_* 类型）
  // SQLite 不支持 ALTER COLUMN，只能 CREATE-INSERT-DROP-RENAME 重建
  7: (db) => {
    // 1. 创建新表（无 CHECK 约束，类型由 Zod schema 在 app 层校验）
    db.exec(`
      CREATE TABLE IF NOT EXISTS generation_assets_v7 (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        source_type TEXT NOT NULL CHECK(source_type IN ('ai_generated', 'user_uploaded', 'composited')),
        url TEXT NOT NULL,
        local_path TEXT,
        thumbnail_path TEXT,
        prompt TEXT,
        model_id TEXT,
        provider_id TEXT,
        metadata TEXT DEFAULT '{}',
        story_beat_id TEXT,
        sub_shot_id TEXT,
        character_id TEXT,
        character_variant_id TEXT,
        scene_id TEXT,
        scene_variant_id TEXT,
        project_id TEXT,
        source_asset_id TEXT,
        owner_id INTEGER DEFAULT 1,
        created_at INTEGER DEFAULT (strftime('%s','now')),
        updated_at INTEGER DEFAULT (strftime('%s','now')),
        is_deleted INTEGER DEFAULT 0,
        deleted_at INTEGER,
        version INTEGER DEFAULT 1,
        sync_id TEXT
      );
    `);

    // 2. 检查旧表是否存在并迁移数据
    const oldTableExists = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='generation_assets'",
    ).get();
    if (oldTableExists) {
      // 获取旧表的实际列
      const oldCols = db.prepare("PRAGMA table_info(generation_assets)").all() as Array<{ name: string }>;
      const oldColNames = oldCols.map((c) => c.name);
      // 仅迁移两边都存在的列
      const newColNames = [
        "id", "type", "source_type", "url", "local_path", "thumbnail_path", "prompt",
        "model_id", "provider_id", "metadata", "story_beat_id", "sub_shot_id", "character_id",
        "character_variant_id", "scene_id", "scene_variant_id", "project_id", "source_asset_id",
        "owner_id", "created_at", "updated_at", "is_deleted", "deleted_at", "version", "sync_id",
      ];
      const commonCols = newColNames.filter((c) => oldColNames.includes(c));
      const colList = commonCols.map((c) => `"${c}"`).join(", ");
      try {
        db.exec(`INSERT INTO generation_assets_v7 (${colList}) SELECT ${colList} FROM generation_assets;`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.warn(`[DB] migration v7: data migration failed (continuing): ${msg}`);
      }
      // 3. 删除旧表并重命名
      db.exec("DROP TABLE generation_assets;");
    }
    db.exec("ALTER TABLE generation_assets_v7 RENAME TO generation_assets;");
    logger.info("[DB] migration v7: generation_assets rebuilt (CHECK constraint relaxed, source_asset_id added)");
  },
  // PR 3 Step 1：数据迁移 — 把 camera JSON 中的 shotType/angle/movement 复制到 shotInstruction 子字段
  // 必须在 PR 3 后续步骤清除读取端 fallback 之前运行，否则旧数据在 UI 上会显示为空
  8: (db) => {
    let rows: Array<{ id: string; camera: string | null }> = [];
    try {
      rows = db.prepare("SELECT id, camera FROM story_beats WHERE camera IS NOT NULL").all() as Array<{ id: string; camera: string | null }>;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.warn(`[DB] migration v8: failed to query story_beats (continuing): ${msg}`);
      return;
    }

    let migrated = 0;
    let skipped = 0;
    for (const row of rows) {
      if (!row.camera) continue;
      let camera: Record<string, unknown>;
      try {
        camera = JSON.parse(row.camera);
      } catch {
        skipped++;
        continue;
      }

      // 已有 shotInstruction 子字段，跳过（避免重复迁移）
      if (camera.shotInstruction && typeof camera.shotInstruction === "object") {
        skipped++;
        continue;
      }

      // 从旧字段构造 shotInstruction
      const shotInstruction = buildShotInstructionFromCameraContainer({
        shotType: typeof camera.shotType === "string" ? camera.shotType : undefined,
        angle: typeof camera.angle === "string" ? camera.angle : undefined,
        movement: typeof camera.movement === "string" ? camera.movement : undefined,
      });

      if (!shotInstruction) {
        skipped++;
        continue;
      }

      camera.shotInstruction = shotInstruction;
      try {
        db.prepare("UPDATE story_beats SET camera = ? WHERE id = ?").run(JSON.stringify(camera), row.id);
        migrated++;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.warn(`[DB] migration v8: failed to update beat ${row.id} (continuing): ${msg}`);
        skipped++;
      }
    }

    logger.info(`[DB] migration v8: shotInstruction backfill done (migrated=${migrated}, skipped=${skipped})`);
  },
  // 故事模板持久化：创建 story_templates 表（与 getSchemaSQL 中的 CREATE TABLE IF NOT EXISTS 互为安全网）
  9: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS story_templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        beats_json TEXT NOT NULL,
        category TEXT,
        genre TEXT,
        tone TEXT,
        tags_json TEXT,
        author TEXT,
        total_duration INTEGER,
        owner_id INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER DEFAULT (strftime('%s','now')),
        updated_at INTEGER DEFAULT (strftime('%s','now')),
        is_deleted INTEGER DEFAULT 0,
        deleted_at INTEGER,
        version INTEGER DEFAULT 1,
        sync_id TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_story_templates_updated ON story_templates(updated_at);
      CREATE INDEX IF NOT EXISTS idx_story_templates_category ON story_templates(category);
    `);
    logger.info("[DB] migration v9: story_templates table ensured");
  },
  // Story 状态字段：支持 draft / in_progress / completed / archived / abandoned
  // 旧数据无 status 列时默认设为 'in_progress'，与既有派生逻辑保持一致
  10: (db) => {
    try {
      db.exec(`ALTER TABLE "stories" ADD COLUMN "status" TEXT DEFAULT 'in_progress';`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("duplicate column")) {
        throw e;
      }
    }
    db.exec(`CREATE INDEX IF NOT EXISTS idx_stories_status ON stories(status);`);
    logger.info("[DB] migration v10: stories.status column ensured");
  },
  // Q3-2: Beat 层关联变体 — story_beats 新增 character_variant_ids_json + scene_variant_id 列
  // 对称 character_ids_json + scene_id 模式，支持 beat 级别指定角色/场景变体
  11: (db) => {
    const columns = [
      { table: "story_beats", column: "character_variant_ids_json", type: "TEXT" },
      { table: "story_beats", column: "scene_variant_id", type: "TEXT" },
    ];
    for (const { table, column, type } of columns) {
      try {
        db.exec(`ALTER TABLE ${sanitizeIdentifier(table)} ADD COLUMN ${sanitizeIdentifier(column)} ${sanitizeColumnType(type)};`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!msg.includes("duplicate column")) {
          throw e;
        }
      }
    }
    logger.info("[DB] migration v11: story_beats variant columns ensured");
  },
  // Q3-3: 时间线维度建模 — 创建 story_timelines + plot_nodes 表
  // 设计来源：docs/timeline-variant-design.md（故事时间线变体系统）
  // story_timelines 是项目主轴，plot_nodes 是时间线上的最小单位（对应 NovelSegment）
  12: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS story_timelines (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL DEFAULT 'default',
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        type TEXT NOT NULL DEFAULT 'main',
        is_parallel INTEGER DEFAULT 0,
        parent_timeline_id TEXT,
        merge_node_id TEXT,
        bindings_json TEXT DEFAULT '{}',
        metadata_json TEXT DEFAULT '{}',
        owner_id INTEGER DEFAULT 1,
        created_at INTEGER DEFAULT (strftime('%s','now')),
        updated_at INTEGER DEFAULT (strftime('%s','now')),
        is_deleted INTEGER DEFAULT 0,
        deleted_at INTEGER,
        version INTEGER DEFAULT 1,
        sync_id TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_story_timelines_project ON story_timelines(project_id);
      CREATE INDEX IF NOT EXISTS idx_story_timelines_type ON story_timelines(type);

      CREATE TABLE IF NOT EXISTS plot_nodes (
        id TEXT PRIMARY KEY,
        timeline_id TEXT NOT NULL,
        order_num INTEGER NOT NULL DEFAULT 0,
        chapter_index INTEGER,
        chapter_title TEXT,
        segment_id TEXT,
        beat_id TEXT,
        plot_event_type TEXT NOT NULL DEFAULT 'narration',
        plot_event_description TEXT DEFAULT '',
        plot_event_parameters_json TEXT DEFAULT '{}',
        ai_analysis_json TEXT,
        character_snapshots_json TEXT DEFAULT '[]',
        scene_snapshots_json TEXT DEFAULT '[]',
        transitions_json TEXT DEFAULT '[]',
        bindings_json TEXT DEFAULT '[]',
        snapshot_strategy TEXT NOT NULL DEFAULT 'active',
        cached_prompt TEXT,
        metadata_json TEXT DEFAULT '{}',
        owner_id INTEGER DEFAULT 1,
        created_at INTEGER DEFAULT (strftime('%s','now')),
        updated_at INTEGER DEFAULT (strftime('%s','now')),
        is_deleted INTEGER DEFAULT 0,
        deleted_at INTEGER,
        version INTEGER DEFAULT 1,
        sync_id TEXT,
        FOREIGN KEY (timeline_id) REFERENCES story_timelines(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_plot_nodes_timeline ON plot_nodes(timeline_id, order_num);
      CREATE INDEX IF NOT EXISTS idx_plot_nodes_segment ON plot_nodes(segment_id);
      CREATE INDEX IF NOT EXISTS idx_plot_nodes_beat ON plot_nodes(beat_id);
    `);
    logger.info("[DB] migration v12: story_timelines + plot_nodes tables ensured");
  },
};

export function runMigrations(db: MigrationDb, currentVersion: number): void {
  const targetVersion = CURRENT_SCHEMA_VERSION;
  if (currentVersion >= targetVersion) {
    logger.info(`[DB] No pending migrations (current: ${currentVersion})`);
    return;
  }

  const hasPending = Array.from({ length: targetVersion - currentVersion }, (_, i) => currentVersion + 1 + i)
    .some((v) => MIGRATIONS[v]);

  if (!hasPending) {
    logger.info(`[DB] Schema version: ${currentVersion} → ${targetVersion} (no-op)`);
    return;
  }

  db.transaction(() => {
    for (let v = currentVersion + 1; v <= targetVersion; v++) {
      const migrate = MIGRATIONS[v];
      if (migrate) {
        logger.info(`[DB] Running migration v${v}...`);
        migrate(db);
      }
    }
  });

  logger.info(`[DB] Schema version: ${currentVersion} → ${targetVersion}`);
}
