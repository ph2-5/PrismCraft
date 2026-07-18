import { useEffect, useMemo, useRef, useState } from "react";
import { useToastHelpers } from "@/shared/presentation/Toast";
import { container } from "@/infrastructure/di";
import { errorLogger } from "@/shared/error-logger";
import { confirm } from "@/shared/utils/confirm";
import { t } from "@/shared/constants/messages";
import type {
  StoryElement,
  ReferenceImageQuality,
  ElementType,
  StoryBeat,
  Character,
  Scene,
  SceneTransition,
} from "@/domain/schemas";
import { validateReferenceImageQuality, buildFeatureAnchoringConfig } from "@/modules/shot";
import type { MinimalAsset } from "./types";
import {
  addSceneTransitionAction,
  removeSceneTransitionAction,
  updateSceneTransitionAction,
  removeElementAction,
  updateBindingAction,
  createNewElementAction,
  updateElementAction,
  imageUploadAction,
  selectAssetAction,
  addCharacterElementAction,
  addSceneElementAction,
  computeAvailableCharacters,
  computeAvailableScenes,
  partitionBoundElements,
} from "./elementBindingActions";

interface UseElementBindingHandlersArgs {
  beat: StoryBeat;
  elements: StoryElement[];
  characters: Character[];
  scenes: Scene[];
  onUpdateBeat: (updatedBeat: StoryBeat) => void;
}

