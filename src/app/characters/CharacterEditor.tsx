import { useState } from "react";
import {
  personalitySuggestions,
  styleSuggestions,
  genderSuggestions,
  heightSuggestions,
  buildSuggestions,
} from "@/modules/character";
import { resolveImageUrl } from "@/shared/utils/image-url";
import { SaveStatusIndicator, type SaveStatus } from "@/shared/presentation/SaveStatusIndicator";
import { ModelSelector } from "@/modules/prompt";
import type { Character, CharacterOutfit, ModelSelection } from "@/domain/schemas";
import {
  Plus,
  X,
  Wand2,
  Loader2,
  Shirt,
  Save,
  Trash2,
  Upload,
  ScanLine,
  Sparkles,
  Folder,
} from "lucide-react";
import { t } from "@/shared/constants/messages";

interface CharacterEditorProps {
  currentCharacter: Character;
  setCurrentCharacter: (update: Character | ((prev: Character) => Character), shouldMarkDirty?: boolean) => void;
  customTrait: string;
  setCustomTrait: (v: string) => void;
  addTrait: (trait: string) => void;
  removeTrait: (trait: string) => void;
  isGenerating: boolean;
  isUploading: boolean;
  isAnalyzing: boolean;
  generatedImage: string | null;
  setGeneratedImage: (v: string | null) => void;
  useDetailedPrompt: boolean;
  setUseDetailedPrompt: (v: boolean) => void;
  selectedImageModel: ModelSelection | null;
  setSelectedImageModel: (v: ModelSelection | null) => void;
  generatePrompt: (char: Character) => string;
  generateImage: () => void;
  saveImageToCharacter: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  analyzeFileInputRef: React.RefObject<HTMLInputElement | null>;
  handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleAnalyzeFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  setShowAssetSelector: (v: boolean) => void;
  onAddOutfit: () => void;
  onEditOutfit: (outfit: CharacterOutfit) => void;
  onDeleteOutfit: (id: string) => void;
  onSetDefaultOutfit: (id: string) => void;
  onGenerateOutfitImage: (outfit: CharacterOutfit) => void;
  referencedBeats: { id: string; title: string; status?: string }[];
  isDirty: boolean;
  saveStatus: SaveStatus;
  saveError: string | null | undefined;
  handleSave: () => void;
  handleDelete: () => void;
}

