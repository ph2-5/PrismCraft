import type { Result } from "@/domain/types";
import { fromAsyncThrowable, DatabaseError } from "@/domain/types";
import type { Scene, CreateSceneInput, UpdateSceneInput } from "@/domain/schemas";
import { sceneSchema } from "@/domain/schemas";
import { safeQuery, safeRun, safeTransaction } from "@/infrastructure/storage/sqlite-core";
import { parseRecord, toSqlValue, trackChange } from "@/infrastructure/storage/core";
import { errorLogger } from "@/shared/error-logger";

const VALID_VIDEO_GEN_STATUS = new Set(["pending", "generating", "completed", "failed"]);

function normalizeVideoGenStatus(raw: unknown): Scene["videoGenerationStatus"] {
  if (raw == null) return undefined;
  const str = String(raw);
  if (str === "processing") return "generating";
  if (VALID_VIDEO_GEN_STATUS.has(str)) return str as Scene["videoGenerationStatus"];
  return undefined;
}

function rowToScene(row: Record<string, unknown>): Scene {
  const parsed = parseRecord(row, "scenes");
  const appearanceContainer = (parsed.appearance ?? {}) as Record<string, unknown>;
  const atmosphereContainer = (parsed.atmosphere ?? {}) as Record<string, unknown>;
  const generationContainer = (parsed.generation ?? {}) as Record<string, unknown>;
  const configContainer = (parsed.config ?? {}) as Record<string, unknown>;

  return sceneSchema.parse({
    id: parsed.id,
    name: parsed.name,
    description: parsed.description ?? "",
    type: parsed.type ?? "",
    timeOfDay: atmosphereContainer.timeOfDay ?? "",
    weather: atmosphereContainer.weather ?? "",
    mood: atmosphereContainer.mood ?? "",
    lighting: atmosphereContainer.lighting ?? "",
    elements: atmosphereContainer.elements ?? [],
    colors: atmosphereContainer.colors ?? [],
    prompt: generationContainer.prompt ?? "",
    imageGenerationPrompt: generationContainer.imageGenerationPrompt,
    generatedImage: generationContainer.generatedImage,
    generatedVideo: generationContainer.generatedVideo,
    videoGenerationStatus: normalizeVideoGenStatus(generationContainer.videoGenerationStatus),
    videoGenerationTaskId: generationContainer.videoGenerationTaskId,
    updatedAt: parsed.updated_at,
    camera: configContainer.camera,
    imageUrl: appearanceContainer.imageUrl,
    refImagePath: parsed.ref_image_path,
    thumbnailPath: appearanceContainer.thumbnailPath,
    previewPath: appearanceContainer.previewPath,
    atmosphere: atmosphereContainer.atmosphere ?? atmosphereContainer.mood,
    source: parsed.source,
    tags: configContainer.tags ?? [],
    createdAt: parsed.created_at,
    generationPrompt: generationContainer.generationPrompt,
    generationParams: generationContainer.generationParams,
    useCount: parsed.use_count ?? 0,
    lastUsedAt: parsed.last_used_at,
  });
}

