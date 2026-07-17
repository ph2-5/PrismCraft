import { t } from "@/shared/constants";
import type { StoryBeat, StoryElement, Character, Scene } from "@/domain/schemas";
import { resolveImageUrl } from "@/shared/utils/image-url";
import type { MinimalAsset } from "./types";
import { AddElementMenu, AssetSelectorDialog } from "./ElementBindingPanelParts";
import {
  CharacterElementCard,
  SceneElementCard,
  PropElementCard,
} from "./ElementBindingCards";
import { useElementBindingHandlers } from "./use-element-binding-handlers";

interface ElementBindingPanelProps {
  beat: StoryBeat;
  elements: StoryElement[];
  characters?: Character[];
  scenes?: Scene[];
  assets?: MinimalAsset[];
  onUpdateBeat: (updatedBeat: StoryBeat) => void;
}

/**
 * Task 2A.12: 为角色元素构造参考图候选列表。
 *
 * 候选来源（按优先级）：
 *   1. 角色主图（character.generatedImage）
 *   2. 默认造型（character.outfits 中 isDefault=true 的 imageUrl）
 *   3. 其他造型（character.outfits 中非默认的 imageUrl）
 *
 * 变体（variants）需要异步加载，由调用方通过 characterAssets 传入 beat-video-generator，
 * 此处仅处理同步可用的 outfits 数据。
 */
function buildCharacterRefCandidates(
  element: StoryElement,
  characters: Character[],
): { url: string; label: string }[] {
  // 通过 element.name 匹配 character（element 模块的设计）
  const character = characters.find((c) => c.name === element.name);
  if (!character) return [];

  const candidates: { url: string; label: string }[] = [];

  // 1. 角色主图
  if (character.generatedImage) {
    const url = resolveImageUrl(character.generatedImage);
    if (url) {
      candidates.push({ url, label: t("element.refImagePrimary") });
    }
  }

  // 2. 造型（outfits）
  if (character.outfits && character.outfits.length > 0) {
    // 默认造型优先
    const defaultOutfit = character.outfits.find((o) => o.isDefault);
    const otherOutfits = character.outfits.filter((o) => !o.isDefault);

    if (defaultOutfit?.imageUrl) {
      const url = resolveImageUrl(defaultOutfit.imageUrl);
      if (url) {
        candidates.push({ url, label: `${t("element.refImageOutfit")} · ${defaultOutfit.name}` });
      }
    }
    for (const outfit of otherOutfits) {
      if (outfit.imageUrl) {
        const url = resolveImageUrl(outfit.imageUrl);
        if (url) {
          candidates.push({ url, label: `${t("element.refImageOutfit")} · ${outfit.name}` });
        }
      }
    }
  }

  return candidates;
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
          characterRefCandidates={buildCharacterRefCandidates(element, characters)}
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
