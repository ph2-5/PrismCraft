import { useState } from "react";
import type { ReactNode } from "react";
import { Upload, Folder, User, Package, Sparkles, MapPin } from "lucide-react";
import { t } from "@/shared/constants";
import { resolveImageUrl } from "@/shared/utils/image-url";
import { Modal } from "@/shared/presentation/Modal";
import type {
  StoryElement,
  StoryBeat,
  Character,
  Scene,
  SceneTransition,
} from "@/domain/schemas";
import type { MinimalAsset } from "./types";

export type ElementBinding = NonNullable<StoryBeat["elementBindings"]>[string];

export interface BindingUpdate {
  elementId: string;
  field: string;
  value: string;
}

interface ElementAvatarProps {
  type: StoryElement["type"];
  imageUrl?: string;
  name: string;
  placeholder: ReactNode;
}

export function ElementAvatar({ type, imageUrl, name, placeholder }: ElementAvatarProps) {
  return (
    <div className={`element-avatar ${type}`}>
      {imageUrl ? (
        <img
          src={resolveImageUrl(imageUrl)}
          alt={name}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        placeholder
      )}
    </div>
  );
}

interface ReferenceImageActionsProps {
  elementId: string;
  onImageUpload: (elementId: string, event: Event) => void;
  onSelectFromAssetLibrary: (elementId: string) => void;
}

export function ReferenceImageActions({
  elementId,
  onImageUpload,
  onSelectFromAssetLibrary,
}: ReferenceImageActionsProps) {
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
      <button
        className="btn btn-ghost btn-xs"
        onClick={() => {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = "image/*";
          input.onchange = (e) => onImageUpload(elementId, e);
          input.click();
        }}
        style={{ gap: 2 }}
      >
        <Upload style={{ width: 10, height: 10 }} /> {t("element.uploadRef")}
      </button>
      <button
        className="btn btn-ghost btn-xs"
        onClick={() => onSelectFromAssetLibrary(elementId)}
        style={{ gap: 2 }}
      >
        <Folder style={{ width: 10, height: 10 }} /> {t("element.selectFromLib")}
      </button>
    </div>
  );
}

interface RemoveElementButtonProps {
  onClick: () => void;
}

export function RemoveElementButton({ onClick }: RemoveElementButtonProps) {
  return (
    <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
      <button
        className="btn btn-ghost btn-xs"
        style={{ color: "var(--destructive)" }}
        onClick={onClick}
      >
        ✕ {t("element.remove")}
      </button>
    </div>
  );
}

interface SceneTransitionListProps {
  sceneId: string;
  scenes: Scene[];
  sceneTransitions: SceneTransition[];
  showMenu: boolean;
  onShowMenu: (show: boolean) => void;
  onAdd: (targetSceneId: string) => void;
  onRemove: (targetSceneId: string) => void;
  onUpdate: (targetSceneId: string, updates: Partial<SceneTransition>) => void;
}

