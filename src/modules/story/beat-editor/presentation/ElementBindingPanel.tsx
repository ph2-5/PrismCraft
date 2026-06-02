import { useState, useEffect, useRef, useMemo } from "react";
import { useToastHelpers } from "@/shared/presentation/Toast";
import { container } from "@/infrastructure/di";
import { t } from "@/shared/constants";
import { Plus, Shield } from "lucide-react";
import { Button } from "@/shared/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import type { StoryElement, ReferenceImageQuality, ElementType, StoryBeat, Character, Scene } from "@/domain/schemas";
import { validateReferenceImageQuality, buildFeatureAnchoringConfig } from "@/modules/shot";
import { CharacterBindingSection } from "./CharacterBindingSection";
import { SceneBindingSection } from "./SceneBindingSection";
import { ReferenceBindingSection } from "./ReferenceBindingSection";
import type { MinimalAsset } from "./ReferenceBindingSection";

const elementTypeConfig: Record<string, { label: string; color: string }> = {
  character: { label: t("element.characterLabel"), color: "bg-blue-500" },
  prop: { label: t("element.propLabel"), color: "bg-yellow-500" },
  effect: { label: t("element.effectLabel"), color: "bg-purple-500" },
};

interface ElementBindingPanelProps {
  beat: StoryBeat;
  elements: StoryElement[];
  characters?: Character[];
  scenes?: Scene[];
  assets?: MinimalAsset[];
  onUpdateBeat: (updatedBeat: StoryBeat) => void;
}

