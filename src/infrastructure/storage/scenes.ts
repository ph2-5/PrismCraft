import { safeQuery, safeRun, safeTransaction } from "./sqlite-core";
import { trackChange, buildInsertFromTargets, buildUpdateSets } from "./core";
import type { Scene } from "@/domain/schemas";
import type { FieldTarget } from "./core";
import { errorLogger } from "@/shared/error-logger";
import { VersionConflictError } from "@/shared/errors/version-conflict";
import {
  parseAppearanceContainer as parseAppearance,
  parseAtmosphereContainer as parseAtmosphere,
  parseGenerationContainer as parseGeneration,
  parseConfigContainer as parseConfig,
} from "./scenes/json-schemas";

const SCENE_FIELD_TARGETS: Record<string, FieldTarget> = {
  name: { type: "fixed", column: "name" },
  description: { type: "fixed", column: "description" },
  refImagePath: { type: "fixed", column: "ref_image_path" },
  type: { type: "fixed", column: "type" },
  source: { type: "fixed", column: "source" },
  useCount: { type: "fixed", column: "use_count" },
  lastUsedAt: { type: "fixed", column: "last_used_at" },

  avatarPath: { type: "json", container: "appearance", key: "avatarPath" },
  thumbnailPath: { type: "json", container: "appearance", key: "thumbnailPath" },
  previewPath: { type: "json", container: "appearance", key: "previewPath" },
  generatedImage: { type: "json", container: "appearance", key: "generatedImage" },
  generatedVideo: { type: "json", container: "appearance", key: "generatedVideo" },
  videoGenerationStatus: { type: "json", container: "appearance", key: "videoGenerationStatus" },
  videoGenerationTaskId: { type: "json", container: "appearance", key: "videoGenerationTaskId" },
  imageGenerationPrompt: { type: "json", container: "appearance", key: "imageGenerationPrompt" },
  scenePath: { type: "json", container: "appearance", key: "scenePath" },
  imageUrl: { type: "json", container: "appearance", key: "imageUrl" },

  prompt: { type: "json", container: "generation", key: "prompt" },
  generationPrompt: { type: "json", container: "generation", key: "generationPrompt" },
  generationParams: { type: "json", container: "generation", key: "generationParams" },

  mood: { type: "json", container: "atmosphere", key: "mood" },
  timeOfDay: { type: "json", container: "atmosphere", key: "timeOfDay" },
  weather: { type: "json", container: "atmosphere", key: "weather" },
  setting: { type: "json", container: "atmosphere", key: "setting" },
  location: { type: "json", container: "atmosphere", key: "location" },
  style: { type: "json", container: "atmosphere", key: "style" },
  elements: { type: "json", container: "atmosphere", key: "elements" },
  colors: { type: "json", container: "atmosphere", key: "colors" },
  lighting: { type: "json", container: "atmosphere", key: "lighting" },

  atmosphere: { type: "json", container: "config", key: "atmosphere" },
  camera: { type: "json", container: "config", key: "camera" },
  props: { type: "json", container: "config", key: "props" },

  tags: { type: "json", container: "config", key: "tags" },
  relatedCharacters: { type: "json", container: "config", key: "relatedCharacters" },
};

// ============= 解析辅助函数（内部使用，不导出） =============

/** 解析时间戳字段（number 秒 / string 秒 / undefined），失败时回退到 fallback */
function parseTimestamp(raw: unknown, fallback: number): number {
  if (typeof raw === "number") return raw * 1000;
  if (typeof raw === "string") {
    const n = parseInt(raw, 10);
    return Number.isNaN(n) ? fallback : n * 1000;
  }
  return fallback;
}

/** 解析可选时间戳字段，缺失时返回 undefined */
function parseOptionalTimestamp(raw: unknown): number | undefined {
  if (typeof raw === "number") return raw * 1000;
  return undefined;
}

/** 字符串字段，缺失时返回空字符串 */
function strOr(val: unknown): string {
  return (val as string) || "";
}

/** 可选字符串字段，缺失时返回 undefined */
function optStrOr(val: unknown): string | undefined {
  const s = val as string;
  return s || undefined;
}

