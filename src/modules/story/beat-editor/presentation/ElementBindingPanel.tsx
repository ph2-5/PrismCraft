import { t } from "@/shared/constants";
import type { StoryBeat, StoryElement, Character, Scene } from "@/domain/schemas";
import type { MinimalAsset } from "./types";
import { AddElementMenu, AssetSelectorDialog } from "./ElementBindingPanelParts";
import {
  CharacterElementCard,
  SceneElementCard,
  PropElementCard,
} from "./ElementBindingCards";
import { useElementBindingHandlers } from "./useElementBindingHandlers";

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
  const {
    state: {
      assetSelectorOpen,
      showAddMenu,
      boundCharacters,
      boundScenes,
      boundProps,
      availableCharacters,
      availableScenes,
    },
    setters: { setAssetSelectorOpen, setShowAddMenu },
    getters: { getElementBinding },
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
  } = useElementBindingHandlers({
    beat,
    elements,
    characters,
    scenes,
    onUpdateBeat,
  });

  const commonCardProps = {
    onUpdateElement: handleUpdateElement,
    onUpdateBinding: handleUpdateBinding,
    onRemove: handleRemoveElement,
    onImageUpload: handleImageUpload,
    onSelectFromAssetLibrary: handleSelectFromAssetLibrary,
  };

  return (
    <>
      {boundCharacters.map((element) => (
        <CharacterElementCard
          key={element.id}
          element={element}
          binding={getElementBinding(element.id)}
          {...commonCardProps}
        />
      ))}

      {boundScenes.map((element) => (
        <SceneElementCard
          key={element.id}
          element={element}
          binding={getElementBinding(element.id)}
          beat={beat}
          scenes={scenes}
          onUpdateBinding={handleUpdateBinding}
          onRemove={handleRemoveElement}
          onAddSceneTransition={handleAddSceneTransition}
          onRemoveSceneTransition={handleRemoveSceneTransition}
          onUpdateSceneTransition={handleUpdateSceneTransition}
        />
      ))}

      {boundProps.map((element) => (
        <PropElementCard
          key={element.id}
          element={element}
          binding={getElementBinding(element.id)}
          {...commonCardProps}
        />
      ))}

      {showAddMenu ? (
        <AddElementMenu
          availableCharacters={availableCharacters}
          availableScenes={availableScenes}
          onAddFromCharacter={handleAddFromCharacter}
          onAddScene={handleAddScene}
          onCreateNewElement={handleCreateNewElement}
          onCancel={() => setShowAddMenu(false)}
        />
      ) : (
        <button
          className="btn btn-outline btn-sm"
          style={{ width: "100%", justifyContent: "center", borderStyle: "dashed", padding: 12, color: "var(--muted-fg)" }}
          onClick={() => setShowAddMenu(true)}
        >
          + {t("element.addBinding")}
        </button>
      )}

      {assetSelectorOpen && (
        <AssetSelectorDialog
          assets={assets}
          onSelect={handleSelectAsset}
          onClose={() => setAssetSelectorOpen(false)}
        />
      )}
    </>
  );
}
