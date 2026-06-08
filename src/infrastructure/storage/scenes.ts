import { safeQuery, safeRun, safeTransaction } from "./sqlite-core";
import { trackChange, buildInsertFromTargets, buildUpdateSets } from "./core";
import type { Scene } from "@/domain/schemas";
import type { FieldTarget } from "./core";
import { errorLogger } from "@/shared/error-logger";
import { VersionConflictError } from "@/shared/errors/version-conflict";

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

function parseScene(record: Record<string, unknown>): Scene {
  const now = Date.now();
  const safeJsonParse = <T>(raw: unknown): T | undefined => {
    if (!raw) return undefined;
    try { return JSON.parse(raw as string) as T; }
    catch (e) { errorLogger.warn("[SceneStorage] JSON 解析失败", e); return undefined; }
  };

  const appearanceContainer = safeJsonParse<Record<string, unknown>>(record.appearance);
  const atmosphereContainer = safeJsonParse<Record<string, unknown>>(record.atmosphere);
  const generationContainer = safeJsonParse<Record<string, unknown>>(record.generation);
  const configContainer = safeJsonParse<Record<string, unknown>>(record.config);

  const createdAtRaw = record.created_at;
  const updatedAtRaw = record.updated_at;
  const createdAt = typeof createdAtRaw === "number" ? createdAtRaw * 1000 : (typeof createdAtRaw === "string" ? parseInt(createdAtRaw) * 1000 : now);
  const updatedAt = typeof updatedAtRaw === "number" ? updatedAtRaw * 1000 : (typeof updatedAtRaw === "string" ? parseInt(updatedAtRaw) * 1000 : now);

  return {
    id: record.id as string,
    name: (record.name as string) || "",
    description: (record.description as string) || "",
    type: (record.type as string) || "",
    refImagePath: (record.ref_image_path as string) || undefined,
    thumbnailPath: appearanceContainer?.thumbnailPath as string | undefined,
    previewPath: appearanceContainer?.previewPath as string | undefined,
    generatedImage: appearanceContainer?.generatedImage as string | undefined,
    generatedVideo: appearanceContainer?.generatedVideo as string | undefined,
    videoGenerationStatus: appearanceContainer?.videoGenerationStatus as "pending" | "generating" | "completed" | "failed" | undefined,
    videoGenerationTaskId: appearanceContainer?.videoGenerationTaskId as string | undefined,
    imageGenerationPrompt: appearanceContainer?.imageGenerationPrompt as string | undefined,
    scenePath: appearanceContainer?.scenePath as string | undefined,
    imageUrl: appearanceContainer?.imageUrl as string | undefined,
    mood: (atmosphereContainer?.mood as string) || "",
    timeOfDay: (atmosphereContainer?.timeOfDay as string) || "",
    weather: (atmosphereContainer?.weather as string) || "",
    source: (record.source as string) || undefined,
    useCount: (record.use_count as number) || 0,
    lastUsedAt: record.last_used_at ? (typeof record.last_used_at === "number" ? record.last_used_at * 1000 : undefined) : undefined,
    createdAt: createdAt.toString(),
    updatedAt: updatedAt.toString(),
    prompt: generationContainer?.prompt as string || "",
    generationPrompt: generationContainer?.generationPrompt as string | undefined,
    generationParams: generationContainer?.generationParams as Record<string, unknown> | undefined,
    atmosphere: configContainer?.atmosphere as string | undefined,
    lighting: (atmosphereContainer?.lighting as string) || "",
    camera: configContainer?.camera as Record<string, unknown> | undefined,
    tags: configContainer?.tags as string[] | undefined,
    elements: (atmosphereContainer?.elements as string[]) || [],
    colors: (atmosphereContainer?.colors as string[]) || [],
  };
}

export const sceneStorage = {
  async getScenes<T = Scene>(): Promise<T[]> {
    const result = await safeQuery<Record<string, unknown>>(
      "SELECT * FROM scenes ORDER BY updated_at DESC",
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
