import { safeQuery, safeRun, safeTransaction } from "../sqlite-core";
import { toSqlValue, trackChange } from "../core";
import type { StoryElement, ElementType } from "@/domain/schemas";
import { getElement } from "./queries";
import { errorLogger } from "@/shared/error-logger";

export async function createElement(
  type: ElementType,
  name: string,
  description: string = "",
): Promise<StoryElement> {
  const prefixMap: Record<ElementType, string> = {
    character: "CHAR",
    prop: "PROP",
    effect: "EFFECT",
  };
  const prefix = prefixMap[type];
  const now = Math.floor(Date.now() / 1000);
  const id = `${prefix}_${crypto.randomUUID()}`;

  const element: StoryElement = {
    id,
    type,
    name,
    description,
    bindings: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await safeRun(
    `INSERT OR IGNORE INTO elements (id, type, name, description, bindings_json, owner_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, type, name, description || null, "[]", 1, now, now],
  );

  try { 
    await trackChange("element", id, "insert"); 
  } catch (e) { errorLogger.warn("[Storage] trackChange failed for element:insert", e); }
  return element;
}

export async function updateElement(
  elementId: string,
  updates: Partial<StoryElement>,
): Promise<StoryElement> {
  const element = await getElement(elementId);
  if (!element) throw new Error(`Element ${elementId} not found`);

  const now = Math.floor(Date.now() / 1000);
  const merged = {
    ...element,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  const result = await safeRun(
    `UPDATE elements SET
      name = ?,
      description = ?,
      character_config_json = ?,
      scene_config_json = ?,
      feature_anchor_json = ?,
      reference_image_quality_json = ?,
      bindings_json = ?,
      updated_at = ?
    WHERE id = ?`,
    [
      merged.name,
      merged.description || null,
      toSqlValue(merged.characterConfig),
      toSqlValue(merged.sceneConfig),
      toSqlValue(merged.featureAnchor),
      toSqlValue(merged.referenceImageQuality),
      toSqlValue(merged.bindings),
      now,
      elementId,
    ],
  );
  const updateResult = result;
  if (!updateResult || updateResult.changes === 0) {
    const existing = await safeQuery<{ id: string }>(
      "SELECT id FROM elements WHERE id = ?",
      [elementId],
    );
    if (existing.length === 0) {
      throw new Error(`Element not found for update: id="${elementId}"`);
    }
  }

  try {
    await trackChange("element", elementId, "update");
  } catch (e) { errorLogger.warn("[Storage] trackChange failed for element:update", e); }

  return merged;
}

export async function deleteElement(elementId: string): Promise<void> {
  await safeTransaction([
    {
      sql: "DELETE FROM story_elements WHERE element_id = ?",
      params: [elementId],
    },
    { sql: "DELETE FROM elements WHERE id = ?", params: [elementId] },
  ]);

  try {
    await trackChange("element", elementId, "delete");
  } catch (e) { errorLogger.warn("[Storage] trackChange failed for element:delete", e); }
}
