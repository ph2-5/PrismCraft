import { Suspense } from "react";
import { User } from "lucide-react";
import { PageErrorBoundary } from "@/shared/presentation/PageErrorBoundary";
import { DeleteConfirmDialog } from "@/shared/presentation/DeleteConfirmDialog";
import { AssetSelectorDialog } from "@/shared/presentation/AssetSelectorDialog";
import { OutfitDialog } from "@/modules/character";
import { t } from "@/shared/constants/messages";
import { CharacterList } from "./CharacterList";
import { CharacterEditor } from "./CharacterEditor";
import { useCharacterPage } from "./hooks/use-character-page";

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
      <div className="fade-in flex flex-col h-full">
        {/* Top Tabs */}
        <div className="top-tabs justify-between">
          <span className="font-semibold text-sm"><User size={14} /> {t("sidebar.characters")}</span>
          <div className="toolbar">
            <input
              className="input !text-xs !py-1.5 !px-2.5 !w-[180px]"
              placeholder={t("character.searchPlaceholder")}
              value={page.search}
              onChange={(e) => page.setSearch(e.target.value)}
            />
            <button className="btn btn-primary btn-sm" onClick={page.handleCreateNew}>
              + {t("character.createNew")}
            </button>
          </div>
        </div>

        {/* Content: Left List + Right Detail Editor */}
        <div className="flex flex-col md:flex-row flex-1 min-h-0">
          <CharacterList
            characters={page.filteredCharacters}
            charactersLoading={page.charactersLoading}
            onSelectCharacter={page.handleSelectCharacter}
            onDeleteCharacter={page.handleDeleteCharacter}
            onCreateNew={page.handleCreateNew}
          />

          {/* Right: Detail Editor */}
          <div className="flex-1 flex flex-col min-w-0 overflow-y-auto p-4 gap-3">
            {page.showEditor ? (
              <CharacterEditor
                currentCharacter={page.currentCharacter}
                setCurrentCharacter={page.setCurrentCharacter}
                customTrait={page.customTrait}
                setCustomTrait={page.setCustomTrait}
                addTrait={page.addTrait}
                removeTrait={page.removeTrait}
                isGenerating={page.isGenerating}
                isUploading={page.isUploading}
                isAnalyzing={page.isAnalyzing}
                generatedImage={page.generatedImage}
                setGeneratedImage={page.setGeneratedImage}
                useDetailedPrompt={page.useDetailedPrompt}
                setUseDetailedPrompt={page.setUseDetailedPrompt}
                selectedImageModel={page.selectedImageModel}
                setSelectedImageModel={page.setSelectedImageModel}
                imageSize={page.imageSize}
                generatePrompt={page.generatePrompt}
                generateImage={page.generateImage}
                saveImageToCharacter={page.saveImageToCharacter}
                fileInputRef={page.fileInputRef}
                analyzeFileInputRef={page.analyzeFileInputRef}
                handleFileUpload={page.handleFileUpload}
                handleAnalyzeFileUpload={page.handleAnalyzeFileUpload}
                setShowAssetSelector={page.setShowAssetSelector}
                onAddOutfit={page.handleAddOutfitClick}
                onEditOutfit={page.handleEditOutfit}
                onDeleteOutfit={page.handleDeleteOutfit}
                onSetDefaultOutfit={page.handleSetDefaultOutfit}
                onGenerateOutfitImage={page.handleGenerateOutfitImage}
                referencedBeats={page.referencedBeats}
                isDirty={page.isDirty}
                saveStatus={page.saveStatus}
                saveError={page.saveError}
                handleSave={page.handleSave}
                handleDelete={() => page.currentCharacter.id && page.performDelete(page.currentCharacter.id)}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <div className="text-5xl mb-2"><User size={48} /></div>
                  <p className="text-sm">{t("character.selectOrCreate")}</p>
                </div>
              </div>
            )}
          </div>
        </div>

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
      </div>
    </PageErrorBoundary>
  );
}
