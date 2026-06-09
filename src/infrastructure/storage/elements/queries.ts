import { safeQuery } from "../sqlite-core";
import type {
  StoryElement,
  ElementLibrary,
  ElementType,
} from "@/domain/schemas";
import {
  parseCharacterConfig,
  parseSceneConfig,
  parseFeatureAnchor,
  parseReferenceImageQuality,
  parseBindings,
} from "./json-schemas";

type ElementRow = {
  id: string;
  type: string;
  name: string;
  description: string | null;
  character_config_json: string | null;
  scene_config_json: string | null;
  feature_anchor_json: string | null;
  reference_image_quality_json: string | null;
  bindings_json: string | null;
  created_at: number;
  updated_at: number;
};

function parseElementRow(row: ElementRow): StoryElement {
  const characterConfig = parseCharacterConfig(row.character_config_json);
  const sceneConfig = parseSceneConfig(row.scene_config_json);
  const featureAnchor = parseFeatureAnchor(row.feature_anchor_json);
  const referenceImageQuality = parseReferenceImageQuality(row.reference_image_quality_json);
  const bindings = parseBindings(row.bindings_json);

  return {
    id: row.id,
    type: row.type as ElementType,
    name: row.name,
    description: row.description ?? "",
    characterConfig,
    sceneConfig,
    featureAnchor,
    referenceImageQuality,
    bindings,
    createdAt: new Date(row.created_at * 1000).toISOString(),
    updatedAt: new Date(row.updated_at * 1000).toISOString(),
  };
}

export async function getLibrary(): Promise<ElementLibrary> {
  const rows = await safeQuery<ElementRow>(
    "SELECT * FROM elements ORDER BY created_at DESC",
  );

  const elements: StoryElement[] = rows.map(parseElementRow);

  const nextCode = { character: 1, prop: 1, effect: 1 };
  for (const element of elements) {
    const match = element.id.match(/_(\d+)$/);
    if (match) {
      const num = parseInt(match[1]!, 10);
      const type = element.type;
      if (num >= nextCode[type]) {
        nextCode[type] = num + 1;
      }
    }
  }

  return { elements, nextCode };
}

export async function getElement(
  elementId: string,
): Promise<StoryElement | undefined> {
  const rows = await safeQuery<ElementRow>(
    "SELECT * FROM elements WHERE id = ?",
    [elementId],
  );

  if (rows.length === 0) return undefined;

  return parseElementRow(rows[0]!);
}

export async function getAllElements(): Promise<StoryElement[]> {
  const library = await getLibrary();
  return library.elements;
}

export async function getElementsByType(
  type: ElementType,
): Promise<StoryElement[]> {
  const rows = await safeQuery<ElementRow>(
    "SELECT * FROM elements WHERE type = ? ORDER BY created_at DESC",
    [type],
  );

  return rows.map(parseElementRow);
}
