import { safeQuery, safeRun, safeTransaction } from "../sqlite-core";
import { parseRecordWithTable } from "../core";
import type { CharacterOutfit } from "@/domain/schemas";

export async function getOutfitsForCharacter(
  characterId: string,
): Promise<CharacterOutfit[]> {
  const rows = await safeQuery<Record<string, unknown>>(
    "SELECT * FROM character_outfits WHERE character_id = ? ORDER BY is_default DESC, created_at ASC",
    [characterId],
  );
  return rows.map(parseOutfitRow);
}

export async function getAllOutfits(): Promise<Map<string, CharacterOutfit[]>> {
  const rows = await safeQuery<Record<string, unknown>>(
    "SELECT * FROM character_outfits ORDER BY is_default DESC, created_at ASC",
  );
  const map = new Map<string, CharacterOutfit[]>();
  for (const row of rows) {
    const parsed = parseRecordWithTable(row, "character_outfits");
    const characterId = String(parsed.character_id || "");
    if (!characterId) continue;
    const outfit = parseOutfitRow(row);
    const list = map.get(characterId);
    if (list) {
      list.push(outfit);
    } else {
      map.set(characterId, [outfit]);
    }
  }
  return map;
}

function parseOutfitRow(row: Record<string, unknown>): CharacterOutfit {
  const parsed = parseRecordWithTable(row, "character_outfits");
  return {
    id: String(parsed.id || ""),
    name: String(parsed.name || ""),
    description: String(parsed.description || ""),
    clothing: String(parsed.clothing || ""),
    accessories: Array.isArray(parsed.accessories_json)
      ? parsed.accessories_json
      : typeof parsed.accessories_json === "string"
        ? (() => {
            try {
              return JSON.parse(parsed.accessories_json);
            } catch {
              return [];
            }
          })()
        : [],
    imageUrl: parsed.image_url ? String(parsed.image_url) : undefined,
    localImagePath: parsed.local_image_path
      ? String(parsed.local_image_path)
      : undefined,
    thumbnailPath: parsed.thumbnail_path
      ? String(parsed.thumbnail_path)
      : undefined,
    isDefault: !!parsed.is_default,
    createdAt: parsed.created_at
      ? (typeof parsed.created_at === "number"
        ? new Date(parsed.created_at * 1000).toISOString()
        : String(parsed.created_at))
      : new Date().toISOString(),
  };
}

export function buildOutfitStatements(
  characterId: string,
  outfits: CharacterOutfit[],
): { sql: string; params: unknown[] }[] {
  const statements: { sql: string; params: unknown[] }[] = [
    {
      sql: "DELETE FROM character_outfits WHERE character_id = ?",
      params: [characterId],
    },
  ];
  for (const outfit of outfits) {
    statements.push({
      sql: `INSERT OR REPLACE INTO character_outfits (id, character_id, name, description, clothing, accessories_json, image_url, local_image_path, thumbnail_path, is_default, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        outfit.id ||
          `outfit_${crypto.randomUUID()}`,
        characterId,
        outfit.name || "",
        outfit.description || "",
        outfit.clothing || "",
        JSON.stringify(outfit.accessories || []),
        outfit.imageUrl || null,
        outfit.localImagePath || null,
        outfit.thumbnailPath || null,
        outfit.isDefault ? 1 : 0,
        outfit.createdAt || new Date().toISOString(),
        new Date().toISOString(),
      ],
    });
  }
  return statements;
}

export async function saveOutfitsForCharacter(
  characterId: string,
  outfits: CharacterOutfit[],
): Promise<void> {
  await safeTransaction(buildOutfitStatements(characterId, outfits));
}

export async function updateOutfitImage(
  outfitId: string,
  imageUrl: string,
  localImagePath?: string,
): Promise<void> {
  const sets = ["image_url = ?", "updated_at = ?"];
  const values: unknown[] = [imageUrl, Math.floor(Date.now() / 1000)];
  if (localImagePath !== undefined) {
    sets.push("local_image_path = ?");
    values.push(localImagePath);
  }
  values.push(outfitId);
  await safeRun(
    `UPDATE character_outfits SET ${sets.join(", ")} WHERE id = ?`,
    values,
  );
}