export function SceneTransitionList({
  sceneId,
  scenes,
  sceneTransitions,
  showMenu,
  onShowMenu,
  onAdd,
  onRemove,
  onUpdate,
}: SceneTransitionListProps) {
  const availableTransitionScenes = scenes.filter(
    (sc) => sc.id !== sceneId && !sceneTransitions.some((tr) => tr.sceneId === sc.id),
  );
  return (
    <div style={{ borderTop: "1px dashed var(--border)", paddingTop: 6, marginTop: 2 }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: "var(--muted-fg)", marginBottom: 4 }}>
        {t("element.sceneTransitions")}
      </div>
      <div style={{ fontSize: 9, color: "var(--muted-fg)", marginBottom: 6 }}>
        {t("element.sceneTransitionsHint")}
      </div>
      {sceneTransitions.map((transition) => {
        const targetScene = scenes.find((s) => s.id === transition.sceneId);
        if (!targetScene) return null;
        return (
          <div
            key={transition.sceneId}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              padding: "4px 0",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 600 }}><MapPin style={{ width: 11, height: 11, display: "inline", verticalAlign: "middle" }} /> {targetScene.name}</span>
              <button
                className="btn btn-ghost btn-xs"
                style={{ color: "var(--destructive)", padding: "0 4px" }}
                onClick={() => onRemove(transition.sceneId)}
              >
                ✕
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 4 }}>
              <select
                className="select"
                style={{ fontSize: 10, padding: "2px 4px" }}
                value={transition.transitionType || ""}
                onChange={(e) =>
                  onUpdate(transition.sceneId, {
                    transitionType: (e.target.value || undefined) as SceneTransition["transitionType"],
                  })
                }
              >
                <option value="">{t("element.selectTransitionType")}</option>
                <option value="cut">{t("element.transitionCut")}</option>
                <option value="dissolve">{t("element.transitionDissolve")}</option>
                <option value="wipe">{t("element.transitionWipe")}</option>
                <option value="fade">{t("element.transitionFade")}</option>
              </select>
              <input
                className="input"
                style={{ fontSize: 10, padding: "2px 4px" }}
                value={transition.description || ""}
                onChange={(e) =>
                  onUpdate(transition.sceneId, { description: e.target.value })
                }
                placeholder={t("element.transitionDescPlaceholder")}
                aria-label={t("element.transitionDesc")}
              />
            </div>
          </div>
        );
      })}
      {showMenu ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "4px 0" }}>
          {availableTransitionScenes.length === 0 ? (
            <div style={{ fontSize: 10, color: "var(--muted-fg)", textAlign: "center" }}>
              {t("element.noMoreScenes")}
            </div>
          ) : (
            availableTransitionScenes.map((sc) => (
              <button
                key={sc.id}
                className="btn btn-ghost btn-xs"
                style={{ justifyContent: "flex-start", gap: 6 }}
                onClick={() => onAdd(sc.id)}
              >
                {(sc.scenePath || sc.generatedImage) && (
                  <img
                    src={resolveImageUrl(sc.scenePath || sc.generatedImage || "")}
                    alt={sc.name}
                    style={{ width: 16, height: 16, borderRadius: 3, objectFit: "cover" }}
                  />
                )}
                <span>{sc.name}</span>
              </button>
            ))
          )}
          <button className="btn btn-ghost btn-xs" onClick={() => onShowMenu(false)}>
            {t("common.cancel")}
          </button>
        </div>
      ) : (
        <button
          className="btn btn-outline btn-xs"
          style={{
            width: "100%",
            justifyContent: "center",
            borderStyle: "dashed",
            padding: 6,
            color: "var(--muted-fg)",
          }}
          onClick={() => onShowMenu(true)}
        >
          + {t("element.addSceneTransition")}
        </button>
      )}
    </div>
  );
}

interface AddElementMenuProps {
  availableCharacters: Character[];
  availableScenes: Scene[];
  onAddFromCharacter: (character: Character, outfitId?: string) => void;
  onAddScene: (scene: Scene) => void;
  onCreateNewElement: (type: StoryElement["type"]) => void;
  onCancel: () => void;
}