/** 数字字段，缺失时返回 0 */
function numOr(val: unknown): number {
  return (val as number) || 0;
}

/** 数组字段，缺失时返回空数组 */
function arrOr<T>(val: unknown): T[] {
  return (val as T[]) || [];
}

/** 从 appearance 容器提取外观字段 */
function buildAppearanceFields(container: unknown): Pick<Scene, "thumbnailPath" | "previewPath" | "generatedImage" | "generatedVideo" | "videoGenerationStatus" | "videoGenerationTaskId" | "imageGenerationPrompt" | "scenePath" | "imageUrl"> {
  if (!container) return {};
  const a = container as Record<string, unknown>;
  return {
    thumbnailPath: a.thumbnailPath as string | undefined,
    previewPath: a.previewPath as string | undefined,
    generatedImage: a.generatedImage as string | undefined,
    generatedVideo: a.generatedVideo as string | undefined,
    videoGenerationStatus: a.videoGenerationStatus as "pending" | "generating" | "completed" | "failed" | undefined,
    videoGenerationTaskId: a.videoGenerationTaskId as string | undefined,
    imageGenerationPrompt: a.imageGenerationPrompt as string | undefined,
    scenePath: a.scenePath as string | undefined,
    imageUrl: a.imageUrl as string | undefined,
  };
}

/** 从 atmosphere 容器提取氛围字段 */
function buildAtmosphereFields(container: unknown): Pick<Scene, "mood" | "timeOfDay" | "weather" | "lighting" | "elements" | "colors"> {
  if (!container) return { mood: "", timeOfDay: "", weather: "", lighting: "", elements: [], colors: [] };
  const a = container as Record<string, unknown>;
  return {
    mood: strOr(a.mood),
    timeOfDay: strOr(a.timeOfDay),
    weather: strOr(a.weather),
    lighting: strOr(a.lighting),
    elements: arrOr<string>(a.elements),
    colors: arrOr<string>(a.colors),
  };
}

/** 从 generation 容器提取生成字段 */
function buildGenerationFields(container: unknown): Pick<Scene, "prompt" | "generationPrompt" | "generationParams"> {
  if (!container) return { prompt: "" };
  const g = container as Record<string, unknown>;
  return {
    prompt: strOr(g.prompt),
    generationPrompt: g.generationPrompt as string | undefined,
    generationParams: g.generationParams as Record<string, unknown> | undefined,
  };
}

/** 从 config 容器提取配置字段 */
function buildConfigFields(container: unknown): Pick<Scene, "atmosphere" | "camera" | "tags"> {
  if (!container) return {};
  const c = container as Record<string, unknown>;
  return {
    atmosphere: c.atmosphere as string | undefined,
    camera: c.camera as Record<string, unknown> | undefined,
    tags: c.tags as string[] | undefined,
  };
}

function parseScene(record: Record<string, unknown>): Scene {
  const now = Date.now();
  return {
    id: record.id as string,
    name: strOr(record.name),
    description: strOr(record.description),
    type: strOr(record.type),
    refImagePath: optStrOr(record.ref_image_path),
    source: optStrOr(record.source),
    useCount: numOr(record.use_count),
    lastUsedAt: parseOptionalTimestamp(record.last_used_at),
    createdAt: parseTimestamp(record.created_at, now).toString(),
    updatedAt: parseTimestamp(record.updated_at, now).toString(),
    ...buildAppearanceFields(parseAppearance(record.appearance)),
    ...buildAtmosphereFields(parseAtmosphere(record.atmosphere)),
    ...buildGenerationFields(parseGeneration(record.generation)),
    ...buildConfigFields(parseConfig(record.config)),
  };
}

