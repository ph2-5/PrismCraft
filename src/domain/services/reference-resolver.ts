import type { Character } from "@/domain/schemas";
import type { StoryBeat } from "@/domain/schemas";

function isValidRefUrl(url: string | undefined): url is string {
  if (!url) return false;
  return /^https?:\/\//.test(url) || /^vcache:\/\//.test(url) || /^\//.test(url) || /^data:/.test(url);
}

export function resolveCharacterRef(
  character: Character,
  beat?: StoryBeat | null,
): string | undefined {
  const outfitId = beat?.characterOutfits?.[character.id];
  if (outfitId) {
    const outfit = character.outfits?.find((o) => o.id === outfitId);
    if (isValidRefUrl(outfit?.imageUrl)) return outfit.imageUrl;
  }
  const candidates = [character.avatarPath, character.generatedImage, character.refImagePath];
  return candidates.find((url) => isValidRefUrl(url));
}

export function resolveSceneRef(
  scene: { refImagePath?: string; scenePath?: string; generatedImage?: string; imageUrl?: string },
): string | undefined {
  const candidates = [scene.refImagePath, scene.scenePath, scene.generatedImage, scene.imageUrl];
  return candidates.find((url) => isValidRefUrl(url));
}
