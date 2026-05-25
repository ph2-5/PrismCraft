import type { Result } from "@/domain/types";
import { DatabaseError, fromAsyncThrowable } from "@/domain/types";
import type { Character, CreateCharacterInput, UpdateCharacterInput } from "@/domain/schemas";
import { characterSchema } from "@/domain/schemas";
import { safeQuery, safeRun, safeTransaction } from "@/infrastructure/storage/sqlite-core";
import { parseRecord, toSqlValue, trackChange } from "@/infrastructure/storage/core";
import { errorLogger } from "@/shared/error-logger";

const VALID_VIDEO_GEN_STATUS = new Set(["pending", "generating", "completed", "failed"]);

function normalizeVideoGenStatus(raw: unknown): Character["videoGenerationStatus"] {
  if (raw == null) return undefined;
  const str = String(raw);
  if (str === "processing") return "generating";
  if (VALID_VIDEO_GEN_STATUS.has(str)) return str as Character["videoGenerationStatus"];
  return undefined;
}

function rowToCharacter(row: Record<string, unknown>): Character {
  const parsed = parseRecord(row, "characters");
  const appearanceContainer = (parsed.appearance ?? {}) as Record<string, unknown>;
  const generationContainer = (parsed.generation ?? {}) as Record<string, unknown>;
  const metaContainer = (parsed.meta ?? {}) as Record<string, unknown>;

  const {
    avatarPath, thumbnailPath, previewPath,
    personality, traits, outfits,
    ...appearanceFields
  } = appearanceContainer;

  return characterSchema.parse({
    id: parsed.id,
    name: parsed.name,
    description: parsed.description ?? "",
    gender: parsed.gender ?? "",
    age: parsed.age ?? undefined,
    style: parsed.style ?? "",
    personality: personality ?? [],
    appearance: appearanceFields,
    outfits: outfits ?? [],
    prompt: generationContainer.prompt ?? "",
    imageGenerationPrompt: generationContainer.imageGenerationPrompt,
    generatedImage: generationContainer.generatedImage,
    refImagePath: parsed.ref_image_path,
    generatedVideo: generationContainer.generatedVideo,
    videoGenerationStatus: normalizeVideoGenStatus(generationContainer.videoGenerationStatus),
    videoGenerationTaskId: generationContainer.videoGenerationTaskId,
    updatedAt: parsed.updated_at,
    traits: traits ?? [],
    avatarPath: avatarPath,
    thumbnailPath: thumbnailPath,
    previewPath: previewPath,
    source: parsed.source,
    tags: metaContainer.tags ?? [],
    generationPrompt: generationContainer.generationPrompt,
    generationParams: generationContainer.generationParams,
    useCount: parsed.use_count ?? 0,
    lastUsedAt: parsed.last_used_at,
    createdAt: parsed.created_at,
  });
}

