import { safeQuery, safeRun, safeTransaction } from "../sqlite-core";
import { toSqlValue, trackChange } from "../core";
import type { StoryElement, ElementType } from "@/domain/schemas";
import { getElement } from "./queries";
import { errorLogger } from "@/shared/error-logger";
import { VersionConflictError } from "@/shared/errors/version-conflict";
import { NotFoundError } from "@/domain/types/result";

export async function createElement(
  type: ElementType,
  name: string,
  description: string = "",
): Promise<StoryElement> {
  const prefixMap: Record<ElementType, string> = {
    character: "CHAR",
    prop: "PROP",
    effect: "EFFECT",
    scene: "SCENE",
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
  version?: number,
): Promise<StoryElement> {
  const element = await getElement(elementId);
  if (!element) throw new NotFoundError("Element", elementId);

  if (version !== undefined) {
    const existing = await safeQuery<{ id: string; version: number }>(
      "SELECT id, version FROM elements WHERE id = ?",
      [elementId],
    );
    if (existing.length > 0 && existing[0]!.version !== version) {
      throw new VersionConflictError("elements", elementId, version);
    }
  }

  const now = Math.floor(Date.now() / 1000);
  const merged = {
    ...element,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  const versionSet = version !== undefined ? ", version = version + 1" : "";
  const result = await safeRun(
    `UPDATE elements SET
      name = ?,
      description = ?,
      character_config_json = ?,
      scene_config_json = ?,
      feature_anchor_json = ?,
      reference_image_quality_json = ?,
      bindings_json = ?,
      updated_at = ?${versionSet}
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
    const existing = await safeQuery<{ id: string; version: number }>(
      "SELECT id, version FROM elements WHERE id = ?",
      [elementId],
    );
    if (existing.length === 0) {
      throw new NotFoundError("Element", elementId);
    }
    if (version !== undefined && existing[0]!.version !== version) {
      throw new VersionConflictError("elements", elementId, version);
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