export function ElementBindingPanel({
  beat,
  elements,
  characters = [],
  scenes = [],
  assets = [],
  onUpdateBeat,
}: ElementBindingPanelProps) {
  const { error: showError, success: showSuccess } = useToastHelpers();
  const [assetSelectorOpen, setAssetSelectorOpen] = useState(false);
  const [selectingImageForElement, setSelectingImageForElement] = useState<
    string | null
  >(null);
  const boundElementIds = useMemo(
    () => beat.elementIds || [],
    [beat.elementIds],
  );
  const boundElements = boundElementIds
    .map((id) => elements.find((e) => e.id === id))
    .filter((e): e is StoryElement => !!e);

  const [imageQualityMap, setImageQualityMap] = useState<
    Record<string, ReferenceImageQuality>
  >({});

  const getElementBinding = (elementId: string) => {
    return beat.elementBindings?.[elementId] || {};
  };

  const prevBoundElementIdsRef = useRef<string>("");
  const prevAnchoringRef = useRef<string>("");
  useEffect(() => {
    const currentIds = boundElementIds.sort().join(",");
    if (
      boundElementIds.length > 0 &&
      currentIds !== prevBoundElementIdsRef.current
    ) {
      prevBoundElementIdsRef.current = currentIds;
      const config = buildFeatureAnchoringConfig(beat, elements, characters);
      const currentConfig = JSON.stringify(beat.featureAnchoring);
      const newConfig = JSON.stringify(config);
      if (
        currentConfig !== newConfig &&
        newConfig !== prevAnchoringRef.current
      ) {
        prevAnchoringRef.current = newConfig;
        onUpdateBeat({
          ...beat,
          featureAnchoring: config,
        } as StoryBeat);
      }
    }
  }, [boundElementIds, beat, elements, characters, onUpdateBeat]);

  const checkImageQuality = async (
    elementId: string,
    imageUrl: string,
    elementType: ElementType,
  ) => {
    const quality = await validateReferenceImageQuality(imageUrl, elementType);
    setImageQualityMap((prev) => ({ ...prev, [elementId]: quality }));

    if (!quality.isValid) {
      const element = elements.find((e) => e.id === elementId);
      if (element) {
        const em = await container.elementManager;
        await em.updateElement(elementId, {
          referenceImageQuality: quality,
        });
      }
    }
  };

  const handleAddFromCharacter = async (
    character: Character,
    outfitId?: string,
  ) => {
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
        if (outfit?.imageUrl) {
          imageUrl = outfit.imageUrl;
        }
      }

      if (imageUrl) {
        const em2 = await container.elementManager;
        await em2.updateElement(newElement.id, {
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
        checkImageQuality(newElement.id, imageUrl, "character");
      }
    }

    const newElementIds = [...boundElementIds, newElement.id];
    const newElementBindings = { ...beat.elementBindings };
    let bindingImageUrl = character.generatedImage;
    if (outfitId && character.outfits) {
      const outfit = character.outfits.find((o) => o.id === outfitId);
      if (outfit?.imageUrl) {
        bindingImageUrl = outfit.imageUrl;
      }
    }
    newElementBindings[newElement.id] = {
      imageUrl: bindingImageUrl,
      text: character.description || character.prompt || "",
      description: character.description || character.prompt || "",
    };

    const newCharacterOutfits = { ...beat.characterOutfits };
    if (outfitId) {
      newCharacterOutfits[character.id] = outfitId;
    }

    onUpdateBeat({
      ...beat,
      elementIds: newElementIds,
      elementBindings: newElementBindings,
      characterOutfits: newCharacterOutfits,
    });
  };

  const [newElementType, setNewElementType] = useState<ElementType>(
    "character",
  );

  const handleCreateNewElement = async () => {
    const em = await container.elementManager;
    const newElement = await em.createElement(
      newElementType,
      t("element.newElementName"),
      "",
    );

    const newElementIds = [...boundElementIds, newElement.id];
    const newElementBindings = { ...beat.elementBindings };
    newElementBindings[newElement.id] = {};

    onUpdateBeat({
      ...beat,
      elementIds: newElementIds,
      elementBindings: newElementBindings,
    });
  };

  const handleRemoveElement = (elementId: string) => {
    const newElementIds = boundElementIds.filter((id) => id !== elementId);
    const newElementBindings = { ...beat.elementBindings };
    delete newElementBindings[elementId];

    onUpdateBeat({
      ...beat,
      elementIds: newElementIds,
      elementBindings: newElementBindings,
    });
  };

  const handleUpdateElement = async (
    elementId: string,
    updates: Partial<StoryElement>,
  ) => {
    const em = await container.elementManager;
    await em.updateElement(elementId, updates);
  };

  const handleUpdateBinding = (
    elementId: string,
    field: string,
    value: string,
  ) => {
    const newElementBindings = { ...beat.elementBindings };
    newElementBindings[elementId] = {
      ...newElementBindings[elementId],
      [field]: value,
    };

    onUpdateBeat({
      ...beat,
      elementBindings: newElementBindings,
    });
  };

  const handleImageUpload = (
    elementId: string,
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
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
      const imageUrl = e.target?.result as string;

      handleUpdateBinding(elementId, "imageUrl", imageUrl);

      const existingBindings = element.bindings || [];
      const hasPrimary = existingBindings.some((b) => b.isPrimary);
      const updatedBindings = [
        ...existingBindings,
        {
          type: "image" as const,
          url: imageUrl,
          name: file.name,
          uploadedAt: new Date().toISOString(),
          isPrimary: !hasPrimary,
        },
      ];
      handleUpdateElement(elementId, { bindings: updatedBindings });
      checkImageQuality(elementId, imageUrl, element.type);
    };
    reader.readAsDataURL(file);
  };

  const handleSelectFromAssetLibrary = (elementId: string) => {
    setSelectingImageForElement(elementId);
    setAssetSelectorOpen(true);
  };

  const handleSelectAsset = (asset: MinimalAsset) => {
    if (!selectingImageForElement) return;

    const element = elements.find((el) => el.id === selectingImageForElement);
    if (!element) return;

    handleUpdateBinding(selectingImageForElement, "imageUrl", asset.url || "");

    const existingBindings = element.bindings || [];
    const hasPrimary = existingBindings.some((b) => b.isPrimary);
    const updatedBindings = [
      ...existingBindings,
      {
        type: "image" as const,
        url: asset.url || "",
        name: asset.name,
        uploadedAt: new Date().toISOString(),
        isPrimary: !hasPrimary,
      },
    ];
    handleUpdateElement(selectingImageForElement, {
      bindings: updatedBindings,
    });
    checkImageQuality(selectingImageForElement, asset.url || "", element.type);

    setAssetSelectorOpen(false);
    setSelectingImageForElement(null);
    showSuccess(t("common.saved"), t("element.selectFromAssetLibrary"));
  };

  const availableCharacters = characters.filter(
    (char) =>
      !boundElements.some(
        (el) => el.type === "character" && el.name === char.name,
      ),
  );

  return (
    <div className="space-y-4">
      <div className="bg-blue-900/20 border border-blue-700/30 rounded-lg p-3 text-xs text-blue-300">
        <div className="flex items-center gap-2 mb-1">
          <Shield className="w-4 h-4" />
          <span className="font-medium">{t("element.featureAnchoringMode")}</span>
        </div>
        <p>
          {t("element.featureAnchoringDesc")}
        </p>
      </div>

      <div className="flex gap-2">
        <CharacterBindingSection
          characters={characters}
          availableCharacters={availableCharacters}
          onAddFromCharacter={handleAddFromCharacter}
        />

        <Select
          value={newElementType}
          onValueChange={(v) => setNewElementType(v as ElementType)}
        >
          <SelectTrigger className="w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(elementTypeConfig).map(([type, config]) => (
              <SelectItem key={type} value={type}>
                {config.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          onClick={handleCreateNewElement}
          className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500"
        >
          <Plus className="w-4 h-4 mr-2" />
          {t("element.newElement")}
        </Button>
      </div>

      <SceneBindingSection
        scenes={scenes}
        beat={beat}
        onUpdateBeat={onUpdateBeat}
      />

      <ReferenceBindingSection
        boundElements={boundElements}
        beat={beat}
        imageQualityMap={imageQualityMap}
        assets={assets}
        assetSelectorOpen={assetSelectorOpen}
        selectingImageForElement={selectingImageForElement}
        getElementBinding={getElementBinding}
        onUpdateElement={handleUpdateElement}
        onRemoveElement={handleRemoveElement}
        onUpdateBinding={handleUpdateBinding}
        onImageUpload={handleImageUpload}
        onSelectFromAssetLibrary={handleSelectFromAssetLibrary}
        onSelectAsset={handleSelectAsset}
        onAssetSelectorOpenChange={setAssetSelectorOpen}
      />
    </div>
  );
}
