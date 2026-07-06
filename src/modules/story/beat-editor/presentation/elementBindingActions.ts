import { container } from "@/infrastructure/di";
import { t } from "@/shared/constants";
import type {
  StoryBeat,
  StoryElement,
  SceneTransition,
  ElementType,
  Character,
  Scene,
} from "@/domain/schemas";
import type { MinimalAsset } from "./types";

/**
 * 纯函数工具模块：将 ElementBinding 的状态更新逻辑提取为独立函数，
 * 避免主 Hook 函数过长触发 max-lines-per-function 警告。
 */

export function computeAvailableCharacters(
  characters: Character[],
  boundElements: StoryElement[],
): Character[] {
  return characters.filter(
    (char) =>
      !boundElements.some((el) => el.type === "character" && el.name === char.name),
  );
}

export function computeAvailableScenes(
  scenes: Scene[],
  boundElements: StoryElement[],
): Scene[] {
  return scenes.filter(
    (sc) => !boundElements.some((el) => el.type === "scene" && el.name === sc.name),
  );
}

export function partitionBoundElements(boundElements: StoryElement[]) {
  return {
    boundCharacters: boundElements.filter((e) => e.type === "character"),
    boundScenes: boundElements.filter((e) => e.type === "scene"),
    boundProps: boundElements.filter((e) => e.type === "prop" || e.type === "effect"),
  };
}

export function addSceneTransitionAction(
  beat: StoryBeat,
  targetSceneId: string,
): StoryBeat {
  const transitions = beat.sceneTransitions || [];
  if (transitions.some((tr) => tr.sceneId === targetSceneId)) return beat;
  return { ...beat, sceneTransitions: [...transitions, { sceneId: targetSceneId }] };
}

export function removeSceneTransitionAction(
  beat: StoryBeat,
  targetSceneId: string,
): StoryBeat {
  const transitions = (beat.sceneTransitions || []).filter(
    (tr) => tr.sceneId !== targetSceneId,
  );
  return {
    ...beat,
    sceneTransitions: transitions.length === 0 ? undefined : transitions,
  };
}

export function updateSceneTransitionAction(
  beat: StoryBeat,
  targetSceneId: string,
  updates: Partial<SceneTransition>,
): StoryBeat {
  const transitions = beat.sceneTransitions || [];
  return {
    ...beat,
    sceneTransitions: transitions.map((tr) =>
      tr.sceneId === targetSceneId ? { ...tr, ...updates } : tr,
    ),
  };
}

export function removeElementAction(
  beat: StoryBeat,
  elementId: string,
): StoryBeat {
  const newElementIds = (beat.elementIds || []).filter((id) => id !== elementId);
  const newElementBindings = { ...beat.elementBindings };
  delete newElementBindings[elementId];
  return {
    ...beat,
    elementIds: newElementIds,
    elementBindings: newElementBindings,
  };
}

export function updateBindingAction(
  beat: StoryBeat,
  elementId: string,
  field: string,
  value: string,
): StoryBeat {
  const newElementBindings = { ...beat.elementBindings };
  newElementBindings[elementId] = {
    ...newElementBindings[elementId],
    [field]: value,
  };
  return { ...beat, elementBindings: newElementBindings };
}

export async function createNewElementAction(
  beat: StoryBeat,
  type: ElementType,
): Promise<StoryBeat> {
  const em = await container.elementManager;
  const newElement = await em.createElement(type, t("element.newElementName"), "");
  const newElementIds = [...(beat.elementIds || []), newElement.id];
  const newElementBindings = { ...beat.elementBindings };
  newElementBindings[newElement.id] = {};
  return {
    ...beat,
    elementIds: newElementIds,
    elementBindings: newElementBindings,
  };
}

export async function updateElementAction(
  elementId: string,
  updates: Partial<StoryElement>,
): Promise<void> {
  const em = await container.elementManager;
  await em.updateElement(elementId, updates);
}

export function buildUpdatedImageBindings(
  element: StoryElement,
  url: string,
  name: string,
) {
  const existingBindings = element.bindings || [];
  const hasPrimary = existingBindings.some((b) => b.isPrimary);
  return [
    ...existingBindings,
    {
      type: "image" as const,
      url,
      name,
      uploadedAt: new Date().toISOString(),
      isPrimary: !hasPrimary,
    },
  ];
}

export async function addCharacterElementAction(args: {
  beat: StoryBeat;
  elements: StoryElement[];
  character: Character;
  outfitId?: string;
  onCheckImageQuality: (elementId: string, imageUrl: string) => void;
}): Promise<StoryBeat> {
  const { beat, elements, character, outfitId, onCheckImageQuality } = args;
  const boundElementIds = beat.elementIds || [];
  const existingElement = elements.find(
    (e) => e.type === "character" && e.name === character.name,
  );
  let newElement: StoryElement;
  if (existingElement) {
    newElement = existingElement;
  } else {
    const em = await container.elementManager;
    newElement = await em.createElement(
      "character",
      character.name,
      character.description || character.prompt || "",
    );
    let imageUrl = character.generatedImage;
    if (outfitId && character.outfits) {
      const outfit = character.outfits.find((o) => o.id === outfitId);
      if (outfit?.imageUrl) imageUrl = outfit.imageUrl;
    }
    if (imageUrl) {
      await em.updateElement(newElement.id, {
        bindings: [
          {
            type: "image" as const,
            url: imageUrl,
            name: t("element.refImageName", { name: character.name }),
            uploadedAt: new Date().toISOString(),
            isPrimary: true,
          },
        ],
      });
      onCheckImageQuality(newElement.id, imageUrl);
    }
  }
  const newElementIds = [...boundElementIds, newElement.id];
  const newElementBindings = { ...beat.elementBindings };
  let bindingImageUrl = character.generatedImage;
  if (outfitId && character.outfits) {
    const outfit = character.outfits.find((o) => o.id === outfitId);
    if (outfit?.imageUrl) bindingImageUrl = outfit.imageUrl;
  }
  newElementBindings[newElement.id] = {
    imageUrl: bindingImageUrl,
    text: character.description || character.prompt || "",
    description: character.description || character.prompt || "",
  };
  const newCharacterOutfits = { ...beat.characterOutfits };
  if (outfitId) newCharacterOutfits[character.id] = outfitId;
  return {
    ...beat,
    elementIds: newElementIds,
    elementBindings: newElementBindings,
    characterOutfits: newCharacterOutfits,
  };
}

