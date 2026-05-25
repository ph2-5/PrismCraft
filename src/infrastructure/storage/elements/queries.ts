import { safeQuery } from "../sqlite-core";
import { errorLogger } from "@/shared/error-logger";
import type {
  StoryElement,
  ElementLibrary,
  ElementType,
  AssetBinding,
} from "@/domain/schemas";

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
  let characterConfig: StoryElement["characterConfig"] | undefined;
  let sceneConfig: StoryElement["sceneConfig"] | undefined;
  let featureAnchor: StoryElement["featureAnchor"] | undefined;
  let referenceImageQuality:
    | StoryElement["referenceImageQuality"]
    | undefined;
  let bindings: AssetBinding[] = [];
  try {
    if (row.character_config_json) {
      characterConfig = JSON.parse(row.character_config_json);
    }
  } catch {
    errorLogger.warn(
      "[Elements] Failed to parse character_config_json for",
      row.id,
    );
  }
  try {
    if (row.scene_config_json) {
      sceneConfig = JSON.parse(row.scene_config_json);
    }
  } catch {
    errorLogger.warn(
      "[Elements] Failed to parse scene_config_json for",
      row.id,
    );
  }
  try {
    if (row.feature_anchor_json) {
      featureAnchor = JSON.parse(row.feature_anchor_json);
    }
  } catch {
    errorLogger.warn(
      "[Elements] Failed to parse feature_anchor_json for",
      row.id,
    );
  }
  try {
    if (row.reference_image_quality_json) {
      referenceImageQuality = JSON.parse(row.reference_image_quality_json);
    }
  } catch {
    errorLogger.warn(
      "[Elements] Failed to parse reference_image_quality_json for",
      row.id,
    );
  }
  try {
    if (row.bindings_json) {
      bindings = JSON.parse(row.bindings_json);
    }
  } catch (e) {
    errorLogger.warn(`[Elements] Failed to parse bindings_json for ${row.id}: ${e instanceof Error ? e.message : String(e)}`);
  }
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
      const num = parseInt(match[1], 10);
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

  return parseElementRow(rows[0]);
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
