import { parseRecordWithTable } from "../core";
import { errorLogger } from "@/shared/error-logger";
import type { Character, CharacterOutfit } from "@/domain/schemas";
import { getOutfitsForCharacter, getAllOutfits } from "./outfit-manager";
import {
  parseAppearanceContainer as parseAppearance,
  parseGenerationContainer as parseGeneration,
  parseConfigContainer as parseConfig,
  parseMetaContainer as parseMeta,
} from "./json-schemas";

const VALID_VIDEO_GEN_STATUS = new Set(["pending", "generating", "completed", "failed"]);

function normalizeVideoGenStatus(raw: unknown): Character["videoGenerationStatus"] {
  if (raw == null) return undefined;
  const str = String(raw);
  if (str === "processing") return "generating";
  if (VALID_VIDEO_GEN_STATUS.has(str)) return str as Character["videoGenerationStatus"];
  return undefined;
}

export function parseCharacter(record: Record<string, unknown>): Character {
  const parsed = parseRecordWithTable(record, "characters");
  const appearanceContainer = parseAppearance(parsed.appearance);
  const generationContainer = parseGeneration(parsed.generation);
  const configContainer = parseConfig(parsed.config);
  const metaContainer = parseMeta(parsed.meta);

  return {
    id: String(parsed.id || ""),
    name: String(parsed.name || ""),
    description: String(parsed.description || ""),
    gender: String(parsed.gender || "unknown"),
    age:
      parsed.age !== null && parsed.age !== undefined
        ? Number(parsed.age)
        : undefined,
    style: String(parsed.style || ""),
    appearance: (configContainer.appearance && typeof configContainer.appearance === "object"
      ? configContainer.appearance
      : {
          hairColor: "",
          hairStyle: "",
          eyeColor: "",
          height: "",
          build: "",
          clothing: "",
        }) as Character["appearance"],
    personality: (Array.isArray(configContainer.personality)
      ? configContainer.personality
      : []) as string[],
    traits: (Array.isArray(configContainer.traits)
      ? configContainer.traits
      : undefined) as string[] | undefined,
    prompt: String(generationContainer.prompt || ""),
    source: String(parsed.source || "ai-generated"),
    avatarPath: appearanceContainer.avatarPath ? String(appearanceContainer.avatarPath) : undefined,
    refImagePath: parsed.ref_image_path
      ? String(parsed.ref_image_path)
      : undefined,
    thumbnailPath: appearanceContainer.thumbnailPath ? String(appearanceContainer.thumbnailPath) : undefined,
    previewPath: appearanceContainer.previewPath ? String(appearanceContainer.previewPath) : undefined,
    generatedImage: appearanceContainer.generatedImage ? String(appearanceContainer.generatedImage) : undefined,
    generatedVideo: appearanceContainer.generatedVideo ? String(appearanceContainer.generatedVideo) : undefined,
    videoGenerationStatus: normalizeVideoGenStatus(appearanceContainer.videoGenerationStatus),
    videoGenerationTaskId: appearanceContainer.videoGenerationTaskId
      ? String(appearanceContainer.videoGenerationTaskId)
      : undefined,
    imageGenerationPrompt: appearanceContainer.imageGenerationPrompt
      ? String(appearanceContainer.imageGenerationPrompt)
      : undefined,
    generationPrompt: generationContainer.generationPrompt
      ? String(generationContainer.generationPrompt)
      : undefined,
    generationParams: (typeof generationContainer.generationParams === "object" &&
    generationContainer.generationParams !== null
      ? generationContainer.generationParams
      : undefined) as Record<string, unknown> | undefined,
    useCount:
      parsed.use_count !== undefined ? Number(parsed.use_count) : undefined,
    lastUsedAt:
      parsed.last_used_at !== undefined
        ? (typeof parsed.last_used_at === "number"
          ? new Date(parsed.last_used_at * 1000).toISOString()
          : String(parsed.last_used_at))
        : undefined,
    tags: (Array.isArray(metaContainer.tags) ? metaContainer.tags : undefined) as
      | string[]
      | undefined,
    outfits: undefined as CharacterOutfit[] | undefined,
    createdAt: parsed.created_at
      ? (typeof parsed.created_at === "number"
        ? new Date(parsed.created_at * 1000).toISOString()
        : String(parsed.created_at))
      : undefined,
    updatedAt: parsed.updated_at
      ? (typeof parsed.updated_at === "number"
        ? new Date(parsed.updated_at * 1000).toISOString()
        : String(parsed.updated_at))
      : undefined,
  };
}

export async function parseCharacterWithOutfits(
  record: Record<string, unknown>,
): Promise<Character> {
  const char = parseCharacter(record);
  try {
    char.outfits = await getOutfitsForCharacter(char.id);
  } catch (e) {
    errorLogger.warn(`[CharacterStorage] Failed to get outfits for character ${char.id}: ${e instanceof Error ? e.message : String(e)}`);
    const metaContainer = parseMeta(record.meta);
    if (metaContainer.outfits) {
      try {
        char.outfits = Array.isArray(metaContainer.outfits)
          ? metaContainer.outfits as CharacterOutfit[]
          : typeof metaContainer.outfits === "string"
            ? JSON.parse(metaContainer.outfits)
            : undefined;
      } catch (parseError) {
        errorLogger.warn(
          `[CharacterStorage] Failed to parse outfits for character ${char.id}: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
        );
      }
    }
  }
  return char;
}

export async function parseCharactersWithOutfits(
  records: Record<string, unknown>[],
): Promise<Character[]> {
  let outfitsMap: Map<string, CharacterOutfit[]>;
  try {
    outfitsMap = await getAllOutfits();
  } catch (e) {
    errorLogger.warn(`[CharacterStorage] Failed to batch-fetch outfits: ${e instanceof Error ? e.message : String(e)}`);
    outfitsMap = new Map();
  }

  return records.map((record) => {
    const char = parseCharacter(record);
    const outfits = outfitsMap.get(char.id);
    if (outfits) {
      char.outfits = outfits;
    } else {
      const metaContainer = parseMeta(record.meta);
      if (metaContainer.outfits) {
        try {
          char.outfits = Array.isArray(metaContainer.outfits)
            ? metaContainer.outfits as CharacterOutfit[]
            : typeof metaContainer.outfits === "string"
              ? JSON.parse(metaContainer.outfits)
              : undefined;
        } catch (e) {
          errorLogger.warn("[CharacterParser] outfits JSON 解析失败", e);
          char.outfits = undefined;
        }
      }
    }
    return char;
  });
}
