import type { Character, StoryBeat, StoryElement, ElementBinding } from "@/domain/schemas";

function isValidRefUrl(url: string | undefined): url is string {
  if (!url) return false;
  return /^https?:\/\//.test(url) || /^vcache:\/\//.test(url) || /^\//.test(url) || /^data:/.test(url);
}

function resolveElementBindingImage(
  characterId: string,
  elements: StoryElement[] | undefined,
  elementBindings?: Record<string, ElementBinding>,
): string | undefined {
  if (elementBindings) {
    const beatBinding = elementBindings[characterId];
    if (beatBinding?.imageUrl && isValidRefUrl(beatBinding.imageUrl)) {
      return beatBinding.imageUrl;
    }
  }

  if (!elements) return undefined;
  const element = elements.find(
    (el) => el.type === "character" && el.id === characterId,
  );
  if (!element) return undefined;

  const primaryBinding = element.bindings?.find((b) => b.isPrimary && b.type === "image");
  const primaryBindingUrl = primaryBinding?.url;
  if (isValidRefUrl(primaryBindingUrl)) return primaryBindingUrl;

  const firstImageBinding = element.bindings?.find((b) => b.type === "image");
  const firstImageBindingUrl = firstImageBinding?.url;
  if (isValidRefUrl(firstImageBindingUrl)) return firstImageBindingUrl;

  const featureAnchorUrl = element.featureAnchor?.referenceImageUrl;
  if (isValidRefUrl(featureAnchorUrl)) return featureAnchorUrl;

  return undefined;
}

export function resolveCharacterRef(
  character: Character,
  beat?: StoryBeat | null,
  elements?: StoryElement[],
): string | undefined {
  const outfitId = beat?.characterOutfits?.[character.id];
  if (outfitId) {
    const outfit = character.outfits?.find((o) => o.id === outfitId);
    if (isValidRefUrl(outfit?.imageUrl)) return outfit.imageUrl;
  }

  const elementImage = resolveElementBindingImage(character.id, elements, beat?.elementBindings);
  if (elementImage) return elementImage;

  const candidates = [character.avatarPath, character.generatedImage, character.refImagePath];
  return candidates.find((url) => isValidRefUrl(url));
}

export function resolveCharacterRefs(
  characterIds: string[],
  characters: Character[],
  beat?: StoryBeat | null,
  elements?: StoryElement[],
): string[] {
  const refs: string[] = [];
  for (const cid of characterIds) {
    const char = characters.find(c => c.id === cid);
    if (!char) continue;
    const ref = resolveCharacterRef(char, beat, elements);
    if (ref) refs.push(ref);
  }
  return refs;
}

export function resolveSceneRef(
  scene: { refImagePath?: string; scenePath?: string; generatedImage?: string; imageUrl?: string },
): string | undefined {
  const candidates = [scene.refImagePath, scene.scenePath, scene.generatedImage, scene.imageUrl];
  return candidates.find((url) => isValidRefUrl(url));
}
