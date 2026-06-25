import { useState, useEffect, useRef, useMemo } from "react";
import { useToastHelpers } from "@/shared/presentation/Toast";
import { container } from "@/infrastructure/di";
import { t } from "@/shared/constants";
import { resolveImageUrl } from "@/shared/utils/image-url";
import { Upload, Folder } from "lucide-react";
import type {
  StoryElement,
  ReferenceImageQuality,
  ElementType,
  StoryBeat,
  Character,
  Scene,
} from "@/domain/schemas";
import { validateReferenceImageQuality, buildFeatureAnchoringConfig } from "@/modules/shot";
import type { MinimalAsset } from "./types";

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
  const [selectingImageForElement, setSelectingImageForElement] = useState<string | null>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [imageQualityMap, setImageQualityMap] = useState<Record<string, ReferenceImageQuality>>({});
  void imageQualityMap; // 保留用于未来质量检测展示

  const boundElementIds = useMemo(() => beat.elementIds || [], [beat.elementIds]);
  const boundElements = boundElementIds
    .map((id) => elements.find((e) => e.id === id))
    .filter((e): e is StoryElement => !!e);

  const boundCharacters = boundElements.filter((e) => e.type === "character");
  const boundScenes = boundElements.filter((e) => (e as StoryElement).type === ("scene" as unknown as ElementType));
  const boundProps = boundElements.filter((e) => e.type === "prop" || e.type === "effect");

  const getElementBinding = (elementId: string) => {
    return beat.elementBindings?.[elementId] || {};
  };

  // Feature anchoring auto-update
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

  const checkImageQuality = async (elementId: string, imageUrl: string, elementType: ElementType) => {
    const quality = await validateReferenceImageQuality(imageUrl, elementType);
    setImageQualityMap((prev) => ({ ...prev, [elementId]: quality }));
    if (!quality.isValid) {
      const em = await container.elementManager;
      await em.updateElement(elementId, { referenceImageQuality: quality });
    }
  };

  const handleAddFromCharacter = async (character: Character, outfitId?: string) => {
    const existingElement = elements.find((e) => e.type === "character" && e.name === character.name);
    let newElement: StoryElement;
    if (existingElement) {
      newElement = existingElement;
    } else {
      const em = await container.elementManager;
      newElement = await em.createElement("character", character.name, character.description || character.prompt || "");
      let imageUrl = character.generatedImage;
      if (outfitId && character.outfits) {
        const outfit = character.outfits.find((o) => o.id === outfitId);
        if (outfit?.imageUrl) imageUrl = outfit.imageUrl;
      }
      if (imageUrl) {
        const em2 = await container.elementManager;
        await em2.updateElement(newElement.id, {
          bindings: [{ type: "image" as const, url: imageUrl, name: t("element.refImageName", { name: character.name }), uploadedAt: new Date().toISOString(), isPrimary: true }],
        });
        checkImageQuality(newElement.id, imageUrl, "character");
      }
    }
    const newElementIds = [...boundElementIds, newElement.id];
    const newElementBindings = { ...beat.elementBindings };
    let bindingImageUrl = character.generatedImage;
    if (outfitId && character.outfits) {
      const outfit = character.outfits.find((o) => o.id === outfitId);
      if (outfit?.imageUrl) bindingImageUrl = outfit.imageUrl;
    }
    newElementBindings[newElement.id] = { imageUrl: bindingImageUrl, text: character.description || character.prompt || "", description: character.description || character.prompt || "" };
    const newCharacterOutfits = { ...beat.characterOutfits };
    if (outfitId) newCharacterOutfits[character.id] = outfitId;
    onUpdateBeat({ ...beat, elementIds: newElementIds, elementBindings: newElementBindings, characterOutfits: newCharacterOutfits });
    setShowAddMenu(false);
  };

  const handleAddScene = (scene: Scene) => {
    const existingElement = elements.find((e) => (e as StoryElement).type === ("scene" as unknown as ElementType) && e.name === scene.name);
    let elementId: string;
    if (existingElement) {
      elementId = existingElement.id;
    } else {
      // Create scene element asynchronously
      container.elementManager.then(async (em) => {
        const newElement = await em.createElement(("scene" as unknown as ElementType), scene.name, scene.description || "");
        if (scene.scenePath || scene.generatedImage) {
          await em.updateElement(newElement.id, {
            bindings: [{ type: "image" as const, url: scene.scenePath || scene.generatedImage || "", name: t("element.refImageName", { name: scene.name }), uploadedAt: new Date().toISOString(), isPrimary: true }],
          });
        }
        const newElementIds = [...boundElementIds, newElement.id];
        const newElementBindings = { ...beat.elementBindings };
        newElementBindings[newElement.id] = { imageUrl: scene.scenePath || scene.generatedImage, text: scene.description || "", description: scene.description || "" };
        onUpdateBeat({ ...beat, elementIds: newElementIds, elementBindings: newElementBindings, sceneId: scene.id });
      });
      setShowAddMenu(false);
      return;
    }
    const newElementIds = [...boundElementIds, elementId];
    const newElementBindings = { ...beat.elementBindings };
    newElementBindings[elementId] = { imageUrl: scene.scenePath || scene.generatedImage, text: scene.description || "", description: scene.description || "" };
    onUpdateBeat({ ...beat, elementIds: newElementIds, elementBindings: newElementBindings, sceneId: scene.id });
    setShowAddMenu(false);
  };

  const handleCreateNewElement = async (type: ElementType) => {
    const em = await container.elementManager;
    const newElement = await em.createElement(type, t("element.newElementName"), "");
    const newElementIds = [...boundElementIds, newElement.id];
    const newElementBindings = { ...beat.elementBindings };
    newElementBindings[newElement.id] = {};
    onUpdateBeat({ ...beat, elementIds: newElementIds, elementBindings: newElementBindings });
    setShowAddMenu(false);
  };

  const handleRemoveElement = (elementId: string) => {
    const newElementIds = boundElementIds.filter((id) => id !== elementId);
    const newElementBindings = { ...beat.elementBindings };
    delete newElementBindings[elementId];
    onUpdateBeat({ ...beat, elementIds: newElementIds, elementBindings: newElementBindings });
  };

  const handleUpdateElement = async (elementId: string, updates: Partial<StoryElement>) => {
    const em = await container.elementManager;
    await em.updateElement(elementId, updates);
  };

  const handleUpdateBinding = (elementId: string, field: string, value: string) => {
    const newElementBindings = { ...beat.elementBindings };
    newElementBindings[elementId] = { ...newElementBindings[elementId], [field]: value };
    onUpdateBeat({ ...beat, elementBindings: newElementBindings });
  };

  const handleImageUpload = (elementId: string, event: React.ChangeEvent<HTMLInputElement>) => {
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
      const result = e.target?.result;
      if (typeof result !== "string") { showError(t("error.fileReadFailed")); return; }
      handleUpdateBinding(elementId, "imageUrl", result);
      const existingBindings = element.bindings || [];
      const hasPrimary = existingBindings.some((b) => b.isPrimary);
      const updatedBindings = [...existingBindings, { type: "image" as const, url: result, name: file.name, uploadedAt: new Date().toISOString(), isPrimary: !hasPrimary }];
      handleUpdateElement(elementId, { bindings: updatedBindings });
      checkImageQuality(elementId, result, element.type);
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
    const updatedBindings = [...existingBindings, { type: "image" as const, url: asset.url || "", name: asset.name, uploadedAt: new Date().toISOString(), isPrimary: !hasPrimary }];
    handleUpdateElement(selectingImageForElement, { bindings: updatedBindings });
    checkImageQuality(selectingImageForElement, asset.url || "", element.type);
    setAssetSelectorOpen(false);
    setSelectingImageForElement(null);
    showSuccess(t("common.saved"), t("element.selectFromAssetLibrary"));
  };

  const availableCharacters = characters.filter((char) => !boundElements.some((el) => el.type === "character" && el.name === char.name));
  const availableScenes = scenes.filter((sc) => !boundElements.some((el) => (el as StoryElement).type === ("scene" as unknown as ElementType) && el.name === sc.name));

  return (
    <>
      {/* Character element-cards */}
      {boundCharacters.map((element) => {
        const binding = getElementBinding(element.id);
        const imageUrl = binding.imageUrl || element.bindings?.find((b) => b.isPrimary)?.url;
        return (
          <div key={element.id} className="element-card">
            <div className={`element-avatar ${element.type}`}>{imageUrl ? <img src={resolveImageUrl(imageUrl)} alt={element.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : "👤"}</div>
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <input className="input" style={{ fontSize: 13, fontWeight: 600, padding: "2px 4px", background: "transparent", border: "none" }} value={element.name} onChange={(e) => handleUpdateElement(element.id, { name: e.target.value })} />
                <span className="badge badge-info">{t("element.characterLabel")}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                <div>
                  <label style={{ fontSize: 9, color: "var(--muted-fg)", display: "block" }}>{t("element.roleInShot")}</label>
                  <select className="select" style={{ fontSize: 11, padding: "4px 6px", width: "100%" }} value={binding.role || ""} onChange={(e) => handleUpdateBinding(element.id, "role", e.target.value)}>
                    <option value="">{t("element.selectRole")}</option>
                    <option value="主角">{t("element.protagonist")}</option>
                    <option value="配角">{t("element.supporting")}</option>
                    <option value="背景">{t("element.background")}</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 9, color: "var(--muted-fg)", display: "block" }}>{t("element.position")}</label>
                  <select className="select" style={{ fontSize: 11, padding: "4px 6px", width: "100%" }} value={binding.position || ""} onChange={(e) => handleUpdateBinding(element.id, "position", e.target.value)}>
                    <option value="">{t("element.selectPosition")}</option>
                    <option value="前景">{t("element.foreground")}</option>
                    <option value="中景">{t("element.middleGround")}</option>
                    <option value="背景">{t("element.background")}</option>
                    <option value="画面中央">{t("element.center")}</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 9, color: "var(--muted-fg)", display: "block" }}>{t("element.action")}</label>
                  <input className="input" style={{ fontSize: 11, padding: "4px 6px" }} value={binding.action || ""} onChange={(e) => handleUpdateBinding(element.id, "action", e.target.value)} placeholder={t("element.actionPlaceholder")} />
                </div>
                <div>
                  <label style={{ fontSize: 9, color: "var(--muted-fg)", display: "block" }}>{t("element.emotion")}</label>
                  <select className="select" style={{ fontSize: 11, padding: "4px 6px", width: "100%" }} value={binding.emotion || ""} onChange={(e) => handleUpdateBinding(element.id, "emotion", e.target.value)}>
                    <option value="">{t("element.selectEmotion")}</option>
                    <option value="坚定">{t("element.determined")}</option>
                    <option value="平静">{t("element.calm")}</option>
                    <option value="紧张">{t("element.tense")}</option>
                    <option value="悲伤">{t("element.sad")}</option>
                    <option value="喜悦">{t("element.joyful")}</option>
                  </select>
                </div>
              </div>
              <div>
                <label style={{ fontSize: 9, color: "var(--muted-fg)", display: "block" }}>{t("element.supplementaryDesc")}</label>
                <input className="input" style={{ fontSize: 11, padding: "4px 6px" }} value={binding.description || ""} onChange={(e) => handleUpdateBinding(element.id, "description", e.target.value)} placeholder={t("element.supplementaryPlaceholder")} />
              </div>
              {/* Reference image actions */}
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                <button className="btn btn-ghost btn-xs" onClick={() => { const input = document.createElement("input"); input.type = "file"; input.accept = "image/*"; input.onchange = (e) => handleImageUpload(element.id, e as unknown as React.ChangeEvent<HTMLInputElement>); input.click(); }} style={{ gap: 2 }}>
                  <Upload style={{ width: 10, height: 10 }} /> {t("element.uploadRef")}
                </button>
                <button className="btn btn-ghost btn-xs" onClick={() => handleSelectFromAssetLibrary(element.id)} style={{ gap: 2 }}>
                  <Folder style={{ width: 10, height: 10 }} /> {t("element.selectFromLib")}
                </button>
              </div>
              <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                <button className="btn btn-ghost btn-xs" style={{ color: "var(--destructive)" }} onClick={() => handleRemoveElement(element.id)}>✕ {t("element.remove")}</button>
              </div>
            </div>
          </div>
        );
      })}

      {/* Scene element-cards */}
      {boundScenes.map((element) => {
        const binding = getElementBinding(element.id);
        const scene = scenes.find((s) => s.name === element.name);
        const imageUrl = binding.imageUrl || scene?.scenePath || scene?.generatedImage;
        return (
          <div key={element.id} className="element-card">
            <div className={`element-avatar ${element.type}`}>{imageUrl ? <img src={resolveImageUrl(imageUrl)} alt={element.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : "🏙"}</div>
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{element.name}</span>
                <span className="badge badge-success">{t("element.sceneLabel")}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                <div>
                  <label style={{ fontSize: 9, color: "var(--muted-fg)", display: "block" }}>{t("element.sceneRole")}</label>
                  <select className="select" style={{ fontSize: 11, padding: "4px 6px", width: "100%" }} value={binding.role || ""} onChange={(e) => handleUpdateBinding(element.id, "role", e.target.value)}>
                    <option value="">{t("element.selectSceneRole")}</option>
                    <option value="主场景">{t("element.mainScene")}</option>
                    <option value="背景">{t("element.background")}</option>
                    <option value="过渡">{t("element.transition")}</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 9, color: "var(--muted-fg)", display: "block" }}>{t("element.time")}</label>
                  <select className="select" style={{ fontSize: 11, padding: "4px 6px", width: "100%" }} value={(binding as Record<string, string>).time || ""} onChange={(e) => handleUpdateBinding(element.id, "time", e.target.value)}>
                    <option value="">{t("element.selectTime")}</option>
                    <option value="清晨">{t("element.morning")}</option>
                    <option value="白天">{t("element.daytime")}</option>
                    <option value="傍晚">{t("element.evening")}</option>
                    <option value="夜晚">{t("element.night")}</option>
                  </select>
                </div>
              </div>
              <div>
                <label style={{ fontSize: 9, color: "var(--muted-fg)", display: "block" }}>{t("element.supplementaryDesc")}</label>
                <input className="input" style={{ fontSize: 11, padding: "4px 6px" }} value={binding.description || ""} onChange={(e) => handleUpdateBinding(element.id, "description", e.target.value)} placeholder={t("element.supplementaryPlaceholder")} />
              </div>
              <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                <button className="btn btn-ghost btn-xs" style={{ color: "var(--destructive)" }} onClick={() => handleRemoveElement(element.id)}>✕ {t("element.remove")}</button>
              </div>
            </div>
          </div>
        );
      })}

      {/* Prop/Effect element-cards */}
      {boundProps.map((element) => {
        const binding = getElementBinding(element.id);
        const imageUrl = binding.imageUrl || element.bindings?.find((b) => b.isPrimary)?.url;
        return (
          <div key={element.id} className="element-card">
            <div className={`element-avatar ${element.type}`}>{imageUrl ? <img src={resolveImageUrl(imageUrl)} alt={element.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : "📦"}</div>
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <input className="input" style={{ fontSize: 13, fontWeight: 600, padding: "2px 4px", background: "transparent", border: "none" }} value={element.name} onChange={(e) => handleUpdateElement(element.id, { name: e.target.value })} />
                <span className="badge">{element.type === "prop" ? t("element.propLabel") : t("element.effectLabel")}</span>
              </div>
              <div>
                <label style={{ fontSize: 9, color: "var(--muted-fg)", display: "block" }}>{t("element.supplementaryDesc")}</label>
                <input className="input" style={{ fontSize: 11, padding: "4px 6px" }} value={binding.description || ""} onChange={(e) => handleUpdateBinding(element.id, "description", e.target.value)} placeholder={t("element.supplementaryPlaceholder")} />
              </div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                <button className="btn btn-ghost btn-xs" onClick={() => { const input = document.createElement("input"); input.type = "file"; input.accept = "image/*"; input.onchange = (e) => handleImageUpload(element.id, e as unknown as React.ChangeEvent<HTMLInputElement>); input.click(); }} style={{ gap: 2 }}>
                  <Upload style={{ width: 10, height: 10 }} /> {t("element.uploadRef")}
                </button>
                <button className="btn btn-ghost btn-xs" onClick={() => handleSelectFromAssetLibrary(element.id)} style={{ gap: 2 }}>
                  <Folder style={{ width: 10, height: 10 }} /> {t("element.selectFromLib")}
                </button>
              </div>
              <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                <button className="btn btn-ghost btn-xs" style={{ color: "var(--destructive)" }} onClick={() => handleRemoveElement(element.id)}>✕ {t("element.remove")}</button>
              </div>
            </div>
          </div>
        );
      })}

      {/* Add binding button / menu */}
      {showAddMenu ? (
        <div className="card" style={{ padding: 8, display: "flex", flexDirection: "column", gap: 6 }}>
          {availableCharacters.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted-fg)" }}>{t("element.addCharacter")}</div>
              {availableCharacters.map((char) => (
                <button key={char.id} className="btn btn-ghost btn-xs" style={{ justifyContent: "flex-start", gap: 6 }} onClick={() => handleAddFromCharacter(char)}>
                  {char.generatedImage && <img src={resolveImageUrl(char.generatedImage)} alt={char.name} style={{ width: 20, height: 20, borderRadius: 4, objectFit: "cover" }} />}
                  <span>{char.name}</span>
                  {char.outfits && char.outfits.length > 0 && <span style={{ fontSize: 10, color: "var(--muted-fg)" }}>+{char.outfits.length} {t("element.outfits")}</span>}
                </button>
              ))}
            </>
          )}
          {availableScenes.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted-fg)", marginTop: 4 }}>{t("element.addScene")}</div>
              {availableScenes.map((sc) => (
                <button key={sc.id} className="btn btn-ghost btn-xs" style={{ justifyContent: "flex-start", gap: 6 }} onClick={() => handleAddScene(sc)}>
                  {(sc.scenePath || sc.generatedImage) && <img src={resolveImageUrl(sc.scenePath || sc.generatedImage || "")} alt={sc.name} style={{ width: 20, height: 20, borderRadius: 4, objectFit: "cover" }} />}
                  <span>{sc.name}</span>
                </button>
              ))}
            </>
          )}
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted-fg)", marginTop: 4 }}>{t("element.createNew")}</div>
          <div style={{ display: "flex", gap: 4 }}>
            <button className="btn btn-outline btn-xs" style={{ flex: 1 }} onClick={() => handleCreateNewElement("character")}>👤 {t("element.characterLabel")}</button>
            <button className="btn btn-outline btn-xs" style={{ flex: 1 }} onClick={() => handleCreateNewElement("prop")}>📦 {t("element.propLabel")}</button>
            <button className="btn btn-outline btn-xs" style={{ flex: 1 }} onClick={() => handleCreateNewElement("effect")}>✨ {t("element.effectLabel")}</button>
          </div>
          <button className="btn btn-ghost btn-xs" onClick={() => setShowAddMenu(false)}>{t("common.cancel")}</button>
        </div>
      ) : (
        <button className="btn btn-outline btn-sm" style={{ width: "100%", justifyContent: "center", borderStyle: "dashed", padding: 12, color: "var(--muted-fg)" }} onClick={() => setShowAddMenu(true)}>
          + {t("element.addBinding")}
        </button>
      )}

      {/* Asset selector dialog */}
      {assetSelectorOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }} onClick={() => setAssetSelectorOpen(false)}>
          <div className="card" style={{ maxWidth: 600, width: "90%", maxHeight: "70vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{t("element.selectFromAssetLibrary")}</div>
            {assets.filter((a) => a.type === "image").length === 0 ? (
              <div style={{ textAlign: "center", padding: 24, color: "var(--muted-fg)" }}>{t("element.noAssets")}</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                {assets.filter((a) => a.type === "image").map((asset) => (
                  <div key={asset.id} style={{ cursor: "pointer", borderRadius: 8, overflow: "hidden", border: "1px solid var(--border)" }} onClick={() => handleSelectAsset(asset)}>
                    {asset.url && <img src={resolveImageUrl(asset.url)} alt={asset.name} style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "cover" }} />}
                    <div style={{ padding: 4, fontSize: 11 }}>{asset.name}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
