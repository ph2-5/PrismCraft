import type { Result } from "@/domain/types";
import { fromAsyncThrowable, err, ValidationError } from "@/domain/types";
import { safeQuery, safeTransaction } from "@/shared/db-core";
import { errorLogger } from "@/shared/error-logger";
import { z } from "zod";
import { t } from "@/shared/constants";

export interface AssetExportService {
  exportCharacters: (characterIds: string[]) => Promise<Result<Uint8Array>>;
  exportScenes: (sceneIds: string[]) => Promise<Result<Uint8Array>>;
  exportStoryboards: (storyboardIds: string[]) => Promise<Result<Uint8Array>>;
  exportCollections: (collectionIds: string[]) => Promise<Result<Uint8Array>>;
  importFromFile: (file: File, importMode?: string) => Promise<Result<ImportResult>>;
}

export interface ImportResult {
  imported: number;
  errors: string[];
}

const asaCharacterRowSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(""),
  ref_image_path: z.string().nullable().optional(),
  avatar_path: z.string().nullable().optional(),
  thumbnail_path: z.string().nullable().optional(),
  preview_path: z.string().nullable().optional(),
  generated_image: z.string().nullable().optional(),
  created_at: z.string().default(() => new Date().toISOString()),
  updated_at: z.string().default(() => new Date().toISOString()),
});

const asaOutfitRowSchema = z.object({
  id: z.string().min(1),
  character_id: z.string().min(1),
  name: z.string().default(""),
  image_url: z.string().nullable().optional(),
  local_image_path: z.string().nullable().optional(),
  created_at: z.string().default(() => new Date().toISOString()),
});

const asaSceneRowSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(""),
  ref_image_path: z.string().nullable().optional(),
  generated_image: z.string().nullable().optional(),
  created_at: z.string().default(() => new Date().toISOString()),
  updated_at: z.string().default(() => new Date().toISOString()),
});

const asaStoryboardRowSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(""),
  created_at: z.string().default(() => new Date().toISOString()),
  updated_at: z.string().default(() => new Date().toISOString()),
});

const asaBeatRowSchema = z.object({
  id: z.string().min(1),
  story_id: z.string().min(1),
  title: z.string().default(""),
  content: z.string().default(""),
  order: z.number().default(0),
  duration: z.number().default(5),
  created_at: z.string().default(() => new Date().toISOString()),
});

const asaCollectionRowSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(""),
  created_at: z.string().default(() => new Date().toISOString()),
  updated_at: z.string().default(() => new Date().toISOString()),
});

const asaFileSchema = z.discriminatedUnion("format", [
  z.object({
    format: z.literal("asa-characters"),
    version: z.number(),
    exportedAt: z.string(),
    characters: z.array(asaCharacterRowSchema),
    outfits: z.array(asaOutfitRowSchema).optional().default([]),
  }),
  z.object({
    format: z.literal("asa-scenes"),
    version: z.number(),
    exportedAt: z.string(),
    scenes: z.array(asaSceneRowSchema),
  }),
  z.object({
    format: z.literal("asa-storyboards"),
    version: z.number(),
    exportedAt: z.string(),
    storyboards: z.array(asaStoryboardRowSchema),
    beats: z.array(asaBeatRowSchema).optional().default([]),
  }),
  z.object({
    format: z.literal("asa-collections"),
    version: z.number(),
    exportedAt: z.string(),
    collections: z.array(asaCollectionRowSchema),
  }),
]);

export async function exportCharacters(
  characterIds: string[],
): Promise<Result<Uint8Array>> {
  return fromAsyncThrowable(async () => {
    const characters = [];
    for (const id of characterIds) {
      const rows = await safeQuery(
        "SELECT * FROM characters WHERE id = ?",
        [id],
      );
      if (rows.length > 0) {
        characters.push(rows[0]);
      }
    }

    const outfits = [];
    for (const id of characterIds) {
      const rows = await safeQuery(
        "SELECT * FROM character_outfits WHERE character_id = ?",
        [id],
      );
      outfits.push(...rows);
    }

    const data = {
      format: "asa-characters" as const,
      version: 1,
      exportedAt: new Date().toISOString(),
      characters,
      outfits,
    };

    const encoder = new TextEncoder();
    return encoder.encode(JSON.stringify(data, null, 2));
  });
}

export async function exportScenes(
  sceneIds: string[],
): Promise<Result<Uint8Array>> {
  return fromAsyncThrowable(async () => {
    const scenes = [];
    for (const id of sceneIds) {
      const rows = await safeQuery(
        "SELECT * FROM scenes WHERE id = ?",
        [id],
      );
      if (rows.length > 0) {
        scenes.push(rows[0]);
      }
    }

    const data = {
      format: "asa-scenes" as const,
      version: 1,
      exportedAt: new Date().toISOString(),
      scenes,
    };

    const encoder = new TextEncoder();
    return encoder.encode(JSON.stringify(data, null, 2));
  });
}

export async function exportStoryboards(
  storyboardIds: string[],
): Promise<Result<Uint8Array>> {
  return fromAsyncThrowable(async () => {
    const storyboards = [];
    const beats = [];

    for (const id of storyboardIds) {
      const rows = await safeQuery(
        "SELECT * FROM stories WHERE id = ?",
        [id],
      );
      if (rows.length > 0) {
        storyboards.push(rows[0]);
      }

      const beatRows = await safeQuery(
        'SELECT * FROM story_beats WHERE story_id = ? ORDER BY "order"',
        [id],
      );
      beats.push(...beatRows);
    }

    const data = {
      format: "asa-storyboards" as const,
      version: 1,
      exportedAt: new Date().toISOString(),
      storyboards,
      beats,
    };

    const encoder = new TextEncoder();
    return encoder.encode(JSON.stringify(data, null, 2));
  });
}

