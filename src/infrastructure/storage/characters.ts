import { safeQuery, safeRun, safeTransaction } from "./sqlite-core";
import { trackChange, buildInsertFromTargets, buildUpdateSets } from "./core";
import type { Character } from "@/domain/schemas";
import type { FieldTarget } from "./core";
import {
  buildOutfitStatements,
  getOutfitsForCharacter,
  saveOutfitsForCharacter,
  updateOutfitImage,
} from "./characters/outfit-manager";
import { parseCharacterWithOutfits } from "./characters/parser";
import { errorLogger } from "@/shared/error-logger";

const CHARACTER_FIELD_TARGETS: Record<string, FieldTarget> = {
  name: { type: "fixed", column: "name" },
  description: { type: "fixed", column: "description" },
  refImagePath: { type: "fixed", column: "ref_image_path" },
  gender: { type: "fixed", column: "gender" },
  age: { type: "fixed", column: "age" },
  style: { type: "fixed", column: "style" },
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

  prompt: { type: "json", container: "generation", key: "prompt" },
  generationPrompt: { type: "json", container: "generation", key: "generationPrompt" },
  generationParams: { type: "json", container: "generation", key: "generationParams" },

  personality: { type: "json", container: "config", key: "personality" },
  traits: { type: "json", container: "config", key: "traits" },
  appearance: { type: "json", container: "config", key: "appearance" },

  tags: { type: "json", container: "meta", key: "tags" },
  outfits: { type: "json", container: "meta", key: "outfits" },
};

export const characterStorage = {
  async getCharacters<T = Character>(): Promise<T[]> {
    const result = await safeQuery<Record<string, unknown>>(
      "SELECT * FROM characters ORDER BY updated_at DESC",
    );
    const characters: Character[] = [];
    for (const record of result) {
      characters.push(await parseCharacterWithOutfits(record));
    }
    return characters as T[];
  },

  async getCharacterById<T = Character>(id: string): Promise<T | null> {
    const result = await safeQuery<Record<string, unknown>>(
      "SELECT * FROM characters WHERE id = ?",
      [id],
    );
    return result.length > 0
      ? ((await parseCharacterWithOutfits(result[0])) as T)
      : null;
  },

  async createCharacter(character: Partial<Character>): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    const id = character.id || `char_${crypto.randomUUID()}`;

    const baseColumns = ["id", "owner_id", "created_at", "updated_at"];
    const baseValues = [id, 1, character.createdAt
      ? (typeof character.createdAt === "number"
        ? Math.floor(character.createdAt / 1000)
        : Math.floor(new Date(character.createdAt).getTime() / 1000))
      : now,
      now,
    ];

    const { sql, params } = buildInsertFromTargets(
      "characters",
      character as Record<string, unknown>,
      CHARACTER_FIELD_TARGETS,
      baseColumns,
      baseValues,
    );

    const allStatements: { sql: string; params: unknown[] }[] = [{ sql, params }];
    if (character.outfits && character.outfits.length > 0) {
      allStatements.push(...buildOutfitStatements(id, character.outfits));
    }
    await safeTransaction(allStatements);
    try {
      await trackChange("character", id, "insert");
    } catch (e) { errorLogger.warn("[Storage] trackChange failed for character:insert", e); }
  },

  async updateCharacter(
    id: string,
    character: Partial<Character>,
  ): Promise<void> {
    const now = Math.floor(Date.now() / 1000);

    const existing = await safeQuery<{ id: string }>(
      "SELECT id FROM characters WHERE id = ?",
      [id],
    );
    if (existing.length === 0) {
      throw new Error(`Character not found for update: id="${id}"`);
    }

    const { sql: setSql, params: setParams } = buildUpdateSets(
      character as Record<string, unknown>,
      CHARACTER_FIELD_TARGETS,
    );

    const allStatements: { sql: string; params: unknown[] }[] = [];

    if (setParams.length === 0) {
      allStatements.push({
        sql: "UPDATE characters SET updated_at = ? WHERE id = ?",
        params: [now, id],
      });
    } else {
      const fullSql = `UPDATE characters SET ${setSql}, updated_at = ? WHERE id = ?`;
      const allParams = [...setParams, now, id];
      const placeholderCount = (fullSql.match(/\?/g) || []).length;
      if (placeholderCount !== allParams.length) {
        errorLogger.error(
          `[Storage] Parameter mismatch in updateCharacter: SQL has ${placeholderCount} placeholders but ${allParams.length} params. SQL: ${fullSql}`,
        );
      }
      allStatements.push({ sql: fullSql, params: allParams });
    }

    if (character.outfits !== undefined) {
      allStatements.push(...buildOutfitStatements(id, character.outfits));
    }

    await safeTransaction(allStatements);

    try {
      await trackChange("character", id, "update");
    } catch (e) { errorLogger.warn("[Storage] trackChange failed for character:update", e); }
  },

  async deleteCharacter(id: string): Promise<void> {
    const affectedBeats = await safeQuery<{ id: string; character_ids_json: string }>(
      "SELECT id, character_ids_json FROM story_beats WHERE character_ids_json IS NOT NULL",
    );
    const beatUpdates: { sql: string; params: unknown[] }[] = [];
    for (const beat of affectedBeats) {
      const ids = beat.character_ids_json.split(",").filter((cid: string) => cid !== id);
      const newValue = ids.length > 0 ? ids.join(",") : null;
      beatUpdates.push({
        sql: "UPDATE story_beats SET character_ids_json = ? WHERE id = ?",
        params: [newValue, beat.id],
      });
    }
    await safeTransaction([
      ...beatUpdates,
      {
        sql: "DELETE FROM collection_assets WHERE asset_id = ? AND asset_type = 'character'",
        params: [id],
      },
      {
        sql: "DELETE FROM story_characters WHERE character_id = ?",
        params: [id],
      },
      {
        sql: "DELETE FROM asset_tags WHERE asset_id = ? AND asset_type = 'character'",
        params: [id],
      },
      {
        sql: "DELETE FROM character_outfits WHERE character_id = ?",
        params: [id],
      },
      {
        sql: "UPDATE media_assets SET bound_to_type = NULL, bound_to_id = NULL, bound_to_name = NULL WHERE bound_to_id = ? AND bound_to_type = 'character'",
        params: [id],
      },
      { sql: "DELETE FROM characters WHERE id = ?", params: [id] },
    ]);
    try {
      await trackChange("character", id, "delete");
    } catch (e) { errorLogger.warn("[Storage] trackChange failed for character:delete", e); }
  },

  async incrementCharacterUseCount(id: string): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    await safeRun(
      "UPDATE characters SET use_count = use_count + 1, last_used_at = ? WHERE id = ?",
      [now, id],
    );
    try {
      await trackChange("character", id, "update");
    } catch (e) { errorLogger.warn("[Storage] trackChange failed for character:incrementUseCount", e); }
  },
};

export { getOutfitsForCharacter, saveOutfitsForCharacter, updateOutfitImage };
