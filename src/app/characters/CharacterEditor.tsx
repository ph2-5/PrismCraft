/* eslint-disable max-lines -- 组件已合理拆分至 AiRequestPreview.tsx，剩余子组件均为本文件专用 */
import {
  personalitySuggestions,
  styleSuggestions,
  genderSuggestions,
  heightSuggestions,
  buildSuggestions,
} from "@/modules/character";
import { resolveImageUrl } from "@/shared/utils/image-url";
import { SaveStatusIndicator, type SaveStatus } from "@/shared/presentation/SaveStatusIndicator";
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
  User,
} from "lucide-react";
import { t } from "@/shared/constants/messages";
import { useState } from "react";
import { AiRequestPreview } from "./AiRequestPreview";

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
  imageSize: string;
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

interface OutfitListProps {
  outfits: CharacterOutfit[];
  isGenerating: boolean;
  onAddOutfit: () => void;
  onEditOutfit: (outfit: CharacterOutfit) => void;
  onDeleteOutfit: (id: string) => void;
  onSetDefaultOutfit: (id: string) => void;
  onGenerateOutfitImage: (outfit: CharacterOutfit) => void;
}

function OutfitList({
  outfits, isGenerating, onAddOutfit, onEditOutfit, onDeleteOutfit, onSetDefaultOutfit, onGenerateOutfitImage,
}: OutfitListProps) {
  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div className="section-label">{t("character.outfitBranch")}</div>
        <button className="btn btn-outline btn-xs" onClick={onAddOutfit} style={{ gap: 4 }}>
          <Plus style={{ width: 12, height: 12 }} />
          {t("character.addOutfit")}
        </button>
      </div>
      {outfits && outfits.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {outfits.map((outfit) => (
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
                  <button className="btn btn-ghost btn-xs" onClick={() => onEditOutfit(outfit)} style={{ gap: 4 }}>
                    {t("character.edit")}
                  </button>
                  <button className="btn btn-ghost btn-xs" onClick={() => onDeleteOutfit(outfit.id)} aria-label={t("character.deleteOutfitLabel")} style={{ gap: 4 }}>
                    <Trash2 style={{ width: 12, height: 12 }} />
                  </button>
                </div>
              </div>
              {outfit.imageUrl && (
                <div style={{ width: 80, height: 80, borderRadius: 6, overflow: "hidden", marginTop: 6, border: "1px solid var(--border)" }}>
                  <img src={resolveImageUrl(outfit.imageUrl)} alt={outfit.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                </div>
              )}
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <button className="btn btn-primary btn-xs" onClick={() => onGenerateOutfitImage(outfit)} disabled={isGenerating} style={{ flex: 1, gap: 4 }}>
                  {isGenerating ? <Loader2 className="animate-spin" style={{ width: 12, height: 12 }} /> : <Wand2 style={{ width: 12, height: 12 }} />}
                  {t("character.generateImage")}
                </button>
                {!outfit.isDefault && (
                  <button className="btn btn-outline btn-xs" onClick={() => onSetDefaultOutfit(outfit.id)}>
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
  );
}

function EquipmentCard() {
  return (
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
  );
}

function ReferencedBeatsCard({ beats }: { beats: { id: string; title: string; status?: string }[] }) {
  return (
    <div className="card">
      <div className="section-label">{t("character.referencedShots")}</div>
      {beats.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {beats.map((beat) => (
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
  );
}

interface BasicInfoCardProps {
  character: Character;
  setCurrentCharacter: (update: Character | ((prev: Character) => Character), shouldMarkDirty?: boolean) => void;
}

function BasicInfoCard({ character, setCurrentCharacter }: BasicInfoCardProps) {
  return (
    <div className="card">
      <div className="section-label">{t("character.basicInfo")}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label className="section-label" style={{ fontSize: 11 }}>{t("character.gender")}</label>
          <select
            className="select"
            value={character.gender}
            onChange={(e) => setCurrentCharacter({ ...character, gender: e.target.value }, true)}
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
            value={character.appearance.height}
            onChange={(e) => setCurrentCharacter({ ...character, appearance: { ...character.appearance, height: e.target.value } }, true)}
          />
          <datalist id="height-suggestions">
            {heightSuggestions.map((h) => <option key={h} value={h} />)}
          </datalist>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label className="section-label" style={{ fontSize: 11 }}>{t("character.build")}</label>
          <select
            className="select"
            value={character.appearance.build}
            onChange={(e) => setCurrentCharacter({ ...character, appearance: { ...character.appearance, build: e.target.value } }, true)}
          >
            <option value="">-</option>
            {buildSuggestions.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
      </div>
    </div>
  );
}

function AppearanceCard({ character, setCurrentCharacter }: BasicInfoCardProps) {
  return (
    <div className="card">
      <div className="section-label">{t("character.appearanceDesc")}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
        <input
          className="input"
          data-testid="character-hair-color-input"
          placeholder={t("character.hairColorPlaceholder")}
          value={character.appearance.hairColor}
          onChange={(e) => setCurrentCharacter({ ...character, appearance: { ...character.appearance, hairColor: e.target.value } }, true)}
        />
        <input
          className="input"
          data-testid="character-hair-style-input"
          placeholder={t("character.hairStylePlaceholder")}
          value={character.appearance.hairStyle}
          onChange={(e) => setCurrentCharacter({ ...character, appearance: { ...character.appearance, hairStyle: e.target.value } }, true)}
        />
      </div>
      <textarea
        className="textarea"
        placeholder={t("character.clothingPlaceholder")}
        rows={3}
        value={character.appearance.clothing}
        onChange={(e) => setCurrentCharacter({ ...character, appearance: { ...character.appearance, clothing: e.target.value } }, true)}
      />
    </div>
  );
}

interface PersonalityStyleCardProps extends BasicInfoCardProps {
  customTrait: string;
  setCustomTrait: (v: string) => void;
  addTrait: (trait: string) => void;
  removeTrait: (trait: string) => void;
}

function PersonalityStyleCard({
  character, setCurrentCharacter, customTrait, setCustomTrait, addTrait, removeTrait,
}: PersonalityStyleCardProps) {
  const [showStyleSuggestions, setShowStyleSuggestions] = useState(false);
  return (
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
            <button className="btn btn-outline btn-xs" onClick={() => addTrait(customTrait)}>
              {t("character.add")}
            </button>
          </div>
          {character.personality.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
              {character.personality.map((trait) => (
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
            data-testid="character-style-input"
            placeholder={t("character.stylePlaceholder")}
            value={character.style}
            onChange={(e) => setCurrentCharacter({ ...character, style: e.target.value }, true)}
            onFocus={() => setShowStyleSuggestions(true)}
          />
          {showStyleSuggestions && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
              {styleSuggestions.slice(0, 8).map((style) => (
                <span
                  key={style.value}
                  className="badge"
                  style={{ cursor: "pointer" }}
                  onClick={() => { setCurrentCharacter({ ...character, style: style.value }, true); setShowStyleSuggestions(false); }}
                >
                  {t(style.labelKey)}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      <textarea
        className="textarea"
        data-testid="character-description-input"
        placeholder={t("character.descriptionPlaceholder")}
        rows={3}
        value={character.description}
        onChange={(e) => setCurrentCharacter({ ...character, description: e.target.value }, true)}
      />
    </div>
  );
}

interface CharacterHeaderProps {
  character: Character;
  avatarUrl: string | undefined;
  isUploading: boolean;
  referencedBeats: { id: string; title: string; status?: string }[];
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onNameChange: (name: string) => void;
}

function CharacterHeader({
  character, avatarUrl, isUploading, referencedBeats, fileInputRef, onFileUpload, onNameChange,
}: CharacterHeaderProps) {
  return (
    <div className="card" style={{ display: "flex", alignItems: "center", gap: 12, padding: 12 }}>
      <div
        className="element-avatar"
        style={{ width: 64, height: 64, flexShrink: 0, borderRadius: 8, overflow: "hidden" }}
      >
        {avatarUrl ? (
          <img src={resolveImageUrl(avatarUrl)} alt={character.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <User size={28} />
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
        <input
          className="input"
          data-testid="character-name-input"
          placeholder={t("character.namePlaceholder")}
          value={character.name}
          onChange={(e) => onNameChange(e.target.value)}
          style={{ fontSize: 16, fontWeight: 600 }}
        />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {character.gender && (
            <span className="badge badge-info">{character.gender}</span>
          )}
          <span className="badge">{t("character.referencedBy", { count: referencedBeats.length })}</span>
        </div>
      </div>
      <button
        className="btn btn-outline btn-xs"
        onClick={() => fileInputRef.current?.click()}
        disabled={isUploading}
        style={{ gap: 4 }}
      >
        {isUploading ? <Loader2 className="animate-spin" style={{ width: 12, height: 12 }} /> : <Upload style={{ width: 12, height: 12 }} />}
        {t("character.changeAvatar")}
      </button>
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFileUpload} />
    </div>
  );
}

interface CharacterActionFooterProps {
  isDirty: boolean;
  saveStatus: SaveStatus;
  saveError: string | null | undefined;
  canSave: boolean;
  onSave: () => void;
  onDelete: () => void;
}

function CharacterActionFooter({
  isDirty, saveStatus, saveError, canSave, onSave, onDelete,
}: CharacterActionFooterProps) {
  return (
    <div
      style={{
        position: "sticky",
        bottom: 0,
        left: 0,
        right: 0,
        display: "flex",
        gap: 8,
        alignItems: "center",
        padding: "10px 0",
        marginTop: 8,
        background: "var(--bg)",
        borderTop: "1px solid var(--border)",
        zIndex: 10,
      }}
    >
      <SaveStatusIndicator status={isDirty ? "unsaved" : saveStatus} errorMessage={saveError ?? undefined} />
      <button
        className="btn btn-ghost btn-xs"
        onClick={onDelete}
        aria-label={t("character.deleteCharacter")}
        style={{ gap: 4, color: "var(--destructive)" }}
      >
        <Trash2 style={{ width: 12, height: 12 }} />
        {t("character.deleteCharacter")}
      </button>
      <button
        className="btn btn-primary btn-sm"
        data-testid="character-save-button"
        onClick={onSave}
        disabled={saveStatus === "saving" || !canSave}
        style={{ flex: 1, gap: 4, justifyContent: "center" }}
      >
        <Save style={{ width: 14, height: 14 }} />
        {saveStatus === "saving" ? t("common.saving") : t("character.saveCharacter")}
      </button>
    </div>
  );
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
  imageSize,
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
  const avatarUrl = generatedImage || currentCharacter.avatarPath || currentCharacter.generatedImage || currentCharacter.refImagePath;

  return (
    <>
      <CharacterHeader
        character={currentCharacter}
        avatarUrl={avatarUrl}
        isUploading={isUploading}
        referencedBeats={referencedBeats}
        fileInputRef={fileInputRef}
        onFileUpload={handleFileUpload}
        onNameChange={(name) => setCurrentCharacter({ ...currentCharacter, name }, true)}
      />

      {/* 基本信息 card */}
      <BasicInfoCard character={currentCharacter} setCurrentCharacter={setCurrentCharacter} />

      {/* 外观描述 card */}
      <AppearanceCard character={currentCharacter} setCurrentCharacter={setCurrentCharacter} />

      {/* 性格与风格 card */}
      <PersonalityStyleCard
        character={currentCharacter}
        setCurrentCharacter={setCurrentCharacter}
        customTrait={customTrait}
        setCustomTrait={setCustomTrait}
        addTrait={addTrait}
        removeTrait={removeTrait}
      />

      {/* 装备与道具 card (新功能，P2A 占位) */}
      <EquipmentCard />

      {/* 造型变体 card */}
      <OutfitList
        outfits={currentCharacter.outfits || []}
        isGenerating={isGenerating}
        onAddOutfit={onAddOutfit}
        onEditOutfit={onEditOutfit}
        onDeleteOutfit={onDeleteOutfit}
        onSetDefaultOutfit={onSetDefaultOutfit}
        onGenerateOutfitImage={onGenerateOutfitImage}
      />

      {/* 引用此角色的分镜 card */}
      <ReferencedBeatsCard beats={referencedBeats} />

      {/* AI 请求预览区（展示最终发送给大模型的完整内容） */}
      <AiRequestPreview
        currentCharacter={currentCharacter}
        generatedImage={generatedImage}
        useDetailedPrompt={useDetailedPrompt}
        setUseDetailedPrompt={setUseDetailedPrompt}
        selectedImageModel={selectedImageModel}
        setSelectedImageModel={setSelectedImageModel}
        imageSize={imageSize}
        isGenerating={isGenerating}
        isUploading={isUploading}
        isAnalyzing={isAnalyzing}
        generatePrompt={generatePrompt}
        generateImage={generateImage}
        saveImageToCharacter={saveImageToCharacter}
        fileInputRef={fileInputRef}
        analyzeFileInputRef={analyzeFileInputRef}
        handleFileUpload={handleFileUpload}
        handleAnalyzeFileUpload={handleAnalyzeFileUpload}
        setShowAssetSelector={setShowAssetSelector}
        setGeneratedImage={setGeneratedImage}
        referencedBeats={referencedBeats}
      />

      {/* 底部吸底操作栏 */}
      <CharacterActionFooter
        isDirty={isDirty}
        saveStatus={saveStatus}
        saveError={saveError}
        canSave={!!currentCharacter.name.trim()}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </>
  );
}