export const sceneStorage = {
  async getScenes<T = Scene>(): Promise<T[]> {
    const result = await safeQuery<Record<string, unknown>>(
      "SELECT * FROM scenes ORDER BY updated_at DESC LIMIT 500",
    );
    return result.map((record) => parseScene(record)) as T[];
  },

  async getSceneById<T = Scene>(id: string): Promise<T | null> {
    const result = await safeQuery<Record<string, unknown>>(
      "SELECT * FROM scenes WHERE id = ?",
      [id],
    );
    return result.length > 0 ? (parseScene(result[0]!) as T) : null;
  },

  async getSceneVersion(id: string): Promise<number | null> {
    const result = await safeQuery<{ version: number }>(
      "SELECT version FROM scenes WHERE id = ?",
      [id],
    );
    return result.length > 0 ? result[0]!.version : null;
  },

  async createScene(scene: Partial<Scene>): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    const id = scene.id || `scene_${crypto.randomUUID()}`;

    const baseColumns = ["id", "owner_id", "created_at", "updated_at"];
    const baseValues = [id, 1, scene.createdAt
      ? (typeof scene.createdAt === "number"
        ? Math.floor(scene.createdAt / 1000)
        : Math.floor(new Date(scene.createdAt).getTime() / 1000))
      : now,
      now,
    ];

    const { sql, params } = buildInsertFromTargets(
      "scenes",
      scene as Record<string, unknown>,
      SCENE_FIELD_TARGETS,
      baseColumns,
      baseValues,
    );

    await safeTransaction([{ sql, params }]);
    try {
      await trackChange("scene", id, "insert");
    } catch (e) { errorLogger.warn("[Storage] trackChange failed for scene:insert", e); }
  },

  async updateScene(id: string, scene: Partial<Scene>, version?: number): Promise<void> {
    const now = Math.floor(Date.now() / 1000);

    const existing = await safeQuery<{ id: string; version: number }>(
      "SELECT id, version FROM scenes WHERE id = ?",
      [id],
    );
    if (existing.length === 0) {
      throw new Error(`Scene not found for update: id="${id}"`);
    }
    if (version !== undefined && existing[0]!.version !== version) {
      throw new VersionConflictError("scenes", id, version);
    }

    const { sql: setSql, params: setParams } = buildUpdateSets(
      scene as Record<string, unknown>,
      SCENE_FIELD_TARGETS,
    );

    if (setParams.length === 0) {
      const versionSet = version !== undefined ? ", version = version + 1" : "";
      await safeRun(
        `UPDATE scenes SET updated_at = ?${versionSet} WHERE id = ?`,
        [now, id],
      );
    } else {
      const versionSet = version !== undefined ? ", version = version + 1" : "";
      const fullSql = `UPDATE scenes SET ${setSql}, updated_at = ?${versionSet} WHERE id = ?`;
      const allParams = [...setParams, now, id];
      const placeholderCount = (fullSql.match(/\?/g) || []).length;
      if (placeholderCount !== allParams.length) {
        errorLogger.error(
          `[Storage] Parameter mismatch in updateScene: SQL has ${placeholderCount} placeholders but ${allParams.length} params. SQL: ${fullSql}`,
        );
      }
      await safeRun(fullSql, allParams);
    }

    try {
      await trackChange("scene", id, "update");
    } catch (e) { errorLogger.warn("[Storage] trackChange failed for scene:update", e); }
  },

  async deleteScene(id: string): Promise<void> {
    await safeTransaction([
      {
        sql: "DELETE FROM collection_assets WHERE asset_id = ? AND asset_type = 'scene'",
        params: [id],
      },
      {
        sql: "DELETE FROM asset_tags WHERE asset_id = ? AND asset_type = 'scene'",
        params: [id],
      },
      {
        sql: "UPDATE media_assets SET bound_to_type = NULL, bound_to_id = NULL, bound_to_name = NULL WHERE bound_to_id = ? AND bound_to_type = 'scene'",
        params: [id],
      },
      { sql: "DELETE FROM scenes WHERE id = ?", params: [id] },
    ]);
    try {
      await trackChange("scene", id, "delete");
    } catch (e) { errorLogger.warn("[Storage] trackChange failed for scene:delete", e); }
  },

  async incrementSceneUseCount(id: string): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    await safeRun(
      "UPDATE scenes SET use_count = use_count + 1, last_used_at = ? WHERE id = ?",
      [now, id],
    );
    try {
      await trackChange("scene", id, "update");
    } catch (e) { errorLogger.warn("[Storage] trackChange failed for scene:incrementUseCount", e); }
  },
};
