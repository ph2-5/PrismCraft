import { Suspense } from "react";
import { PageErrorBoundary } from "@/shared/presentation/PageErrorBoundary";
import { DeleteConfirmDialog } from "@/shared/presentation/DeleteConfirmDialog";
import { AssetSelectorDialog } from "@/shared/presentation/AssetSelectorDialog";
import { OutfitDialog } from "@/modules/character";
import { MediaExporter } from "@/modules/asset";
import { t } from "@/shared/constants/messages";
import { CharacterList } from "./CharacterList";
import { CharacterEditor } from "./CharacterEditor";
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
      <div className="fade-in" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        {/* Top Tabs */}
        <div className="top-tabs" style={{ justifyContent: "space-between" }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>👤 {t("sidebar.characters")}</span>
          <div className="toolbar">
            <input
              className="input"
              placeholder={t("character.searchPlaceholder")}
              style={{ fontSize: 12, padding: "6px 10px", width: 180 }}
              value={page.search}
              onChange={(e) => page.setSearch(e.target.value)}
            />
            <button className="btn btn-primary btn-sm" onClick={page.handleCreateNew}>
              + {t("character.createNew")}
            </button>
          </div>
        </div>

        {/* Content: Left List + Right Detail Editor */}
        <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
          <CharacterList
            characters={page.filteredCharacters}
            charactersLoading={page.charactersLoading}
            onSelectCharacter={page.handleSelectCharacter}
            onDeleteCharacter={page.handleDeleteCharacter}
            onCreateNew={page.handleCreateNew}
          />

          {/* Right: Detail Editor */}
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflowY: "auto", padding: 16, gap: 12 }}>
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
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted-fg)" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 48, marginBottom: 8 }}>👤</div>
                  <p style={{ fontSize: 14 }}>{t("character.selectOrCreate")}</p>
                </div>
              </div>
            )}
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
      </div>
    </PageErrorBoundary>
  );
}
