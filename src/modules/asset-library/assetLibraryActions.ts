import type { Story, AssetLibraryType } from "@/domain/schemas";
import { BLOB_URL_REVOKE_DELAY_MS } from "@/shared/constants";
import type { AssetTab } from "./AssetCardGrid";

/**
 * Convert an active asset tab to its corresponding AssetLibraryType.
 * Returns null for tabs that don't map to a deletable asset type.
 */
export function resolveAssetLibraryType(activeTab: AssetTab): AssetLibraryType | null {
  if (activeTab === "characters") return "character";
  if (activeTab === "scenes") return "scene";
  if (activeTab === "storyboards") return "storyboard";
  return null;
}

/**
 * Trigger a browser download for binary data by creating a temporary blob URL.
 */
export function downloadBinaryAsFile(
  data: Uint8Array,
  filename: string,
  mimeType = "application/json",
): void {
  const blob = new Blob([new Uint8Array(data)], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), BLOB_URL_REVOKE_DELAY_MS);
}

/**
 * Pure transform: remove a character reference from a story.
 */
export function transformStoryAfterCharacterDelete(story: Story, characterId: string): Story {
  return {
    ...story,
    characters: (story.characters || []).filter((cid) => cid !== characterId),
    beats: (story.beats || []).map((beat) => {
      const updated = { ...beat };
      if (updated.characterIds?.includes(characterId)) {
        updated.characterIds = updated.characterIds.filter((cid) => cid !== characterId);
      }
      return updated;
    }),
  };
}

/**
 * Pure transform: remove a scene reference from a story.
 */
export function transformStoryAfterSceneDelete(story: Story, sceneId: string): Story {
  return {
    ...story,
    scenes: (story.scenes || []).filter((sid) => sid !== sceneId),
    beats: (story.beats || []).map((beat) => {
      const updated = { ...beat };
      if (updated.sceneId === sceneId) delete updated.sceneId;
      return updated;
    }),
  };
}

/**
 * Pure check: whether a story references the deleted character.
 */
export function isStoryAffectedByCharacterDelete(story: Story, characterId: string): boolean {
  return (
    story.beats?.some((b) => b.characterIds?.includes(characterId)) ||
    story.characters?.includes(characterId) ||
    false
  );
}

/**
 * Pure check: whether a story references the deleted scene.
 */
export function isStoryAffectedBySceneDelete(story: Story, sceneId: string): boolean {
  return (
    story.beats?.some((b) => b.sceneId === sceneId) ||
    story.scenes?.includes(sceneId) ||
    false
  );
}