export function AddElementMenu({
  availableCharacters,
  availableScenes,
  onAddFromCharacter,
  onAddScene,
  onCreateNewElement,
  onCancel,
}: AddElementMenuProps) {
  return (
    <div className="card" style={{ padding: 8, display: "flex", flexDirection: "column", gap: 6 }}>
      {availableCharacters.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted-fg)" }}>
            {t("element.addCharacter")}
          </div>
          {availableCharacters.map((char) => (
            <button
              key={char.id}
              className="btn btn-ghost btn-xs"
              style={{ justifyContent: "flex-start", gap: 6 }}
              onClick={() => onAddFromCharacter(char)}
            >
              {char.generatedImage && (
                <img
                  src={resolveImageUrl(char.generatedImage)}
                  alt={char.name}
                  style={{ width: 20, height: 20, borderRadius: 4, objectFit: "cover" }}
                />
              )}
              <span>{char.name}</span>
              {char.outfits && char.outfits.length > 0 && (
                <span style={{ fontSize: 10, color: "var(--muted-fg)" }}>
                  +{char.outfits.length} {t("element.outfits")}
                </span>
              )}
            </button>
          ))}
        </>
      )}
      {availableScenes.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted-fg)", marginTop: 4 }}>
            {t("element.addScene")}
          </div>
          {availableScenes.map((sc) => (
            <button
              key={sc.id}
              className="btn btn-ghost btn-xs"
              style={{ justifyContent: "flex-start", gap: 6 }}
              onClick={() => onAddScene(sc)}
            >
              {(sc.scenePath || sc.generatedImage) && (
                <img
                  src={resolveImageUrl(sc.scenePath || sc.generatedImage || "")}
                  alt={sc.name}
                  style={{ width: 20, height: 20, borderRadius: 4, objectFit: "cover" }}
                />
              )}
              <span>{sc.name}</span>
            </button>
          ))}
        </>
      )}
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted-fg)", marginTop: 4 }}>
        {t("element.createNew")}
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        <button
          className="btn btn-outline btn-xs"
          style={{ flex: 1 }}
          onClick={() => onCreateNewElement("character")}
        >
          <User style={{ width: 12, height: 12, display: "inline", verticalAlign: "middle" }} /> {t("element.characterLabel")}
        </button>
        <button
          className="btn btn-outline btn-xs"
          style={{ flex: 1 }}
          onClick={() => onCreateNewElement("prop")}
        >
          <Package style={{ width: 12, height: 12, display: "inline", verticalAlign: "middle" }} /> {t("element.propLabel")}
        </button>
        <button
          className="btn btn-outline btn-xs"
          style={{ flex: 1 }}
          onClick={() => onCreateNewElement("effect")}
        >
          <Sparkles style={{ width: 12, height: 12, display: "inline", verticalAlign: "middle" }} aria-hidden="true" /> {t("element.effectLabel")}
        </button>
      </div>
      <button className="btn btn-ghost btn-xs" onClick={onCancel}>
        {t("common.cancel")}
      </button>
    </div>
  );
}

interface AssetSelectorDialogProps {
  assets: MinimalAsset[];
  onSelect: (asset: MinimalAsset) => void;
  onClose: () => void;
}

export function AssetSelectorDialog({
  assets,
  onSelect,
  onClose,
}: AssetSelectorDialogProps) {
  const imageAssets = assets.filter((a) => a.type === "image");
  return (
    <Modal
      open={true}
      onClose={onClose}
      ariaLabel={t("element.selectFromAssetLibrary")}
      style={{ maxWidth: 600, width: "90%", maxHeight: "70vh", overflowY: "auto" }}
    >
      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
          {t("element.selectFromAssetLibrary")}
        </div>
        {imageAssets.length === 0 ? (
          <div style={{ textAlign: "center", padding: 24, color: "var(--muted-fg)" }}>
            {t("element.noAssets")}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            {imageAssets.map((asset) => (
              <div
                key={asset.id}
                style={{
                  cursor: "pointer",
                  borderRadius: 8,
                  overflow: "hidden",
                  border: "1px solid var(--border)",
                }}
                onClick={() => onSelect(asset)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(asset);
                  }
                }}
                aria-label={t("aria.selectAsset", { name: asset.name })}
              >
                {asset.url && (
                  <img
                    src={resolveImageUrl(asset.url)}
                    alt={asset.name}
                    style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "cover" }}
                  />
                )}
                <div style={{ padding: 4, fontSize: 11 }}>{asset.name}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

// Re-export useState hook for callers that need the asset selector state
export function useAssetSelectorState() {
  const [open, setOpen] = useState(false);
  const [selectingImageForElement, setSelectingImageForElement] = useState<string | null>(null);
  return {
    open,
    setOpen,
    selectingImageForElement,
    setSelectingImageForElement,
  };
}