export const characterRepository = {
  async findAll(): Promise<Result<Character[]>> {
    return fromAsyncThrowable(async () => {
      const rows = await safeQuery<Record<string, unknown>>(
        "SELECT * FROM characters WHERE is_deleted = 0 ORDER BY updated_at DESC",
      );
      return rows.map(rowToCharacter);
    });
  },

  async findById(id: string): Promise<Result<Character | null>> {
    return fromAsyncThrowable(async () => {
      const rows = await safeQuery<Record<string, unknown>>(
        "SELECT * FROM characters WHERE id = ? AND is_deleted = 0",
        [id],
      );
      if (rows.length === 0) return null;
      return rowToCharacter(rows[0]);
    });
  },

  async create(input: CreateCharacterInput & { id: string }): Promise<Result<Character>> {
    return fromAsyncThrowable(async () => {
      const id = input.id;
      const now = Math.floor(Date.now() / 1000);

      const appearanceContainer: Record<string, unknown> = {
        ...(input.appearance ?? {}),
        avatarPath: input.avatarPath ?? null,
        thumbnailPath: input.thumbnailPath ?? null,
        previewPath: input.previewPath ?? null,
        personality: input.personality ?? [],
        traits: input.traits ?? [],
        outfits: input.outfits ?? [],
      };

      const generationContainer: Record<string, unknown> = {
        prompt: input.prompt ?? "",
        imageGenerationPrompt: input.imageGenerationPrompt ?? null,
      };

      const metaContainer: Record<string, unknown> = {
        tags: input.tags ?? [],
      };

      await safeRun(
        `INSERT OR IGNORE INTO characters (id, name, description, gender, age, style, ref_image_path, appearance, generation, meta, use_count, last_used_at, created_at, updated_at, is_deleted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [
          id, input.name, input.description ?? "", input.gender ?? "", input.age ?? null, input.style ?? "",
          input.refImagePath ?? null,
          JSON.stringify(appearanceContainer), JSON.stringify(generationContainer), JSON.stringify(metaContainer),
          0, null, now, now,
        ],
      );

      try { await trackChange("character", id, "insert"); } catch (e) { errorLogger.warn("[Storage] trackChange failed for character:insert", e); }
      const result = await this.findById(id);
      if (!result.ok) throw result.error;
      if (!result.value) throw new DatabaseError("Failed to create character");
      return result.value;
    });
  },

  async update(id: string, input: UpdateCharacterInput): Promise<Result<void>> {
    return fromAsyncThrowable(async () => {
      const fields: string[] = [];
      const values: unknown[] = [];

      const flatFieldMap: Record<string, string> = {
        name: "name",
        description: "description",
        gender: "gender",
        age: "age",
        style: "style",
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
      const hasAppearanceUpdate = inputRec.appearance !== undefined || inputRec.avatarPath !== undefined || inputRec.thumbnailPath !== undefined || inputRec.previewPath !== undefined || inputRec.personality !== undefined || inputRec.traits !== undefined || inputRec.outfits !== undefined;
      const hasGenerationUpdate = inputRec.prompt !== undefined || inputRec.imageGenerationPrompt !== undefined || inputRec.generatedImage !== undefined || inputRec.generatedVideo !== undefined || inputRec.videoGenerationStatus !== undefined || inputRec.videoGenerationTaskId !== undefined || inputRec.generationPrompt !== undefined || inputRec.generationParams !== undefined;
      const hasMetaUpdate = inputRec.tags !== undefined;

      if (hasAppearanceUpdate || hasGenerationUpdate || hasMetaUpdate) {
        const rows = await safeQuery<Record<string, unknown>>(
          "SELECT appearance, generation, meta FROM characters WHERE id = ?",
          [id],
        );
        if (rows.length > 0) {
          const current = parseRecord(rows[0], "characters");

          if (hasAppearanceUpdate) {
            const currentAppearance = (current.appearance ?? {}) as Record<string, unknown>;
            const merged = { ...currentAppearance };
            if (inputRec.appearance !== undefined) Object.assign(merged, inputRec.appearance as Record<string, unknown>);
            if (inputRec.avatarPath !== undefined) merged.avatarPath = inputRec.avatarPath;
            if (inputRec.thumbnailPath !== undefined) merged.thumbnailPath = inputRec.thumbnailPath;
            if (inputRec.previewPath !== undefined) merged.previewPath = inputRec.previewPath;
            if (inputRec.personality !== undefined) merged.personality = inputRec.personality;
            if (inputRec.traits !== undefined) merged.traits = inputRec.traits;
            if (inputRec.outfits !== undefined) merged.outfits = inputRec.outfits;
            fields.push("appearance = ?");
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

          if (hasMetaUpdate) {
            const currentMeta = (current.meta ?? {}) as Record<string, unknown>;
            const merged = { ...currentMeta };
            if (inputRec.tags !== undefined) merged.tags = inputRec.tags;
            fields.push("meta = ?");
            values.push(JSON.stringify(merged));
          }
        }
      }

      if (fields.length === 0) return;

      fields.push("updated_at = ?");
      values.push(Math.floor(Date.now() / 1000));
      values.push(id);

      await safeRun(
        `UPDATE characters SET ${fields.join(", ")} WHERE id = ?`,
        values,
      );

      try { await trackChange("character", id, "update"); } catch (e) { errorLogger.warn("[Storage] trackChange failed for character:update", e); }
    });
  },

  async delete(id: string): Promise<Result<void>> {
    return fromAsyncThrowable(async () => {
      await safeTransaction([
        { sql: "UPDATE characters SET is_deleted = 1, updated_at = ? WHERE id = ?", params: [Math.floor(Date.now() / 1000), id] },
        { sql: "DELETE FROM story_characters WHERE character_id = ?", params: [id] },
      ]);
      try { await trackChange("character", id, "delete"); } catch (e) { errorLogger.warn("[Storage] trackChange failed for character:delete", e); }
    });
  },

  async count(): Promise<Result<number>> {
    return fromAsyncThrowable(async () => {
      const rows = await safeQuery<{ count: number }>(
        "SELECT COUNT(*) as count FROM characters WHERE is_deleted = 0",
      );
      return rows[0]?.count ?? 0;
    });
  },
};