export async function addSceneElementAction(args: {
  beat: StoryBeat;
  elements: StoryElement[];
  scene: Scene;
  onCheckImageQuality: (elementId: string, imageUrl: string) => void;
}): Promise<StoryBeat | null> {
  const { beat, elements, scene, onCheckImageQuality } = args;
  const boundElementIds = beat.elementIds || [];
  const existingElement = elements.find(
    (e) => e.type === "scene" && e.name === scene.name,
  );
  if (existingElement) {
    const newElementIds = [...boundElementIds, existingElement.id];
    const newElementBindings = { ...beat.elementBindings };
    newElementBindings[existingElement.id] = {
      imageUrl: scene.scenePath || scene.generatedImage,
      text: scene.description || "",
      description: scene.description || "",
    };
    return {
      ...beat,
      elementIds: newElementIds,
      elementBindings: newElementBindings,
      sceneId: scene.id,
    };
  }
  const em = await container.elementManager;
  const newElement = await em.createElement(
    "scene",
    scene.name,
    scene.description || "",
  );
  if (scene.scenePath || scene.generatedImage) {
    await em.updateElement(newElement.id, {
      bindings: [
        {
          type: "image" as const,
          url: scene.scenePath || scene.generatedImage || "",
          name: t("element.refImageName", { name: scene.name }),
          uploadedAt: new Date().toISOString(),
          isPrimary: true,
        },
      ],
    });
    onCheckImageQuality(
      newElement.id,
      scene.scenePath || scene.generatedImage || "",
    );
  }
  const newElementIds = [...boundElementIds, newElement.id];
  const newElementBindings = { ...beat.elementBindings };
  newElementBindings[newElement.id] = {
    imageUrl: scene.scenePath || scene.generatedImage,
    text: scene.description || "",
    description: scene.description || "",
  };
  return {
    ...beat,
    elementIds: newElementIds,
    elementBindings: newElementBindings,
    sceneId: scene.id,
  };
}

export function imageUploadAction(args: {
  elementId: string;
  event: Event;
  elements: StoryElement[];
  showError: (msg: string, title?: string) => void;
  onUpdateBinding: (elementId: string, field: string, value: string) => void;
  onUpdateElement: (elementId: string, updates: Partial<StoryElement>) => Promise<void>;
  onCheckImageQuality: (elementId: string, url: string, type: ElementType) => void;
}): void {
  const { elementId, event, elements, showError, onUpdateBinding, onUpdateElement, onCheckImageQuality } = args;
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;
  const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
  if (file.size > MAX_IMAGE_SIZE) {
    showError(t("error.imageTooLarge"), t("error.imageSizeLimit"));
    return;
  }
  const element = elements.find((el) => el.id === elementId);
  if (!element) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const result = e.target?.result;
    if (typeof result !== "string") {
      showError(t("error.fileReadFailed"));
      return;
    }
    onUpdateBinding(elementId, "imageUrl", result);
    const updatedBindings = buildUpdatedImageBindings(element, result, file.name);
    onUpdateElement(elementId, { bindings: updatedBindings });
    onCheckImageQuality(elementId, result, element.type);
  };
  reader.readAsDataURL(file);
}

export function selectAssetAction(args: {
  asset: MinimalAsset;
  selectingImageForElement: string | null;
  elements: StoryElement[];
  onUpdateBinding: (elementId: string, field: string, value: string) => void;
  onUpdateElement: (elementId: string, updates: Partial<StoryElement>) => Promise<void>;
  onCheckImageQuality: (elementId: string, url: string, type: ElementType) => void;
  showSuccess: (msg: string, title?: string) => void;
  onClose: () => void;
}): boolean {
  const {
    asset,
    selectingImageForElement,
    elements,
    onUpdateBinding,
    onUpdateElement,
    onCheckImageQuality,
    showSuccess,
    onClose,
  } = args;
  if (!selectingImageForElement) return false;
  const element = elements.find((el) => el.id === selectingImageForElement);
  if (!element) return false;
  const url = asset.url || "";
  onUpdateBinding(selectingImageForElement, "imageUrl", url);
  const updatedBindings = buildUpdatedImageBindings(element, url, asset.name);
  onUpdateElement(selectingImageForElement, { bindings: updatedBindings });
  onCheckImageQuality(selectingImageForElement, url, element.type);
  onClose();
  showSuccess(t("common.saved"), t("element.selectFromAssetLibrary"));
  return true;
}