export function CharacterEditor({
  currentCharacter,
  setCurrentCharacter,
  customTrait,
  setCustomTrait,
  addTrait,
  removeTrait,
  isGenerating,
  isUploading,
  isAnalyzing,
  generatedImage,
  setGeneratedImage,
  useDetailedPrompt,
  setUseDetailedPrompt,
  selectedImageModel,
  setSelectedImageModel,
  generatePrompt,
  generateImage,
  saveImageToCharacter,
  fileInputRef,
  analyzeFileInputRef,
  handleFileUpload,
  handleAnalyzeFileUpload,
  setShowAssetSelector,
  onAddOutfit,
  onEditOutfit,
  onDeleteOutfit,
  onSetDefaultOutfit,
  onGenerateOutfitImage,
  referencedBeats,
  isDirty,
  saveStatus,
  saveError,
  handleSave,
  handleDelete,
}: CharacterEditorProps) {
  const [showStyleSuggestions, setShowStyleSuggestions] = useState(false);
  const avatarUrl = generatedImage || currentCharacter.avatarPath || currentCharacter.generatedImage || currentCharacter.refImagePath;

  return (
    <>
      {/* Header: avatar + name + badges + change avatar */}
      <div className="card" style={{ display: "flex", alignItems: "center", gap: 12, padding: 12 }}>
        <div
          className="element-avatar"
          style={{ width: 64, height: 64, flexShrink: 0, borderRadius: 8, overflow: "hidden" }}
        >
          {avatarUrl ? (
            <img src={resolveImageUrl(avatarUrl)} alt={currentCharacter.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <span style={{ fontSize: 28 }}>👤</span>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
          <input
            className="input"
            placeholder={t("character.namePlaceholder")}
            value={currentCharacter.name}
            onChange={(e) => setCurrentCharacter({ ...currentCharacter, name: e.target.value }, true)}
            style={{ fontSize: 16, fontWeight: 600 }}
          />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {currentCharacter.gender && (
              <span className="badge badge-info">{currentCharacter.gender}</span>
            )}
            <span className="badge">{t("character.referencedBy", { count: referencedBeats.length })}</span>
          </div>
        </div>
        <button
          className="btn btn-outline btn-sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          style={{ gap: 4 }}
        >
          {isUploading ? <Loader2 className="animate-spin" style={{ width: 14, height: 14 }} /> : <Upload style={{ width: 14, height: 14 }} />}
          {t("character.changeAvatar")}
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
      </div>

      {/* 基本信息 card */}
      <div className="card">
        <div className="section-label">{t("character.basicInfo")}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label className="section-label" style={{ fontSize: 11 }}>{t("character.gender")}</label>
            <select
              className="select"
              value={currentCharacter.gender}
              onChange={(e) => setCurrentCharacter({ ...currentCharacter, gender: e.target.value }, true)}
            >
              <option value="">{t("character.custom")}</option>
              {genderSuggestions.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label className="section-label" style={{ fontSize: 11 }}>{t("character.height")}</label>
            <input
              className="input"
              list="height-suggestions"
              placeholder={t("character.heightPlaceholder")}
              value={currentCharacter.appearance.height}
              onChange={(e) => setCurrentCharacter({ ...currentCharacter, appearance: { ...currentCharacter.appearance, height: e.target.value } }, true)}
            />
            <datalist id="height-suggestions">
              {heightSuggestions.map((h) => <option key={h} value={h} />)}
            </datalist>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label className="section-label" style={{ fontSize: 11 }}>{t("character.build")}</label>
            <select
              className="select"
              value={currentCharacter.appearance.build}
              onChange={(e) => setCurrentCharacter({ ...currentCharacter, appearance: { ...currentCharacter.appearance, build: e.target.value } }, true)}
            >
              <option value="">-</option>
              {buildSuggestions.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* 外观描述 card */}
      <div className="card">
        <div className="section-label">{t("character.appearanceDesc")}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
          <input
            className="input"
            placeholder={t("character.hairColorPlaceholder")}
            value={currentCharacter.appearance.hairColor}
            onChange={(e) => setCurrentCharacter({ ...currentCharacter, appearance: { ...currentCharacter.appearance, hairColor: e.target.value } }, true)}
          />
          <input
            className="input"
            placeholder={t("character.hairStylePlaceholder")}
            value={currentCharacter.appearance.hairStyle}
            onChange={(e) => setCurrentCharacter({ ...currentCharacter, appearance: { ...currentCharacter.appearance, hairStyle: e.target.value } }, true)}
          />
        </div>
        <textarea
          className="textarea"
          placeholder={t("character.clothingPlaceholder")}
          rows={3}
          value={currentCharacter.appearance.clothing}
          onChange={(e) => setCurrentCharacter({ ...currentCharacter, appearance: { ...currentCharacter.appearance, clothing: e.target.value } }, true)}
        />
      </div>

      {/* 性格与风格 card */}
      <div className="card">
        <div className="section-label">{t("character.personalityStyle")}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label className="section-label" style={{ fontSize: 11 }}>{t("character.personality")}</label>
            <div style={{ display: "flex", gap: 4 }}>
              <input
                className="input"
                list="trait-suggestions"
                placeholder={t("character.personalityPlaceholder")}
                value={customTrait}
                onChange={(e) => setCustomTrait(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTrait(customTrait); } }}
              />
              <datalist id="trait-suggestions">
                {personalitySuggestions.map((s) => <option key={s} value={s} />)}
              </datalist>
              <button className="btn btn-outline btn-sm" onClick={() => addTrait(customTrait)}>
                {t("character.add")}
              </button>
            </div>
            {currentCharacter.personality.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                {currentCharacter.personality.map((trait) => (
                  <span key={trait} className="badge badge-info" style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 2 }} onClick={() => removeTrait(trait)}>
                    {trait}
                    <X style={{ width: 10, height: 10 }} />
                  </span>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label className="section-label" style={{ fontSize: 11 }}>{t("character.style")}</label>
            <input
              className="input"
              placeholder={t("character.stylePlaceholder")}
              value={currentCharacter.style}
              onChange={(e) => setCurrentCharacter({ ...currentCharacter, style: e.target.value }, true)}
              onFocus={() => setShowStyleSuggestions(true)}
            />
            {showStyleSuggestions && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                {styleSuggestions.slice(0, 8).map((style) => (
                  <span
                    key={style}
                    className="badge"
                    style={{ cursor: "pointer" }}
                    onClick={() => { setCurrentCharacter({ ...currentCharacter, style }, true); setShowStyleSuggestions(false); }}
                  >
                    {style}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <textarea
          className="textarea"
          placeholder={t("character.descriptionPlaceholder")}
          rows={3}
          value={currentCharacter.description}
          onChange={(e) => setCurrentCharacter({ ...currentCharacter, description: e.target.value }, true)}
        />
      </div>

      {/* 装备与道具 card (新功能，P2A 占位) */}
      <div className="card">
        <div className="section-label">{t("character.equipmentProps")}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label className="section-label" style={{ fontSize: 11 }}>{t("character.weapon")}</label>
            <input className="input" placeholder={t("character.weaponPlaceholder")} disabled />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label className="section-label" style={{ fontSize: 11 }}>{t("character.items")}</label>
            <input className="input" placeholder={t("character.itemsPlaceholder")} disabled />
          </div>
        </div>
        <p style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 6 }}>
          {t("character.equipmentPropsHint")}
        </p>
      </div>

      {/* 造型变体 card */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div className="section-label">{t("character.outfitBranch")}</div>
          <button className="btn btn-outline btn-sm" onClick={onAddOutfit} style={{ gap: 4 }}>
            <Plus style={{ width: 12, height: 12 }} />
            {t("character.addOutfit")}
          </button>
        </div>
        {currentCharacter.outfits && currentCharacter.outfits.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {currentCharacter.outfits.map((outfit) => (
              <div key={outfit.id} className="element-card" style={{ padding: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontWeight: 500, fontSize: 13 }}>{outfit.name}</span>
                      {outfit.isDefault && <span className="badge badge-success">{t("character.defaultOutfit")}</span>}
                    </div>
                    {outfit.description && (
                      <p style={{ fontSize: 12, color: "var(--muted-fg)", marginTop: 2 }}>{outfit.description}</p>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => onEditOutfit(outfit)} style={{ gap: 4 }}>
                      {t("character.edit")}
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => onDeleteOutfit(outfit.id)} aria-label={t("character.deleteOutfitLabel")} style={{ gap: 4 }}>
                      <Trash2 style={{ width: 14, height: 14 }} />
                    </button>
                  </div>
                </div>
                {outfit.imageUrl && (
                  <div style={{ width: 80, height: 80, borderRadius: 6, overflow: "hidden", marginTop: 6, border: "1px solid var(--border)" }}>
                    <img src={resolveImageUrl(outfit.imageUrl)} alt={outfit.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </div>
                )}
                <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                  <button className="btn btn-outline btn-sm" onClick={() => onGenerateOutfitImage(outfit)} disabled={isGenerating} style={{ flex: 1, gap: 4 }}>
                    {isGenerating ? <Loader2 className="animate-spin" style={{ width: 14, height: 14 }} /> : <Wand2 style={{ width: 14, height: 14 }} />}
                    {t("character.generateImage")}
                  </button>
                  {!outfit.isDefault && (
                    <button className="btn btn-outline btn-sm" onClick={() => onSetDefaultOutfit(outfit.id)}>
                      {t("character.setDefault")}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: 24, color: "var(--muted-fg)" }}>
            <Shirt style={{ width: 32, height: 32, margin: "0 auto 8px", opacity: 0.5 }} />
            <p style={{ fontSize: 13 }}>{t("character.noOutfits")}</p>
            <p style={{ fontSize: 12 }}>{t("character.noOutfitsHint")}</p>
          </div>
        )}
      </div>

      {/* 引用此角色的分镜 card */}
      <div className="card">
        <div className="section-label">{t("character.referencedShots")}</div>
        {referencedBeats.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {referencedBeats.map((beat) => (
              <div key={beat.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
                <span style={{ fontSize: 13 }}>{beat.title}</span>
                {beat.status && <span className="badge badge-success">{beat.status}</span>}
              </div>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: 12, color: "var(--muted-fg)", textAlign: "center", padding: 12 }}>
            {t("character.noReferencedShots")}
          </p>
        )}
      </div>

      {/* 图片生成区 */}
      <div className="card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div className="section-label">{t("character.aiPrompt")}</div>
          <button
            className={`btn ${useDetailedPrompt ? "btn-primary" : "btn-outline"} btn-sm`}
            onClick={() => setUseDetailedPrompt(!useDetailedPrompt)}
            style={{ gap: 4 }}
          >
            <Sparkles style={{ width: 14, height: 14 }} />
            {useDetailedPrompt ? t("character.aiOptimized") : t("character.aiOptimize")}
          </button>
        </div>
        <div className="card2" style={{ padding: 10, fontSize: 12, lineHeight: 1.7, marginBottom: 8, maxHeight: 100, overflowY: "auto" }}>
          {generatePrompt(currentCharacter)}
        </div>
        {(generatedImage || currentCharacter.avatarPath || currentCharacter.generatedImage || currentCharacter.refImagePath) && (
          <div style={{ width: "100%", aspectRatio: "1 / 1", maxWidth: 200, margin: "0 auto 8px", borderRadius: 8, overflow: "hidden", border: "1px solid var(--border)" }}>
            <img
              src={resolveImageUrl(generatedImage || currentCharacter.avatarPath || currentCharacter.generatedImage || currentCharacter.refImagePath)}
              alt={t("character.characterImage")}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </div>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <button className="btn btn-primary btn-sm" onClick={generateImage} disabled={isGenerating} style={{ gap: 4 }}>
            {isGenerating ? <Loader2 className="animate-spin" style={{ width: 14, height: 14 }} /> : <Wand2 style={{ width: 14, height: 14 }} />}
            {isGenerating ? t("common.generating") : t("character.generateImage")}
          </button>
          <ModelSelector capability="image" value={selectedImageModel} onChange={setSelectedImageModel} />
          <button className="btn btn-outline btn-sm" onClick={saveImageToCharacter} disabled={!currentCharacter.id} style={{ gap: 4 }}>
            <Save style={{ width: 14, height: 14 }} />
            {t("character.saveToCharacter")}
          </button>
          {generatedImage && (
            <button className="btn btn-ghost btn-sm" onClick={() => setGeneratedImage(null)}>
              {t("character.clear")}
            </button>
          )}
          <button className="btn btn-outline btn-sm" onClick={() => fileInputRef.current?.click()} disabled={isUploading} style={{ gap: 4 }}>
            {isUploading ? <Loader2 className="animate-spin" style={{ width: 14, height: 14 }} /> : <Upload style={{ width: 14, height: 14 }} />}
            {isUploading ? t("common.uploading") : t("character.uploadImage")}
          </button>
          <button className="btn btn-outline btn-sm" onClick={() => setShowAssetSelector(true)} style={{ gap: 4 }}>
            <Folder style={{ width: 14, height: 14 }} />
            {t("character.selectFromLibrary")}
          </button>
          <button className="btn btn-outline btn-sm" onClick={() => analyzeFileInputRef.current?.click()} disabled={isAnalyzing || isUploading} style={{ gap: 4 }}>
            {isAnalyzing ? <Loader2 className="animate-spin" style={{ width: 14, height: 14 }} /> : <ScanLine style={{ width: 14, height: 14 }} />}
            {isAnalyzing ? t("common.analyzing") : t("character.recognizePerson")}
          </button>
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
        <input ref={analyzeFileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAnalyzeFileUpload} />
      </div>

      {/* 底部操作栏 */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 0" }}>
        <SaveStatusIndicator status={isDirty ? "unsaved" : saveStatus} errorMessage={saveError ?? undefined} />
        <button className="btn btn-danger btn-sm" onClick={handleDelete} style={{ gap: 4 }}>
          <Trash2 style={{ width: 14, height: 14 }} />
          {t("character.deleteCharacter")}
        </button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saveStatus === "saving"} style={{ flex: 1, gap: 4 }}>
          <Save style={{ width: 14, height: 14 }} />
          {saveStatus === "saving" ? t("common.saving") : t("character.saveCharacter")}
        </button>
      </div>
    </>
  );
}
