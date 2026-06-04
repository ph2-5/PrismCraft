import { useState, useRef, useEffect, useCallback, Suspense } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useDirtyState } from "@/shared/hooks/use-dirty-state";
import { useCharacters } from "@/modules/character";
import { useStories, storyService } from "@/modules/story";
import { useMediaAssets, useCreateMediaAsset } from "@/modules/asset";
import { characterService } from "@/modules/character";
import { mapUserFacingError } from "@/shared/utils/user-facing-error";
import { resolveImageUrl } from "@/shared/utils/image-url";
import { PageErrorBoundary } from "@/shared/presentation/PageErrorBoundary";
import { DeleteConfirmDialog } from "@/shared/presentation/DeleteConfirmDialog";
import { AssetSelectorDialog } from "@/shared/presentation/AssetSelectorDialog";
import { useToastHelpers } from "@/shared/presentation/Toast";
import { t } from "@/shared/constants/messages";
import { errorLogger } from "@/shared/error-logger";
import { useGlobalKeyboardActions } from "@/shared/hooks/use-global-keyboard-actions";
import { OutfitDialog } from "@/modules/character";
import { MediaExporter } from "@/modules/asset";
import {
  defaultCharacter,
  useCharacterImage,
  useCharacterCRUD,
  useOutfitManagement,
} from "@/modules/character";
import { confirm } from "@/shared/utils/confirm";
import type { Character } from "@/domain/schemas";
import { CharacterList } from "./CharacterList";
import { CharacterEditor } from "./CharacterEditor";
import { CharacterImageSection } from "./CharacterImageSection";

export default function CharactersPage() {
  return (
    <Suspense>
      <CharactersPageContent />
    </Suspense>
  );
}