export async function exportCollections(
  collectionIds: string[],
): Promise<Result<Uint8Array>> {
  return fromAsyncThrowable(async () => {
    const collections = [];
    for (const id of collectionIds) {
      const rows = await safeQuery(
        "SELECT * FROM asset_collections WHERE id = ?",
        [id],
      );
      if (rows.length > 0) {
        collections.push(rows[0]);
      }
    }

    const data = {
      format: "asa-collections" as const,
      version: 1,
      exportedAt: new Date().toISOString(),
      collections,
    };

    const encoder = new TextEncoder();
    return encoder.encode(JSON.stringify(data, null, 2));
  });
}

export async function importFromFile(
  file: File,
  _importMode?: string,
): Promise<Result<ImportResult>> {
  const text = await file.text();

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    errorLogger.warn("[AsaExport] Failed to parse import file as JSON", e as Error);
    return err(new ValidationError(t("error.invalidJsonFile")));
  }

  const validated = asaFileSchema.safeParse(parsed);
  if (!validated.success) {
    const messages = validated.error.issues.map(
      (i) => `${i.path.join(".")}: ${i.message}`,
    );
    return err(new ValidationError(t("error.dataValidationFailed") + ": " + messages.slice(0, 5).join("; ")));
  }

  const data = validated.data;

  switch (data.format) {
    case "asa-characters":
      return importCharacters(data);
    case "asa-scenes":
      return importScenes(data);
    case "asa-storyboards":
      return importStoryboards(data);
    case "asa-collections":
      return importCollections(data);
  }
}

async function importCharacters(
  data: z.infer<typeof asaFileSchema> & { format: "asa-characters" },
): Promise<Result<ImportResult>> {
  return fromAsyncThrowable(async () => {
    const statements: Array<{ sql: string; params: unknown[] }> = [];

    for (const char of data.characters) {
      statements.push({
        sql: "INSERT OR REPLACE INTO characters (id, name, description, ref_image_path, avatar_path, thumbnail_path, preview_path, generated_image, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        params: [
          char.id, char.name, char.description,
          char.ref_image_path ?? null, char.avatar_path ?? null,
          char.thumbnail_path ?? null, char.preview_path ?? null,
          char.generated_image ?? null, char.created_at, char.updated_at,
        ],
      });
    }

    for (const outfit of data.outfits) {
      statements.push({
        sql: "INSERT OR REPLACE INTO character_outfits (id, character_id, name, image_url, local_image_path, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        params: [
          outfit.id, outfit.character_id, outfit.name,
          outfit.image_url ?? null, outfit.local_image_path ?? null,
          outfit.created_at,
        ],
      });
    }

    await safeTransaction(statements);
    return { imported: data.characters.length, errors: [] };
  });
}

async function importScenes(
  data: z.infer<typeof asaFileSchema> & { format: "asa-scenes" },
): Promise<Result<ImportResult>> {
  return fromAsyncThrowable(async () => {
    const statements: Array<{ sql: string; params: unknown[] }> = [];

    for (const scene of data.scenes) {
      statements.push({
        sql: "INSERT OR REPLACE INTO scenes (id, name, description, ref_image_path, generated_image, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        params: [
          scene.id, scene.name, scene.description,
          scene.ref_image_path ?? null, scene.generated_image ?? null,
          scene.created_at, scene.updated_at,
        ],
      });
    }

    await safeTransaction(statements);
    return { imported: data.scenes.length, errors: [] };
  });
}

async function importStoryboards(
  data: z.infer<typeof asaFileSchema> & { format: "asa-storyboards" },
): Promise<Result<ImportResult>> {
  return fromAsyncThrowable(async () => {
    const statements: Array<{ sql: string; params: unknown[] }> = [];

    for (const sb of data.storyboards) {
      statements.push({
        sql: "INSERT OR REPLACE INTO stories (id, title, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        params: [sb.id, sb.title, sb.description, sb.created_at, sb.updated_at],
      });
    }

    for (const beat of data.beats) {
      statements.push({
        sql: 'INSERT OR REPLACE INTO story_beats (id, story_id, title, content, "order", duration, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        params: [beat.id, beat.story_id, beat.title, beat.content, beat.order, beat.duration, beat.created_at],
      });
    }

    await safeTransaction(statements);
    return { imported: data.storyboards.length, errors: [] };
  });
}

async function importCollections(
  data: z.infer<typeof asaFileSchema> & { format: "asa-collections" },
): Promise<Result<ImportResult>> {
  return fromAsyncThrowable(async () => {
    const statements: Array<{ sql: string; params: unknown[] }> = [];

    for (const col of data.collections) {
      statements.push({
        sql: "INSERT OR REPLACE INTO asset_collections (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        params: [col.id, col.name, col.description, col.created_at, col.updated_at],
      });
    }

    await safeTransaction(statements);
    return { imported: data.collections.length, errors: [] };
  });
}

export const assetExportService: AssetExportService = {
  exportCharacters,
  exportScenes,
  exportStoryboards,
  exportCollections,
  importFromFile,
};
