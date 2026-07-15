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

type AppearanceContainer = ReturnType<typeof parseAppearance>;
type GenerationContainer = ReturnType<typeof parseGeneration>;
type ConfigContainer = ReturnType<typeof parseConfig>;
type MetaContainer = ReturnType<typeof parseMeta>;

function strOr(value: unknown, defaultValue = ""): string {
  return String(value || defaultValue);
}

function optStrOr(value: unknown): string | undefined {
  return value ? String(value) : undefined;
}

function optNumOr(value: unknown): number | undefined {
  return value !== undefined && value !== null ? Number(value) : undefined;
}

function optTsOr(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "number") return new Date(value * 1000).toISOString();
  return String(value);
}

function buildAppearanceFields(container: AppearanceContainer): Pick<Character, "avatarPath" | "thumbnailPath" | "previewPath" | "generatedImage" | "generatedVideo" | "videoGenerationStatus" | "videoGenerationTaskId" | "imageGenerationPrompt"> {
  return {
    avatarPath: optStrOr(container.avatarPath),
    thumbnailPath: optStrOr(container.thumbnailPath),
    previewPath: optStrOr(container.previewPath),
    generatedImage: optStrOr(container.generatedImage),
    generatedVideo: optStrOr(container.generatedVideo),
    videoGenerationStatus: normalizeVideoGenStatus(container.videoGenerationStatus),
    videoGenerationTaskId: optStrOr(container.videoGenerationTaskId),
    imageGenerationPrompt: optStrOr(container.imageGenerationPrompt),
  };
}

function buildConfigFields(container: ConfigContainer): Pick<Character, "appearance" | "personality" | "traits"> {
  return {
    appearance: (container.appearance && typeof container.appearance === "object"
      ? container.appearance
      : { hairColor: "", hairStyle: "", eyeColor: "", height: "", build: "", clothing: "" }) as Character["appearance"],
    personality: (Array.isArray(container.personality) ? container.personality : []) as string[],
    traits: (Array.isArray(container.traits) ? container.traits : undefined) as string[] | undefined,
  };
}

function buildGenerationFields(container: GenerationContainer): Pick<Character, "prompt" | "generationPrompt" | "generationParams"> {
  return {
    prompt: strOr(container.prompt),
    generationPrompt: optStrOr(container.generationPrompt),
    generationParams: (typeof container.generationParams === "object" && container.generationParams !== null
      ? container.generationParams
      : undefined) as Record<string, unknown> | undefined,
  };
}

function buildMetaFields(container: MetaContainer): Pick<Character, "tags"> {
  return {
    tags: (Array.isArray(container.tags) ? container.tags : undefined) as string[] | undefined,
  };
}

function buildTimestampFields(parsed: Record<string, unknown>): Pick<Character, "createdAt" | "updatedAt" | "lastUsedAt"> {
  return {
    createdAt: optTsOr(parsed.created_at),
    updatedAt: optTsOr(parsed.updated_at),
    lastUsedAt: optTsOr(parsed.last_used_at),
  };
}

export function parseCharacter(record: Record<string, unknown>): Character {
  const parsed = parseRecordWithTable(record, "characters");

  return {
    id: strOr(parsed.id),
    name: strOr(parsed.name),
    description: strOr(parsed.description),
    gender: strOr(parsed.gender, "unknown"),
    age: optNumOr(parsed.age),
    style: strOr(parsed.style),
    source: strOr(parsed.source, "ai-generated"),
    refImagePath: optStrOr(parsed.ref_image_path),
    useCount: optNumOr(parsed.use_count),
    outfits: undefined as CharacterOutfit[] | undefined,
    ...buildAppearanceFields(parseAppearance(parsed.appearance)),
    ...buildConfigFields(parseConfig(parsed.config)),
    ...buildGenerationFields(parseGeneration(parsed.generation)),
    ...buildMetaFields(parseMeta(parsed.meta)),
    ...buildTimestampFields(parsed),
    version: optNumOr(parsed.version),
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