function CharactersPageContent() {
  const { markDirty, markClean, isDirty } = useDirtyState();
  const queryClient = useQueryClient();
  const createMediaAssetMutation = useCreateMediaAsset();
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get("highlight");

  const { data: characters = [], isLoading: charactersLoading } = useCharacters();
  const { data: stories = [] } = useStories();
  const { data: assets = [], isLoading: _assetsLoading } = useMediaAssets();
  const [showAssetSelector, setShowAssetSelector] = useState(false);
  const [currentCharacter, setCurrentCharacterRaw] =
    useState<Character>(defaultCharacter);
  const setCurrentCharacter = useCallback(
    (update: Character | ((prev: Character) => Character), shouldMarkDirty = false) => {
      setCurrentCharacterRaw(update);
      if (shouldMarkDirty) markDirty("characters");
    },
    [markDirty],
  );
  const currentCharacterRef = useRef(currentCharacter);
  useEffect(() => { currentCharacterRef.current = currentCharacter; }, [currentCharacter]);
  const [customTrait, setCustomTrait] = useState("");
  const [, setCustomStyle] = useState("");
  const { success, error: showError } = useToastHelpers();

  const addAssetToLibrary = async (
    url: string,
    type: "image" | "video",
    name: string,
    boundTo?: { type: "character" | "scene"; id: string; name: string },
  ) => {
    await createMediaAssetMutation.mutateAsync({
      name,
      type,
      url,
      description: "",
      tags: [],
      boundTo,
    });
  };

  const {
    isGenerating,
    setIsGenerating,
    generatedImage,
    setGeneratedImage,
    isUploading,
    isAnalyzing,
    useDetailedPrompt,
    setUseDetailedPrompt,
    imageSize,
    setImageSize,
    fileInputRef,
    analyzeFileInputRef,
    selectedImageModel,
    setSelectedImageModel,
    generatePrompt,
    generateImage,
    saveImageToCharacter,
    handleFileUpload,
    handleAnalyzeFileUpload,
  } = useCharacterImage({
    currentCharacter,
    currentCharacterRef,
    setCurrentCharacter,
    addAssetToLibrary,
    success,
    showError,
  });

  const {
    deleteDialogOpen,
    setDeleteDialogOpen,
    characterToDelete,
    referenceCheck,
    handleSave,
    saveStatus,
    saveError,
    handleDelete,
    performDelete,
    isDeleting,
    addTrait,
    removeTrait,
  } = useCharacterCRUD({
    currentCharacter,
    setCurrentCharacter,
    generatedImage,
    setCustomTrait,
    setCustomStyle,
    setGeneratedImage,
    addAssetToLibrary,
    generatePrompt,
    success,
    showError,
    stories,
    markDirty,
    markClean,
    onUpdateStoriesAfterDelete: async (characterId, storiesList) => {
      const updatedStories = storiesList.map((story) => {
        const updatedBeats = (story.beats || []).map((beat) => {
          const updated = { ...beat };
          if (updated.characterIds?.includes(characterId)) {
            updated.characterIds = updated.characterIds.filter(
              (cid) => cid !== characterId,
            );
          }
          if (updated.characters?.includes(characterId)) {
            updated.characters = updated.characters.filter(
              (cid) => cid !== characterId,
            );
          }
          if (updated.character === characterId) {
            delete updated.character;
          }
          return updated;
        });
        const updatedCharacters = (story.characters || []).filter(
          (cid) => cid !== characterId,
        );
        return { ...story, characters: updatedCharacters, beats: updatedBeats };
      });
      const failedStories: string[] = [];
      for (const updatedStory of updatedStories) {
        const original = storiesList.find((s) => s.id === updatedStory.id);
        const wasAffected =
          original?.characters?.includes(characterId) ||
          original?.beats?.some(
            (b) =>
              b.characterIds?.includes(characterId) ||
              b.characters?.includes(characterId) ||
              b.character === characterId,
          );
        if (wasAffected) {
          try {
            const result = await storyService.update(updatedStory.id, updatedStory);
            if (!result.ok) {
              failedStories.push(updatedStory.title || updatedStory.id.slice(0, 8));
            }
          } catch (e) {
            errorLogger.warn("[Characters] Failed to update story after character deletion", e as Error);
            failedStories.push(updatedStory.title || updatedStory.id.slice(0, 8));
          }
        }
      }
      if (failedStories.length > 0) {
        showError(t("story.partialRefFailed"), t("story.partialRefFailedDetail", { items: failedStories.join("、") }));
      }
    },
  });

  const {
    showOutfitDialog,
    setShowOutfitDialog,
    editingOutfit,
    setEditingOutfit,
    outfitForm,
    setOutfitForm,
    customAccessory,
    setCustomAccessory,
    handleAddOutfit,
    handleDeleteOutfit,
    handleSetDefaultOutfit,
    handleEditOutfit,
    handleGenerateOutfitImage,
    addAccessory,
    removeAccessory,
  } = useOutfitManagement({
    currentCharacter,
    setCurrentCharacter,
    setIsGenerating,
    addAssetToLibrary,
    success,
    showError,
  });

  const handleSaveRef = useRef(handleSave);
  useEffect(() => { handleSaveRef.current = handleSave; }, [handleSave]);

  const handleSelectCharacter = useCallback(
    async (char: Character) => {
      if (
        currentCharacter.id &&
        char.id !== currentCharacter.id &&
        isDirty("characters")
      ) {
        if (
          !(await confirm(
            t("character.unsavedSwitchConfirm"),
            t("character.unsavedChanges"),
          ))
        )
          return;
      }
      setCurrentCharacter(char);
      setGeneratedImage(
        resolveImageUrl(char.avatarPath || char.generatedImage || char.refImagePath) || null,
      );
    },
    [currentCharacter.id, isDirty, setCurrentCharacter, setGeneratedImage],
  );

  const handleDeleteCharacter = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const charId = (e.currentTarget.closest("[data-char-id]") as HTMLElement)?.dataset.charId;
      if (charId) handleDelete(charId);
    },
    [handleDelete],
  );

  useGlobalKeyboardActions({
    onSave: () => handleSaveRef.current(),
  });

  useEffect(() => {
    if (!highlightId || characters.length === 0) return;
    const found = characters.find((c) => c.id === highlightId);
    if (found) {
      setCurrentCharacterRaw(found);
      setGeneratedImage(found.generatedImage || found.refImagePath || null);
    }
  }, [highlightId, characters, setGeneratedImage]);

  const handleCreateNew = useCallback(async () => {
    if (currentCharacter.id && isDirty("characters")) {
      if (
        !(await confirm(
          t("character.unsavedSwitchConfirm"),
          t("character.unsavedChanges"),
        ))
      )
        return;
    }
    setCurrentCharacter(defaultCharacter);
    setCustomTrait("");
    setCustomStyle("");
  }, [currentCharacter.id, isDirty, setCurrentCharacter, setCustomTrait, setCustomStyle]);

  const handleAddOutfitClick = useCallback(() => {
    setEditingOutfit(null);
    setOutfitForm({
      name: "",
      description: "",
      clothing: "",
      accessories: [],
    });
    setShowOutfitDialog(true);
  }, [setEditingOutfit, setOutfitForm, setShowOutfitDialog]);

  return (
    <PageErrorBoundary pageName={t("page.characters")}>
      <div className="h-full flex gap-3">
        <CharacterList
          characters={characters}
          charactersLoading={charactersLoading}
          onSelectCharacter={handleSelectCharacter}
          onDeleteCharacter={handleDeleteCharacter}
          onCreateNew={handleCreateNew}
        />

        <div className="flex-1 min-w-0 border border-border rounded-lg bg-card overflow-hidden">
          <div className="h-full overflow-y-auto">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold">
                {currentCharacter.id ? t("character.editCharacter") : t("character.createNew")}
              </h3>
              <p className="text-xs text-muted-foreground">
                {t("character.allFieldsOptional")}
              </p>
            </div>
            <div className="p-4">
              <CharacterEditor
                currentCharacter={currentCharacter}
                setCurrentCharacter={setCurrentCharacter}
                customTrait={customTrait}
                setCustomTrait={setCustomTrait}
                addTrait={addTrait}
                removeTrait={removeTrait}
                isGenerating={isGenerating}
                onAddOutfit={handleAddOutfitClick}
                onEditOutfit={handleEditOutfit}
                onDeleteOutfit={handleDeleteOutfit}
                onSetDefaultOutfit={handleSetDefaultOutfit}
                onGenerateOutfitImage={handleGenerateOutfitImage}
              />

              <CharacterImageSection
                currentCharacter={currentCharacter}
                generatedImage={generatedImage}
                setGeneratedImage={setGeneratedImage}
                isGenerating={isGenerating}
                isUploading={isUploading}
                isAnalyzing={isAnalyzing}
                useDetailedPrompt={useDetailedPrompt}
                setUseDetailedPrompt={setUseDetailedPrompt}
                imageSize={imageSize}
                setImageSize={setImageSize}
                selectedImageModel={selectedImageModel}
                setSelectedImageModel={setSelectedImageModel}
                generatePrompt={generatePrompt}
                generateImage={generateImage}
                saveImageToCharacter={saveImageToCharacter}
                fileInputRef={fileInputRef}
                analyzeFileInputRef={analyzeFileInputRef}
                handleFileUpload={handleFileUpload}
                handleAnalyzeFileUpload={handleAnalyzeFileUpload}
                setShowAssetSelector={setShowAssetSelector}
                isDirty={isDirty("characters")}
                saveStatus={saveStatus}
                saveError={saveError}
                handleSave={handleSave}
              />
            </div>
          </div>
        </div>
      </div>

      {currentCharacter.id && (
        <MediaExporter type="character" item={currentCharacter} />
      )}

      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        entityLabel={t("sidebar.characters")}
        isDeleting={isDeleting}
        onConfirm={() => characterToDelete && performDelete(characterToDelete)}
        referenceCheck={referenceCheck}
      />

      <OutfitDialog
        open={showOutfitDialog}
        onOpenChange={setShowOutfitDialog}
        editingOutfit={editingOutfit}
        outfitForm={outfitForm}
        setOutfitForm={setOutfitForm}
        customAccessory={customAccessory}
        setCustomAccessory={setCustomAccessory}
        onAddOutfit={handleAddOutfit}
        onAddAccessory={addAccessory}
        onRemoveAccessory={removeAccessory}
      />

      <AssetSelectorDialog
        open={showAssetSelector}
        onOpenChange={setShowAssetSelector}
        assets={assets}
        description={t("character.selectImageAsCharacter")}
        onSelect={async (asset) => {
          setGeneratedImage(asset.url);
          if (currentCharacter.id) {
            try {
              const result = await characterService.update(currentCharacter.id, {
                ...currentCharacter,
                refImagePath: asset.url,
                generatedImage: asset.url,
              });
              if (!result.ok) throw result.error;
              queryClient.invalidateQueries({ queryKey: ["characters"] });
            } catch (err) {
              showError(t("error.saveFailed"), mapUserFacingError(err));
            }
          }
          setShowAssetSelector(false);
          success(t("success.applied"), t("success.imageSelectedFromLibrary"));
        }}
      />
    </PageErrorBoundary>
  );
}