export const sceneRepository = {
  async findAll(): Promise<Result<Scene[]>> {
    return fromAsyncThrowable(async () => {
      const rows = await safeQuery<Record<string, unknown>>(
        "SELECT * FROM scenes WHERE is_deleted = 0 ORDER BY updated_at DESC",
      );
      return rows.map(rowToScene);
    });
  },

  async findById(id: string): Promise<Result<Scene | null>> {
    return fromAsyncThrowable(async () => {
      const rows = await safeQuery<Record<string, unknown>>(
        "SELECT * FROM scenes WHERE id = ? AND is_deleted = 0",
        [id],
      );
      if (rows.length === 0) return null;
      return rowToScene(rows[0]);
    });
  },

  async create(input: CreateSceneInput & { id: string }): Promise<Result<Scene>> {
    return fromAsyncThrowable(async () => {
      const now = Math.floor(Date.now() / 1000);

      const appearanceContainer: Record<string, unknown> = {
        imageUrl: input.imageUrl ?? null,
        thumbnailPath: input.thumbnailPath ?? null,
        previewPath: input.previewPath ?? null,
      };

      const atmosphereContainer: Record<string, unknown> = {
        timeOfDay: input.timeOfDay ?? "",
        weather: input.weather ?? "",
        mood: input.mood ?? "",
        lighting: input.lighting ?? "",
        atmosphere: input.atmosphere ?? null,
        elements: input.elements ?? [],
        colors: input.colors ?? [],
      };

      const generationContainer: Record<string, unknown> = {
        prompt: input.prompt ?? "",
        imageGenerationPrompt: input.imageGenerationPrompt ?? null,
        generationPrompt: input.generationPrompt ?? null,
        generationParams: input.generationParams ?? null,
      };

      const configContainer: Record<string, unknown> = {
        camera: input.camera ?? null,
        tags: input.tags ?? [],
      };

      await safeRun(
        `INSERT OR IGNORE INTO scenes (id, name, description, type, ref_image_path, source, appearance, atmosphere, generation, config, use_count, last_used_at, created_at, updated_at, is_deleted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [
          input.id, input.name, input.description ?? "", input.type ?? "",
          input.refImagePath ?? null, input.source ?? null,
          JSON.stringify(appearanceContainer), JSON.stringify(atmosphereContainer),
          JSON.stringify(generationContainer), JSON.stringify(configContainer),
          0, null, now, now,
        ],
      );

      try { await trackChange("scene", input.id, "insert"); } catch (e) { errorLogger.warn("[Storage] trackChange failed for scene:insert", e); }
      const result = await this.findById(input.id);
      if (!result.ok) throw result.error;
      if (!result.value) throw new DatabaseError("Failed to create scene");
      return result.value;
    });
  },

  async update(id: string, input: UpdateSceneInput): Promise<Result<void>> {
    return fromAsyncThrowable(async () => {
      const fields: string[] = [];
      const values: unknown[] = [];

      const flatFieldMap: Record<string, string> = {
        name: "name",
        description: "description",
        type: "type",
        refImagePath: "ref_image_path",
        source: "source",
        useCount: "use_count",
        lastUsedAt: "last_used_at",
      };

      for (const [jsKey, sqlKey] of Object.entries(flatFieldMap)) {
        const value = (input as Record<string, unknown>)[jsKey];
        if (value === undefined) continue;
        fields.push(`${sqlKey} = ?`);
        values.push(toSqlValue(value));
      }

      const inputRec = input as Record<string, unknown>;
      const hasAppearanceUpdate = inputRec.imageUrl !== undefined || inputRec.thumbnailPath !== undefined || inputRec.previewPath !== undefined;
      const hasAtmosphereUpdate = inputRec.timeOfDay !== undefined || inputRec.weather !== undefined || inputRec.mood !== undefined || inputRec.lighting !== undefined || inputRec.atmosphere !== undefined || inputRec.elements !== undefined || inputRec.colors !== undefined;
      const hasGenerationUpdate = inputRec.prompt !== undefined || inputRec.imageGenerationPrompt !== undefined || inputRec.generatedImage !== undefined || inputRec.generatedVideo !== undefined || inputRec.videoGenerationStatus !== undefined || inputRec.videoGenerationTaskId !== undefined || inputRec.generationPrompt !== undefined || inputRec.generationParams !== undefined;
      const hasConfigUpdate = inputRec.camera !== undefined || inputRec.tags !== undefined;

      if (hasAppearanceUpdate || hasAtmosphereUpdate || hasGenerationUpdate || hasConfigUpdate) {
        const rows = await safeQuery<Record<string, unknown>>(
          "SELECT appearance, atmosphere, generation, config FROM scenes WHERE id = ?",
          [id],
        );
        if (rows.length > 0) {
          const current = parseRecord(rows[0], "scenes");

          if (hasAppearanceUpdate) {
            const currentAppearance = (current.appearance ?? {}) as Record<string, unknown>;
            const merged = { ...currentAppearance };
            if (inputRec.imageUrl !== undefined) merged.imageUrl = inputRec.imageUrl;
            if (inputRec.thumbnailPath !== undefined) merged.thumbnailPath = inputRec.thumbnailPath;
            if (inputRec.previewPath !== undefined) merged.previewPath = inputRec.previewPath;
            fields.push("appearance = ?");
            values.push(JSON.stringify(merged));
          }

          if (hasAtmosphereUpdate) {
            const currentAtmosphere = (current.atmosphere ?? {}) as Record<string, unknown>;
            const merged = { ...currentAtmosphere };
            if (inputRec.timeOfDay !== undefined) merged.timeOfDay = inputRec.timeOfDay;
            if (inputRec.weather !== undefined) merged.weather = inputRec.weather;
            if (inputRec.mood !== undefined) merged.mood = inputRec.mood;
            if (inputRec.lighting !== undefined) merged.lighting = inputRec.lighting;
            if (inputRec.atmosphere !== undefined) merged.atmosphere = inputRec.atmosphere;
            if (inputRec.elements !== undefined) merged.elements = inputRec.elements;
            if (inputRec.colors !== undefined) merged.colors = inputRec.colors;
            fields.push("atmosphere = ?");
            values.push(JSON.stringify(merged));
          }

          if (hasGenerationUpdate) {
            const currentGeneration = (current.generation ?? {}) as Record<string, unknown>;
            const merged = { ...currentGeneration };
            if (inputRec.prompt !== undefined) merged.prompt = inputRec.prompt;
            if (inputRec.imageGenerationPrompt !== undefined) merged.imageGenerationPrompt = inputRec.imageGenerationPrompt;
            if (inputRec.generatedImage !== undefined) merged.generatedImage = inputRec.generatedImage;
            if (inputRec.generatedVideo !== undefined) merged.generatedVideo = inputRec.generatedVideo;
            if (inputRec.videoGenerationStatus !== undefined) merged.videoGenerationStatus = inputRec.videoGenerationStatus;
            if (inputRec.videoGenerationTaskId !== undefined) merged.videoGenerationTaskId = inputRec.videoGenerationTaskId;
            if (inputRec.generationPrompt !== undefined) merged.generationPrompt = inputRec.generationPrompt;
            if (inputRec.generationParams !== undefined) merged.generationParams = inputRec.generationParams;
            fields.push("generation = ?");
            values.push(JSON.stringify(merged));
          }

          if (hasConfigUpdate) {
            const currentConfig = (current.config ?? {}) as Record<string, unknown>;
            const merged = { ...currentConfig };
            if (inputRec.camera !== undefined) merged.camera = inputRec.camera;
            if (inputRec.tags !== undefined) merged.tags = inputRec.tags;
            fields.push("config = ?");
            values.push(JSON.stringify(merged));
          }
        }
      }

      if (fields.length === 0) return;

      fields.push("updated_at = ?");
      values.push(Math.floor(Date.now() / 1000));
      values.push(id);

      await safeRun(
        `UPDATE scenes SET ${fields.join(", ")} WHERE id = ?`,
        values,
      );

      try { await trackChange("scene", id, "update"); } catch (e) { errorLogger.warn("[Storage] trackChange failed for scene:update", e); }
    });
  },

  async delete(id: string): Promise<Result<void>> {
    return fromAsyncThrowable(async () => {
      await safeTransaction([
        { sql: "UPDATE scenes SET is_deleted = 1, updated_at = ? WHERE id = ?", params: [Math.floor(Date.now() / 1000), id] },
        { sql: "DELETE FROM story_scenes WHERE scene_id = ?", params: [id] },
      ]);
      try { await trackChange("scene", id, "delete"); } catch (e) { errorLogger.warn("[Storage] trackChange failed for scene:delete", e); }
    });
  },

  async count(): Promise<Result<number>> {
    return fromAsyncThrowable(async () => {
      const rows = await safeQuery<{ count: number }>(
        "SELECT COUNT(*) as count FROM scenes WHERE is_deleted = 0",
      );
      return rows[0]?.count ?? 0;
    });
  },
};
