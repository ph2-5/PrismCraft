import { Suspense } from "react";
import { PageErrorBoundary } from "@/shared/presentation/PageErrorBoundary";
import { DeleteConfirmDialog } from "@/shared/presentation/DeleteConfirmDialog";
import { AssetSelectorDialog } from "@/shared/presentation/AssetSelectorDialog";
import { OutfitDialog } from "@/modules/character";
import { MediaExporter } from "@/modules/asset";
import { t } from "@/shared/constants/messages";
import { CharacterList } from "./CharacterList";
import { CharacterEditor } from "./CharacterEditor";
import { CharacterImageSection } from "./CharacterImageSection";
import { useCharacterPage } from "./hooks/useCharacterPage";

export default function CharactersPage() {
  return (
    <Suspense>
      <CharactersPageContent />
    </Suspense>
  );
}

function CharactersPageContent() {
  const page = useCharacterPage();

  return (
    <PageErrorBoundary pageName={t("page.characters")}>
      <div className="h-full flex gap-3">
        <CharacterList
          characters={page.characters}
          charactersLoading={page.charactersLoading}
          onSelectCharacter={page.handleSelectCharacter}
          onDeleteCharacter={page.handleDeleteCharacter}
          onCreateNew={page.handleCreateNew}
        />

        <div className="flex-1 min-w-0 border border-border rounded-lg bg-card overflow-hidden">
          <div className="h-full overflow-y-auto">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold">
                {page.currentCharacter.id ? t("character.editCharacter") : t("character.createNew")}
              </h3>
              <p className="text-xs text-muted-foreground">
                {t("character.allFieldsOptional")}
              </p>
            </div>
            <div className="p-4">
              <CharacterEditor
                currentCharacter={page.currentCharacter}
                setCurrentCharacter={page.setCurrentCharacter}
                customTrait={page.customTrait}
                setCustomTrait={page.setCustomTrait}
                addTrait={page.addTrait}
                removeTrait={page.removeTrait}
                isGenerating={page.isGenerating}
                onAddOutfit={page.handleAddOutfitClick}
                onEditOutfit={page.handleEditOutfit}
                onDeleteOutfit={page.handleDeleteOutfit}
                onSetDefaultOutfit={page.handleSetDefaultOutfit}
                onGenerateOutfitImage={page.handleGenerateOutfitImage}
              />

              <CharacterImageSection
                currentCharacter={page.currentCharacter}
                generatedImage={page.generatedImage}
                setGeneratedImage={page.setGeneratedImage}
                isGenerating={page.isGenerating}
                isUploading={page.isUploading}
                isAnalyzing={page.isAnalyzing}
                useDetailedPrompt={page.useDetailedPrompt}
                setUseDetailedPrompt={page.setUseDetailedPrompt}
                imageSize={page.imageSize}
                setImageSize={page.setImageSize}
                selectedImageModel={page.selectedImageModel}
                setSelectedImageModel={page.setSelectedImageModel}
                generatePrompt={page.generatePrompt}
                generateImage={page.generateImage}
                saveImageToCharacter={page.saveImageToCharacter}
                fileInputRef={page.fileInputRef}
                analyzeFileInputRef={page.analyzeFileInputRef}
                handleFileUpload={page.handleFileUpload}
                handleAnalyzeFileUpload={page.handleAnalyzeFileUpload}
                setShowAssetSelector={page.setShowAssetSelector}
                isDirty={page.isDirty}
                saveStatus={page.saveStatus}
                saveError={page.saveError}
                handleSave={page.handleSave}
              />
            </div>
          </div>
        </div>
      </div>

      {page.currentCharacter.id && (
        <MediaExporter type="character" item={page.currentCharacter} />
      )}

      <DeleteConfirmDialog
        open={page.deleteDialogOpen}
        onOpenChange={page.setDeleteDialogOpen}
        entityLabel={t("sidebar.characters")}
        isDeleting={page.isDeleting}
        onConfirm={() => page.characterToDelete && page.performDelete(page.characterToDelete)}
        referenceCheck={page.referenceCheck}
      />

      <OutfitDialog
        open={page.showOutfitDialog}
        onOpenChange={page.setShowOutfitDialog}
        editingOutfit={page.editingOutfit}
        outfitForm={page.outfitForm}
        setOutfitForm={page.setOutfitForm}
        customAccessory={page.customAccessory}
        setCustomAccessory={page.setCustomAccessory}
        onAddOutfit={page.handleAddOutfit}
        onAddAccessory={page.addAccessory}
        onRemoveAccessory={page.removeAccessory}
      />

      <AssetSelectorDialog
        open={page.showAssetSelector}
        onOpenChange={page.setShowAssetSelector}
        assets={page.assets}
        description={t("character.selectImageAsCharacter")}
        onSelect={page.handleAssetSelect}
      />
    </PageErrorBoundary>
  );
}