export function useElementBindingHandlers({
  beat,
  elements,
  characters,
  scenes,
  onUpdateBeat,
}: UseElementBindingHandlersArgs) {
  const { error: showError, success: showSuccess } = useToastHelpers();
  const [assetSelectorOpen, setAssetSelectorOpen] = useState(false);
  const [selectingImageForElement, setSelectingImageForElement] = useState<string | null>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [imageQualityMap, setImageQualityMap] = useState<Record<string, ReferenceImageQuality>>({});
  void imageQualityMap;

  const boundElementIds = useMemo(() => beat.elementIds || [], [beat.elementIds]);
  const boundElements = boundElementIds
    .map((id) => elements.find((e) => e.id === id))
    .filter((e): e is StoryElement => !!e);

  const { boundCharacters, boundScenes, boundProps } = partitionBoundElements(boundElements);

  const getElementBinding = (elementId: string) =>
    beat.elementBindings?.[elementId] || {};

  useFeatureAnchoringSync({ boundElementIds, beat, elements, characters, onUpdateBeat });

  const availableCharacters = computeAvailableCharacters(characters, boundElements);
  const availableScenes = computeAvailableScenes(scenes, boundElements);

  const checkImageQuality = async (
    elementId: string,
    imageUrl: string,
    elementType: ElementType,
  ) => {
    const quality = await validateReferenceImageQuality(imageUrl, elementType);
    setImageQualityMap((prev) => ({ ...prev, [elementId]: quality }));
    if (!quality.isValid) {
      const em = await container.elementManager;
      await em.updateElement(elementId, { referenceImageQuality: quality });
    }
  };

  const handleAddFromCharacter = async (character: Character, outfitId?: string) => {
    const newBeat = await addCharacterElementAction({
      beat,
      elements,
      character,
      outfitId,
      onCheckImageQuality: (id, url) => checkImageQuality(id, url, "character"),
    });
    onUpdateBeat(newBeat);
    setShowAddMenu(false);
  };

  const handleAddScene = (scene: Scene) => {
    addSceneElementAction({
      beat,
      elements,
      scene,
      onCheckImageQuality: (id, url) => checkImageQuality(id, url, "scene"),
    })
      .then((newBeat) => {
        if (newBeat) onUpdateBeat(newBeat);
      })
      .catch((err: unknown) => {
        errorLogger.warn("[ElementBindingPanel] 添加场景元素失败", err);
      });
    setShowAddMenu(false);
  };

  const handleAddSceneTransition = (targetSceneId: string) => {
    onUpdateBeat(addSceneTransitionAction(beat, targetSceneId));
  };

  const handleRemoveSceneTransition = async (targetSceneId: string) => {
    // P1-6: 不可逆操作二次确认（场景过渡元数据将丢失）
    const ok = await confirm({
      title: t("element.removeTransitionConfirmTitle"),
      description: t("element.removeTransitionConfirmDesc"),
      variant: "warning",
    });
    if (!ok) return;
    onUpdateBeat(removeSceneTransitionAction(beat, targetSceneId));
  };

  const handleUpdateSceneTransition = (
    targetSceneId: string,
    updates: Partial<SceneTransition>,
  ) => {
    onUpdateBeat(updateSceneTransitionAction(beat, targetSceneId, updates));
  };

  const handleCreateNewElement = async (type: ElementType) => {
    const newBeat = await createNewElementAction(beat, type);
    onUpdateBeat(newBeat);
    setShowAddMenu(false);
  };

  const handleRemoveElement = async (elementId: string) => {
    // P1-6: 不可逆操作二次确认（元素绑定信息将丢失：角色定位、动作、情绪、描述、参考图）
    const ok = await confirm({
      title: t("element.removeConfirmTitle"),
      description: t("element.removeConfirmDesc"),
      variant: "warning",
    });
    if (!ok) return;
    onUpdateBeat(removeElementAction(beat, elementId));
  };

  const handleUpdateElement = async (elementId: string, updates: Partial<StoryElement>) => {
    await updateElementAction(elementId, updates);
  };

  const handleUpdateBinding = (elementId: string, field: string, value: string) => {
    onUpdateBeat(updateBindingAction(beat, elementId, field, value));
  };

  const handleImageUpload = (elementId: string, event: Event) => {
    imageUploadAction({
      elementId,
      event,
      elements,
      showError,
      onUpdateBinding: handleUpdateBinding,
      onUpdateElement: handleUpdateElement,
      onCheckImageQuality: (id, url, type) => checkImageQuality(id, url, type),
    });
  };

  const handleSelectFromAssetLibrary = (elementId: string) => {
    setSelectingImageForElement(elementId);
    setAssetSelectorOpen(true);
  };

  const handleSelectAsset = (asset: MinimalAsset) => {
    selectAssetAction({
      asset,
      selectingImageForElement,
      elements,
      onUpdateBinding: handleUpdateBinding,
      onUpdateElement: handleUpdateElement,
      onCheckImageQuality: (id, url, type) => checkImageQuality(id, url, type),
      showSuccess,
      onClose: () => {
        setAssetSelectorOpen(false);
        setSelectingImageForElement(null);
      },
    });
  };

  return {
    state: {
      assetSelectorOpen,
      showAddMenu,
      boundCharacters,
      boundScenes,
      boundProps,
      availableCharacters,
      availableScenes,
    },
    setters: {
      setAssetSelectorOpen,
      setShowAddMenu,
    },
    getters: {
      getElementBinding,
    },
    handlers: {
      handleAddFromCharacter,
      handleAddScene,
      handleAddSceneTransition,
      handleRemoveSceneTransition,
      handleUpdateSceneTransition,
      handleCreateNewElement,
      handleRemoveElement,
      handleUpdateElement,
      handleUpdateBinding,
      handleImageUpload,
      handleSelectFromAssetLibrary,
      handleSelectAsset,
    },
  };
}

interface FeatureAnchoringSyncArgs {
  boundElementIds: string[];
  beat: StoryBeat;
  elements: StoryElement[];
  characters: Character[];
  onUpdateBeat: (updatedBeat: StoryBeat) => void;
}

function useFeatureAnchoringSync({
  boundElementIds,
  beat,
  elements,
  characters,
  onUpdateBeat,
}: FeatureAnchoringSyncArgs) {
  const prevBoundElementIdsRef = useRef<string>("");
  const prevAnchoringRef = useRef<string>("");
  useEffect(() => {
    const currentIds = boundElementIds.sort().join(",");
    if (boundElementIds.length > 0 && currentIds !== prevBoundElementIdsRef.current) {
      prevBoundElementIdsRef.current = currentIds;
      const config = buildFeatureAnchoringConfig(beat, elements, characters);
      const currentConfig = JSON.stringify(beat.featureAnchoring);
      const newConfig = JSON.stringify(config);
      if (currentConfig !== newConfig && newConfig !== prevAnchoringRef.current) {
        prevAnchoringRef.current = newConfig;
        onUpdateBeat({ ...beat, featureAnchoring: config } as StoryBeat);
      }
    }
  }, [boundElementIds, beat, elements, characters, onUpdateBeat]);
}
